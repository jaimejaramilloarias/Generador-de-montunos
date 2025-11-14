import { z } from 'zod';
import type { ParsedChord } from '../types';

const chordRegex = /^[A-G](?:#|b)?/i;

const progressionSchema = z
  .string({ required_error: 'La progresión es obligatoria.' })
  .transform((value) => value.replace(/\s+/g, ' ').trim());

export function normaliseProgressionText(text: string): string {
  const parsed = progressionSchema.safeParse(text ?? '');
  if (!parsed.success) {
    return '';
  }
  return parsed.data;
}

export function parseProgression(text: string): { chords: ParsedChord[]; errors: string[] } {
  const normalised = normaliseProgressionText(text);
  if (!normalised) {
    return { chords: [], errors: [] };
  }

  const tokens = normalised
    .split(/\s+|\|/g)
    .map((token) => token.trim())
    .filter(Boolean);

  const chords: ParsedChord[] = [];
  const errors: string[] = [];

  tokens.forEach((token, index) => {
    const match = token.match(chordRegex);
    if (!match) {
      errors.push(`Token no reconocido en la posición ${index + 1}: “${token}”`);
      return;
    }
    const chord = match[0].toUpperCase() + token.slice(match[0].length);
    chords.push({ name: chord, raw: token, index });
  });

  return { chords, errors };
}
