import type { GenerationResult } from '../types';

export function generateMidiBlob(result: GenerationResult): Blob {
  return new Blob([result.midiData], { type: 'audio/midi' });
}
