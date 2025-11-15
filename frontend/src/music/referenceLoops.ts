import { REFERENCE_LOOP_DATA } from './referenceLoopsData';

function decodeBase64ToUint8Array(base64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const BufferCtor = (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
  if (typeof BufferCtor === 'function') {
    const buffer = BufferCtor.from(base64, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
  }

  throw new Error('El entorno actual no soporta decodificación base64.');
}

const LOOP_CACHE = new Map<string, Uint8Array>();

export const REFERENCE_LOOP_FILES = Object.keys(REFERENCE_LOOP_DATA) as (keyof typeof REFERENCE_LOOP_DATA)[];

export function getReferenceLoop(filename: string): Uint8Array {
  const cached = LOOP_CACHE.get(filename);
  if (cached) {
    return cached;
  }

  const base64 = REFERENCE_LOOP_DATA[filename];
  if (!base64) {
    throw new Error(`Archivo de loop desconocido: ${filename}`);
  }

  const data = decodeBase64ToUint8Array(base64);
  LOOP_CACHE.set(filename, data);
  return data;
}
