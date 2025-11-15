# -*- coding: utf-8 -*-
"""Utilities for generating piano voicings."""

from typing import Callable, Dict, List, Optional, Tuple
import logging
import re

# ---------------------------------------------------------------------------
# Pitch range limits for the generated voicings.  Notes are adjusted so that
# they remain within this interval when building the linked voicings.
# These limits should only affect the base voicings; harmonisation later on
# (octaves, double octaves, tenths or sixths) may exceed ``RANGO_MAX``.
# ---------------------------------------------------------------------------
RANGO_MIN = 53  # F3
RANGO_MAX = 67  # G4
RANGO_EXTRA = 4  # flexible extension above and below
SALTO_MAX = 8  # maximum leap in semitones

logger = logging.getLogger(__name__)

# ==========================================================================
# Dictionaries for chord suffixes and note names
# These are used to parse chord symbols and build chord voicings
# ===========================================================================

INTERVALOS_TRADICIONALES = {
    '6':      [0, 4, 7, 9],     # 1 3 5 6
    '7':      [0, 4, 7, 10],    # 1 3 5 b7
    '∆':      [0, 4, 7, 11],    # 1 3 5 7
    'm6':     [0, 3, 7, 9],     # 1 b3 5 6
    'm7':     [0, 3, 7, 10],    # 1 b3 5 b7
    'm∆':     [0, 3, 7, 11],    # 1 b3 5 7
    '+7':     [0, 4, 8, 10],    # 1 3 #5 b7
    '∆sus4':  [0, 5, 7, 11],    # 1 4 5 7
    '∆sus2':  [0, 2, 7, 11],    # 1 2 5 7
    '7sus4':  [0, 5, 7, 10],    # 1 4 5 b7
    '7sus2':  [0, 2, 7, 10],    # 1 2 5 b7
    'º7':     [0, 3, 6, 9],     # 1 b3 b5 bb7 (bb7 = 6ma mayor)
    'º∆':     [0, 3, 6, 11],    # 1 b3 b5 7
    'm7(b5)':      [0, 3, 6, 10],    # 1 b3 b5 b7
    '7(b5)':  [0, 4, 6, 10],    # 1 3 b5 b7
    '7(b9)':  [0, 4, 7, 10, 13],  # 1 3 5 b7 b9
    '+7(b9)': [0, 4, 8, 10, 13],  # 1 3 #5 b7 b9
    '7(b5)b9': [0, 4, 6, 10, 13],  # 1 3 b5 b7 b9
    '7sus4(b9)': [0, 5, 7, 10, 13],  # 1 4 5 b7 b9
    '∆(b5)':  [0, 4, 6, 11],    # 1 3 b5 7
    '9':      [0, 4, 7, 10, 14],   # 1 3 5 b7 9
    '11':     [0, 4, 7, 10, 17],   # 1 3 5 b7 11
    '13':     [0, 4, 7, 10, 21],   # 1 3 5 b7 13
    '∆9':     [0, 4, 7, 11, 14],   # 1 3 5 7 9
    '∆11':    [0, 4, 7, 11, 17],   # 1 3 5 7 11
    '∆13':    [0, 4, 7, 11, 21],   # 1 3 5 7 13
    'm9':     [0, 3, 7, 10, 14],   # 1 b3 5 b7 9
    'm11':    [0, 3, 7, 10, 17],   # 1 b3 5 b7 11
    'm13':    [0, 3, 7, 10, 21],   # 1 b3 5 b7 13
    '7(9)':   [0, 4, 7, 10, 14],   # 1 3 5 b7 9
    '7(13)':  [0, 4, 7, 10, 21],   # 1 3 5 b7 13
    'm7(9)':  [0, 3, 7, 10, 14],   # 1 b3 5 b7 9
    'm7(11)': [0, 3, 7, 10, 17],   # 1 b3 5 b7 11
    'm7(13)': [0, 3, 7, 10, 21],   # 1 b3 5 b7 13
}

NOTAS = {
    'C':0,  'B#':0,
    'C#':1, 'Db':1,
    'D':2,
    'D#':3,'Eb':3,
    'E':4, 'Fb':4,
    'F':5, 'E#':5,
    'F#':6,'Gb':6,
    'G':7,
    'G#':8,'Ab':8,
    'A':9,
    'A#':10,'Bb':10,
    'B':11, 'Cb':11,
}

# ==========================================================================
# Chord parsing and linked voicing generation
# ==========================================================================

_SUFIJOS_ORDENADOS = sorted(INTERVALOS_TRADICIONALES.keys(), key=len, reverse=True)
_SUFIJOS_PATRON = "|".join(re.escape(suf) for suf in _SUFIJOS_ORDENADOS)
_PATRON_ACORDE = re.compile(rf'^([A-G][b#]?)(?:({_SUFIJOS_PATRON}))?$', re.ASCII)


def parsear_nombre_acorde(nombre: str) -> Tuple[int, str]:
    """Parse a chord name into root MIDI pitch class and suffix."""

    base = re.sub(r"/[1357]$", "", nombre)

    m = _PATRON_ACORDE.match(base)
    if not m:
        raise ValueError(f"Acorde no reconocido: {nombre}")
    root, suf = m.group(1), m.group(2) or '∆'
    return NOTAS[root], suf


IntervalSelector = Callable[[List[int]], Tuple[List[int], Dict[str, int]]]


