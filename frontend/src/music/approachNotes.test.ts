import { describe, expect, it } from 'vitest';
import { DEFAULT_SALSA_APPROACH_NOTES } from '../types/constants';
import { deriveApproachNotes } from './approachNotes';

describe('deriveApproachNotes', () => {
  it('devuelve listas distintas según el acorde', () => {
    const cMajor = deriveApproachNotes('Cmaj7');
    const fMajor = deriveApproachNotes('Fmaj7');

    expect(cMajor.split(', ').length).toBeLessThanOrEqual(DEFAULT_SALSA_APPROACH_NOTES.length);
    expect(fMajor.split(', ').length).toBeLessThanOrEqual(DEFAULT_SALSA_APPROACH_NOTES.length);
    expect(cMajor).not.toBe(fMajor);
  });

  it('solo muestra la novena correspondiente al cifrado', () => {
    const naturalNine = deriveApproachNotes('Cmaj7').split(', ');
    const flatNine = deriveApproachNotes('C7(b9)').split(', ');
    const sharpNine = deriveApproachNotes('C7(#9)').split(', ');

    expect(naturalNine).not.toContain('C#');
    expect(flatNine).toContain('C#');
    expect(flatNine).not.toContain('D');
    expect(sharpNine).toContain('D#');
  });

  it('distingue entre acordes mayores y menores', () => {
    const major = deriveApproachNotes('Amaj7');
    const minor = deriveApproachNotes('Am7');

    expect(major).not.toBe(minor);
  });
});
