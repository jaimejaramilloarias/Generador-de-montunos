# -*- coding: utf-8 -*-
"""Definition of the available montuno generation modes."""

from pathlib import Path

import pretty_midi
from typing import List, Optional, Tuple


from .voicings_tradicional import (
    generar_voicings_enlazados_extendido,
    generar_voicings_enlazados_tradicional,
)
from . import midi_utils, midi_utils_tradicional
from .salsa import montuno_salsa


# ==========================================================================
# Shared helpers
# ==========================================================================

def _exportar_montuno_extendido(
    midi_ref: Path,
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int], str]],
    compases: int,
    output: Path,
    armonizacion: Optional[str] = None,
    *,
    inicio_cor: int = 0,
    return_pm: bool = False,
    aleatorio: bool = False,
    debug: bool = False,
    octavaciones: Optional[List[str]] = None,
) -> Optional[pretty_midi.PrettyMIDI]:
    """Wrap :func:`midi_utils.exportar_montuno` adding ``return_pm`` support."""

    midi_utils.exportar_montuno(
        midi_ref,
        voicings,
        asignaciones,
        compases,
        output,
        armonizacion,
        inicio_cor=inicio_cor,
        aleatorio=aleatorio,
        octavaciones=octavaciones,
        debug=debug,
    )
    return pretty_midi.PrettyMIDI(str(output)) if return_pm else None


def _montuno_generico(
    generar_voicings,
    procesar_progresion_en_grupos,
    exportar_montuno,
    progresion_texto: str,
    midi_ref: Path,
    output: Path,
    armonizacion: Optional[str] = None,
    *,
    inicio_cor: int = 0,
    return_pm: bool = False,
    aleatorio: bool = False,
    armonizaciones_custom: Optional[List[str]] = None,
    asignaciones_custom: Optional[List[Tuple[str, List[int], str]]] = None,
    octavacion_default: Optional[str] = None,
    octavaciones_custom: Optional[List[str]] = None,
    bajos_objetivo: Optional[List[int]] = None,
) -> Optional[pretty_midi.PrettyMIDI]:
    if asignaciones_custom is None:
        asignaciones, compases = procesar_progresion_en_grupos(
            progresion_texto, armonizacion, inicio_cor=inicio_cor
        )
    else:
        asignaciones = asignaciones_custom
        compases = (
            (max(i for _, idxs, *_ in asignaciones for i in idxs) + 7) // 8
            if asignaciones
            else 0
        )
    octavaciones = octavaciones_custom or [octavacion_default] * len(asignaciones)
    if armonizaciones_custom is not None:
        for idx, arm in enumerate(armonizaciones_custom):
            if idx < len(asignaciones):
                nombre, idxs = asignaciones[idx][:2]
                asignaciones[idx] = (nombre, idxs, arm)
    acordes = [data[0] for data in asignaciones]
    voicings = generar_voicings(acordes)
    if bajos_objetivo is not None:
        for idx, (voicing, objetivo) in enumerate(zip(voicings, bajos_objetivo)):
            if objetivo is None:
                continue
            desplazamiento = objetivo - voicing[0]
            voicings[idx] = [n + desplazamiento for n in voicing]
    return exportar_montuno(
        midi_ref,
        voicings,
        asignaciones,
        compases,
        output,
        armonizacion=armonizacion,
        inicio_cor=inicio_cor,
        return_pm=return_pm,
        aleatorio=aleatorio,
        octavaciones=octavaciones,
    )


# ==========================================================================
# Traditional mode
# ==========================================================================

def montuno_tradicional(
    progresion_texto: str,
    midi_ref: Path,
    output: Path,
    armonizacion: Optional[str] = None,
    *,
    inicio_cor: int = 0,
    return_pm: bool = False,
    aleatorio: bool = False,
    armonizaciones_custom: Optional[List[str]] = None,
    asignaciones_custom: Optional[List[Tuple[str, List[int], str]]] = None,
    octavacion_default: Optional[str] = None,
    octavaciones_custom: Optional[List[str]] = None,
    bajos_objetivo: Optional[List[int]] = None,
) -> Optional[pretty_midi.PrettyMIDI]:
    """Generate a montuno in the traditional style."""

    return _montuno_generico(
        generar_voicings_enlazados_tradicional,
        midi_utils_tradicional.procesar_progresion_en_grupos,
        midi_utils_tradicional.exportar_montuno,
        progresion_texto,
        midi_ref,
        output,
        armonizacion,
        inicio_cor=inicio_cor,
        return_pm=return_pm,
        aleatorio=aleatorio,
        armonizaciones_custom=armonizaciones_custom,
        asignaciones_custom=asignaciones_custom,
        octavacion_default=octavacion_default,
        octavaciones_custom=octavaciones_custom,
        bajos_objetivo=bajos_objetivo,
    )


def montuno_extendido(
    progresion_texto: str,
    midi_ref: Path,
    output: Path,
    armonizacion: Optional[str] = None,
    *,
    inicio_cor: int = 0,
    return_pm: bool = False,
    aleatorio: bool = False,
    armonizaciones_custom: Optional[List[str]] = None,
    asignaciones_custom: Optional[List[Tuple[str, List[int], str]]] = None,
    octavacion_default: Optional[str] = None,
    octavaciones_custom: Optional[List[str]] = None,
    bajos_objetivo: Optional[List[int]] = None,
) -> Optional[pretty_midi.PrettyMIDI]:
    """Generate a montuno emphasising extended chord tones."""

    return _montuno_generico(
        generar_voicings_enlazados_extendido,
        midi_utils.procesar_progresion_en_grupos,
        _exportar_montuno_extendido,
        progresion_texto,
        midi_ref,
        output,
        armonizacion,
        inicio_cor=inicio_cor,
        return_pm=return_pm,
        aleatorio=aleatorio,
        armonizaciones_custom=armonizaciones_custom,
        asignaciones_custom=asignaciones_custom,
        octavacion_default=octavacion_default,
        octavaciones_custom=octavaciones_custom,
        bajos_objetivo=bajos_objetivo,
    )


MODOS_DISPONIBLES = {
    "Tradicional": montuno_tradicional,
    "Salsa": montuno_salsa,
}
