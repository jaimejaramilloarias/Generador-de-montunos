from pathlib import Path
import sys

import pretty_midi

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend import salsa


def _make_octave_stack(
    path: Path,
    pitch_class: str = "D",
    extra_notes: tuple[tuple[str, float, float], ...] = (),
) -> None:
    """Create a reference MIDI with three stacked octaves of ``pitch_class``.

    ``extra_notes`` can be used to append additional notes as
    ``(note_name, start, end)`` tuples. A low ``C2`` is included so any bass
    retargeting logic does not alter the octavated triad used in the
    assertions.
    """

    pm = pretty_midi.PrettyMIDI()
    inst = pretty_midi.Instrument(program=0)
    for octave in (3, 4, 5):
        note_name = f"{pitch_class}{octave}"
        inst.notes.append(
            pretty_midi.Note(
                velocity=100,
                pitch=pretty_midi.note_name_to_number(note_name),
                start=0.0,
                end=0.25,
            )
        )

    for note_name, start, end in extra_notes:
        inst.notes.append(
            pretty_midi.Note(
                velocity=100,
                pitch=pretty_midi.note_name_to_number(note_name),
                start=start,
                end=end,
            )
        )

    inst.notes.append(
        pretty_midi.Note(
            velocity=100,
            pitch=pretty_midi.note_name_to_number("C2"),
            start=0.0,
            end=0.25,
        )
    )
    pm.instruments.append(inst)
    pm.write(str(path))


def test_octave_stacks_keep_alignment_on_approach_notes(monkeypatch, tmp_path):
    midi_ref = tmp_path / "salsa_2-3_root_A.mid"
    _make_octave_stack(midi_ref)

    seen = set()

    def fake_adjust(note_name: str, cifrado: str, pitch: int) -> int:
        pc = note_name[:-1]
        if pc in seen:
            return pitch
        seen.add(pc)
        return pitch - 1

    monkeypatch.setattr(salsa, "_ajustar_a_estructural_mas_cercano", fake_adjust)

    pm_out = salsa.montuno_salsa(
        "",
        midi_ref,
        tmp_path / "out.mid",
        inversion_inicial="root",
        asignaciones_custom=[("C#7", [0], "", None)],
        octavacion_default="Original",
        octavaciones_custom=["Original"],
        aproximaciones_por_acorde=[None],
        return_pm=True,
    )

    pitches = sorted(n.pitch for n in pm_out.instruments[0].notes if n.pitch > 0)
    stack = pitches[1:]

    assert len(stack) == 3
    assert len(set(p % 12 for p in stack)) == 1
    assert stack[1] - stack[0] == 12
    assert stack[2] - stack[1] == 12


def test_octave_alignment_applies_only_on_matching_note_on(monkeypatch, tmp_path):
    midi_ref = tmp_path / "salsa_2-3_root_A.mid"
    _make_octave_stack(
        midi_ref,
        extra_notes=(
            ("D3", 0.5, 0.75),
            ("D4", 0.5, 0.75),
            ("D5", 0.5, 0.75),
        ),
    )

    seen = set()

    def fake_adjust(note_name: str, cifrado: str, pitch: int) -> int:
        pc = note_name[:-1]
        if pc in seen:
            return pitch
        seen.add(pc)
        return pitch - 1

    monkeypatch.setattr(salsa, "_ajustar_a_estructural_mas_cercano", fake_adjust)

    pm_out = salsa.montuno_salsa(
        "",
        midi_ref,
        tmp_path / "out.mid",
        inversion_inicial="root",
        asignaciones_custom=[("C7", [0, 1, 2], "", None)],
        octavacion_default="Original",
        octavaciones_custom=["Original"],
        aproximaciones_por_acorde=[None],
        return_pm=True,
    )

    def _stack_for_start(target: float) -> list[int]:
        return sorted(
            [
                n.pitch
                for n in pm_out.instruments[0].notes
                if n.pitch > 0 and abs(n.start - target) < 1e-4
            ]
        )

    first_stack = _stack_for_start(0.0)
    second_stack = _stack_for_start(0.5)

    assert len(first_stack) >= 3
    assert len(second_stack) >= 3
    assert all(second_stack[i] - second_stack[i - 1] == 12 for i in range(1, 3))

    base_pitches = [salsa.traducir_nota(f"D{oct}", "C7")[0] for oct in (3, 4, 5)]

    def _deltas(stack: list[int]) -> list[int]:
        return [stack[i] - base_pitches[i] for i in range(3)]

    assert _deltas(first_stack) != _deltas(second_stack)
