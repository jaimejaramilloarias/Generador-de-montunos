import { describe, expect, it } from 'vitest';
import { getPattern } from './patterns';

describe('patterns', () => {
  it('devuelve copias independientes del patrón solicitado', () => {
    const trad = getPattern('Tradicional', 'A');
    const tradCopy = getPattern('Tradicional', 'A');
    const salsa = getPattern('Salsa', 'A');

    expect(trad).not.toBe(tradCopy);
    expect(trad[0]!.roles).not.toEqual([]);
    trad[0]!.roles.push('extra');

    expect(tradCopy[0]!.roles).not.toContain('extra');
    expect(salsa).not.toBe(trad);
  });
});
