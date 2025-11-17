import { describe, expect, it } from 'vitest';
import type { ChordConfig, Inversion, ResolvedChordInversion } from '../types';
import {
  calculateBassPitch,
  formatMidiNote,
  listBassOptions,
  resolveInversionChain,
  stepInversionPitch,
} from './inversions';

function buildChord(index: number, name: string, inversion: ChordConfig['inversion'] = null): ChordConfig {
  return {
    index,
    name,
    armonizacion: 'Octavas',
    octavacion: 'Original',
    inversion,
    registerOffset: 0,
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

  it('elige la nota más cercana aunque sea una extensión', () => {
    const chords = [buildChord(0, 'D7'), buildChord(1, 'Cmaj9'), buildChord(2, 'G7')];

    const resolved = resolveInversionChain(chords, 'root');

    expect(resolved[0].pitch).toBeGreaterThan(0);
    expect(resolved[1].pitch).toBe(resolved[0].pitch);
    expect(Math.abs(resolved[2].pitch - resolved[1].pitch)).toBeLessThanOrEqual(8);
  });

  it('mantiene un desplazamiento de registro manual al resolver una cadena', () => {
    const chords = [
      { ...buildChord(0, 'Cmaj7', 'root'), registerOffset: 2 },
      { ...buildChord(1, 'Fmaj7', 'third'), registerOffset: 2 },
    ];

    const resolved = resolveInversionChain(chords, 'root');

    expect(resolved[0].pitch).toBe(calculateBassPitch('Cmaj7', 'root', null, 2, false));
    expect(resolved[1].pitch).toBe(calculateBassPitch('Fmaj7', 'third', resolved[0].pitch, 2, false));
  });
});

describe('stepInversionPitch', () => {
  it('repite las notas del acorde hacia el registro agudo al subir', () => {
    const startPitch = 48; // C3
    let currentInversion: Inversion = 'root';

    const up1 = stepInversionPitch('Cmaj7', startPitch, 1, currentInversion);
    currentInversion = up1.inversion;
    const up2 = stepInversionPitch('Cmaj7', up1.pitch, 1, currentInversion);
    currentInversion = up2.inversion;
    const up3 = stepInversionPitch('Cmaj7', up2.pitch, 1, currentInversion);
    currentInversion = up3.inversion;
    const up4 = stepInversionPitch('Cmaj7', up3.pitch, 1, currentInversion);

    expect(up1.pitch).toBeGreaterThan(startPitch);
    expect(up2.pitch).toBeGreaterThan(up1.pitch);
    expect(up3.pitch).toBeGreaterThan(up2.pitch);
    expect(up4.pitch).toBeGreaterThan(up3.pitch);
    expect(up4.inversion).toBe('third');
  });

  it('recorre las notas hacia el grave al bajar', () => {
    const startPitch = 72; // C5
    let currentInversion: Inversion = 'root';

    const down1 = stepInversionPitch('Cmaj7', startPitch, -1, currentInversion);
    currentInversion = down1.inversion;
    const down2 = stepInversionPitch('Cmaj7', down1.pitch, -1, currentInversion);

    expect(down1.pitch).toBeLessThan(startPitch);
    expect(down2.pitch).toBeLessThan(down1.pitch);
    expect(down1.inversion).toBe('fifth');
  });

  it('avanza las inversiones sin retroceder por salto en cualquier acorde', () => {
    const startPitch = 52; // E3
    let currentInversion: Inversion = 'fifth';

    const steps: ResolvedChordInversion[] = [];
    for (let i = 0; i < 5; i += 1) {
      const next = stepInversionPitch('Am7', i === 0 ? startPitch : steps[i - 1]!.pitch, 1, currentInversion);
      steps.push(next);
      currentInversion = next.inversion;
    }

    expect(steps.map((s) => s.pitch)).toEqual([57, 60, 64, 69, 72]);
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
