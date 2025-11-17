import type { ChordConfig, Inversion, ResolvedChordInversion } from '../types';
import { INVERSION_ORDER } from '../types/constants';
import { detectIntervals, getChordRootSemitone } from './chords';

const MAX_LEAP = 8; // minor sixth

function limitLeap(prev: number | null, pitch: number): number {
  if (prev === null) {
    return pitch;
  }
  let result = pitch;
  while (result - prev > MAX_LEAP) {
    result -= 12;
  }
  while (prev - result > MAX_LEAP) {
    result += 12;
  }
  return result;
}

function inversionBasePitch(chordName: string, inversion: Inversion): number {
  const rootPc = getChordRootSemitone(chordName) ?? 0;
  const intervals = detectIntervals(chordName);
  const base = rootPc + 12 * 3;
  const third = intervals[1] ?? 4;
  const fifth = intervals[2] ?? 7;
  const seventh = intervals[3] ?? 10;

  if (inversion === 'third') {
    return ((rootPc + third) % 12) + 12 * 3;
  }
  if (inversion === 'fifth') {
    return ((rootPc + fifth) % 12) + 12 * 3;
  }
  if (inversion === 'seventh') {
    return ((rootPc + seventh) % 12) + 12 * 3;
  }
  return base;
}

export function calculateBassPitch(
  chordName: string,
  inversion: Inversion,
  prevPitch: number | null
): number {
  const basePitch = inversionBasePitch(chordName, inversion);
  return limitLeap(prevPitch, basePitch);
}

function nearestPitchForPc(prevPitch: number, pitchClass: number): number {
  const baseOctave = Math.round((prevPitch - pitchClass) / 12);
  const centered = pitchClass + 12 * baseOctave;
  const candidates = [centered - 12, centered, centered + 12];

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
  direction: 1 | -1
): ResolvedChordInversion {
  const pitchClasses = inversionPitchClasses(chordName);
  const candidates = pitchClasses.map((entry) => {
    const baseOctave = Math.floor(currentPitch / 12);
    let pitch = entry.pc + 12 * baseOctave;
    if (direction === 1 && pitch <= currentPitch + 1e-6) {
      pitch += 12;
    }
    if (direction === -1 && pitch >= currentPitch - 1e-6) {
      pitch -= 12;
    }
    return { inversion: entry.inversion, pitch } satisfies ResolvedChordInversion;
  });

  const selected =
    direction === 1
      ? candidates.reduce<ResolvedChordInversion | null>(
          (best, candidate) => (best === null || candidate.pitch < best.pitch ? candidate : best),
          null
        )
      : candidates.reduce<ResolvedChordInversion | null>(
          (best, candidate) => (best === null || candidate.pitch > best.pitch ? candidate : best),
          null
        );

  return selected ?? candidates[0];
}

export function resolveInversionChain(
  chords: ChordConfig[],
  inversionDefault: Inversion
): ResolvedChordInversion[] {
  let prevPitch: number | null = null;
  return chords.map((chord, idx) => {
    let chosenInversion = chord.inversion ?? inversionDefault;
    let pitch = calculateBassPitch(chord.name, chosenInversion, prevPitch);

    if (chord.inversion === null && idx > 0 && prevPitch !== null) {
      const closestTone = selectNearestChordTone(chord.name, prevPitch);
      const matchingInversion = INVERSION_ORDER.find(
        (inv) => (inversionBasePitch(chord.name, inv) % 12 + 12) % 12 === closestTone.pc
      );

      chosenInversion = matchingInversion ?? inversionDefault;
      pitch = limitLeap(prevPitch, closestTone.pitch);
    }

    prevPitch = pitch;
    return { inversion: chosenInversion, pitch } satisfies ResolvedChordInversion;
  });
}

export function listBassOptions(
  chordName: string,
  prevPitch: number | null
): ResolvedChordInversion[] {
  return INVERSION_ORDER.map((inversion) => ({
    inversion,
    pitch: calculateBassPitch(chordName, inversion, prevPitch),
  })).sort((a, b) => a.pitch - b.pitch || INVERSION_ORDER.indexOf(a.inversion) - INVERSION_ORDER.indexOf(b.inversion));
}

export function formatMidiNote(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const name = names[((midi % 12) + 12) % 12];
  return `${name}${octave}`;
}
