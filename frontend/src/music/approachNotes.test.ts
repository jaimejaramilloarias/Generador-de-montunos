import { describe, expect, it } from 'vitest';
import { DEFAULT_SALSA_APPROACH_NOTES } from '../types/constants';
import { deriveApproachNotes } from './approachNotes';

describe('deriveApproachNotes', () => {
  it('devuelve listas distintas según el acorde', () => {
    const cMajor = deriveApproachNotes('Cmaj7');
    const fMajor = deriveApproachNotes('Fmaj7');

    expect(cMajor.split(', ')).toHaveLength(DEFAULT_SALSA_APPROACH_NOTES.length);
    expect(fMajor.split(', ')).toHaveLength(DEFAULT_SALSA_APPROACH_NOTES.length);
    expect(cMajor).not.toBe(fMajor);
  });

  it('incluye las alteraciones importantes como la b9', () => {
    const altered = deriveApproachNotes('G7(b9)').split(', ');
    expect(altered).toContain('F');
  });

  it('distingue entre acordes mayores y menores', () => {
    const major = deriveApproachNotes('Amaj7');
    const minor = deriveApproachNotes('Am7');

    expect(major).not.toBe(minor);
  });
});
