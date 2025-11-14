import type { AppState, PersistedState } from '../types';
import { STORAGE_KEY } from '../types/constants';

export function loadPreferences(): PersistedState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as PersistedState;
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
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('No se pudieron guardar las preferencias.', error);
  }
}
