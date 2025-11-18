import { describe, expect, it } from 'vitest';
import { getPattern } from './patterns';

describe('patterns', () => {
  it('devuelve copias independientes para evitar mutaciones accidentales', () => {
    const trad = getPattern('Tradicional', 'A');
    const repeat = getPattern('Tradicional', 'A');

    expect(repeat).toEqual(trad);
    expect(repeat).not.toBe(trad);

    repeat[0]!.roles.push('extra');
    expect(trad[0]!.roles).not.toContain('extra');
  });
});
