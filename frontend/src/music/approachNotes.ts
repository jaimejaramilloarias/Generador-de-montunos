import { detectIntervals, extractRootSymbol, getChordRootSemitone } from './chords';

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function prefersFlats(chordName: string): boolean {
  const match = chordName.match(/^([A-G](?:b|#)?)/i);
  return Boolean(match && match[1].includes('b'));
}

function intervalToNote(rootPc: number, interval: number, useFlats: boolean): string {
  const semitone = ((rootPc + interval) % 12 + 12) % 12;
  const names = useFlats ? FLAT_NOTES : SHARP_NOTES;
  return names[semitone];
}

function detectNinthInterval(suffix: string): number {
  const lowered = suffix.toLowerCase();
  if (lowered.includes('b9')) return 1;
  if (/#9|\+9/.test(lowered)) return 3;
  if (lowered.includes('9')) return 2;
  return 2;
}

function detectFourthInterval(intervals: number[]): number {
  const third = intervals[1] ?? 4;
  const isMinor = third - (intervals[0] ?? 0) === 3;
  return isMinor ? 5 : 6;
}

function detectSixthInterval(intervals: number[]): number {
  const fifth = intervals[2] ?? 7;
  const diff = fifth - (intervals[0] ?? 0);
  if (diff === 6 || diff === 8) return 8;
  return 9;
}

function detectSeventhInterval(intervals: number[], suffix: string): number {
  if (intervals.length > 3) {
    return intervals[3];
  }
  const lowered = suffix.toLowerCase();
  if (/maj7|ma7|∆/.test(lowered)) return 11;
  if (/7/.test(lowered)) return 10;
  return 10;
}

export function deriveApproachNotes(chordName: string): string[] {
  const rootSymbol = extractRootSymbol(chordName) ?? '';
  const suffix = chordName.slice(rootSymbol.length);
  const rootPc = getChordRootSemitone(chordName) ?? 0;
  const intervals = detectIntervals(chordName);
  const useFlats = prefersFlats(rootSymbol) || /b9|b5|b13/.test(suffix);

  const second = detectNinthInterval(suffix);
  const fourth = detectFourthInterval(intervals);
  const sixth = detectSixthInterval(intervals);
  const seventh = detectSeventhInterval(intervals, suffix);

  return [second, fourth, sixth, seventh].map((interval) => intervalToNote(rootPc, interval, useFlats));
}
