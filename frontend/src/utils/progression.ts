import { z } from 'zod';
import type { Armonizacion, Inversion, ParsedChord } from '../types';
import { DEFAULT_APPROACH_NOTES } from '../music/approachNotes';
import { applyChordReplacements } from '../music/chordNormalizer';
import { isRecognizedChordSymbol } from './chordValidation';

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

function normaliseNoteToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const [letter, ...rest] = trimmed;
  if (!letter) return null;
  return `${letter.toUpperCase()}${rest.join('')}`;
}

function approachIndexForNote(note: string): number | null {
  const letter = note[0]?.toUpperCase();
  if (!letter) return null;
  if (letter === 'B') return 3;
  if (letter === 'G' || letter === 'A') return 2;
  if (letter === 'E' || letter === 'F') return 1;
  if (letter === 'C' || letter === 'D') return 0;
  return null;
}

function approachNotesFromMarker(marker: string): string[] {
  const content = marker.slice(1, -1).trim();
  const base = [...DEFAULT_APPROACH_NOTES];
  if (!content) return base;

  const tokens = content.split(/[\s,]+/).filter(Boolean);
  tokens.forEach((token) => {
    const note = normaliseNoteToken(token);
    const index = note ? approachIndexForNote(note) : null;
    if (note && index !== null) {
      base[index] = note;
    }
  });
  return base;
}

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

  let approachCurrent = [...DEFAULT_APPROACH_NOTES];

  segments.forEach((segment) => {
    const tokens = segment.match(/\[[^\]]*\]|\S+/g) ?? [];

    const segmentChords: {
      raw: string;
      chord: string;
      armonizacion?: Armonizacion;
      inversion?: Inversion;
      approachNotes: string[];
    }[] = [];

    tokens.forEach((token) => {
      if (token.startsWith('[') && token.endsWith(']')) {
        approachCurrent = approachNotesFromMarker(token);
        return;
      }

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
        approachNotes: [...approachCurrent],
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
      const recognized = isRecognizedChordSymbol(normalisedChord);
      if (!recognized) {
        errors.push(`Acorde no reconocido en la posición ${chords.length + 1}: “${raw}”`);
      }
      const displayName = recognized ? normalisedChord : raw;
      chords.push({
        name: displayName,
        raw,
        index: chords.length,
        isRecognized: recognized,
        approachNotes: chord.approachNotes ?? [...DEFAULT_APPROACH_NOTES],
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
