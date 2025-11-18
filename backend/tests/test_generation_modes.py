from pathlib import Path
import sys
from pathlib import Path
import sys
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import backend.modos as modos
from backend.montuno_core import CLAVES
from backend.montuno_core.generation import generate_montuno


def _stub_writer(calls, key):
    def _impl(*args, **kwargs):
        calls[key] += 1
        # ``output`` is the third positional argument in the generation
        # functions (progresion_texto, midi_ref, output, armonizacion).
        output = args[2]
        from pretty_midi import Instrument, Note, PrettyMIDI

        pm = PrettyMIDI()
        inst = Instrument(program=0)
        inst.notes.append(Note(velocity=90, pitch=60, start=0, end=1))
        pm.instruments.append(inst)
        pm.write(str(output))

    return _impl


def test_traditional_is_used_when_set_as_default():
    calls = {"trad": 0, "salsa": 0}
    stub_salsa = _stub_writer(calls, "salsa")
    stub_trad = _stub_writer(calls, "trad")

    with patch.object(modos, "montuno_salsa", stub_salsa), patch.object(
        modos, "montuno_tradicional", stub_trad
    ), patch.dict(modos.MODOS_DISPONIBLES, {"Salsa": stub_salsa, "Tradicional": stub_trad}):
        generate_montuno(
            "C∆ F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Tradicional",
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert calls["trad"] == 1
    assert calls["salsa"] == 0


def test_missing_modo_entries_fall_back_to_default():
    calls = {"trad": 0, "salsa": 0}
    stub_salsa = _stub_writer(calls, "salsa")
    stub_trad = _stub_writer(calls, "trad")

    with patch.object(modos, "montuno_salsa", stub_salsa), patch.object(
        modos, "montuno_tradicional", stub_trad
    ), patch.dict(modos.MODOS_DISPONIBLES, {"Salsa": stub_salsa, "Tradicional": stub_trad}):
        generate_montuno(
            "C∆ F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Salsa",
            modo_por_acorde=[None, None],
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert calls["salsa"] == 1
    assert calls["trad"] == 0


def test_per_chord_modes_override_default():
    calls = {"trad": 0, "salsa": 0}
    stub_salsa = _stub_writer(calls, "salsa")
    stub_trad = _stub_writer(calls, "trad")

    with patch.object(modos, "montuno_salsa", stub_salsa), patch.object(
        modos, "montuno_tradicional", stub_trad
    ), patch.dict(modos.MODOS_DISPONIBLES, {"Salsa": stub_salsa, "Tradicional": stub_trad}):
        generate_montuno(
            "Cmaj9 F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Salsa",
            modo_por_acorde=["Tradicional", "Salsa"],
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert calls["salsa"] == 1
    assert calls["trad"] == 1


def test_approach_notes_are_only_used_for_salsa_segments():
    calls = {"trad": 0, "salsa": 0}
    captured = {}

    def _stub_salsa(*args, **kwargs):
        calls["salsa"] += 1
        captured["kwargs"] = kwargs
        output = args[2]
        from pretty_midi import Instrument, Note, PrettyMIDI

        pm = PrettyMIDI()
        inst = Instrument(program=0)
        inst.notes.append(Note(velocity=90, pitch=60, start=0, end=1))
        pm.instruments.append(inst)
        pm.write(str(output))

    stub_trad = _stub_writer(calls, "trad")

    with patch.object(modos, "montuno_salsa", _stub_salsa), patch.object(
        modos, "montuno_tradicional", stub_trad
    ), patch.dict(modos.MODOS_DISPONIBLES, {"Salsa": _stub_salsa, "Tradicional": stub_trad}):
        generate_montuno(
            "C∆ F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Tradicional",
            modo_por_acorde=["Tradicional", "Salsa"],
            aproximaciones_por_indice=[["C#"], ["D"]],
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert calls["trad"] == 1
    assert calls["salsa"] == 1
    assert captured.get("kwargs", {}).get("aproximaciones_por_acorde") == [["D"]]
