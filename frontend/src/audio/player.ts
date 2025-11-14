import * as Tone from 'tone';
import type { NoteEvent } from '../types';

let part: Tone.Part<NoteEvent> | null = null;
const synth = new Tone.PolySynth(Tone.Synth).toDestination();

export async function prepareAudio(): Promise<void> {
  await Tone.start();
}

export async function loadSequence(events: NoteEvent[], bpm: number): Promise<void> {
  await prepareAudio();
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.position = 0;
  Tone.getTransport().bpm.value = bpm;

  if (part) {
    part.dispose();
    part = null;
  }

  if (!events.length) {
    return;
  }

  const secondsPerBeat = 60 / bpm;
  const schedule = events.map((event) => [event.time * secondsPerBeat, event] as [number, NoteEvent]);
  part = new Tone.Part((time, value) => {
    const durationSeconds = Math.max(0.1, value.duration * secondsPerBeat);
    synth.triggerAttackRelease(Tone.Frequency(value.midi, 'midi'), durationSeconds, time, value.velocity);
  }, schedule);
  part.start(0);
}

export function play(): void {
  Tone.Transport.start();
}

export function stop(): void {
  Tone.Transport.stop();
  Tone.Transport.position = 0;
}

export function isPlaying(): boolean {
  return Tone.Transport.state === 'started';
}
