import type { Armonizacion, Inversion, Modo, Octavacion, Variacion } from './index';

export const CLAVES: Record<string, { label: string; description: string }> = {
  'Clave 2-3': {
    label: 'Clave 2-3',
    description: 'Patrón tradicional con acento inicial en dos golpes.',
  },
  'Clave 3-2': {
    label: 'Clave 3-2',
    description: 'Patrón invertido con tres golpes al inicio.',
  },
};

export const MODOS: Modo[] = ['Tradicional', 'Extendido', 'Salsa'];
export const ARMONIZACIONES: Armonizacion[] = ['Octavas', 'Doble octava', 'Décimas', 'Treceavas'];
export const OCTAVACIONES: Octavacion[] = ['Original', 'Octava arriba', 'Octava abajo'];
export const VARIACIONES: Variacion[] = ['A', 'B', 'C', 'D'];
export const INVERSIONES: Record<Inversion, string> = {
  root: 'Fundamental',
  third: 'Tercera',
  fifth: 'Quinta',
  seventh: 'Séptima',
};
export const INVERSION_ORDER: Inversion[] = ['root', 'third', 'fifth', 'seventh'];

export const DEFAULT_SALSA_APPROACH_NOTES = ['D', 'A', 'B', 'D#', 'F', 'G#', 'C#'];

export const STORAGE_KEY = 'montuno-web/preferences/v1';
