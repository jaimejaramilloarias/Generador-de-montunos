import { describe, expect, it } from 'vitest';
import { parseProgression, normaliseProgressionText } from './progression';

describe('normaliseProgressionText', () => {
  it('recorta espacios extra', () => {
    expect(normaliseProgressionText('  Cmaj7   F7  ')).toBe('Cmaj7 F7');
  });

  it('devuelve cadena vacía si no hay progresión', () => {
    expect(normaliseProgressionText('   ')).toBe('');
  });
});

describe('parseProgression', () => {
  it('detecta acordes válidos', () => {
    const result = parseProgression('Cmaj7 F7 | G7');
    expect(result.chords.map((c) => c.name)).toEqual(['Cmaj7', 'F7', 'G7']);
    expect(result.errors).toHaveLength(0);
  });

  it('marca tokens inválidos', () => {
    const result = parseProgression('Cmaj7 Xyz');
    expect(result.errors).toHaveLength(1);
  });
});
