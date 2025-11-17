import type { ChordConfig, Inversion, ResolvedChordInversion } from '../types';
import { INVERSION_ORDER } from '../types/constants';
import { detectIntervals, getChordRootSemitone } from './chords';

const MAX_LEAP = 8; // minor sixth
const SEMITONES_IN_OCTAVE = 12;

function limitLeap(prev: number | null, pitch: number): number {
  if (prev === null) {
    return pitch;
  }
  let result = pitch;
  while (result - prev > MAX_LEAP) {
    result -= SEMITONES_IN_OCTAVE;
  }
  while (prev - result > MAX_LEAP) {
    result += SEMITONES_IN_OCTAVE;
  }
  return result;
}

function inversionBasePitch(chordName: string, inversion: Inversion): number {
  const rootPc = getChordRootSemitone(chordName) ?? 0;
  const intervals = detectIntervals(chordName);
  const base = rootPc + SEMITONES_IN_OCTAVE * 3;
  const third = intervals[1] ?? 4;
  const fifth = intervals[2] ?? 7;
  const seventh = intervals[3] ?? 10;

  if (inversion === 'third') {
    return ((rootPc + third) % 12) + SEMITONES_IN_OCTAVE * 3;
  }
  if (inversion === 'fifth') {
    return ((rootPc + fifth) % 12) + SEMITONES_IN_OCTAVE * 3;
  }
  if (inversion === 'seventh') {
    return ((rootPc + seventh) % 12) + SEMITONES_IN_OCTAVE * 3;
  }
  return base;
}

export function calculateBassPitch(
  chordName: string,
  inversion: Inversion,
  prevPitch: number | null,
  registerOffset = 0,
  clampToPrev = true
): number {
  const basePitch = inversionBasePitch(chordName, inversion) + registerOffset * SEMITONES_IN_OCTAVE;
  return clampToPrev ? limitLeap(prevPitch, basePitch) : basePitch;
}

export function deriveRegisterOffset(chordName: string, inversion: Inversion, pitch: number): number {
  const base = inversionBasePitch(chordName, inversion);
  return Math.round((pitch - base) / SEMITONES_IN_OCTAVE);
}

function nearestPitchForPc(prevPitch: number, pitchClass: number): number {
  const baseOctave = Math.round((prevPitch - pitchClass) / SEMITONES_IN_OCTAVE);
  const centered = pitchClass + SEMITONES_IN_OCTAVE * baseOctave;
  const candidates = [centered - SEMITONES_IN_OCTAVE, centered, centered + SEMITONES_IN_OCTAVE];

  return candidates.reduce((best, candidate) => {
    const distance = Math.abs(candidate - prevPitch);
    if (distance < Math.abs(best - prevPitch)) {
      return candidate;
    }
    if (distance === Math.abs(best - prevPitch)) {
      return Math.min(best, candidate);
    }
    return best;
  }, candidates[0]);
}

function chordPitchClasses(chordName: string): number[] {
  const rootPc = getChordRootSemitone(chordName) ?? 0;
  const intervals = detectIntervals(chordName);
  const pcs = new Set<number>();
  intervals.forEach((interval) => pcs.add((rootPc + interval) % 12));
  return Array.from(pcs);
}

function selectNearestChordTone(chordName: string, prevPitch: number) {
  const pitchClasses = chordPitchClasses(chordName);

  return pitchClasses
    .map((pc) => {
      const pitch = nearestPitchForPc(prevPitch, pc);
      return { pc, pitch, distance: Math.abs(pitch - prevPitch) };
    })
    .sort((a, b) => a.distance - b.distance || a.pitch - b.pitch)[0];
}

function selectClosestInversion(chordName: string, prevPitch: number | null): ResolvedChordInversion {
  const candidates = INVERSION_ORDER.map((inversion) => {
    const pitch = calculateBassPitch(chordName, inversion, prevPitch);
    const distance = prevPitch === null ? 0 : Math.abs(pitch - prevPitch);
    return { inversion, pitch, distance };
  }).sort((a, b) => a.distance - b.distance);

  const best = candidates[0];
  if (prevPitch !== null && Math.abs(best.pitch - prevPitch) < 1e-6) {
    const alternative = candidates.find(
      (candidate) => Math.abs(candidate.pitch - prevPitch) > 1e-6 && candidate.distance <= MAX_LEAP
    );
    if (alternative) {
      return { inversion: alternative.inversion, pitch: alternative.pitch };
    }
  }

  return { inversion: best.inversion, pitch: best.pitch };
}

