"""Simplified ``pretty_midi`` implementation for the Pyodide build.

The original project depends on compiled extensions which are not available in
Pyodide.  This module provides just enough of the public surface required by
our music generation code and relies exclusively on ``mido`` which *is*
available as a pure Python package.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import mido

DEFAULT_TICKS_PER_BEAT = 480
DEFAULT_TEMPO = mido.bpm2tempo(120)  # microseconds per beat

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


@dataclass
class Note:
    """Lightweight representation of a MIDI note."""

    velocity: int
    pitch: int
    start: float
    end: float


class Instrument:
    """Container for notes with minimal PrettyMIDI compatibility."""

    def __init__(self, program: int = 0, is_drum: bool = False, name: str = "") -> None:
        self.program = int(program)
        self.is_drum = bool(is_drum)
        self.name = name
        self.notes: List[Note] = []


class PrettyMIDI:
    """Very small subset of :mod:`pretty_midi` used in the web worker."""

    def __init__(self, midi_file: Optional[str] = None) -> None:
        self.instruments: List[Instrument] = []
        self.resolution = DEFAULT_TICKS_PER_BEAT
        self._tempo = DEFAULT_TEMPO
        if midi_file is not None:
            self._load_midi(midi_file)

    # ------------------------------------------------------------------
    # Reading helpers
    # ------------------------------------------------------------------
    def _load_midi(self, midi_file: str) -> None:
        mid = mido.MidiFile(midi_file)
        self.resolution = mid.ticks_per_beat or DEFAULT_TICKS_PER_BEAT
        tempo = DEFAULT_TEMPO
        channel_programs: Dict[int, int] = {}
        channel_names: Dict[int, str] = {}
        active_notes: Dict[Tuple[int, int], Tuple[float, int]] = {}
        channel_instruments: Dict[int, Instrument] = {}

        for track in mid.tracks:
            abs_ticks = 0
            track_name = ""
            for msg in track:
                abs_ticks += msg.time
                if msg.is_meta:
                    if msg.type == "set_tempo":
                        tempo = msg.tempo
                        self._tempo = tempo
                    elif msg.type == "track_name":
                        track_name = msg.name or ""
                    continue

                channel = getattr(msg, "channel", 0)
                if msg.type == "program_change":
                    channel_programs[channel] = msg.program
                    continue

                if msg.type not in {"note_on", "note_off"}:
                    continue

                pitch = getattr(msg, "note", 0)
                seconds = mido.tick2second(abs_ticks, self.resolution, tempo)
                key = (channel, pitch)

                if msg.type == "note_on" and msg.velocity > 0:
                    active_notes[key] = (seconds, msg.velocity)
                    if track_name and channel not in channel_names:
                        channel_names[channel] = track_name
                    continue

                start_info = active_notes.pop(key, None)
                if start_info is None:
                    continue

                start_seconds, velocity = start_info
                instrument = channel_instruments.get(channel)
                if instrument is None:
                    program = channel_programs.get(channel, 0)
                    name = channel_names.get(channel, track_name)
                    instrument = Instrument(program=program, is_drum=(channel == 9), name=name)
                    channel_instruments[channel] = instrument
                    self.instruments.append(instrument)

                instrument.notes.append(
                    Note(
                        velocity=int(velocity),
                        pitch=int(pitch),
                        start=float(start_seconds),
                        end=float(seconds),
                    )
                )

    # ------------------------------------------------------------------
    # Writing helpers
    # ------------------------------------------------------------------
    def write(self, path: str) -> None:
        mid = mido.MidiFile(ticks_per_beat=self.resolution or DEFAULT_TICKS_PER_BEAT)
        tempo_track = mido.MidiTrack()
        tempo_track.append(mido.MetaMessage("set_tempo", tempo=self._tempo, time=0))
        mid.tracks.append(tempo_track)

        next_channel = 0
        for instrument in self.instruments:
            channel = 9 if instrument.is_drum else self._allocate_channel(next_channel)
            if channel != 9:
                next_channel = channel + 1

            track = mido.MidiTrack()
            if instrument.name:
                track.append(mido.MetaMessage("track_name", name=instrument.name, time=0))
            if channel != 9:
                track.append(
                    mido.Message(
                        "program_change",
                        program=int(instrument.program) % 128,
                        channel=channel,
                        time=0,
                    )
                )

            events: List[Tuple[int, bool, Note]] = []
            for note in instrument.notes:
                start_tick = int(round(mido.second2tick(note.start, mid.ticks_per_beat, self._tempo)))
                end_tick = int(round(mido.second2tick(note.end, mid.ticks_per_beat, self._tempo)))
                events.append((start_tick, True, note))
                events.append((end_tick, False, note))
            events.sort(key=lambda item: (item[0], not item[1]))

            last_tick = 0
            for tick, is_on, note in events:
                delta = max(0, tick - last_tick)
                last_tick = tick
                if is_on:
                    track.append(
                        mido.Message(
                            "note_on",
                            channel=channel,
                            note=int(note.pitch) % 128,
                            velocity=max(0, min(127, int(note.velocity))),
                            time=delta,
                        )
                    )
                else:
                    track.append(
                        mido.Message(
                            "note_off",
                            channel=channel,
                            note=int(note.pitch) % 128,
                            velocity=0,
                            time=delta,
                        )
                    )

            mid.tracks.append(track)

        mid.save(path)

    @staticmethod
    def _allocate_channel(start: int) -> int:
        channel = start
        while channel == 9:
            channel += 1
        return channel % 16

    # ------------------------------------------------------------------
    # Convenience helpers used by the backend code
    # ------------------------------------------------------------------
    def get_end_time(self) -> float:
        end = 0.0
        for instrument in self.instruments:
            for note in instrument.notes:
                if note.end > end:
                    end = note.end
        return end


def note_number_to_name(number: int) -> str:
    octave = number // 12 - 1
    name = _NOTE_NAMES[number % 12]
    return f"{name}{octave}"


def note_name_to_number(name: str) -> int:
    if not name:
        raise ValueError("Nombre de nota vacío")

    cleaned = name.strip().replace("♯", "#").replace("♭", "b")
    if not cleaned:
        raise ValueError("Nombre de nota vacío")

    idx = len(cleaned) - 1
    while idx >= 0 and (cleaned[idx].isdigit() or cleaned[idx] == "-"):
        idx -= 1
    idx += 1
    if idx == len(cleaned):
        raise ValueError(f"Nombre de nota sin octava: {name}")

    base = cleaned[:idx].upper()
    octave = int(cleaned[idx:])

    if not base:
        raise ValueError(f"Nombre de nota inválido: {name}")

    if len(base) == 2 and base[1] == "B":
        index = (_NOTE_NAMES.index(base[0]) - 1) % 12
    elif len(base) == 2 and base[1] == "#":
        index = (_NOTE_NAMES.index(base[0]) + 1) % 12
    else:
        index = _NOTE_NAMES.index(base[0])

    return (octave + 1) * 12 + index


__all__ = [
    "Instrument",
    "Note",
    "PrettyMIDI",
    "note_name_to_number",
    "note_number_to_name",
]
