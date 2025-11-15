import type { Armonizacion, Inversion } from '../types';

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const QUALITY_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  maj11: [0, 4, 7, 11, 17],
  maj13: [0, 4, 7, 11, 21],
  m: [0, 3, 7],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 17],
  m13: [0, 3, 7, 10, 21],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 7, 10, 14],
  dom11: [0, 4, 7, 10, 17],
  dom13: [0, 4, 7, 10, 21],
};

const DEFAULT_INTERVALS = [0, 4, 7];

function detectIntervals(chordName: string): number[] {
  const lowered = chordName.toLowerCase();
  if (chordName.includes('∆13') || lowered.includes('maj13')) return QUALITY_INTERVALS.maj13;
  if (chordName.includes('∆11') || lowered.includes('maj11')) return QUALITY_INTERVALS.maj11;
  if (chordName.includes('∆9') || lowered.includes('maj9')) return QUALITY_INTERVALS.maj9;
  if (lowered.includes('m13')) return QUALITY_INTERVALS.m13;
  if (lowered.includes('m11')) return QUALITY_INTERVALS.m11;
  if (lowered.includes('m9')) return QUALITY_INTERVALS.m9;
  if (lowered.includes('sus2')) return QUALITY_INTERVALS.sus2;
  if (lowered.includes('sus4')) return QUALITY_INTERVALS.sus4;
  if (lowered.includes('dim7') || lowered.includes('º7') || lowered.includes('°7')) return QUALITY_INTERVALS.dim7;
  if (lowered.includes('dim') || lowered.includes('º') || lowered.includes('°')) return QUALITY_INTERVALS.dim;
  if (lowered.includes('aug') || lowered.includes('+')) return QUALITY_INTERVALS.aug;
  if (lowered.includes('maj7') || lowered.includes('ma7') || lowered.includes('Δ')) return QUALITY_INTERVALS.maj7;
  if (lowered.includes('maj')) return QUALITY_INTERVALS.maj;
  if (lowered.includes('m7b5')) return [0, 3, 6, 10];
  if (lowered.includes('m7')) return QUALITY_INTERVALS.m7;
  if (lowered.includes('m')) return QUALITY_INTERVALS.m;
  if (lowered.includes('13')) return QUALITY_INTERVALS.dom13;
  if (lowered.includes('11')) return QUALITY_INTERVALS.dom11;
  if (lowered.includes('9')) return QUALITY_INTERVALS.dom9;
  if (lowered.includes('7')) return QUALITY_INTERVALS.dom7;
  return DEFAULT_INTERVALS;
}

function extractRootSymbol(chordName: string): string | null {
  const match = chordName.match(/^([A-G](?:#|b)?)/i);
  return match ? match[1] : null;
}

const inversionSteps: Record<Inversion, number> = {
  root: 0,
  third: 1,
  fifth: 2,
  seventh: 3,
};

export interface VoiceLayout {
  root: number;
  rootHigh: number;
  third: number;
  thirdHigh: number;
  fifth: number;
  fifthHigh: number;
  seventh?: number;
  seventhHigh?: number;
  tenth: number;
  thirteenth: number;
}

export function buildVoiceLayout(chordName: string, inversion: Inversion, armonizacion: Armonizacion): VoiceLayout {
  const rootSymbol = extractRootSymbol(chordName);
  if (!rootSymbol) {
    throw new Error(`No se pudo determinar la nota raíz para ${chordName}`);
  }
  const rootSemitone = NOTE_TO_SEMITONE[rootSymbol.toUpperCase()] ?? NOTE_TO_SEMITONE[rootSymbol];
  const rootMidi = 60 + rootSemitone; // Base en C4
  const baseIntervals = detectIntervals(chordName).slice();

  const steps = inversionSteps[inversion];
  for (let i = 0; i < steps; i += 1) {
    const interval = baseIntervals.shift();
    if (interval === undefined) {
      break;
    }
    baseIntervals.push(interval + 12);
  }

  const absolute = baseIntervals.map((interval) => rootMidi + interval);
  const [first, second, third, fourth] = absolute;

  const thirdVoice = second ?? rootMidi + 4;
  const fifthVoice = third ?? rootMidi + 7;
  const seventhVoice = fourth;

  const lowRegisterBoost = armonizacion === 'Doble octava' ? -12 : 0;
  const highRegisterBoost = armonizacion === 'Treceavas' ? 12 : 0;

  const layout: VoiceLayout = {
    root: (first ?? rootMidi) + lowRegisterBoost,
    rootHigh: (first ?? rootMidi) + 12 + highRegisterBoost,
    third: thirdVoice,
    thirdHigh: thirdVoice + 12,
    fifth: fifthVoice,
    fifthHigh: fifthVoice + 12,
    tenth: thirdVoice + 12,
    thirteenth: fifthVoice + 12,
  };

  if (seventhVoice) {
    layout.seventh = seventhVoice;
    layout.seventhHigh = seventhVoice + 12;
  }

  if (armonizacion === 'Décimas') {
    layout.third = thirdVoice - 12;
    layout.tenth = thirdVoice + 12;
    layout.fifthHigh = fifthVoice + 12;
  }

  if (armonizacion === 'Treceavas') {
    layout.thirteenth = fifthVoice + 19;
  }

  return layout;
}
