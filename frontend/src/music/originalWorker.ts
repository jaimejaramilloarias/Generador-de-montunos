/// <reference lib="webworker" />

import { PYTHON_DATA_FILES, PYTHON_SOURCES } from './pythonSources';
import { REFERENCE_LOOP_FILES, getReferenceLoop } from './referenceLoops';

interface GenerateMessage {
  id: number;
  type: 'generate';
  payload: Record<string, unknown> & { baseUrl: string; referenceRoot: string };
}

interface SuccessResponse {
  id: number;
  success: true;
  result: Record<string, unknown>;
}

interface ErrorResponse {
  id: number;
  success: false;
  error: string;
}

type WorkerResponse = SuccessResponse | ErrorResponse;

type PyodideInterface = {
  runPythonAsync: (code: string) => Promise<any>;
  globals: Map<string, any> & { get: (name: string) => any };
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: string | Uint8Array, options?: { encoding?: 'utf8' }) => void;
    stat: (path: string) => any;
  };
  loadPackage: (names: string | string[]) => Promise<void>;
};

type WebGenerateFn = (payloadJson: string) => Promise<any>;

const ctx: DedicatedWorkerGlobalScope & { loadPyodide?: (options: { indexURL: string }) => Promise<PyodideInterface> } = self as any;

let pyodideReady: Promise<PyodideInterface> | null = null;
let webGenerateFn: WebGenerateFn | null = null;
const loadedReferenceFiles = new Set<string>();

type PyodideLoaderModule = {
  loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface>;
};

async function ensurePyodideLoader(): Promise<void> {
  if (ctx.loadPyodide) {
    return;
  }

  const moduleUrl = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs';
  const scriptUrl = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
  let lastError: unknown = null;

  if (!ctx.loadPyodide) {
    try {
      const module = (await import(/* @vite-ignore */ moduleUrl)) as PyodideLoaderModule;
      ctx.loadPyodide = module.loadPyodide;
    } catch (error) {
      lastError = error;
      console.warn('Fallo al importar Pyodide como módulo, intentando con importScripts.', error);
    }
  }

  if (!ctx.loadPyodide && typeof ctx.importScripts === 'function') {
    try {
      ctx.importScripts(scriptUrl);
    } catch (error) {
      lastError = error;
      console.warn('Fallo al cargar Pyodide mediante importScripts, intentando evaluar el bundle clásico.', error);
    }
  }

  if (!ctx.loadPyodide) {
    const response = await fetch(scriptUrl);
    const source = await response.text();
    if (lastError) {
      console.warn('Fallo al inicializar Pyodide con los métodos estándar, evaluando el bundle clásico.', lastError);
    }
    ctx.eval(source);
  }
}

function ensureDirectory(pyodide: PyodideInterface, path: string): void {
  if (!path) return;
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    try {
      pyodide.FS.mkdir(current);
    } catch (error: any) {
      const errno = error?.errno;
      if (errno !== 17 && errno !== 20) {
        throw error;
      }
    }
  }
}

function writeTextFile(pyodide: PyodideInterface, path: string, content: string): void {
  const directory = path.split('/').slice(0, -1).join('/');
  ensureDirectory(pyodide, directory);
  pyodide.FS.writeFile(path, content, { encoding: 'utf8' });
}

function writeBinaryFile(pyodide: PyodideInterface, path: string, data: Uint8Array): void {
  const directory = path.split('/').slice(0, -1).join('/');
  ensureDirectory(pyodide, directory);
  pyodide.FS.writeFile(path, data);
}

