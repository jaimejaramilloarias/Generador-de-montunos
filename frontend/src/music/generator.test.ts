import { describe, expect, it } from 'vitest';
import { generateMontuno } from './generator';
import type { AppState } from '../types';

describe('generateMontuno', () => {
  const baseState: AppState = {
    progressionInput: 'Cmaj7 F7',
    clave: 'Clave 2-3',
    modoDefault: 'Tradicional',
    armonizacionDefault: 'Octavas',
    variation: 'A',
    inversionDefault: 'root',
    bpm: 120,
    seed: 42,
    chords: [
      { index: 0, name: 'Cmaj7', modo: 'Tradicional', armonizacion: 'Octavas', inversion: 'root' },
      { index: 1, name: 'F7', modo: 'Tradicional', armonizacion: 'Octavas', inversion: 'root' },
    ],
    errors: [],
    isPlaying: false,
    generated: undefined,
  };

  it('genera eventos a partir de la configuración', () => {
    const result = generateMontuno(baseState);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.lengthBars).toBeGreaterThan(0);
    expect(result.durationSeconds).toBeGreaterThan(0);
  });

  it('respeta la semilla para obtener resultados reproducibles', () => {
    const first = generateMontuno(baseState);
    const second = generateMontuno({
      ...baseState,
      chords: baseState.chords.map((chord) => ({ ...chord })),
    });
    expect(second.events).toEqual(first.events);
  });
});
