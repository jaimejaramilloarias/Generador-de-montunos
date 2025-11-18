import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Midi } from '@tonejs/midi';

import { generateMontuno } from './generator';
import type { AppState } from '../types';
import { FALLBACK_RAW_RESULT } from './fallbackResult';
import { deriveApproachNotes } from './approachNotes';

const mockedGenerateMontunoRaw = vi.hoisted(() => vi.fn());

vi.mock('./bridge', () => ({
  generateMontunoRaw: mockedGenerateMontunoRaw,
}));

function buildFixture() {
  const midi = new Midi();
  midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
  const buffer = midi.toArray();
  const base64 = Buffer.from(buffer).toString('base64');
  return {
    ...FALLBACK_RAW_RESULT,
    midi_base64: base64,
    modo_tag: 'salsa',
    clave_tag: '2-3',
    max_eighths: 8,
    reference_files: ['backend/reference_midi_loops/salsa_2-3_root_A.mid'],
  };
}

const fixture = buildFixture();

describe('generateMontuno', () => {
  const baseState: AppState = {
    progressionInput: 'Cmaj7 F7 | G7 Cmaj7',
    clave: 'Clave 2-3',
    modoDefault: 'Salsa',
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
        modo: 'Salsa',
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
        modo: 'Salsa',
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
        modo: 'Salsa',
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
        modo: 'Salsa',
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
    mockedGenerateMontunoRaw.mockResolvedValue(fixture);
  });

  it('produce eventos y metadatos a partir del resultado del backend', async () => {
    const result = await generateMontuno(baseState);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.modoTag).toBe('salsa');
    expect(result.claveTag).toBe('2-3');
    expect(result.maxEighths).toBe(fixture.max_eighths);
    expect(result.referenceFiles).toEqual(fixture.reference_files);
    expect(result.midiData.byteLength).toBeGreaterThan(0);
  });

  it('utiliza la progresión normalizada al invocar el puente de Python', async () => {
    await generateMontuno(baseState);
    expect(mockedGenerateMontunoRaw).toHaveBeenCalledWith(
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

  it('envía solo los campos necesarios para cada acorde', async () => {
    await generateMontuno(baseState);

    const [payload] = mockedGenerateMontunoRaw.mock.calls.at(-1) ?? [];
    expect(payload.chords).toHaveLength(baseState.chords.length);
    expect(payload.chords[0]).not.toHaveProperty('modo');
    expect(payload.chords[0]).not.toHaveProperty('armonizacion');
    expect(payload.chords.every((chord: any) => typeof chord.registerOffset === 'number')).toBe(true);
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

    const [payload] = mockedGenerateMontunoRaw.mock.calls.at(-1) ?? [];
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

    mockedGenerateMontunoRaw.mockResolvedValueOnce({
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
