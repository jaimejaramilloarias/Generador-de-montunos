export type Modo = 'Tradicional' | 'Salsa';
export type Armonizacion = 'Octavas' | 'Doble octava' | 'Décimas' | 'Treceavas';
export type Variacion = 'A' | 'B' | 'C' | 'D';
export type Inversion = 'root' | 'third' | 'fifth' | 'seventh';

export interface ChordConfig {
  index: number;
  name: string;
  modo: Modo;
  armonizacion: Armonizacion;
  inversion: Inversion;
}

export interface SavedProgression {
  id: string;
  name: string;
  progression: string;
  updatedAt: string;
}

export interface AppState {
  progressionInput: string;
  clave: string;
  modoDefault: Modo;
  armonizacionDefault: Armonizacion;
  variation: Variacion;
  inversionDefault: Inversion;
  bpm: number;
  seed: number | null;
  chords: ChordConfig[];
  errors: string[];
  isPlaying: boolean;
  generated?: GenerationResult;
  savedProgressions: SavedProgression[];
  activeProgressionId: string | null;
}

export interface GenerationResult {
  events: NoteEvent[];
  lengthBars: number;
  bpm: number;
  durationSeconds: number;
}

export interface NoteEvent {
  time: number; // in beats
  duration: number; // in beats
  midi: number;
  velocity: number; // 0 - 1
}

export interface PersistedState {
  progressionInput: string;
  clave: string;
  modoDefault: Modo;
  armonizacionDefault: Armonizacion;
  variation: Variacion;
  inversionDefault: Inversion;
  bpm: number;
  savedProgressions?: SavedProgression[];
  activeProgressionId?: string | null;
}

export interface ParsedChord {
  name: string;
  raw: string;
  index: number;
}
