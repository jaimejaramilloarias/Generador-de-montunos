import type {
  AppState,
  ChordConfig,
  GenerationResult,
  Inversion,
  Modo,
  SavedProgression,
  Variacion,
} from '../types';
import { ARMONIZACIONES, CLAVES, INVERSIONES, MODOS, VARIACIONES } from '../types/constants';
import { loadPreferences, savePreferences } from '../storage/preferences';
import { parseProgression } from '../utils/progression';

const listeners = new Set<(state: AppState) => void>();

function createId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `prog-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normaliseSavedProgressions(list?: SavedProgression[]): SavedProgression[] {
  if (!list || !Array.isArray(list) || list.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  return list
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .filter((item) => {
      if (!item || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    })
    .map((item) => ({
      ...item,
      name: item.name.trim() || 'Progresión guardada',
      progression: item.progression.trim(),
    }));
}

function createDefaultProgressionName(current: SavedProgression[]): string {
  const existingNames = new Set(current.map((item) => item.name));
  let index = current.length + 1;
  let candidate = `Progresión ${index}`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `Progresión ${index}`;
  }
  return candidate;
}

function createInitialState(): AppState {
  const persisted = loadPreferences();
  const savedProgressions = normaliseSavedProgressions(persisted?.savedProgressions);
  const activeFromPersisted =
    persisted?.activeProgressionId && savedProgressions.some((item) => item.id === persisted.activeProgressionId)
      ? persisted.activeProgressionId
      : null;
  const activeProgression = activeFromPersisted
    ? savedProgressions.find((item) => item.id === activeFromPersisted) ?? null
    : null;
  const progressionInput = activeProgression?.progression ?? persisted?.progressionInput ?? 'Cmaj7 F7 | G7 Cmaj7';
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
    savedProgressions,
    activeProgressionId: activeFromPersisted,
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
  const parsed = parseProgression(progressionInput, { armonizacionDefault: base.armonizacionDefault });
  const previous = base.chords;
  const chords = parsed.chords.map((chord, index) => {
    const prev = previous[index];
    const armonizacion = chord.armonizacion ?? prev?.armonizacion ?? base.armonizacionDefault;
    const inversion =
      chord.forcedInversion !== undefined
        ? chord.forcedInversion
        : prev?.inversion ?? base.inversionDefault;
    if (prev && prev.name === chord.name) {
      return {
        ...prev,
        index,
        armonizacion,
        inversion,
      } satisfies ChordConfig;
    }
    return {
      index,
      name: chord.name,
      modo: base.modoDefault,
      armonizacion,
      inversion,
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

function applyProgression(
  progressionInput: string,
  options?: {
    activeProgressionId?: string | null;
  }
): void {
  const { chords, errors } = buildChords(progressionInput, {
    modoDefault: state.modoDefault,
    armonizacionDefault: state.armonizacionDefault,
    inversionDefault: state.inversionDefault,
    chords: state.chords,
  });
  let nextActiveId: string | null = state.activeProgressionId;
  if (options && 'activeProgressionId' in options) {
    nextActiveId = options.activeProgressionId ?? null;
  } else {
    const currentActive = nextActiveId
      ? state.savedProgressions.find((item) => item.id === nextActiveId)
      : undefined;
    if (!currentActive || currentActive.progression !== progressionInput) {
      const matching = state.savedProgressions.find((item) => item.progression === progressionInput);
      nextActiveId = matching ? matching.id : null;
    }
  }
  updateState({ progressionInput, chords, errors, generated: undefined, activeProgressionId: nextActiveId });
}

export function setProgression(progressionInput: string): void {
  applyProgression(progressionInput);
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

export function saveCurrentProgression(name: string): void {
  const trimmedProgression = state.progressionInput.trim();
  if (!trimmedProgression || state.errors.length > 0) {
    return;
  }
  const now = new Date().toISOString();
  const existingActive = state.activeProgressionId
    ? state.savedProgressions.find((item) => item.id === state.activeProgressionId)
    : undefined;
  const desiredName = name.trim();
  let nextSaved: SavedProgression;
  let savedProgressions: SavedProgression[];

  if (existingActive) {
    const finalName = desiredName || existingActive.name;
    nextSaved = {
      ...existingActive,
      name: finalName,
      progression: trimmedProgression,
      updatedAt: now,
    };
    savedProgressions = [nextSaved, ...state.savedProgressions.filter((item) => item.id !== existingActive.id)];
  } else {
    const duplicate = state.savedProgressions.find((item) => item.progression === trimmedProgression);
    const finalName = desiredName || duplicate?.name || createDefaultProgressionName(state.savedProgressions);
    if (duplicate) {
      nextSaved = {
        ...duplicate,
        name: finalName,
        progression: trimmedProgression,
        updatedAt: now,
      };
      savedProgressions = [nextSaved, ...state.savedProgressions.filter((item) => item.id !== duplicate.id)];
    } else {
      nextSaved = {
        id: createId(),
        name: finalName,
        progression: trimmedProgression,
        updatedAt: now,
      };
      savedProgressions = [nextSaved, ...state.savedProgressions];
    }
  }

  updateState({ savedProgressions, activeProgressionId: nextSaved.id });
}

export function loadSavedProgression(id: string): void {
  const saved = state.savedProgressions.find((item) => item.id === id);
  if (!saved) {
    return;
  }
  applyProgression(saved.progression, { activeProgressionId: saved.id });
}

export function deleteSavedProgression(id: string): void {
  if (!state.savedProgressions.some((item) => item.id === id)) {
    return;
  }
  const remaining = state.savedProgressions.filter((item) => item.id !== id);
  let nextActiveId = state.activeProgressionId;
  if (state.activeProgressionId === id) {
    const match = remaining.find((item) => item.progression === state.progressionInput.trim());
    nextActiveId = match ? match.id : null;
  }
  updateState({ savedProgressions: remaining, activeProgressionId: nextActiveId ?? null });
}
