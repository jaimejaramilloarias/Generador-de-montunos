import { describe, expect, it } from 'vitest';
import { buildVoiceLayout } from './chords';

describe('buildVoiceLayout extended chords', () => {
  it('expone las voces de séptima para acordes con tensiones mayores', () => {
    const layout = buildVoiceLayout('C∆13', 'root', 'Octavas');

    expect(layout.seventh).toBeDefined();
    expect(layout.seventhHigh).toBe(layout.seventh! + 12);
    expect(layout.rootHigh).toBe(layout.root + 12);
  });

  it('mantiene disponibles las treceavas al usar inversiones y armonizaciones altas', () => {
    const layout = buildVoiceLayout('G13', 'third', 'Treceavas');

    expect(layout.seventh).toBeDefined();
    expect(layout.thirteenth).toBeGreaterThan(layout.fifthHigh);
    expect(layout.tenth).toBeGreaterThan(layout.third);
  });
});
