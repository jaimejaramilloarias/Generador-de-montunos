import type { AppState } from '../types';

export interface RawGenerationInput {
  progression: string;
  clave: string;
  modoDefault: AppState['modoDefault'];
  armonizacionDefault: AppState['armonizacionDefault'];
  variation: AppState['variation'];
  inversionDefault: AppState['inversionDefault'];
  bpm: number;
  seed: number | null;
  chords: {
    index: number;
    modo: AppState['modoDefault'];
    armonizacion: AppState['armonizacionDefault'];
    inversion: AppState['inversionDefault'] | null;
  }[];
  referenceRoot: string;
}

export interface RawGenerationResult {
  midi_base64: string;
  modo_tag: string;
  clave_tag: string;
  max_eighths: number;
  reference_files: string[];
}

interface WorkerRequest {
  id: number;
  type: 'generate';
  payload: RawGenerationInput & { baseUrl: string };
}

interface WorkerSuccess {
  id: number;
  success: true;
  result: RawGenerationResult;
}

interface WorkerFailure {
  id: number;
  success: false;
  error: string;
}

type WorkerResponse = WorkerSuccess | WorkerFailure;

type PendingEntry = {
  resolve: (value: RawGenerationResult) => void;
  reject: (reason: Error) => void;
};

let workerInstance: Worker | null = null;
let requestCounter = 0;
const pending = new Map<number, PendingEntry>();

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('./originalWorker.ts', import.meta.url), { type: 'module' });
    workerInstance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }
      pending.delete(message.id);
      if (message.success) {
        entry.resolve(message.result);
      } else {
        entry.reject(new Error(message.error));
      }
    };
    workerInstance.onerror = (event) => {
      const error = new Error(event.message || 'Fallo en el generador de montunos.');
      pending.forEach(({ reject }) => reject(error));
      pending.clear();
    };
  }
  return workerInstance;
}

export function generateMontunoRaw(input: RawGenerationInput, baseUrl: string): Promise<RawGenerationResult> {
  const worker = getWorker();
  const id = ++requestCounter;
  const payload: WorkerRequest = {
    id,
    type: 'generate',
    payload: { ...input, baseUrl },
  };

  return new Promise<RawGenerationResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage(payload);
  });
}
