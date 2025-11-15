import { describe, expect, it } from 'vitest';
import { getPattern } from './patterns';

describe('patterns', () => {
  it('comparte el patrón tradicional con el modo extendido sin mutar el original', () => {
    const trad = getPattern('Tradicional', 'A');
    const extendido = getPattern('Extendido', 'A');

    expect(extendido).toEqual(trad);
    expect(extendido).not.toBe(trad);

    extendido[0]!.roles.push('extra');
    expect(trad[0]!.roles).not.toContain('extra');
  });
});
