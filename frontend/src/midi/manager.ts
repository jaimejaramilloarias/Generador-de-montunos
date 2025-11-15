import type { MidiOutputInfo, MidiStatus, NoteEvent } from '../types';

let midiAccess: WebMidi.MIDIAccess | null = null;
let selectedOutputId: string | null = null;
let preparedEvents: NoteEvent[] = [];
let preparedBpm = 120;
const outputListeners = new Set<(outputs: MidiOutputInfo[]) => void>();

function mapOutputs(): MidiOutputInfo[] {
  if (!midiAccess) {
    return [];
  }
  return Array.from(midiAccess.outputs.values()).map((output) => ({
    id: output.id,
    name: output.name ?? output.id,
    manufacturer: output.manufacturer ?? null,
  }));
}

function notifyOutputs(): void {
  const outputs = mapOutputs();
  if (selectedOutputId && !outputs.some((output) => output.id === selectedOutputId)) {
    selectedOutputId = null;
  }
  outputListeners.forEach((listener) => listener(outputs));
}

function getActiveOutput(): WebMidi.MIDIOutput | null {
  if (!midiAccess || !selectedOutputId) {
    return null;
  }
  return midiAccess.outputs.get(selectedOutputId) ?? null;
}

function sendAllNotesOff(output: WebMidi.MIDIOutput): void {
  for (let channel = 0; channel < 16; channel += 1) {
    output.send([0xb0 + channel, 123, 0]);
  }
}

export async function requestMidiAccess(): Promise<{ status: MidiStatus; outputs: MidiOutputInfo[] }> {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
    return { status: 'unavailable', outputs: [] };
  }
  if (midiAccess) {
    const outputs = mapOutputs();
    return { status: 'ready', outputs };
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = () => {
      notifyOutputs();
    };
    const outputs = mapOutputs();
    return { status: 'ready', outputs };
  } catch (error) {
    console.warn('Acceso MIDI denegado o no disponible.', error);
    midiAccess = null;
    return { status: 'denied', outputs: [] };
  }
}

export function onOutputsChanged(listener: (outputs: MidiOutputInfo[]) => void): () => void {
  outputListeners.add(listener);
  if (midiAccess) {
    listener(mapOutputs());
  }
  return () => {
    outputListeners.delete(listener);
  };
}

export function setSelectedOutput(id: string | null): void {
  if (selectedOutputId === id) {
    return;
  }
  const output = getActiveOutput();
  if (output) {
    sendAllNotesOff(output);
  }
  selectedOutputId = id;
}

export function preparePlayback(events: NoteEvent[], bpm: number): void {
  preparedEvents = events.map((event) => ({ ...event }));
  preparedBpm = bpm;
  if (events.length === 0) {
    stopPlayback();
  }
}

export function startPlayback(): void {
  const output = getActiveOutput();
  if (!output || preparedEvents.length === 0) {
    return;
  }
  sendAllNotesOff(output);
  const secondsPerBeat = 60 / preparedBpm;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  preparedEvents.forEach((event) => {
    const start = now + event.time * secondsPerBeat * 1000;
    const durationMs = Math.max(50, event.duration * secondsPerBeat * 1000);
    const velocity = Math.max(0, Math.min(127, Math.round(event.velocity * 127)));
    output.send([0x90, event.midi, velocity], start);
    output.send([0x80, event.midi, 0], start + durationMs);
  });
}

export function stopPlayback(): void {
  const output = getActiveOutput();
  if (!output) {
    return;
  }
  sendAllNotesOff(output);
}
