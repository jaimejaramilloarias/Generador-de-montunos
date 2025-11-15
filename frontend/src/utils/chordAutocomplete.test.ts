import { describe, expect, it } from 'vitest';
import {
  CHORD_SUFFIX_SUGGESTIONS,
  autocompleteChordSuffix,
  getChordSuffixSuggestions,
} from './chordAutocomplete';

describe('autocompleteChordSuffix', () => {
  it('no modifica el texto ni el cursor', () => {
    const original = 'Cm7(b5) F7 Bbmaj7';
    const cursor = 5;
    const result = autocompleteChordSuffix(original, cursor);
    expect(result.text).toBe(original);
    expect(result.cursor).toBe(cursor);
  });
});

describe('getChordSuffixSuggestions', () => {
  it('devuelve todas las sugerencias cuando no hay sufijo', () => {
    const suggestions = getChordSuffixSuggestions('C', 1);
    expect(suggestions).toEqual(CHORD_SUFFIX_SUGGESTIONS);
  });

  it('devuelve todas las sugerencias aun cuando hay un sufijo parcial', () => {
    const suggestions = getChordSuffixSuggestions('Cm', 2);
    expect(suggestions).toEqual(CHORD_SUFFIX_SUGGESTIONS);
  });
});
