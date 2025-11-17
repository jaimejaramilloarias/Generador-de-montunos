import type { ChordConfig, Inversion, ResolvedChordInversion } from '../types';
import { INVERSION_ORDER } from '../types/constants';
import { detectIntervals, getChordRootSemitone } from './chords';

const BASS_RANGE_MIN = 48; // C3
const BASS_RANGE_MAX = 67; // G4
const BASS_RANGE_EXTRA = 4;
const MAX_LEAP = 8; // minor sixth

function confineToRange(pitch: number, extended: boolean): number {
  const min = extended ? BASS_RANGE_MIN - BASS_RANGE_EXTRA : BASS_RANGE_MIN;
  const max = extended ? BASS_RANGE_MAX + BASS_RANGE_EXTRA : BASS_RANGE_MAX;
  let result = pitch;
  while (result < min) {
    result += 12;
  }
  while (result > max) {
    result -= 12;
  }
  return result;
}

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

function adjustFlexibleRange(prev: number | null, pitch: number): number {
  const base = limitLeap(prev, confineToRange(pitch, false));
  if (prev === null || Math.abs(base - prev) <= MAX_LEAP) {
    return base;
  }

  return limitLeap(prev, confineToRange(pitch, true));
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
  return adjustFlexibleRange(prevPitch, basePitch);
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

export function resolveInversionChain(
  chords: ChordConfig[],
  inversionDefault: Inversion
): ResolvedChordInversion[] {
  let prevPitch: number | null = null;
  return chords.map((chord, idx) => {
    const chosenInversion = chord.inversion ?? (idx === 0
      ? inversionDefault
      : selectClosestInversion(chord.name, prevPitch).inversion);
    const pitch = calculateBassPitch(chord.name, chosenInversion, prevPitch);
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
