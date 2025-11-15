import { describe, expect, it } from 'vitest';
import { autocompleteChordSuffix } from './chordAutocomplete';

describe('autocompleteChordSuffix', () => {
  it('completa sufijos mayores incompletos', () => {
    const original = 'Cmaj F7';
    const result = autocompleteChordSuffix(original, 4);
    expect(result.text).toBe('C∆ F7');
    expect(result.cursor).toBe(2);
  });

  it('agrega la séptima a sufijos dim', () => {
    const original = 'Bdim';
    const result = autocompleteChordSuffix(original, original.length);
    expect(result.text).toBe('Bº7');
    expect(result.cursor).toBe(3);
  });

  it('envuelve el bemol cinco entre paréntesis', () => {
    const original = 'Dm7b5 G7';
    const result = autocompleteChordSuffix(original, 5);
    expect(result.text).toBe('Dm7(b5) G7');
    expect(result.cursor).toBe(7);
  });

  it('no modifica el texto si no hay sufijo coincidente', () => {
    const original = 'Cadd9';
    const result = autocompleteChordSuffix(original, original.length);
    expect(result.text).toBe(original);
    expect(result.cursor).toBe(original.length);
  });
});
