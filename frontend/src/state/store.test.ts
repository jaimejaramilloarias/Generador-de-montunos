import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../types';

let getState: () => AppState;
let setProgression: (progression: string) => void;
let saveCurrentProgression: (name: string) => void;
let loadSavedProgression: (id: string) => void;
let deleteSavedProgression: (id: string) => void;
let setDefaultModo: (modo: AppState['modoDefault']) => void;
let setChord: (
  index: number,
  patch: Partial<Pick<AppState['chords'][number], 'modo' | 'armonizacion' | 'octavacion' | 'inversion'>>
) => void;
let recalculateInversions: () => void;
let resetChordOverrides: () => void;

async function importStore() {
  const store = await import('./store');
  getState = store.getState;
  setProgression = store.setProgression;
  saveCurrentProgression = store.saveCurrentProgression;
  loadSavedProgression = store.loadSavedProgression;
  deleteSavedProgression = store.deleteSavedProgression;
  setDefaultModo = store.setDefaultModo;
  setChord = store.setChord;
  recalculateInversions = store.recalculateInversions;
  resetChordOverrides = store.resetChordOverrides;
}

describe('state/store saved progressions', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.resetModules();
    await importStore();
  });

  it('guarda una progresión nueva y la marca como activa', () => {
    setProgression('Cm7 F7');
    saveCurrentProgression('Mi montuno');

    const state = getState();
    expect(state.savedProgressions).toHaveLength(1);
    expect(state.savedProgressions[0].name).toBe('Mi montuno');
    expect(state.activeProgressionId).toBe(state.savedProgressions[0].id);
  });

  it('cargar una progresión restablece el texto y los acordes', () => {
    setProgression('Cm7 F7');
    saveCurrentProgression('Intro en Cm');
    const firstId = getState().savedProgressions[0].id;

    setProgression('Gm7 C7');
    saveCurrentProgression('II-V en F');

    loadSavedProgression(firstId);

    const state = getState();
    expect(state.progressionInput).toBe('Cm7 F7');
    expect(state.activeProgressionId).toBe(firstId);
    expect(state.chords[0]?.name).toBe('Cm7');
  });

  it('eliminar una progresión la quita del listado y limpia el estado activo', () => {
    setProgression('Cm7 F7');
    saveCurrentProgression('Intro en Cm');
    const { id } = getState().savedProgressions[0];

    deleteSavedProgression(id);

    const state = getState();
    expect(state.savedProgressions).toHaveLength(0);
    expect(state.activeProgressionId).toBeNull();
  });

  it('usa el modo tradicional como predeterminado', () => {
    setProgression('Cmaj9 | Dm7(9) G7');
    const state = getState();
    expect(state.chords.every((chord) => chord.modo === 'Tradicional')).toBe(true);
  });

  it('permite cambiar el modo global a salsa', () => {
    setProgression('Cmaj7 F7 | G7 Cmaj7');
    setDefaultModo('Salsa');

    const state = getState();
    expect(state.chords.every((chord) => chord.modo === 'Salsa')).toBe(true);
    expect(state.modoDefault).toBe('Salsa');
  });

  it('mantiene overrides manuales al actualizar el modo global', () => {
    setProgression('Cmaj9 | Dm9 G9');
    setChord(0, { modo: 'Salsa' });

    setDefaultModo('Tradicional');

    const state = getState();
    expect(state.chords[0]?.modo).toBe('Salsa');
    expect(state.chords[1]?.modo).toBe('Tradicional');
    expect(state.chords[2]?.modo).toBe('Tradicional');
    expect(state.modoDefault).toBe('Tradicional');
  });

  it('permite ajustar el modo de cualquier acorde sin imponer un modo oculto', () => {
    setProgression('Cmaj7 | Dm7 G7');
    setDefaultModo('Salsa');
    setChord(0, { modo: 'Tradicional' });
    setChord(2, { modo: 'Tradicional' });

    const state = getState();
    expect(state.chords[0]?.modo).toBe('Tradicional');
    expect(state.chords[1]?.modo).toBe('Salsa');
    expect(state.chords[2]?.modo).toBe('Tradicional');
  });

  it('recalcular inversiones restablece los enlaces ignorando overrides manuales', () => {
    setProgression('Cmaj7 F7');
    setChord(0, { inversion: 'seventh' });

    recalculateInversions();

    const state = getState();
    expect(state.chords[0]?.inversion).toBe('root');
  });

  it('limpia los overrides manuales y restablece los acordes a los valores por defecto', () => {
    setProgression('Cmaj7 G7/B');
    setDefaultModo('Salsa');
    setChord(0, { modo: 'Tradicional', armonizacion: 'Doble octava', inversion: 'third' });
    setChord(1, { octavacion: 'Octava arriba', inversion: 'fifth' });

    resetChordOverrides();

    const state = getState();
    expect(state.chords.every((chord) => chord.modo === state.modoDefault)).toBe(true);
    expect(state.chords.every((chord) => chord.registerOffset === 0)).toBe(true);
    expect(state.chords[0]?.inversion).toBeNull();
    expect(state.chords[1]?.inversion).toBeNull();
  });
});