async function ensurePyodide(_baseUrl: string): Promise<PyodideInterface> {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      await ensurePyodideLoader();
      const pyodide = await ctx.loadPyodide!({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' });
      await pyodide.loadPackage(['micropip', 'numpy', 'scipy']);
      await pyodide.runPythonAsync('import micropip\nawait micropip.install(["mido"])');
      for (const [path, source] of Object.entries(PYTHON_SOURCES)) {
        writeTextFile(pyodide, path, source);
      }
      for (const [path, source] of Object.entries(PYTHON_DATA_FILES)) {
        writeTextFile(pyodide, path, source);
      }
      await pyodide.runPythonAsync(
        [
          'import json, base64, os, tempfile',
          'from pathlib import Path',
          'from backend.montuno_core import CLAVES',
          'from backend.montuno_core.generation import generate_montuno',
          'from backend.utils import clean_tokens',
          '',
          'def _midi_to_base64(pm):',
          '    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as tmp:',
          '        pm.write(tmp.name)',
          '        tmp.flush()',
          '        tmp.seek(0)',
          '        data = tmp.read()',
          '    os.unlink(tmp.name)',
          '    return base64.b64encode(data).decode("ascii")',
          '',
          'def web_generate(payload_json):',
          '    params = json.loads(payload_json)',
          '    progression = clean_tokens(params.get("progression", ""))',
          '    if not progression:',
          '        raise ValueError("Ingresa una progresión de acordes")',
          '    params["progression"] = progression',
          '    clave_name = params.get("clave")',
          '    if clave_name not in CLAVES:',
          '        raise KeyError(f"Clave no soportada: {clave_name}")',
          '    clave_cfg = CLAVES[clave_name]',
          '    chords = params.get("chords", [])',
          '    modo_por_acorde = [c.get("modo") for c in chords] if chords else None',
          '    armonias_por_indice = [c.get("armonizacion") for c in chords] if chords else None',
          '    octavas_por_indice = [c.get("octavacion") for c in chords] if chords else None',
          '    inversiones_por_indice = [c.get("resolvedInversion") for c in chords] if chords else None',
          '    inversiones_usuario = [c.get("inversion") for c in chords] if chords else None',
          '    offsets_por_indice = [c.get("registerOffset", 0) for c in chords] if chords else None',
          '    aproximaciones_por_indice = [c.get("approachNotes") for c in chords] if chords else None',
          '    manual_edits = params.get("manualEdits") or None',
          '    result = generate_montuno(',
          '        progression,',
          '        clave_config=clave_cfg,',
          '        modo_default=params.get("modoDefault"),',
          '        modo_por_acorde=modo_por_acorde,',
          '        armonizacion_default=params.get("armonizacionDefault"),',
          '        armonias_por_indice=armonias_por_indice,',
          '        octavas_por_indice=octavas_por_indice,',
          '        octavacion_default=params.get("octavacionDefault", "Original"),',
          '        variacion=params.get("variation"),',
          '        inversion=params.get("inversionDefault"),',
          '        reference_root=Path(params.get("referenceRoot")),',
          '        inversiones_por_indice=inversiones_por_indice,',
          '        inversiones_usuario=inversiones_usuario,',
          '        register_offsets=offsets_por_indice,',
          '        aproximaciones_por_indice=aproximaciones_por_indice,',
          '        manual_edits=manual_edits,',
          '        seed=params.get("seed"),',
          '        bpm=params.get("bpm", 120),',
          '        return_pm=True,',
          '    )',
          '    midi_b64 = _midi_to_base64(result.midi)',
          '    return json.dumps({',
          '        "midi_base64": midi_b64,',
          '        "modo_tag": result.modo_tag,',
          '        "clave_tag": result.clave_tag,',
          '        "max_eighths": result.max_eighths,',
          '        "reference_files": [str(path) for path in result.reference_files],',
          '    })',
        ].join('\n')
      );
      return pyodide;
    })();
  }
  const pyodide = await pyodideReady;
  await ensureReferenceLoops(pyodide);
  if (!webGenerateFn) {
    const fnProxy = pyodide.globals.get('web_generate');
    webGenerateFn = fnProxy;
  }
  return pyodide;
}

async function ensureReferenceLoops(pyodide: PyodideInterface): Promise<void> {
  for (const filename of REFERENCE_LOOP_FILES) {
    if (loadedReferenceFiles.has(filename)) {
      continue;
    }
    const data = getReferenceLoop(filename);
    writeBinaryFile(pyodide, `backend/reference_midi_loops/${filename}`, data);
    loadedReferenceFiles.add(filename);
  }
}

async function handleGenerate(message: GenerateMessage): Promise<void> {
  const { id, payload } = message;
  try {
    const { baseUrl, ...pythonPayload } = payload;
    const pyodide = await ensurePyodide(String(baseUrl ?? '/'));
    if (!webGenerateFn) {
      throw new Error('Python bridge no inicializado');
    }
    const resultProxy = await webGenerateFn(JSON.stringify(pythonPayload));
    const resultJson = typeof resultProxy === 'string' ? resultProxy : resultProxy.toString();
    if (typeof (resultProxy as any).destroy === 'function') {
      (resultProxy as any).destroy();
    }
    const parsed = JSON.parse(resultJson);
    ctx.postMessage({ id, success: true, result: parsed } satisfies SuccessResponse);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'No se pudo generar el montuno.';
    ctx.postMessage({ id, success: false, error: messageText } satisfies ErrorResponse);
  }
}

ctx.onmessage = (event: MessageEvent<GenerateMessage>) => {
  const data = event.data;
  if (data.type === 'generate') {
    handleGenerate(data);
  }
};
