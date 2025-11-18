import { describe, expect, it } from 'vitest';
import { deriveApproachNotes } from './approachNotes';

describe('deriveApproachNotes', () => {
  it('devuelve listas distintas según el acorde', () => {
    const cMajor = deriveApproachNotes('Cmaj7');
    const fMajor = deriveApproachNotes('Fmaj7');

    expect(cMajor).toHaveLength(4);
    expect(fMajor).toHaveLength(4);
    expect(cMajor.join(',')).not.toBe(fMajor.join(','));
  });

  it('solo muestra la novena correspondiente al cifrado', () => {
    const naturalNine = deriveApproachNotes('Cmaj7');
    const flatNine = deriveApproachNotes('C7(b9)');
    const sharpNine = deriveApproachNotes('C7(#9)');

    expect(naturalNine[0]).toBe('D');
    expect(flatNine[0]).toBe('Db');
    expect(sharpNine[0]).toBe('D#');
  });

  it('distingue entre acordes mayores y menores', () => {
    const major = deriveApproachNotes('Amaj7');
    const minor = deriveApproachNotes('Am7');

    expect(major.join(',')).not.toBe(minor.join(','));
  });
});
