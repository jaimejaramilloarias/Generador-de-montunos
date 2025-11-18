import { describe, expect, it } from 'vitest';
import { DEFAULT_APPROACH_NOTES, deriveApproachNotes } from './approachNotes';

describe('deriveApproachNotes', () => {
  it('siempre devuelve las cuatro aproximaciones naturales', () => {
    const result = deriveApproachNotes();

    expect(result).toEqual(Array.from(DEFAULT_APPROACH_NOTES));
  });
});
