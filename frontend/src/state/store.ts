import type { AppState, ChordConfig, GenerationResult, Inversion, Modo, Variacion } from '../types';
import { ARMONIZACIONES, CLAVES, INVERSIONES, MODOS, VARIACIONES } from '../types/constants';
import { loadPreferences, savePreferences } from '../storage/preferences';
import { parseProgression } from '../utils/progression';

const listeners = new Set<(state: AppState) => void>();

function createInitialState(): AppState {
  const persisted = loadPreferences();
  const progressionInput = persisted?.progressionInput ?? 'Cmaj7 F7 | G7 Cmaj7';
  const base: AppState = {
    progressionInput,
    clave: persisted?.clave && CLAVES[persisted.clave] ? persisted.clave : 'Clave 2-3',
    modoDefault: persisted?.modoDefault && MODOS.includes(persisted.modoDefault) ? persisted.modoDefault : 'Tradicional',
    armonizacionDefault:
      persisted?.armonizacionDefault && ARMONIZACIONES.includes(persisted.armonizacionDefault)
        ? persisted.armonizacionDefault
        : 'Octavas',
    variation:
      persisted?.variation && VARIACIONES.includes(persisted.variation) ? persisted.variation : VARIACIONES[0],
    inversionDefault:
      persisted?.inversionDefault && INVERSIONES[persisted.inversionDefault]
        ? persisted.inversionDefault
        : 'root',
    bpm: persisted?.bpm ?? 120,
    seed: null,
    chords: [],
    errors: [],
    isPlaying: false,
    generated: undefined,
  };
  const { chords, errors } = buildChords(base.progressionInput, base);
  base.chords = chords;
  base.errors = errors;
  return base;
}

let state: AppState = createInitialState();

function emit(): void {
  listeners.forEach((listener) => listener(state));
}

function persist(): void {
  savePreferences(state);
}

function buildChords(
  progressionInput: string,
  base: Pick<AppState, 'modoDefault' | 'armonizacionDefault' | 'inversionDefault' | 'chords'>
): { chords: ChordConfig[]; errors: string[] } {
  const parsed = parseProgression(progressionInput);
  const previous = base.chords;
  const chords = parsed.chords.map((chord, index) => {
    const prev = previous[index];
    if (prev && prev.name === chord.name) {
      return { ...prev, index };
    }
    return {
      index,
      name: chord.name,
      modo: base.modoDefault,
      armonizacion: base.armonizacionDefault,
      inversion: base.inversionDefault,
    } satisfies ChordConfig;
  });
  return { chords, errors: parsed.errors };
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: (state: AppState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function updateState(partial: Partial<AppState>): void {
  state = { ...state, ...partial };
  emit();
  persist();
}

export function setProgression(progressionInput: string): void {
  const { chords, errors } = buildChords(progressionInput, {
    modoDefault: state.modoDefault,
    armonizacionDefault: state.armonizacionDefault,
    inversionDefault: state.inversionDefault,
    chords: state.chords,
  });
  updateState({ progressionInput, chords, errors, generated: undefined });
}

export function setDefaultModo(modo: Modo): void {
  const chords = state.chords.map((chord) => ({ ...chord, modo }));
  updateState({ modoDefault: modo, chords });
}

export function setDefaultArmonizacion(armonizacion: AppState['armonizacionDefault']): void {
  const chords = state.chords.map((chord) => ({ ...chord, armonizacion }));
  updateState({ armonizacionDefault: armonizacion, chords });
}

export function setDefaultInversion(inversion: Inversion): void {
  const chords = state.chords.map((chord) => ({ ...chord, inversion }));
  updateState({ inversionDefault: inversion, chords });
}

export function setVariation(variation: Variacion): void {
  updateState({ variation });
}

export function setClave(clave: string): void {
  if (!CLAVES[clave]) {
    return;
  }
  updateState({ clave });
}

export function setBpm(bpm: number): void {
  updateState({ bpm });
}

export function setSeed(seed: number | null): void {
  updateState({ seed });
}

export function setChord(index: number, patch: Partial<Omit<ChordConfig, 'index' | 'name'>>): void {
  const chords = state.chords.map((chord) => {
    if (chord.index !== index) {
      return chord;
    }
    return { ...chord, ...patch };
  });
  updateState({ chords });
}

export function setGenerated(result: GenerationResult | undefined): void {
  updateState({ generated: result });
}

export function setErrors(errors: string[]): void {
  updateState({ errors });
}

export function setIsPlaying(isPlaying: boolean): void {
  state = { ...state, isPlaying };
  emit();
}

export function resetPlayback(): void {
  setIsPlaying(false);
}
