import type {
  AppState,
  ChordConfig,
  GenerationResult,
  Inversion,
  ManualEditEntry,
  MidiOutputInfo,
  MidiStatus,
  Modo,
  SavedProgression,
  Variacion,
} from '../types';
import {
  ARMONIZACIONES,
  CLAVES,
  INVERSIONES,
  INVERSION_ORDER,
  MODOS,
  OCTAVACIONES,
  VARIACIONES,
} from '../types/constants';
import { loadPreferences, savePreferences } from '../storage/preferences';
import { parseProgression } from '../utils/progression';
import { isExtendedChordName } from '../utils/chords';
import { resolveInversionChain, stepInversionPitch } from '../music/inversions';

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

function isValidManualEdit(entry: ManualEditEntry): boolean {
  return (
    (entry.type === 'modify' || entry.type === 'add' || entry.type === 'delete') &&
    Number.isFinite(entry.startBeats) &&
    Number.isFinite(entry.durationBeats) &&
    Number.isFinite(entry.pitch)
  );
}

function detectInitialMidiStatus(): MidiStatus {
  if (typeof navigator === 'undefined') {
    return 'unavailable';
  }
  return typeof navigator.requestMIDIAccess === 'function' ? 'idle' : 'unavailable';
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
  const midiStatus = detectInitialMidiStatus();
  const base: AppState = {
    progressionInput,
    clave: persisted?.clave && CLAVES[persisted.clave] ? persisted.clave : 'Clave 2-3',
    modoDefault: persisted?.modoDefault && MODOS.includes(persisted.modoDefault) ? persisted.modoDefault : 'Tradicional',
    armonizacionDefault:
      persisted?.armonizacionDefault && ARMONIZACIONES.includes(persisted.armonizacionDefault)
        ? persisted.armonizacionDefault
        : 'Octavas',
    octavacionDefault:
      persisted?.octavacionDefault && OCTAVACIONES.includes(persisted.octavacionDefault)
        ? persisted.octavacionDefault
        : 'Original',
    variation:
      persisted?.variation && VARIACIONES.includes(persisted.variation) ? persisted.variation : VARIACIONES[0],
    inversionDefault:
      persisted?.inversionDefault && INVERSIONES[persisted.inversionDefault]
        ? persisted.inversionDefault
        : 'root',
    bpm: persisted?.bpm ?? 120,
    seed: null,
    chords: [],
    manualEdits: Array.isArray(persisted?.manualEdits)
      ? persisted.manualEdits.filter((edit) => isValidManualEdit(edit as ManualEditEntry))
      : [],
    errors: [],
    isPlaying: false,
    isGenerating: false,
    generated: undefined,
    savedProgressions,
    activeProgressionId: activeFromPersisted,
    midiStatus,
    midiOutputs: [],
    selectedMidiOutputId: midiStatus === 'unavailable' ? null : persisted?.selectedMidiOutputId ?? null,
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
  base: Pick<AppState, 'modoDefault' | 'armonizacionDefault' | 'octavacionDefault' | 'chords'>
): { chords: ChordConfig[]; errors: string[] } {
  const parsed = parseProgression(progressionInput, { armonizacionDefault: base.armonizacionDefault });
  const previous = base.chords;
  const chords = parsed.chords.map((chord, index) => {
    const prev = previous[index];
    const armonizacion = chord.armonizacion ?? prev?.armonizacion ?? base.armonizacionDefault;
    const octavacion = prev?.octavacion ?? base.octavacionDefault;
    const forcedInversion = chord.forcedInversion ?? null;
    const isExtended = isExtendedChordName(chord.name);

    if (prev && prev.name === chord.name) {
      const nextInversion = forcedInversion ?? prev.inversion ?? null;
      const nextModo = isExtended ? prev.modo ?? 'Extendido' : prev.modo;
      return {
        ...prev,
        index,
        modo: nextModo,
        armonizacion,
        octavacion,
        inversion: nextInversion,
        isRecognized: chord.isRecognized,
      } satisfies ChordConfig;
    }

    const nextModo = isExtended ? 'Extendido' : base.modoDefault;
    return {
      index,
      name: chord.name,
      modo: nextModo,
      armonizacion,
      octavacion: base.octavacionDefault,
      inversion: forcedInversion,
      isRecognized: chord.isRecognized,
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

function markDirty(): void {
  const updates: Partial<AppState> = {};
  if (state.generated) {
    updates.generated = undefined;
  }
  if (state.isPlaying) {
    updates.isPlaying = false;
  }
  if (Object.keys(updates).length > 0) {
    updateState(updates);
  }
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
    octavacionDefault: state.octavacionDefault,
    chords: state.chords,
  });
  const wasGenerating = state.isGenerating;
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
  if (wasGenerating) {
    setIsGenerating(false);
  }
}

export function setProgression(progressionInput: string): void {
  applyProgression(progressionInput);
}

export function setDefaultModo(modo: Modo): void {
  const chords = state.chords.map((chord) =>
    isExtendedChordName(chord.name) ? chord : { ...chord, modo }
  );
  updateState({ modoDefault: modo, chords });
  markDirty();
}

export function setDefaultArmonizacion(armonizacion: AppState['armonizacionDefault']): void {
  const chords = state.chords.map((chord) => ({ ...chord, armonizacion }));
  updateState({ armonizacionDefault: armonizacion, chords });
  markDirty();
}

export function setDefaultOctavacion(octavacion: AppState['octavacionDefault']): void {
  const chords = state.chords.map((chord) => ({ ...chord, octavacion }));
  updateState({ octavacionDefault: octavacion, chords });
  markDirty();
}

export function setDefaultInversion(inversion: Inversion): void {
  const chords = state.chords.map((chord) =>
    chord.inversion === null ? chord : { ...chord, inversion }
  );
  updateState({ inversionDefault: inversion, chords });
  markDirty();
}

export function setVariation(variation: Variacion): void {
  updateState({ variation });
  markDirty();
}

export function setClave(clave: string): void {
  if (!CLAVES[clave]) {
    return;
  }
  updateState({ clave });
  markDirty();
}

export function setBpm(bpm: number): void {
  updateState({ bpm });
  markDirty();
}

export function setSeed(seed: number | null): void {
  updateState({ seed });
  markDirty();
}

export function setChord(
  index: number,
  patch: Partial<Omit<ChordConfig, 'index' | 'name' | 'isRecognized'>>
): void {
  const chords = state.chords.map((chord) => {
    if (chord.index !== index) {
      return chord;
    }
    const next: ChordConfig = {
      ...chord,
      ...patch,
      inversion: patch.inversion === undefined ? chord.inversion : patch.inversion,
    };
    if (isExtendedChordName(next.name) && patch.modo === undefined) {
      next.modo = 'Extendido';
    }
    return next;
  });
  updateState({ chords });
  markDirty();
}

export function nudgeChordBass(index: number, direction: 1 | -1): void {
  const resolved = resolveInversionChain(state.chords, state.inversionDefault);
  const chord = state.chords[index];
  const current = resolved[index];
  if (!chord || !current) {
    return;
  }
  let pitch = current.pitch;
  let inversion = current.inversion;
  const steps = Math.max(1, Math.abs(direction));
  const sign: 1 | -1 = direction >= 0 ? 1 : -1;

  for (let step = 0; step < steps; step += 1) {
    const target = stepInversionPitch(chord.name, pitch, sign);
    pitch = target.pitch;
    inversion = target.inversion;
  }

  if (inversion !== current.inversion) {
    setChord(index, { inversion });
  }
}

export function shiftAllInversions(delta: number): void {
  if (!delta) {
    return;
  }

  const resolved = resolveInversionChain(state.chords, state.inversionDefault);
  const steps = Math.max(1, Math.abs(delta));
  const direction: 1 | -1 = delta > 0 ? 1 : -1;

  const chords = state.chords.map((chord, idx) => {
    const current = resolved[idx];
    if (!current) {
      return chord;
    }

    let pitch = current.pitch;
    let inversion = current.inversion;
    for (let step = 0; step < steps; step += 1) {
      const target = stepInversionPitch(chord.name, pitch, direction);
      pitch = target.pitch;
      inversion = target.inversion;
    }

    if (inversion === chord.inversion) {
      return chord;
    }

    return { ...chord, inversion } satisfies ChordConfig;
  });
  updateState({ chords });
  markDirty();
}

export function recalculateInversions(): void {
  const baseChords = state.chords.map((chord) => ({ ...chord, inversion: null as Inversion | null }));
  const resolved = resolveInversionChain(baseChords, state.inversionDefault);
  const chords = state.chords.map((chord, index) => ({
    ...chord,
    inversion: resolved[index]?.inversion ?? state.inversionDefault ?? null,
  }));
  updateState({ chords });
  markDirty();
}

export function addManualEdit(): void {
  const next: ManualEditEntry = { type: 'modify', startBeats: 0, durationBeats: 1, pitch: 60 };
  updateState({ manualEdits: [next, ...state.manualEdits] });
  markDirty();
}

export function updateManualEdit(index: number, patch: Partial<ManualEditEntry>): void {
  const manualEdits = state.manualEdits.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry));
  updateState({ manualEdits });
  markDirty();
}

export function removeManualEdit(index: number): void {
  const manualEdits = state.manualEdits.filter((_, idx) => idx !== index);
  updateState({ manualEdits });
  markDirty();
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

export function setIsGenerating(isGenerating: boolean): void {
  state = { ...state, isGenerating };
  emit();
}

export function setMidiStatus(status: MidiStatus): void {
  updateState({ midiStatus: status });
}

export function setMidiOutputs(outputs: MidiOutputInfo[]): void {
  updateState({ midiOutputs: outputs });
}

export function setSelectedMidiOutput(id: string | null): void {
  updateState({ selectedMidiOutputId: id });
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
