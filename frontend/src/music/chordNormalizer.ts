import rawReplacements from '@shared/chord_replacements.json?raw';

type ReplacementEntry = {
  pattern: string;
  replacement: string;
  flags?: string;
};

const entries: ReplacementEntry[] = JSON.parse(rawReplacements);

const compiled = entries.map(({ pattern, replacement, flags }) => {
  const normalizedFlags = flags?.includes('g') ? flags : `${flags ?? ''}g`;
  return {
    regex: new RegExp(pattern, normalizedFlags),
    replacement,
  };
});

export function applyChordReplacements(text: string): string {
  return compiled.reduce((acc, { regex, replacement }) => acc.replace(regex, replacement), text);
}
