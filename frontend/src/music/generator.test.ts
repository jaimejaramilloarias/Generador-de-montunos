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

  it('coincide con la regresión registrada para la progresión base', () => {
    const result = generateMontuno(baseState);
    const roundedEvents = result.events.map((event) => ({
      time: Number(event.time.toFixed(3)),
      duration: Number(event.duration.toFixed(3)),
      midi: event.midi,
      velocity: Number(event.velocity.toFixed(3)),
    }));

    expect({
      bpm: result.bpm,
      lengthBars: result.lengthBars,
      durationSeconds: Number(result.durationSeconds.toFixed(3)),
      events: roundedEvents,
    }).toMatchInlineSnapshot(`
      {
        "bpm": 120,
        "durationSeconds": 4,
        "events": [
          {
            "duration": 0.499,
            "midi": 60,
            "time": 0,
            "velocity": 0.96,
          },
          {
            "duration": 0.499,
            "midi": 64,
            "time": 0,
            "velocity": 0.96,
          },
          {
            "duration": 0.499,
            "midi": 67,
            "time": 0.5,
            "velocity": 0.746,
          },
          {
            "duration": 0.496,
            "midi": 72,
            "time": 1,
            "velocity": 0.88,
          },
          {
            "duration": 0.496,
            "midi": 76,
            "time": 1,
            "velocity": 0.88,
          },
          {
            "duration": 0.498,
            "midi": 79,
            "time": 1.5,
            "velocity": 0.763,
          },
          {
            "duration": 0.497,
            "midi": 60,
            "time": 2,
            "velocity": 0.871,
          },
          {
            "duration": 0.497,
            "midi": 64,
            "time": 2,
            "velocity": 0.871,
          },
          {
            "duration": 0.5,
            "midi": 76,
            "time": 2.5,
            "velocity": 0.802,
          },
          {
            "duration": 0.498,
            "midi": 72,
            "time": 3,
            "velocity": 0.88,
          },
          {
            "duration": 0.498,
            "midi": 79,
            "time": 3,
            "velocity": 0.88,
          },
          {
            "duration": 0.499,
            "midi": 67,
            "time": 3.5,
            "velocity": 0.79,
          },
          {
            "duration": 0.496,
            "midi": 65,
            "time": 4,
            "velocity": 0.985,
          },
          {
            "duration": 0.496,
            "midi": 69,
            "time": 4,
            "velocity": 0.985,
          },
          {
            "duration": 0.5,
            "midi": 72,
            "time": 4.5,
            "velocity": 0.748,
          },
          {
            "duration": 0.497,
            "midi": 77,
            "time": 5,
            "velocity": 0.829,
          },
          {
            "duration": 0.497,
            "midi": 81,
            "time": 5,
            "velocity": 0.829,
          },
          {
            "duration": 0.496,
            "midi": 84,
            "time": 5.5,
            "velocity": 0.779,
          },
          {
            "duration": 0.498,
            "midi": 65,
            "time": 6,
            "velocity": 0.922,
          },
          {
            "duration": 0.498,
            "midi": 69,
            "time": 6,
            "velocity": 0.922,
          },
          {
            "duration": 0.498,
            "midi": 81,
            "time": 6.5,
            "velocity": 0.785,
          },
          {
            "duration": 0.497,
            "midi": 77,
            "time": 7,
            "velocity": 0.873,
          },
          {
            "duration": 0.497,
            "midi": 84,
            "time": 7,
            "velocity": 0.873,
          },
          {
            "duration": 0.5,
            "midi": 72,
            "time": 7.5,
            "velocity": 0.78,
          },
        ],
        "lengthBars": 2,
      }
    `);
  });
});
