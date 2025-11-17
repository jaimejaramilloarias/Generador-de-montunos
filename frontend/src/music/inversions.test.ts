import { describe, expect, it } from 'vitest';
import type { ChordConfig } from '../types';
import { formatMidiNote, listBassOptions, resolveInversionChain } from './inversions';

function buildChord(index: number, name: string, inversion: ChordConfig['inversion'] = null): ChordConfig {
  return {
    index,
    name,
    armonizacion: 'Octavas',
    octavacion: 'Original',
    inversion,
    modo: 'Tradicional',
    isRecognized: true,
  } satisfies ChordConfig;
}

describe('resolveInversionChain', () => {
  it('elige inversiones enlazando las notas graves con el siguiente acorde', () => {
    const chords = [buildChord(0, 'Cmaj7'), buildChord(1, 'G7'), buildChord(2, 'Fmaj7')];

    const resolved = resolveInversionChain(chords, 'root');

    expect(resolved[0]?.pitch).toBeGreaterThan(0);
    expect(Math.abs(resolved[1].pitch - resolved[0].pitch)).toBeLessThanOrEqual(8);
    expect(Math.abs(resolved[2].pitch - resolved[1].pitch)).toBeLessThanOrEqual(8);
  });

  it('recalcula las inversiones posteriores al forzar una inversión intermedia', () => {
    const base = [buildChord(0, 'Cmaj7'), buildChord(1, 'G7'), buildChord(2, 'Fmaj7')];

    const withManual = [...base];
    withManual[1] = { ...withManual[1], inversion: 'fifth' };
    const resolvedManual = resolveInversionChain(withManual, 'root');

    expect(resolvedManual[1].inversion).toBe('fifth');
    const prevPitch = resolvedManual[1].pitch;
    const options = listBassOptions(withManual[2].name, prevPitch);
    const closest = options.reduce(
      (best, option) => {
        const distance = Math.abs(option.pitch - prevPitch);
        return distance < best.distance ? { ...option, distance } : best;
      },
      { ...options[0], distance: Math.abs(options[0].pitch - prevPitch) }
    );
    expect(resolvedManual[2].pitch).toBeCloseTo(closest.pitch, 6);
  });
});

describe('formatMidiNote', () => {
  it('devuelve la nota y octava esperadas', () => {
    expect(formatMidiNote(62)).toBe('D4');
  });
});

describe('listBassOptions', () => {
  it('ordena las opciones de nota grave de menor a mayor', () => {
    const options = listBassOptions('Cmaj7', null);
    const pitches = options.map((option) => option.pitch);
    expect(pitches).toEqual([...pitches].sort((a, b) => a - b));
  });
});
