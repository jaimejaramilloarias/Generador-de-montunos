import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '../types';

let getState: () => AppState;
let setProgression: (progression: string) => void;
let saveCurrentProgression: (name: string) => void;
let loadSavedProgression: (id: string) => void;
let deleteSavedProgression: (id: string) => void;
let setChord: (
  index: number,
  patch: Partial<
    Pick<AppState['chords'][number], 'armonizacion' | 'octavacion' | 'inversion' | 'registerOffset'>
  >
) => void;
let recalculateInversions: () => void;
let resetChordOverrides: () => void;
let shiftChordOctave: (index: number, delta: number) => void;
let shiftAllOctaves: (delta: number) => void;

async function importStore() {
  const store = await import('./store');
  getState = store.getState;
  setProgression = store.setProgression;
  saveCurrentProgression = store.saveCurrentProgression;
  loadSavedProgression = store.loadSavedProgression;
  deleteSavedProgression = store.deleteSavedProgression;
  setChord = store.setChord;
  recalculateInversions = store.recalculateInversions;
  resetChordOverrides = store.resetChordOverrides;
  shiftChordOctave = store.shiftChordOctave;
  shiftAllOctaves = store.shiftAllOctaves;
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

  it('asigna el modo salsa a todos los acordes por defecto', () => {
    setProgression('Cmaj7 F7 | G7 Cmaj7');

    const state = getState();
    expect(state.chords.every((chord) => chord.modo === 'Salsa')).toBe(true);
    expect(state.modoDefault).toBe('Salsa');
  });

  it('restablece los overrides al usar el botón global de reseteo', () => {
    setProgression('Cmaj7 F7');
    setChord(0, { octavacion: 'Octava abajo', inversion: 'fifth', registerOffset: -1 });

    resetChordOverrides();

    const state = getState();
    expect(state.chords[0]?.octavacion).toBe(state.octavacionDefault);
    expect(state.chords[0]?.inversion).toBeNull();
    expect(state.chords[0]?.registerOffset).toBe(0);
  });

  it('recalcular inversiones restablece los enlaces ignorando overrides manuales', () => {
    setProgression('Cmaj7 F7');
    setChord(0, { inversion: 'seventh' });

    recalculateInversions();

    const state = getState();
    expect(state.chords[0]?.inversion).toBe('root');
  });

  it('permite transponer una octava por acorde sin modificar los demás', () => {
    setProgression('Cmaj7 F7');

    shiftChordOctave(1, 1);

    let state = getState();
    expect(state.chords[0]?.registerOffset).toBe(0);
    expect(state.chords[1]?.registerOffset).toBe(1);

    shiftChordOctave(1, -2);

    state = getState();
    expect(state.chords[1]?.registerOffset).toBe(-1);
  });

  it('aplica la transposición global respetando el límite de octavas', () => {
    setProgression('Cmaj7 F7');

    shiftAllOctaves(3);
    shiftAllOctaves(3);

    let state = getState();
    expect(state.chords.every((chord) => chord.registerOffset <= 4)).toBe(true);

    shiftAllOctaves(-10);
    state = getState();
    expect(state.chords.every((chord) => chord.registerOffset >= -4)).toBe(true);
  });
});
