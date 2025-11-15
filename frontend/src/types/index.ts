export type Modo = 'Tradicional' | 'Extendido' | 'Salsa';
export type Armonizacion = 'Octavas' | 'Doble octava' | 'Décimas' | 'Treceavas';
export type Variacion = 'A' | 'B' | 'C' | 'D';
export type Inversion = 'root' | 'third' | 'fifth' | 'seventh';

export interface ChordConfig {
  index: number;
  name: string;
  modo: Modo;
  armonizacion: Armonizacion;
  inversion: Inversion | null;
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
  isGenerating: boolean;
  generated?: GenerationResult;
  savedProgressions: SavedProgression[];
  activeProgressionId: string | null;
  midiStatus: MidiStatus;
  midiOutputs: MidiOutputInfo[];
  selectedMidiOutputId: string | null;
}

export interface GenerationResult {
  events: NoteEvent[];
  lengthBars: number;
  bpm: number;
  durationSeconds: number;
  midiData: Uint8Array;
  modoTag: string;
  claveTag: string;
  maxEighths: number;
  referenceFiles: string[];
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
  selectedMidiOutputId?: string | null;
}

export type MidiStatus = 'unavailable' | 'idle' | 'pending' | 'ready' | 'denied';

export interface MidiOutputInfo {
  id: string;
  name: string;
  manufacturer?: string | null;
}

export interface ParsedChord {
  name: string;
  raw: string;
  index: number;
  armonizacion?: Armonizacion;
  forcedInversion?: Inversion | null;
}
