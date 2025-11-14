import type { AppState, GenerationResult, NoteEvent } from '../types';
import { buildVoiceLayout } from './chords';
import { getPattern, getPatternLengthBeats } from './patterns';

export function generateMontuno(state: AppState): GenerationResult {
  if (!state.chords.length) {
    throw new Error('Ingresa al menos un acorde para generar el montuno.');
  }

  const patternLength = getPatternLengthBeats();
  const rng = createRng(state.seed ?? undefined);
  const events: NoteEvent[] = [];
  let beatOffset = 0;

  state.chords.forEach((chord) => {
    const pattern = getPattern(chord.modo, state.variation);
    const voices = buildVoiceLayout(chord.name, chord.inversion, chord.armonizacion);
    pattern.forEach((step) => {
      const jitter = (rng() - 0.5) * 0.1;
      const velocityScale = clamp(step.velocity * (1 + jitter), 0.2, 1);
      const time = beatOffset + step.time;
      const duration = Math.max(0.25, step.duration - Math.abs(jitter) * 0.1);
      step.roles.forEach((role) => {
        const midi = voices[role];
        if (!midi) {
          return;
        }
        events.push({
          time,
          duration,
          midi: Math.round(midi),
          velocity: velocityScale,
        });
      });
    });
    beatOffset += patternLength;
  });

  events.sort((a, b) => a.time - b.time);
  const lengthBars = Math.max(1, Math.ceil(beatOffset / 4));
  const secondsPerBeat = 60 / state.bpm;
  const durationBeats = events.reduce((max, event) => Math.max(max, event.time + event.duration), 0);
  const durationSeconds = durationBeats * secondsPerBeat;

  return { events, lengthBars, bpm: state.bpm, durationSeconds } satisfies GenerationResult;
}

function createRng(seed?: number | null): () => number {
  if (seed === undefined || seed === null || Number.isNaN(seed)) {
    return Math.random;
  }
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
