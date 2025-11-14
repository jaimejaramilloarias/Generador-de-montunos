import { Midi } from '@tonejs/midi';
import type { GenerationResult } from '../types';

export function generateMidiBlob(result: GenerationResult): Blob {
  const midi = new Midi();
  midi.header.setTempo(result.bpm);
  const track = midi.addTrack();
  const secondsPerBeat = 60 / result.bpm;

  result.events.forEach((event) => {
    track.addNote({
      midi: event.midi,
      time: event.time * secondsPerBeat,
      duration: Math.max(0.1, event.duration * secondsPerBeat),
      velocity: event.velocity,
    });
  });

  const array = midi.toArray();
  return new Blob([array], { type: 'audio/midi' });
}
