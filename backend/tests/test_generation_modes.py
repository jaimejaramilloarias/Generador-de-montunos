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


def _recording_stub(logs, key):
    def _impl(*args, **kwargs):
        logs[key].append(kwargs.get("inicio_cor"))
        output = args[2]
        from pretty_midi import Instrument, Note, PrettyMIDI

        pm = PrettyMIDI()
        inst = Instrument(program=0)
        start = float(kwargs.get("inicio_cor") or 0)
        inst.notes.append(Note(velocity=90, pitch=60, start=start, end=start + 1))
        pm.instruments.append(inst)
        pm.write(str(output))

    return _impl


def test_tradicional_is_used_when_set_as_default():
    calls = {"trad": 0, "salsa": 0}
    stub_salsa = _stub_writer(calls, "salsa")
    stub_trad = _stub_writer(calls, "trad")

    with patch.dict(modos.MODOS_DISPONIBLES, {"Salsa": stub_salsa, "Tradicional": stub_trad}):
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

    with patch.dict(modos.MODOS_DISPONIBLES, {"Salsa": stub_salsa, "Tradicional": stub_trad}):
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


def test_overrides_replace_previous_modes_without_overlap():
    logs = {"trad": [], "salsa": []}
    stub_salsa = _recording_stub(logs, "salsa")
    stub_trad = _recording_stub(logs, "trad")

    with patch.dict(modos.MODOS_DISPONIBLES, {"Salsa": stub_salsa, "Tradicional": stub_trad}):
        generate_montuno(
            "C∆ F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Salsa",
            modo_por_acorde=["Tradicional", "Salsa"],
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert logs["trad"] == [0]
    assert len(logs["salsa"]) == 1
    assert logs["salsa"][0] > logs["trad"][0]
