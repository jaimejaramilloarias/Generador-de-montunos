import { DEFAULT_SALSA_APPROACH_NOTES } from '../types/constants';
import { detectIntervals, extractRootSymbol, getChordRootSemitone } from './chords';

const SEMITONE_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function intervalToNote(rootPc: number, interval: number): string {
  const semitone = ((rootPc + interval) % 12 + 12) % 12;
  return SEMITONE_TO_NOTE[semitone];
}

function pickInterval(templateNote: string, intervals: number[], suffix: string): number | null {
  const third = intervals[1] ?? 4;
  const fifth = intervals[2] ?? 7;
  const seventh = intervals[3] ?? 11;

  const lowered = suffix.toLowerCase();
  const isMinor =
    third - (intervals[0] ?? 0) === 3 || /m7\(b5\)|(^|[^a-z])m(?!aj)/.test(lowered) || /º|°/.test(lowered);
  const hasB9 = suffix.includes('b9');
  const hasB13 = suffix.includes('b13');
  const hasB5 = suffix.includes('b5');
  const extraB6 = suffix.includes('(b6)');
  const extraB13 = suffix.includes('(b13)');

  switch (templateNote) {
    case 'C':
      return 0;
    case 'E':
      return suffix.includes('sus') ? 5 : third;
    case 'G':
      return fifth;
    case 'D':
      return hasB5 ? 1 : hasB9 ? 1 : 2;
    case 'A':
      return hasB9 || hasB13 || hasB5 || extraB6 || extraB13 ? 8 : 9;
    case 'B':
      return suffix.endsWith('6') && !suffix.includes('7') ? 11 : seventh;
    case 'D#': {
      const thirdInt = isMinor ? 3 : 4;
      return thirdInt - 1;
    }
    case 'F':
      return 5;
    case 'G#':
      return fifth - 1;
    case 'C#':
      return hasB9 ? 11 : 1;
    default:
      return null;
  }
}

export function deriveApproachNotes(chordName: string): string {
  const rootPc = getChordRootSemitone(chordName) ?? 0;
  const rootSymbol = extractRootSymbol(chordName) ?? '';
  const suffix = chordName.slice(rootSymbol.length).toLowerCase();
  const intervals = detectIntervals(chordName);

  const translated = DEFAULT_SALSA_APPROACH_NOTES.map((note) => {
    const result = pickInterval(note, intervals, suffix);
    if (result === null) {
      return note;
    }
    return intervalToNote(rootPc, result);
  });

  return translated.join(', ');
}
