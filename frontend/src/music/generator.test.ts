import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Midi } from '@tonejs/midi';
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
    octavacionDefault: 'Original',
    variation: 'A',
    inversionDefault: 'root',
    bpm: 120,
    seed: 123,
    chords: [
      {
        index: 0,
        name: 'Cmaj7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
      },
      {
        index: 1,
        name: 'F7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
      },
      {
        index: 2,
        name: 'G7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
      },
      {
        index: 3,
        name: 'Cmaj7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
      },
    ],
    manualEdits: [],
    errors: [],
    isPlaying: false,
    generated: undefined,
    savedProgressions: [],
    activeProgressionId: null,
    midiStatus: 'idle',
    midiOutputs: [],
    selectedMidiOutputId: null,
  };

  beforeEach(() => {
    (generateMontunoRaw as unknown as Mock).mockResolvedValue(fixture);
  });

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

  it('propaga correctamente los modos extendidos y por acorde', async () => {
    const customState: AppState = {
      ...baseState,
      modoDefault: 'Extendido',
      chords: baseState.chords.map((chord, index) =>
        index % 2 === 0
          ? { ...chord, modo: 'Extendido' }
          : { ...chord, modo: 'Tradicional' }
      ),
    };

    await generateMontuno(customState);

    const [payload] = (generateMontunoRaw as unknown as Mock).mock.calls.at(-1) ?? [];
    expect(payload.modoDefault).toBe('Extendido');
    expect(payload.chords).toHaveLength(customState.chords.length);
    expect(payload.chords.map((chord: AppState['chords'][number]) => chord.modo)).toEqual(
      customState.chords.map((chord) => chord.modo)
    );
    expect(payload.chords.every((chord: AppState['chords'][number]) => typeof chord.inversion === 'string')).toBe(true);
  });

  it('mantiene disponible el modo extendido como override por acorde con modo global tradicional', async () => {
    const customState: AppState = {
      ...baseState,
      modoDefault: 'Tradicional',
      chords: baseState.chords.map((chord, index) =>
        index === 1 ? { ...chord, modo: 'Extendido' } : chord
      ),
    };

    await generateMontuno(customState);

    const [payload] = (generateMontunoRaw as unknown as Mock).mock.calls.at(-1) ?? [];
    expect(payload.modoDefault).toBe('Tradicional');
    expect(payload.chords.map((chord: AppState['chords'][number]) => chord.modo)).toEqual(
      customState.chords.map((chord) => chord.modo)
    );
    expect(payload.chords.every((chord: AppState['chords'][number]) => typeof chord.inversion === 'string')).toBe(true);
  });

  it('recorta notas superpuestas cuando cambian los modos por acorde', async () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
    track.addNote({ midi: 60, ticks: 360, durationTicks: 480, velocity: 0.7 });
    const buffer = midi.toArray();
    const base64 = Buffer.from(buffer).toString('base64');

    (generateMontunoRaw as unknown as Mock).mockResolvedValueOnce({
      ...fixture,
      midi_base64: base64,
      max_eighths: 8,
    });

    const result = await generateMontuno(baseState);

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({ time: 0, duration: 0.75 });
    expect(result.events[1]).toMatchObject({ time: 0.75 });
  });
});
