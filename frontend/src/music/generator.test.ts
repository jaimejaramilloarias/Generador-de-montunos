import { describe, expect, it, vi } from 'vitest';
import fixtureRaw from './__fixtures__/tradicional.json?raw';

const fixture = JSON.parse(fixtureRaw);

vi.mock('./bridge', () => {
  const fixture = JSON.parse(fixtureRaw);
  return {
    generateMontunoRaw: vi.fn().mockResolvedValue(fixture),
  };
});

import { generateMontuno } from './generator';
import type { AppState } from '../types';
import { generateMontunoRaw } from './bridge';

describe('generateMontuno', () => {
  const baseState: AppState = {
    progressionInput: 'Cmaj7 F7 | G7 Cmaj7',
    clave: 'Clave 2-3',
    modoDefault: 'Tradicional',
    armonizacionDefault: 'Octavas',
    variation: 'A',
    inversionDefault: 'root',
    bpm: 120,
    seed: 123,
    chords: [
      { index: 0, name: 'Cmaj7', modo: 'Tradicional', armonizacion: 'Octavas', inversion: 'root' },
      { index: 1, name: 'F7', modo: 'Tradicional', armonizacion: 'Octavas', inversion: 'root' },
      { index: 2, name: 'G7', modo: 'Tradicional', armonizacion: 'Octavas', inversion: 'root' },
      { index: 3, name: 'Cmaj7', modo: 'Tradicional', armonizacion: 'Octavas', inversion: 'root' },
    ],
    errors: [],
    isPlaying: false,
    generated: undefined,
    savedProgressions: [],
    activeProgressionId: null,
  };

  it('produce eventos y metadatos a partir del resultado del backend', async () => {
    const result = await generateMontuno(baseState);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.modoTag).toBe('tradicional');
    expect(result.claveTag).toBe('2-3');
    expect(result.maxEighths).toBe(fixture.max_eighths);
    expect(result.referenceFiles).toEqual(fixture.reference_files);
    expect(result.midiData.byteLength).toBeGreaterThan(0);
  });

  it('utiliza la progresión normalizada al invocar el puente de Python', async () => {
    await generateMontuno(baseState);
    expect(generateMontunoRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        progression: 'C∆ F7 | G7 C∆',
        seed: 123,
        referenceRoot: 'backend/reference_midi_loops',
      }),
      expect.any(String)
    );
  });

  it('calcula la duración en segundos en función de los corcheas máximos', async () => {
    const result = await generateMontuno(baseState);
    const expectedSeconds = fixture.max_eighths * (60 / baseState.bpm / 2);
    expect(Number(result.durationSeconds.toFixed(6))).toBeCloseTo(expectedSeconds, 6);
  });
});
