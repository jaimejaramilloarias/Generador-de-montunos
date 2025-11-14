import type { Variacion } from '../types';
import type { VoiceLayout } from './chords';

export type VoiceRole = keyof VoiceLayout;

export interface PatternStep {
  time: number; // beats within the bar
  duration: number; // beats
  velocity: number; // 0-1
  roles: VoiceRole[];
}

const BAR_BEATS = 4;

const tradBase: Record<Variacion, PatternStep[]> = {
  A: [
    { time: 0, duration: 0.5, velocity: 0.95, roles: ['root', 'third'] },
    { time: 0.5, duration: 0.5, velocity: 0.75, roles: ['fifth'] },
    { time: 1, duration: 0.5, velocity: 0.85, roles: ['rootHigh', 'tenth'] },
    { time: 1.5, duration: 0.5, velocity: 0.75, roles: ['fifthHigh'] },
    { time: 2, duration: 0.5, velocity: 0.9, roles: ['root', 'third'] },
    { time: 2.5, duration: 0.5, velocity: 0.8, roles: ['tenth'] },
    { time: 3, duration: 0.5, velocity: 0.9, roles: ['rootHigh', 'thirteenth'] },
    { time: 3.5, duration: 0.5, velocity: 0.78, roles: ['fifth'] },
  ],
  B: [
    { time: 0, duration: 0.5, velocity: 0.9, roles: ['root', 'third'] },
    { time: 0.5, duration: 0.5, velocity: 0.8, roles: ['tenth'] },
    { time: 1.25, duration: 0.5, velocity: 0.85, roles: ['rootHigh'] },
    { time: 1.75, duration: 0.5, velocity: 0.7, roles: ['fifth'] },
    { time: 2.25, duration: 0.5, velocity: 0.88, roles: ['root', 'third'] },
    { time: 2.75, duration: 0.5, velocity: 0.8, roles: ['fifthHigh'] },
    { time: 3.25, duration: 0.5, velocity: 0.86, roles: ['tenth'] },
    { time: 3.75, duration: 0.25, velocity: 0.82, roles: ['rootHigh', 'thirteenth'] },
  ],
  C: [
    { time: 0, duration: 0.5, velocity: 0.95, roles: ['root', 'third'] },
    { time: 0.5, duration: 0.5, velocity: 0.85, roles: ['seventh'] },
    { time: 1, duration: 0.5, velocity: 0.9, roles: ['rootHigh', 'tenth'] },
    { time: 1.5, duration: 0.5, velocity: 0.78, roles: ['fifth'] },
    { time: 2, duration: 0.5, velocity: 0.92, roles: ['root', 'third'] },
    { time: 2.5, duration: 0.5, velocity: 0.8, roles: ['tenth'] },
    { time: 3, duration: 0.5, velocity: 0.87, roles: ['seventhHigh'] },
    { time: 3.5, duration: 0.5, velocity: 0.8, roles: ['thirteenth'] },
  ],
  D: [
    { time: 0, duration: 0.5, velocity: 0.93, roles: ['root', 'third'] },
    { time: 0.5, duration: 0.5, velocity: 0.8, roles: ['fifthHigh'] },
    { time: 1, duration: 0.5, velocity: 0.88, roles: ['rootHigh'] },
    { time: 1.5, duration: 0.5, velocity: 0.75, roles: ['tenth'] },
    { time: 2, duration: 0.5, velocity: 0.9, roles: ['root', 'fifth'] },
    { time: 2.5, duration: 0.5, velocity: 0.78, roles: ['thirdHigh'] },
    { time: 3, duration: 0.5, velocity: 0.86, roles: ['rootHigh', 'thirteenth'] },
    { time: 3.5, duration: 0.5, velocity: 0.76, roles: ['fifth'] },
  ],
};

const salsaBase: Record<Variacion, PatternStep[]> = {
  A: [
    { time: 0, duration: 0.5, velocity: 0.96, roles: ['root', 'third'] },
    { time: 0.75, duration: 0.5, velocity: 0.85, roles: ['tenth'] },
    { time: 1.5, duration: 0.5, velocity: 0.82, roles: ['rootHigh'] },
    { time: 2, duration: 0.5, velocity: 0.9, roles: ['fifth'] },
    { time: 2.75, duration: 0.5, velocity: 0.87, roles: ['tenth'] },
    { time: 3.25, duration: 0.5, velocity: 0.92, roles: ['rootHigh', 'thirteenth'] },
  ],
  B: [
    { time: 0, duration: 0.5, velocity: 0.95, roles: ['root', 'third'] },
    { time: 0.5, duration: 0.5, velocity: 0.82, roles: ['tenth'] },
    { time: 1.25, duration: 0.5, velocity: 0.9, roles: ['rootHigh'] },
    { time: 2, duration: 0.5, velocity: 0.88, roles: ['fifthHigh'] },
    { time: 2.5, duration: 0.5, velocity: 0.85, roles: ['tenth'] },
    { time: 3, duration: 0.5, velocity: 0.92, roles: ['rootHigh', 'thirteenth'] },
  ],
  C: [
    { time: 0, duration: 0.5, velocity: 0.93, roles: ['root', 'third'] },
    { time: 0.75, duration: 0.5, velocity: 0.86, roles: ['seventh'] },
    { time: 1.5, duration: 0.5, velocity: 0.88, roles: ['rootHigh'] },
    { time: 2.25, duration: 0.5, velocity: 0.84, roles: ['tenth'] },
    { time: 2.75, duration: 0.5, velocity: 0.9, roles: ['fifthHigh'] },
    { time: 3.25, duration: 0.5, velocity: 0.92, roles: ['rootHigh', 'thirteenth'] },
  ],
  D: [
    { time: 0, duration: 0.5, velocity: 0.94, roles: ['root', 'third'] },
    { time: 0.5, duration: 0.5, velocity: 0.82, roles: ['tenth'] },
    { time: 1.25, duration: 0.5, velocity: 0.88, roles: ['rootHigh'] },
    { time: 1.75, duration: 0.5, velocity: 0.85, roles: ['fifth'] },
    { time: 2.5, duration: 0.5, velocity: 0.9, roles: ['seventhHigh'] },
    { time: 3, duration: 0.5, velocity: 0.93, roles: ['rootHigh', 'thirteenth'] },
  ],
};

export function getPattern(modo: 'Tradicional' | 'Salsa', variation: Variacion): PatternStep[] {
  const source = modo === 'Salsa' ? salsaBase : tradBase;
  return source[variation].map((step) => ({ ...step }));
}

export function getPatternLengthBeats(): number {
  return BAR_BEATS;
}