function inversionPitchClasses(chordName: string): { inversion: Inversion; pc: number }[] {
  const seen = new Set<number>();
  return INVERSION_ORDER.map((inversion) => {
    const pc = ((inversionBasePitch(chordName, inversion) % 12) + 12) % 12;
    return { inversion, pc };
  }).filter((entry) => {
    if (seen.has(entry.pc)) {
      return false;
    }
    seen.add(entry.pc);
    return true;
  });
}

export function stepInversionPitch(
  chordName: string,
  currentPitch: number,
  direction: 1 | -1,
  currentInversion: Inversion
): ResolvedChordInversion {
  const rotationOrder: Inversion[] = ['root', 'third', 'fifth'];
  const pitchClasses = inversionPitchClasses(chordName).filter((entry) => rotationOrder.includes(entry.inversion));
  const currentIdx = pitchClasses.findIndex((entry) => entry.inversion === currentInversion);

  const targetIdx =
    currentIdx === -1
      ? (direction === 1 ? 0 : pitchClasses.length - 1)
      : (currentIdx + direction + pitchClasses.length) % pitchClasses.length;
  const target = pitchClasses[targetIdx];

  const registerOffset = deriveRegisterOffset(chordName, currentInversion, currentPitch);
  const basePitch = inversionBasePitch(chordName, target.inversion);
  let pitch = basePitch + registerOffset * SEMITONES_IN_OCTAVE;

  if (direction === 1) {
    while (pitch <= currentPitch + 1e-6) {
      pitch += SEMITONES_IN_OCTAVE;
    }
  }
  if (direction === -1) {
    while (pitch >= currentPitch - 1e-6) {
      pitch -= SEMITONES_IN_OCTAVE;
    }
  }

  return { inversion: target.inversion, pitch } satisfies ResolvedChordInversion;
}

export function resolveInversionChain(
  chords: ChordConfig[],
  inversionDefault: Inversion
): ResolvedChordInversion[] {
  let prevPitch: number | null = null;
  return chords.map((chord, idx) => {
    let chosenInversion = chord.inversion ?? inversionDefault;
    const registerOffset = chord.registerOffset ?? 0;
    const clampToPrev = chord.inversion === null;
    let pitch = calculateBassPitch(chord.name, chosenInversion, prevPitch, registerOffset, clampToPrev);

    if (chord.inversion === null && idx > 0 && prevPitch !== null) {
      const closestTone = selectNearestChordTone(chord.name, prevPitch);
      const matchingInversion = INVERSION_ORDER.find(
        (inv) => (inversionBasePitch(chord.name, inv) % 12 + 12) % 12 === closestTone.pc
      );

      chosenInversion = matchingInversion ?? inversionDefault;
      const targetPitch = closestTone.pitch + registerOffset * SEMITONES_IN_OCTAVE;
      pitch = clampToPrev ? limitLeap(prevPitch, targetPitch) : targetPitch;
    }

    prevPitch = pitch;
    return { inversion: chosenInversion, pitch } satisfies ResolvedChordInversion;
  });
}

export function listBassOptions(
  chordName: string,
  prevPitch: number | null,
  registerOffset = 0
): ResolvedChordInversion[] {
  return INVERSION_ORDER.map((inversion) => ({
    inversion,
    pitch: calculateBassPitch(chordName, inversion, prevPitch, registerOffset),
  })).sort((a, b) => a.pitch - b.pitch || INVERSION_ORDER.indexOf(a.inversion) - INVERSION_ORDER.indexOf(b.inversion));
}

export function formatMidiNote(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const name = names[((midi % 12) + 12) % 12];
  return `${name}${octave}`;
}