def _selector_tradicional(intervalos: List[int]) -> Tuple[List[int], Dict[str, int]]:
    seleccion = intervalos[:4]
    mapa = {'root': 0, 'third': 1, 'fifth': 2, 'seventh': 3}
    return seleccion, mapa


def _selector_extendido(intervalos: List[int]) -> Tuple[List[int], Dict[str, int]]:
    if len(intervalos) <= 4:
        return _selector_tradicional(intervalos)

    base = intervalos[:2]
    resto = intervalos[2:]
    elegidos = resto[-2:] if len(resto) >= 2 else resto
    seleccion = (base + elegidos)[:4]

    mapa = {'root': 0, 'third': 1}
    if len(seleccion) >= 3:
        mapa['seventh'] = 2
        mapa.setdefault('fifth', 2)
    if len(seleccion) >= 4:
        mapa.setdefault('fifth', 2)
        mapa.setdefault('seventh', 2)
    return seleccion, mapa


def _generar_voicings_enlazados(
    progresion: List[str],
    selector: IntervalSelector,
) -> List[List[int]]:
    """Generate linked voicings applying the provided interval selector."""

    import pretty_midi

    referencia = [55, 57, 60, 64]
    voicings: List[List[int]] = []
    bajo_anterior = referencia[0]

    def ajustar(pc: int, target: int) -> int:
        pitch = target + ((pc - target) % 12)
        if abs(pitch - target) > abs(pitch - 12 - target):
            pitch -= 12
        return pitch

    for nombre in progresion:
        inv_forzado = None
        m = re.search(r"/([1357])$", nombre)
        if m:
            inv_map = {'1': 'root', '3': 'third', '5': 'fifth', '7': 'seventh'}
            inv_forzado = inv_map[m.group(1)]
            nombre = nombre[: m.start()]

        root, suf = parsear_nombre_acorde(nombre)
        ints_completos = INTERVALOS_TRADICIONALES[suf]
        ints, idx_map = selector(ints_completos)
        pcs = [(root + i) % 12 for i in ints]

        if inv_forzado:
            idx_lookup = idx_map.get(inv_forzado, idx_map.get('root', 0))
            pc_bajo = pcs[idx_lookup]
            bajo_tmp = ajustar(pc_bajo, bajo_anterior)
            bajo = _ajustar_octava_flexible(bajo_tmp, bajo_anterior)
            restantes_pcs = [p for i, p in enumerate(pcs) if i != idx_lookup][:3]
        else:
            idx_y = min(2, len(pcs) - 1)
            idx_z = min(3, len(pcs) - 1)
            pc_y, pc_z = pcs[idx_y], pcs[idx_z]
            cand_y = _ajustar_octava_flexible(ajustar(pc_y, bajo_anterior), bajo_anterior)
            cand_z = _ajustar_octava_flexible(ajustar(pc_z, bajo_anterior), bajo_anterior)
            if abs(cand_y - bajo_anterior) <= abs(cand_z - bajo_anterior):
                bajo = cand_y
                restantes_pcs = [pcs[0], pcs[1], pc_z]
            else:
                bajo = cand_z
                restantes_pcs = [pcs[0], pcs[1], pc_y]

        notas_restantes: List[int] = []
        for pc, ref in zip(restantes_pcs, referencia[1:]):
            pitch = ajustar(pc, ref)
            while pitch <= bajo:
                pitch += 12
            pitch = _ajustar_octava(pitch)
            while pitch <= bajo:
                pitch += 12
            notas_restantes.append(pitch)

        voicing = sorted([bajo] + notas_restantes)

        if root % 12 == 0:
            alt_voicing = [n + 12 for n in voicing]
            if abs(alt_voicing[0] - bajo_anterior) < abs(voicing[0] - bajo_anterior):
                voicing = alt_voicing
                bajo = voicing[0]

        voicings.append(voicing)
        nombres = [pretty_midi.note_number_to_name(n) for n in voicing]
        logger.debug("Voicing %s (%s): %s", nombre, suf, ", ".join(nombres))

        bajo_anterior = bajo

    return voicings


def _ajustar_octava(pitch: int) -> int:
    """Confine ``pitch`` within ``RANGO_MIN`` .. ``RANGO_MAX`` by octaves."""

    while pitch < RANGO_MIN:
        pitch += 12
    while pitch > RANGO_MAX:
        pitch -= 12
    return pitch


def _ajustar_octava_flexible(pitch: int, prev: Optional[int]) -> int:
    """Adjust ``pitch`` preferring the fixed range but allowing a small extension."""

    def clamp(p: int, lo: int, hi: int) -> int:
        while p < lo:
            p += 12
        while p > hi:
            p -= 12
        return p

    base = clamp(pitch, RANGO_MIN, RANGO_MAX)
    if prev is None or abs(base - prev) <= SALTO_MAX:
        return base

    ext = clamp(pitch, RANGO_MIN - RANGO_EXTRA, RANGO_MAX + RANGO_EXTRA)
    if abs(ext - prev) < abs(base - prev):
        return ext
    return base


def generar_voicings_enlazados_tradicional(progresion: List[str]) -> List[List[int]]:
    """Generate linked four-note voicings in the traditional style."""

    return _generar_voicings_enlazados(progresion, _selector_tradicional)


def generar_voicings_enlazados_extendido(progresion: List[str]) -> List[List[int]]:
    """Generate linked voicings prioritising chord extensions."""

    return _generar_voicings_enlazados(progresion, _selector_extendido)

# Future voicing strategies for other modes can be added here
