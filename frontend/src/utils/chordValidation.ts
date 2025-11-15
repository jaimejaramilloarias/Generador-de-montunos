export const CHORD_SUFFIXES = [
  '6',
  '7',
  '∆',
  'm',
  'm6',
  'm7',
  'm∆',
  '+7',
  '∆sus4',
  '∆sus2',
  '7sus4',
  '7sus2',
  'º7',
  'º∆',
  'm7(b5)',
  '7(b5)',
  '7(b9)',
  '+7(b9)',
  '7(b5)b9',
  '7sus4(b9)',
  '∆(b5)',
  '9',
  '11',
  '13',
  '∆9',
  '∆11',
  '∆13',
  'm9',
  'm11',
  'm13',
  '7(9)',
  '7(13)',
  'm7(9)',
  'm7(11)',
  'm7(13)',
] as const;

const VALID_SUFFIXES = new Set(CHORD_SUFFIXES);

const ROOT_REGEX = /^([A-G](?:#|b)?)(.*)$/i;
const FORCED_INVERSION_REGEX = /\/(?:[1357])$/;
const OPTIONAL_EXTENSION_REGEX = /\((?:b6|b13)\)/g;

export function isRecognizedChordSymbol(symbol: string): boolean {
  if (!symbol) {
    return false;
  }

  const base = symbol.trim().replace(FORCED_INVERSION_REGEX, '');
  const cleaned = base.replace(OPTIONAL_EXTENSION_REGEX, '');
  const match = cleaned.match(ROOT_REGEX);
  if (!match) {
    return false;
  }

  const suffix = match[2] ?? '';
  const normalizedSuffix = suffix === '' ? '∆' : suffix;
  return VALID_SUFFIXES.has(normalizedSuffix);
}
