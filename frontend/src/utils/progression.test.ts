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
    expect(result.chords.every((c) => c.isRecognized)).toBe(true);
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

  it('interpreta % como repetición del compás anterior', () => {
    const result = parseProgression('| Bm7 | % |', { armonizacionDefault: 'Octavas' });
    expect(result.chords.map((c) => c.name)).toEqual(['Bm7', 'Bm7']);
  });

  it('marca acordes no reconocidos y conserva el cifrado', () => {
    const result = parseProgression('Cmaj7 Cfoo', { armonizacionDefault: 'Octavas' });
    expect(result.chords[1]?.name).toBe('Cfoo');
    expect(result.chords[1]?.isRecognized).toBe(false);
    expect(result.errors.some((error) => error.includes('Acorde no reconocido'))).toBe(true);
  });
});
