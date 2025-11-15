import { z } from 'zod';
import type { Armonizacion, Inversion, ParsedChord } from '../types';
import { applyChordReplacements } from '../music/chordNormalizer';

const chordRegex = /^[A-G](?:#|b)?/i;

const progressionSchema = z
  .string({ required_error: 'La progresión es obligatoria.' })
  .transform((value) => value.replace(/\s+/g, ' ').trim());

const ARMON_MAP: Record<string, Armonizacion> = {
  '8': 'Octavas',
  '10': 'Décimas',
  '13': 'Treceavas',
  '15': 'Doble octava',
};

const INVERSION_MAP: Record<string, Inversion> = {
  '1': 'root',
  '3': 'third',
  '5': 'fifth',
  '7': 'seventh',
};

export interface ParseProgressionOptions {
  armonizacionDefault: Armonizacion;
}

export function normaliseProgressionText(text: string): string {
  const parsed = progressionSchema.safeParse(text ?? '');
  if (!parsed.success) {
    return '';
  }
  return parsed.data;
}

export function parseProgression(
  text: string,
  options: ParseProgressionOptions
): { chords: ParsedChord[]; errors: string[] } {
  const normalised = normaliseProgressionText(text);
  if (!normalised) {
    return { chords: [], errors: [] };
  }

  const chords: ParsedChord[] = [];
  const errors: string[] = [];

  let armonActual: Armonizacion = options.armonizacionDefault;
  let armonActualFromMarker = false;
  let forcedInversion: Inversion | null = null;

  const rawSegments = normalised
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const segments: string[] = [];
  rawSegments.forEach((segment) => {
    if (segment === '%') {
      if (segments.length === 0) {
        errors.push('% no puede ir en el primer compás');
      } else {
        segments.push(segments[segments.length - 1]);
      }
    } else {
      segments.push(segment);
    }
  });

  segments.forEach((segment) => {
    const tokens = segment
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

    const segmentChords: {
      raw: string;
      chord: string;
      armonizacion?: Armonizacion;
      inversion?: Inversion;
    }[] = [];

    tokens.forEach((token) => {
      const original = token;
      const result = procesarToken(token);
      if (result == null) {
        return;
      }
      const { chord, inversion } = result;
      if (chord === null) {
        forcedInversion = inversion;
        return;
      }
      const forced = inversion ?? forcedInversion;
      forcedInversion = null;
      segmentChords.push({
        raw: original,
        chord,
        armonizacion: armonActualFromMarker ? armonActual : undefined,
        inversion: forced ?? undefined,
      });
    });

    if (segmentChords.length > 2) {
      errors.push(`Cada segmento debe contener uno o dos acordes: ${segment}`);
      return;
    }

    segmentChords.forEach(({ raw, chord, armonizacion, inversion }) => {
      const match = chord.match(chordRegex);
      if (!match) {
        errors.push(`Token no reconocido en la posición ${chords.length + 1}: “${raw}”`);
        return;
      }
      const root = match[0].toUpperCase();
      const suffix = chord.slice(match[0].length);
      const normalisedChord = applyChordReplacements(`${root}${suffix}`);
      chords.push({
        name: normalisedChord,
        raw,
        index: chords.length,
        ...(armonizacion ? { armonizacion } : {}),
        ...(inversion ? { forcedInversion: inversion } : {}),
      });
    });
  });

  return { chords, errors };

  function procesarToken(token: string): { chord: string | null; inversion: Inversion | null } | null {
    let working = token;
    let inversion: Inversion | null = null;

    while (true) {
      const modeMatch = working.match(/^\[[A-Z]+\](.*)$/);
      if (modeMatch) {
        working = modeMatch[1];
        if (!working) {
          return { chord: null, inversion };
        }
        continue;
      }

      const armonMatch = working.match(/^\((8|10|13|15)\)(.*)$/);
      if (armonMatch) {
        const codigo = armonMatch[1];
        const resto = armonMatch[2];
        const mapped = ARMON_MAP[codigo];
        if (mapped) {
          armonActual = mapped;
          armonActualFromMarker = true;
        }
        working = resto;
        continue;
      }
      break;
    }

    const inversionMatch = working.match(/^(.*)\/([1357])$/);
    if (inversionMatch) {
      working = inversionMatch[1];
      const codigo = inversionMatch[2];
      inversion = INVERSION_MAP[codigo] ?? inversion;
    }

    working = working.trim();

    if (!working) {
      return { chord: null, inversion };
    }

    return { chord: working, inversion };
  }
}
