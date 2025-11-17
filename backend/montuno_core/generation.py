"""Utilities to render montunos without relying on the Tk GUI."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import pretty_midi

from .. import midi_utils, midi_utils_tradicional, salsa
from ..modos import MODOS_DISPONIBLES
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


@dataclass
class _Segment:
    mode: str
    assignments: List[Tuple[str, List[int], str, Optional[str]]]
    start_eighth: int
    chord_indices: List[int]
    octavaciones: List[str]


_DEF_VARIATIONS = ["A", "B", "C", "D"]


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


def _is_extended_chord(symbol: str) -> bool:
    base = symbol.split("/")[0]
    sufijo = ""
    for idx, char in enumerate(base):
        if char.isalpha() and char.upper() in "ABCDEFG" and idx == 0:
            continue
        sufijo = base[idx:]
        break
    if not sufijo:
        return False
    return any(token in sufijo for token in ("9", "11", "13"))


def generate_montuno(
    progression_text: str,
    *,
    clave_config: ClaveConfig,
    modo_default: str,
    modo_por_acorde: Optional[Sequence[str]] = None,
    armonias_por_indice: Optional[Sequence[str]] = None,
    armonizacion_default: str,
    octavas_por_indice: Optional[Sequence[str]] = None,
    octavacion_default: str = "Original",
    variacion: str,
    inversion: str,
    reference_root: Path,
    inversiones_por_indice: Optional[Sequence[Optional[str]]] = None,
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
        asignaciones_all, _ = salsa.procesar_progresion_salsa(progression_text)

        if not asignaciones_all:
            raise ValueError("Progresión vacía")

        num_chords = len(asignaciones_all)
        modos = _normalise_sequence(modo_por_acorde, modo_default, num_chords)
        armonias = _normalise_sequence(armonias_por_indice, armonizacion_default, num_chords)
        octavaciones = _normalise_sequence(
            octavas_por_indice, octavacion_default, num_chords
        )
        inversiones = _normalise_optional_sequence(inversiones_por_indice, num_chords)

        inversion_limpia = limpiar_inversion(inversion)

        default_inversions, bass_targets = calc_default_inversions(
            asignaciones_all,
            lambda: inversion_limpia,
            salsa.get_bass_pitch,
            salsa._ajustar_rango_flexible,
            salsa.seleccionar_inversion,
            inversiones_por_indice,
            offset_getter=lambda idx: salsa._offset_octavacion(octavaciones[idx]),
            return_pitches=True,
        )

        inversiones = [inv or default_inv for inv, default_inv in zip(inversiones, default_inversions)]

        for idx, asign in enumerate(asignaciones_all):
            if modos[idx] != "Extendido" and _is_extended_chord(asign[0]):
                modos[idx] = "Extendido"

        segmentos: List[_Segment] = []
        start = 0
        modo_actual = modos[0]
        for idx in range(1, num_chords):
            if modos[idx] != modo_actual:
                segmentos.append(
                    _Segment(
                        modo_actual,
                        _build_segment_assignments(asignaciones_all[start:idx]),
                        asignaciones_all[start][1][0],
                        list(range(start, idx)),
                        octavaciones[start:idx],
                    )
                )
                start = idx
                modo_actual = modos[idx]
        segmentos.append(
            _Segment(
                modo_actual,
                _build_segment_assignments(asignaciones_all[start:num_chords]),
                asignaciones_all[start][1][0],
                list(range(start, num_chords)),
                octavaciones[start:num_chords],
            )
        )

        modos_unicos = {seg.mode for seg in segmentos}
        if len(modos_unicos) == 1:
            unico = next(iter(modos_unicos))
            modo_tag = unico.lower()
        else:
            modo_tag = "mixto"

        clave_tag = get_clave_tag(clave_config)

        for mod in (midi_utils_tradicional, midi_utils):
            mod.PRIMER_BLOQUE = list(clave_config.primer_bloque)
            mod.PATRON_REPETIDO = list(clave_config.patron_repetido)
            mod.PATRON_GRUPOS = mod.PRIMER_BLOQUE + mod.PATRON_REPETIDO * 3

        notas_finales: List[pretty_midi.Note] = []
        max_cor = 0
        inst_params: Optional[Tuple[int, bool, str]] = None
        reference_files: List[Path] = []
        # ``inversion_limpia`` calculated above so the same base inversion is
        # reused for deterministic default selection.

        with TemporaryDirectory() as tmpdir:
            for idx, segmento in enumerate(segmentos):
                funcion = MODOS_DISPONIBLES.get(segmento.mode)
                if funcion is None:
                    raise ValueError(f"Modo no soportado: {segmento.mode}")

                if segmento.mode == "Salsa":
                    sufijo_idx = seed or 0
                    midi_ref_seg = reference_root / (
                        f"salsa_{clave_tag}_{inversion_limpia}_{_DEF_VARIATIONS[sufijo_idx % 4]}.mid"
                    )
                    arg_extra = inversion_limpia
                else:
                    midi_ref_seg = reference_root / f"{clave_config.midi_prefix}_{variacion}.mid"
                    arg_extra = armonizacion_default

                if not midi_ref_seg.exists():
                    raise FileNotFoundError(f"No se encontró {midi_ref_seg}")

                reference_files.append(midi_ref_seg)
                tmp_path = Path(tmpdir) / f"segment_{idx}.mid"

                asign_seg = [tuple(a) for a in segmento.assignments]
                kwargs = {"asignaciones_custom": asign_seg}
                inv_seg = [inversiones[i] for i in segmento.chord_indices]
                bass_seg = [bass_targets[i] for i in segmento.chord_indices]
                oct_seg = [octavaciones[i] for i in segmento.chord_indices]
                kwargs["octavacion_default"] = octavacion_default
                kwargs["octavaciones_custom"] = oct_seg

                if segmento.mode == "Salsa":
                    if any(inv_seg):
                        kwargs["inversiones_manual"] = inv_seg
                else:
                    if any(inv_seg):
                        suf_map = {"root": "1", "third": "3", "fifth": "5", "seventh": "7"}
                        asign_mod: List[Tuple[str, List[int], str]] = []
                        for (nombre, idxs, arm, *_), inv in zip(asign_seg, inv_seg):
                            if inv and inv != "root":
                                nombre = f"{nombre}/{suf_map.get(inv, '1')}"
                            asign_mod.append((nombre, idxs, arm))
                        asign_seg = asign_mod
                        kwargs["asignaciones_custom"] = asign_seg
                    armon_seg = [armonias[i] for i in segmento.chord_indices]
                    kwargs["armonizaciones_custom"] = armon_seg
                    kwargs["aleatorio"] = True
                    kwargs["bajos_objetivo"] = bass_seg

                funcion(
                    "",
                    midi_ref_seg,
                    tmp_path,
                    arg_extra,
                    inicio_cor=segmento.start_eighth,
                    return_pm=False,
                    **kwargs,
                )

                pm_segment = pretty_midi.PrettyMIDI(str(tmp_path))
                if not pm_segment.instruments:
                    continue

                inst = pm_segment.instruments[0]
                if inst_params is None:
                    inst_params = (inst.program, inst.is_drum, inst.name)

                grid_seg = 60.0 / bpm / 2
                seg_cor = int(round(pm_segment.get_end_time() / grid_seg))
                start = segmento.start_eighth * grid_seg
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
                if segmento.start_eighth + seg_cor > max_cor:
                    max_cor = segmento.start_eighth + seg_cor

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
