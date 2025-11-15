import { applyChordReplacements } from '../music/chordNormalizer';

const ROOT_REGEX = /^([A-Ga-g](?:#|b)?)(.*)$/;
const TOKEN_REGEX = /[^\s|]+$/;

interface CompletionRule {
  test: RegExp;
  completion: string;
}

const SUFFIX_RULES: CompletionRule[] = [
  { test: /^maj$/i, completion: 'maj7' },
  { test: /^mmaj$/i, completion: 'mmaj7' },
  { test: /^dim$/i, completion: 'dim7' },
  { test: /^o$/i, completion: 'º7' },
  { test: /^o7$/i, completion: 'º7' },
  { test: /^ø$/i, completion: 'm7(b5)' },
  { test: /^ø7$/i, completion: 'm7(b5)' },
  { test: /^m7b5$/i, completion: 'm7(b5)' },
  { test: /^7b5$/i, completion: '7(b5)' },
  { test: /^7b5b9$/i, completion: '7(b5)b9' },
  { test: /^\+7b9$/i, completion: '+7(b9)' },
  { test: /^7sus4b9$/i, completion: '7sus4(b9)' },
  { test: /^aug$/i, completion: 'aug7' },
];

export interface AutocompleteResult {
  text: string;
  cursor: number;
}

export function autocompleteChordSuffix(text: string, cursorIndex: number): AutocompleteResult {
  if (!text) {
    return { text, cursor: cursorIndex };
  }

  const beforeCursor = text.slice(0, cursorIndex);
  const tokenMatch = beforeCursor.match(TOKEN_REGEX);
  if (!tokenMatch) {
    return { text, cursor: cursorIndex };
  }

  const token = tokenMatch[0];
  const tokenStart = beforeCursor.length - token.length;
  const rootMatch = token.match(ROOT_REGEX);
  if (!rootMatch) {
    return { text, cursor: cursorIndex };
  }

  const [, root, suffix] = rootMatch;
  if (!suffix) {
    return { text, cursor: cursorIndex };
  }

  const completedSuffix = completeSuffix(suffix);
  if (completedSuffix === null) {
    return { text, cursor: cursorIndex };
  }

  const updatedToken = applyChordReplacements(`${root}${completedSuffix}`);
  const resultToken = updatedToken || `${root}${completedSuffix}`;
  if (resultToken === token) {
    return { text, cursor: cursorIndex };
  }

  const nextText = `${text.slice(0, tokenStart)}${resultToken}${text.slice(tokenStart + token.length)}`;
  const cursorDelta = resultToken.length - token.length;
  const nextCursor = cursorIndex + cursorDelta;
  return { text: nextText, cursor: nextCursor };
}

function completeSuffix(suffix: string): string | null {
  for (const rule of SUFFIX_RULES) {
    if (rule.test.test(suffix)) {
      return rule.completion;
    }
  }

  if (suffix.includes('(') || suffix.includes(')')) {
    return null;
  }

  const replaced = applyChordReplacements(`C${suffix}`);
  if (replaced && replaced !== `C${suffix}`) {
    return replaced.slice(1);
  }

  return null;
}
