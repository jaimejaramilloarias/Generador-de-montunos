"""Utilities to render montunos without relying on the Tk GUI."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import pretty_midi

from .. import midi_utils, salsa
from ..utils import apply_manual_edits, limpiar_inversion, calc_default_inversions

from .config import ClaveConfig, get_clave_tag


@dataclass
class MontunoGenerateResult:
    """Return value for :func:`generate_montuno`."""

    midi: pretty_midi.PrettyMIDI
    modo_tag: str
    clave_tag: str
    max_eighths: int
    reference_files: List[Path]


def _normalise_sequence(
    values: Optional[Sequence[str]],
    default: str,
    length: int,
) -> List[str]:
    # Use the provided ``default`` whenever an entry is missing or ``None`` so
    # that callers can pass sparse lists (e.g. JSON payloads omitting optional
    # fields) without losing the intended fallback.
    result = [value or default for value in (values or [])]
    if len(result) < length:
        result.extend([default] * (length - len(result)))
    return result[:length]


def _normalise_optional_sequence(
    values: Optional[Sequence[Optional[str]]],
    length: int,
) -> List[Optional[str]]:
    result = [value or None for value in (values or [])]
    if len(result) < length:
        result.extend([None] * (length - len(result)))
    return result[:length]


def _normalise_int_sequence(
    values: Optional[Sequence[Optional[int]]], default: int, length: int
) -> List[int]:
    result = [default if value is None else int(value) for value in (values or [])]
    if len(result) < length:
        result.extend([default] * (length - len(result)))
    return result[:length]


def _normalise_nested_notes(
    values: Optional[Sequence[Optional[Sequence[str]]]], length: int
) -> List[Optional[List[str]]]:
    result: List[Optional[List[str]]] = []
    for idx in range(length):
        raw = values[idx] if values and idx < len(values) else None
        if raw is None:
            result.append(None)
            continue
        cleaned = [str(item).strip() for item in raw if str(item).strip()]
        result.append(cleaned or None)
    return result


def generate_montuno(
    progression_text: str,
    *,
    clave_config: ClaveConfig,
    octavas_por_indice: Optional[Sequence[str]] = None,
    octavacion_default: str = "Original",
    variacion: str,
    inversion: str,
    reference_root: Path,
    inversiones_por_indice: Optional[Sequence[Optional[str]]] = None,
    register_offsets: Optional[Sequence[Optional[int]]] = None,
    aproximaciones_por_indice: Optional[Sequence[Optional[Sequence[str]]]] = None,
    manual_edits: Optional[List[Dict]] = None,
    seed: Optional[int] = None,
    bpm: float = 120.0,
    return_pm: bool = False,
) -> MontunoGenerateResult:
    """Render a montuno using the existing MIDI engines."""

    progression_text = " ".join((progression_text or "").split())
    if not progression_text:
        raise ValueError("Ingresa una progresión de acordes")

    import random

    old_state = None
    if seed is not None:
        old_state = random.getstate()
        random.seed(seed)

    try:
        asignaciones_all, _, aproximaciones_auto = salsa.procesar_progresion_salsa(
            progression_text
        )

        if not asignaciones_all:
            raise ValueError("Progresión vacía")

        num_chords = len(asignaciones_all)
        octavaciones = _normalise_sequence(
            octavas_por_indice, octavacion_default, num_chords
        )
        register_offsets_norm = _normalise_int_sequence(register_offsets, 0, num_chords)
        inversiones = _normalise_optional_sequence(inversiones_por_indice, num_chords)
        aproximaciones = (
            _normalise_nested_notes(aproximaciones_por_indice, num_chords)
            if aproximaciones_por_indice is not None
            else aproximaciones_auto
        )

        inversion_limpia = limpiar_inversion(inversion)

        default_inversions, _ = calc_default_inversions(
            asignaciones_all,
            lambda: inversion_limpia,
            salsa.get_bass_pitch,
            salsa._ajustar_rango_flexible,
            salsa.seleccionar_inversion,
            inversiones_por_indice,
            offset_getter=lambda idx: salsa._offset_octavacion(octavaciones[idx])
            + register_offsets_norm[idx] * 12,
            return_pitches=True,
        )

        inversiones = [inv or default_inv for inv, default_inv in zip(inversiones, default_inversions)]
        modo_tag = "salsa"
        clave_tag = get_clave_tag(clave_config)

        midi_utils.PRIMER_BLOQUE = list(clave_config.primer_bloque)
        midi_utils.PATRON_REPETIDO = list(clave_config.patron_repetido)
        midi_utils.PATRON_GRUPOS = midi_utils.PRIMER_BLOQUE + midi_utils.PATRON_REPETIDO * 3

        notas_finales: List[pretty_midi.Note] = []
        max_cor = 0
        inst_params: Optional[Tuple[int, bool, str]] = None
        reference_files: List[Path] = []
        asignaciones_segmento = _build_segment_assignments(asignaciones_all)

        with TemporaryDirectory() as tmpdir:
            midi_ref_seg = reference_root / f"salsa_{clave_tag}_{inversion_limpia}_{variacion}.mid"

            if not midi_ref_seg.exists():
                raise FileNotFoundError(f"No se encontró {midi_ref_seg}")

            reference_files.append(midi_ref_seg)
            tmp_path = Path(tmpdir) / "segment_0.mid"

            kwargs: Dict[str, object] = {
                "asignaciones_custom": asignaciones_segmento,
                "octavacion_default": octavacion_default,
                "octavaciones_custom": octavaciones,
                "register_offsets": register_offsets_norm,
                "variante": variacion,
            }

            if any(aproximaciones):
                kwargs["aproximaciones_por_acorde"] = aproximaciones
            if any(inversiones):
                kwargs["inversiones_manual"] = inversiones

            salsa.montuno_salsa(
                "",
                midi_ref_seg,
                tmp_path,
                inversion_limpia,
                inicio_cor=0,
                return_pm=False,
                **kwargs,
            )

            pm_segment = pretty_midi.PrettyMIDI(str(tmp_path))
            if not pm_segment.instruments:
                return MontunoGenerateResult(
                    midi=pretty_midi.PrettyMIDI(),
                    modo_tag=modo_tag,
                    clave_tag=clave_tag,
                    max_eighths=0,
                    reference_files=reference_files,
                )

            inst = pm_segment.instruments[0]
            inst_params = (inst.program, inst.is_drum, inst.name)

            grid_seg = 60.0 / bpm / 2
            seg_cor = int(round(pm_segment.get_end_time() / grid_seg))
            start = 0.0
            for note in inst.notes:
                if note.pitch in (0, 21):
                    continue
                notas_finales.append(
                    pretty_midi.Note(
                        velocity=note.velocity,
                        pitch=note.pitch,
                        start=note.start + start,
                        end=note.end + start,
                    )
                )
            max_cor = max(max_cor, seg_cor)

        if inst_params is None:
            raise ValueError("No se generaron notas para la progresión proporcionada")

        grid = 60.0 / bpm / 2
        final_offset = max_cor * grid
        if final_offset > 0 and not return_pm:
            has_start = any(n.start <= 0 < n.end and n.pitch > 0 for n in notas_finales)
            has_end = any(
                n.pitch > 0 and n.start < final_offset and n.end > final_offset - grid for n in notas_finales
            )
            if not has_start:
                notas_finales.append(
                    pretty_midi.Note(velocity=1, pitch=0, start=0.0, end=min(grid, final_offset))
                )
            if not has_end:
                notas_finales.append(
                    pretty_midi.Note(
                        velocity=1,
                        pitch=0,
                        start=max(0.0, final_offset - grid),
                        end=final_offset,
                    )
                )

        pm_out = pretty_midi.PrettyMIDI()
        inst_out = pretty_midi.Instrument(
            program=inst_params[0], is_drum=inst_params[1], name=inst_params[2]
        )
        inst_out.notes = notas_finales
        pm_out.instruments.append(inst_out)

        if manual_edits:
            apply_manual_edits(pm_out, manual_edits)

        return MontunoGenerateResult(
            midi=pm_out,
            modo_tag=modo_tag,
            clave_tag=clave_tag,
            max_eighths=max_cor,
            reference_files=reference_files,
        )
    finally:
        if seed is not None and old_state is not None:
            random.setstate(old_state)


def _build_segment_assignments(
    asignaciones: Iterable[Tuple[str, List[int], str, Optional[str]]]
) -> List[Tuple[str, List[int], str, Optional[str]]]:
    """Build relative eighth-note assignments for a segment."""

    asign_list = list(asignaciones)
    if not asign_list:
        return []
    start_cor = asign_list[0][1][0]
    return [
        (nombre, [i - start_cor for i in idxs], arm, inv)
        for nombre, idxs, arm, inv in asign_list
    ]
