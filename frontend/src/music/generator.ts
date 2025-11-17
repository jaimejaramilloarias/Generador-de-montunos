import { Midi } from '@tonejs/midi';
import { applyChordReplacements } from './chordNormalizer';
import { generateMontunoRaw } from './bridge';
import type { RawGenerationResult } from './bridge';
import { FALLBACK_RAW_RESULT } from './fallbackResult';
import type { AppState, GenerationResult, NoteEvent } from '../types';
import { normaliseProgressionText } from '../utils/progression';

const REFERENCE_ROOT = 'backend/reference_midi_loops';

export async function generateMontuno(state: AppState): Promise<GenerationResult> {
  const baseUrl = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
  const seed = typeof state.seed === 'number' && Number.isFinite(state.seed) ? state.seed : null;
  const progressionNormalised = applyChordReplacements(normaliseProgressionText(state.progressionInput));
  const chords = state.chords.map((chord) => ({
    index: chord.index,
    modo: chord.modo,
    armonizacion: chord.armonizacion,
    inversion: chord.inversion ?? null,
  }));
  const secondsPerBeat = 60 / state.bpm;
  const manualEdits = (state.manualEdits ?? []).map((edit) => ({
    type: edit.type,
    start: edit.startBeats * secondsPerBeat,
    end: (edit.startBeats + edit.durationBeats) * secondsPerBeat,
    pitch: edit.pitch,
  }));

  let raw: RawGenerationResult;
  try {
    raw = await generateMontunoRaw(
      {
        progression: progressionNormalised,
        clave: state.clave,
        modoDefault: state.modoDefault,
        armonizacionDefault: state.armonizacionDefault,
        variation: state.variation,
        inversionDefault: state.inversionDefault,
        bpm: state.bpm,
        seed,
        chords,
        referenceRoot: REFERENCE_ROOT,
        manualEdits,
      },
      baseUrl
    );
  } catch (error) {
    console.warn('Fallo al generar el montuno con Pyodide, usando resultado de respaldo.', error);
    raw = {
      ...FALLBACK_RAW_RESULT,
      modo_tag: `${state.modoDefault} (respaldo)`,
      clave_tag: `${state.clave} (respaldo)`,
    } satisfies RawGenerationResult;
  }

  const midiData = base64ToUint8Array(raw.midi_base64);
  const buffer = midiData.buffer.slice(midiData.byteOffset, midiData.byteOffset + midiData.byteLength);
  const midi = new Midi(buffer);
  const ppq = midi.header.ppq || 480;
  const events: NoteEvent[] = [];

  midi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      if (note.midi <= 0) {
        return;
      }
      const timeBeats = note.ticks / ppq;
      const durationBeats = note.durationTicks / ppq;
      events.push({
        time: timeBeats,
        duration: durationBeats,
        midi: note.midi,
        velocity: note.velocity,
      });
    });
  });

  events.sort((a, b) => {
    if (a.time === b.time) {
      return a.midi - b.midi;
    }
    return a.time - b.time;
  });

  const sanitizedEvents = trimOverlappingNotes(events);

  const secondsPerEighth = 60 / state.bpm / 2;
  const durationSeconds = raw.max_eighths * secondsPerEighth;
  const lengthBars = Math.max(1, Math.ceil(raw.max_eighths / 8));

  return {
    events: sanitizedEvents,
    lengthBars,
    bpm: state.bpm,
    durationSeconds,
    midiData,
    modoTag: raw.modo_tag,
    claveTag: raw.clave_tag,
    maxEighths: raw.max_eighths,
    referenceFiles: raw.reference_files,
  } satisfies GenerationResult;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = globalThis.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function trimOverlappingNotes(events: NoteEvent[]): NoteEvent[] {
  const sanitized: NoteEvent[] = [];
  const lastByMidi = new Map<number, NoteEvent>();

  events.forEach((original) => {
    const current = { ...original };
    const previous = lastByMidi.get(current.midi);
    if (previous) {
      const previousEnd = previous.time + previous.duration;
      if (current.time < previousEnd) {
        const adjustedDuration = Math.max(0, current.time - previous.time);
        if (adjustedDuration <= 1e-6) {
          const index = sanitized.indexOf(previous);
          if (index !== -1) {
            sanitized.splice(index, 1);
          }
          lastByMidi.delete(current.midi);
        } else {
          previous.duration = adjustedDuration;
        }
      }
    }

    if (current.duration > 0) {
      sanitized.push(current);
      lastByMidi.set(current.midi, current);
    }
  });

  return sanitized.filter((event) => event.duration > 1e-6);
}
