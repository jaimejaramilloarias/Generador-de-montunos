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
    const result = parseProgression('Cmaj7 F7 | G7', { armonizacionDefault: 'Octavas' });
    expect(result.chords.map((c) => c.name)).toEqual(['C∆', 'F7', 'G7']);
    expect(result.errors).toHaveLength(0);
  });

  it('marca tokens inválidos', () => {
    const result = parseProgression('Cmaj7 Xyz', { armonizacionDefault: 'Octavas' });
    expect(result.errors).toHaveLength(1);
  });

  it('interpreta marcadores de armonización e inversión como el backend', () => {
    const result = parseProgression('(13)C7 /3 F7', { armonizacionDefault: 'Octavas' });
    expect(result.chords).toHaveLength(2);
    expect(result.chords[0]?.armonizacion).toBe('Treceavas');
    expect(result.chords[0]?.forcedInversion).toBeUndefined();
    expect(result.chords[1]?.armonizacion).toBe('Treceavas');
    expect(result.chords[1]?.forcedInversion).toBe('third');
  });
});
