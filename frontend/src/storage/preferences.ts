import type { AppState, ManualEditEntry, PersistedState, SavedProgression } from '../types';
import { STORAGE_KEY } from '../types/constants';

function isSavedProgression(value: unknown): value is SavedProgression {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.progression === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isManualEdit(value: unknown): value is ManualEditEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.type === 'modify' || candidate.type === 'add' || candidate.type === 'delete') &&
    typeof candidate.startBeats === 'number' &&
    Number.isFinite(candidate.startBeats) &&
    typeof candidate.durationBeats === 'number' &&
    Number.isFinite(candidate.durationBeats) &&
    typeof candidate.pitch === 'number' &&
    Number.isFinite(candidate.pitch)
  );
}

export function loadPreferences(): PersistedState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return null;
    }
    const parsed = JSON.parse(data) as PersistedState;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (Array.isArray(parsed.savedProgressions)) {
      parsed.savedProgressions = parsed.savedProgressions.filter(isSavedProgression);
    } else {
      delete parsed.savedProgressions;
    }
    if (Array.isArray((parsed as Record<string, unknown>).manualEdits)) {
      parsed.manualEdits = (parsed as Record<string, unknown>).manualEdits?.filter(isManualEdit);
    }
    if (parsed.activeProgressionId !== undefined && typeof parsed.activeProgressionId !== 'string') {
      parsed.activeProgressionId = null;
    }
    if (
      parsed.selectedMidiOutputId !== undefined &&
      parsed.selectedMidiOutputId !== null &&
      typeof parsed.selectedMidiOutputId !== 'string'
    ) {
      parsed.selectedMidiOutputId = null;
    }
    return parsed;
  } catch (error) {
    console.warn('No se pudieron cargar las preferencias guardadas.', error);
    return null;
  }
}

export function savePreferences(state: AppState): void {
  if (typeof window === 'undefined') {
    return;
  }
  const data: PersistedState = {
    progressionInput: state.progressionInput,
    clave: state.clave,
    modoDefault: state.modoDefault,
    armonizacionDefault: state.armonizacionDefault,
    variation: state.variation,
    inversionDefault: state.inversionDefault,
    bpm: state.bpm,
    manualEdits: state.manualEdits,
    savedProgressions: state.savedProgressions,
    activeProgressionId: state.activeProgressionId,
    selectedMidiOutputId: state.selectedMidiOutputId,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('No se pudieron guardar las preferencias.', error);
  }
}
