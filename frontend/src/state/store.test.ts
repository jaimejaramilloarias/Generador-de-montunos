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

async function importStore() {
  const store = await import('./store');
  getState = store.getState;
  setProgression = store.setProgression;
  saveCurrentProgression = store.saveCurrentProgression;
  loadSavedProgression = store.loadSavedProgression;
  deleteSavedProgression = store.deleteSavedProgression;
  setDefaultModo = store.setDefaultModo;
  setChord = store.setChord;
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

  it('detecta acordes extendidos y fuerza el modo extendido', () => {
    setProgression('Cmaj9 | Dm7(9) G7');
    const state = getState();
    expect(state.chords[0]?.modo).toBe('Extendido');
    expect(state.chords[0]?.inversion).toBeNull();
    expect(state.chords[1]?.modo).toBe('Extendido');
    expect(state.chords[2]?.modo).toBe('Tradicional');
  });

  it('permite cambiar el modo global a extendido', () => {
    setProgression('Cmaj7 F7 | G7 Cmaj7');
    setDefaultModo('Extendido');

    const state = getState();
    expect(state.chords.every((chord) => chord.modo === 'Extendido')).toBe(true);
    expect(state.modoDefault).toBe('Extendido');
  });

  it('mantiene el modo extendido en acordes con tensiones al cambiar el modo global', () => {
    setProgression('Cmaj9 | Dm7(9) G7');
    setDefaultModo('Tradicional');

    const state = getState();
    expect(state.chords[0]?.modo).toBe('Extendido');
    expect(state.chords[1]?.modo).toBe('Extendido');
    expect(state.chords[2]?.modo).toBe('Tradicional');
    expect(state.modoDefault).toBe('Tradicional');
  });

  it('permite ajustar el modo de cualquier acorde, aunque el cifrado sea extendido', () => {
    setProgression('Cmaj9 | Dm9 G9');
    setChord(0, { modo: 'Tradicional' });
    setChord(2, { modo: 'Salsa' });

    const state = getState();
    expect(state.chords[0]?.modo).toBe('Tradicional');
    expect(state.chords[1]?.modo).toBe('Extendido');
    expect(state.chords[2]?.modo).toBe('Salsa');
  });
});
