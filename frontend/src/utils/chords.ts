const EXTENDED_PATTERN = /(9|11|13)/;

function stripInversionSuffix(name: string): string {
  const slashIndex = name.indexOf('/');
  return slashIndex === -1 ? name : name.slice(0, slashIndex);
}

export function isExtendedChordName(name: string): boolean {
  const base = stripInversionSuffix(name).trim();
  if (!base) {
    return false;
  }
  return EXTENDED_PATTERN.test(base);
}
