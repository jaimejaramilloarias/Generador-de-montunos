import type { Part, PolySynth } from 'tone';
import type { NoteEvent } from '../types';

type ToneModule = typeof import('tone');

let toneModule: ToneModule | null = null;
let toneModulePromise: Promise<ToneModule> | null = null;
let part: Part<NoteEvent> | null = null;
let synth: PolySynth | null = null;

async function ensureTone(): Promise<ToneModule> {
  if (toneModule) {
    return toneModule;
  }
  if (!toneModulePromise) {
    toneModulePromise = import('tone').then((module) => {
      toneModule = module;
      synth = new module.PolySynth(module.Synth).toDestination();
      return module;
    });
  }
  const module = await toneModulePromise;
  if (!synth) {
    synth = new module.PolySynth(module.Synth).toDestination();
  }
  return module;
}

export async function prepareAudio(): Promise<void> {
  const tone = await ensureTone();
  await tone.start();
}

export async function loadSequence(events: NoteEvent[], bpm: number): Promise<void> {
  const tone = await ensureTone();
  await tone.start();
  tone.Transport.stop();
  tone.Transport.cancel();
  tone.Transport.position = 0;
  tone.getTransport().bpm.value = bpm;

  if (part) {
    part.dispose();
    part = null;
  }

  if (!events.length) {
    return;
  }

  const secondsPerBeat = 60 / bpm;
  const schedule = events.map((event) => [event.time * secondsPerBeat, event] as [number, NoteEvent]);
  const engine = synth ?? new tone.PolySynth(tone.Synth).toDestination();
  synth = engine;
  part = new tone.Part((time, value) => {
    const durationSeconds = Math.max(0.1, value.duration * secondsPerBeat);
    engine.triggerAttackRelease(tone.Frequency(value.midi, 'midi'), durationSeconds, time, value.velocity);
  }, schedule);
  part.start(0);
}

export function play(): void {
  if (!toneModule) {
    return;
  }
  toneModule.Transport.start();
}

export function stop(): void {
  if (!toneModule) {
    return;
  }
  toneModule.Transport.stop();
  toneModule.Transport.position = 0;
}

export function isPlaying(): boolean {
  if (!toneModule) {
    return false;
  }
  return toneModule.Transport.state === 'started';
}
