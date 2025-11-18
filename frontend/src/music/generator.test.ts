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
import { deriveApproachNotes } from './approachNotes';

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
        label: 'Cmaj7',
        name: 'Cmaj7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
        registerOffset: 0,
        approachNotes: deriveApproachNotes('Cmaj7'),
        isRecognized: true,
      },
      {
        index: 1,
        label: 'F7',
        name: 'F7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
        registerOffset: 0,
        approachNotes: deriveApproachNotes('F7'),
        isRecognized: true,
      },
      {
        index: 2,
        label: 'G7',
        name: 'G7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
        registerOffset: 0,
        approachNotes: deriveApproachNotes('G7'),
        isRecognized: true,
      },
      {
        index: 3,
        label: 'Cmaj7',
        name: 'Cmaj7',
        modo: 'Tradicional',
        armonizacion: 'Octavas',
        octavacion: 'Original',
        inversion: null,
        registerOffset: 0,
        approachNotes: deriveApproachNotes('Cmaj7'),
        isRecognized: true,
      },
    ],
    manualEdits: [],
    errors: [],
    isPlaying: false,
    isGenerating: false,
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

  it('propaga correctamente los modos tradicionales y de salsa por acorde', async () => {
    const customState: AppState = {
      ...baseState,
      modoDefault: 'Salsa',
      chords: baseState.chords.map((chord, index) =>
        index % 2 === 0 ? { ...chord, modo: 'Tradicional' } : { ...chord, modo: 'Salsa' }
      ),
    };

    await generateMontuno(customState);

    const [payload] = (generateMontunoRaw as unknown as Mock).mock.calls.at(-1) ?? [];
    expect(payload.modoDefault).toBe('Salsa');
    expect(payload.chords).toHaveLength(customState.chords.length);
    expect(payload.chords.map((chord: AppState['chords'][number]) => chord.modo)).toEqual(
      customState.chords.map((chord) => chord.modo)
    );
    expect(payload.chords.every((chord: AppState['chords'][number]) => typeof chord.inversion === 'string')).toBe(true);
  });

  it('utiliza una seed aleatoria cuando no se especifica ninguna', async () => {
    const originalCrypto = globalThis.crypto;
    const mockValue = new Uint32Array([4242]);
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (arr: Uint32Array) => {
          arr.set(mockValue);
          return arr;
        },
      },
      configurable: true,
    });

    const customState: AppState = { ...baseState, seed: null };

    await generateMontuno(customState);

    const [payload] = (generateMontunoRaw as unknown as Mock).mock.calls.at(-1) ?? [];
    expect(payload.seed).toBe(4242);

    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true, writable: true });
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
