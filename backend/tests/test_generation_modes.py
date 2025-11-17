from pathlib import Path
import sys
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import backend.modos as modos
import backend.montuno_core.generation as generation
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


def test_extendido_is_used_when_set_as_default():
    calls = {"trad": 0, "ext": 0}
    stub_ext = _stub_writer(calls, "ext")
    stub_trad = _stub_writer(calls, "trad")

    with patch.object(modos, "montuno_extendido", stub_ext), patch.object(
        modos, "montuno_tradicional", stub_trad
    ), patch.dict(
        modos.MODOS_DISPONIBLES, {"Extendido": stub_ext, "Tradicional": stub_trad}
    ):
        generate_montuno(
            "C∆ F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Extendido",
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert calls["ext"] == 1
    assert calls["trad"] == 0


def test_missing_modo_entries_fall_back_to_default():
    calls = {"trad": 0, "ext": 0}
    stub_ext = _stub_writer(calls, "ext")
    stub_trad = _stub_writer(calls, "trad")

    with patch.object(modos, "montuno_extendido", stub_ext), patch.object(
        modos, "montuno_tradicional", stub_trad
    ), patch.dict(
        modos.MODOS_DISPONIBLES, {"Extendido": stub_ext, "Tradicional": stub_trad}
    ):
        generate_montuno(
            "C∆ F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Extendido",
            modo_por_acorde=[None, None],
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert calls["ext"] == 1
    assert calls["trad"] == 0


def test_runtime_mapping_replacement_is_used():
    calls = {"trad": 0, "ext": 0}
    stub_ext = _stub_writer(calls, "ext")
    stub_trad = _stub_writer(calls, "trad")

    with patch.object(
        generation.modos,
        "MODOS_DISPONIBLES",
        {"Extendido": stub_ext, "Tradicional": stub_trad},
    ):
        generate_montuno(
            "C∆ F7",
            clave_config=CLAVES["Clave 2-3"],
            modo_default="Extendido",
            armonizacion_default="Octavas",
            variacion="A",
            inversion="root",
            reference_root=Path("backend/reference_midi_loops"),
        )

    assert calls["ext"] == 1
    assert calls["trad"] == 0
