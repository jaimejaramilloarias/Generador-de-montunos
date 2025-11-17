(function(){"use strict";var I=`"""Backend package exposing the montuno generation core."""

from . import midi_common, midi_utils, midi_utils_tradicional, modos, salsa, style_utils, utils, voicings, voicings_tradicional
from .montuno_core import CLAVES, ClaveConfig, MontunoGenerateResult, generate_montuno, get_clave_tag

__all__ = [
    "CLAVES",
    "ClaveConfig",
    "MontunoGenerateResult",
    "generate_montuno",
    "get_clave_tag",
    "midi_common",
    "midi_utils",
    "midi_utils_tradicional",
    "modos",
    "salsa",
    "style_utils",
    "utils",
    "voicings",
    "voicings_tradicional",
]
`,w=`from __future__ import annotations

"""Miscellaneous helper functions used across the GUI."""

from typing import Callable, Iterable, List, Optional, Sequence, Tuple, Union
import json
import re
from pathlib import Path
import re
import pretty_midi

__all__ = [
    "RE_BAR_CLEAN",
    "limpiar_inversion",
    "apply_manual_edits",
    "calc_default_inversions",
    "normalise_bars",
    "clean_tokens",
]

RE_BAR_CLEAN = re.compile(r"\\|\\s*\\|+")


def limpiar_inversion(valor: str) -> str:
    """Remove duplicated inversion suffixes like \`\`root_root\`\`."""
    if "_" in valor:
        valor = valor.split("_")[0]
    return valor


def apply_manual_edits(pm: pretty_midi.PrettyMIDI, edits: Iterable[dict]) -> None:
    """Apply recorded manual edits to a \`\`PrettyMIDI\`\` object."""
    inst = pm.instruments[0]
    for ed in edits:
        typ = ed.get("type", "modify")
        if typ == "modify":
            for n in inst.notes:
                if abs(n.start - ed["start"]) < 1e-6 and abs(n.end - ed["end"]) < 1e-6:
                    n.pitch = ed["pitch"]
                    break
        elif typ == "add":
            inst.notes.append(
                pretty_midi.Note(
                    velocity=100,
                    pitch=ed["pitch"],
                    start=ed["start"],
                    end=ed["end"],
                )
            )
        elif typ == "delete":
            for n in list(inst.notes):
                if (
                    abs(n.start - ed["start"]) < 1e-6
                    and abs(n.end - ed["end"]) < 1e-6
                    and n.pitch == ed["pitch"]
                ):
                    inst.notes.remove(n)
                    break
    inst.notes.sort(key=lambda n: n.start)


def calc_default_inversions(
    asignaciones,
    inversion_getter: Callable[[], str],
    get_bass_pitch: Callable[[str, str], int],
    ajustar_rango_flexible: Callable[[Optional[int], int], int],
    seleccionar_inversion: Callable[[Optional[int], str], Tuple[str, int]],
    manual_overrides: Optional[Sequence[Optional[str]]] = None,
    offset_getter: Optional[Callable[[int], int]] = None,
    *,
    return_pitches: bool = False,
) -> Union[List[str], Tuple[List[str], List[int]]]:
    """Return default inversions (and optional bass targets) using the salsa helpers.

    \`\`manual_overrides\`\` allows callers to inject per-chord inversion choices
    while keeping the linked-voice logic intact.  \`\`offset_getter\`\` can supply
    an additional octave displacement per index (e.g. to reflect octavation
    labels).  When \`\`return_pitches\`\` is \`\`True\`\` the function returns a
    \`\`(inversions, pitches)\`\` tuple with the adjusted bass pitch for each
    inversion; otherwise only the inversion list is returned.
    """

    invs: List[str] = []
    pitches: List[int] = []
    voz: Optional[int] = None
    overrides = list(manual_overrides or [])

    for idx, data in enumerate(asignaciones):
        cif = data[0]
        inv_for = data[3] if len(data) > 3 else None
        override = overrides[idx] if idx < len(overrides) else None
        offset = offset_getter(idx) if offset_getter is not None else 0

        if override:
            inv = override
            pitch = get_bass_pitch(cif, inv) + offset
            pitch = ajustar_rango_flexible(voz, pitch)
        elif idx == 0:
            inv = inv_for or limpiar_inversion(inversion_getter())
            pitch = get_bass_pitch(cif, inv) + offset
            pitch = ajustar_rango_flexible(voz, pitch)
        else:
            if inv_for:
                inv = inv_for
                pitch = get_bass_pitch(cif, inv) + offset
                pitch = ajustar_rango_flexible(voz, pitch)
            else:
                inv, pitch = seleccionar_inversion(voz, cif)
        invs.append(inv)
        pitches.append(pitch)
        voz = pitch

    return (invs, pitches) if return_pitches else invs


def normalise_bars(text: str) -> str:
    """Remove duplicated barlines and tidy spacing."""
    lines = []
    for ln in text.splitlines():
        ln = RE_BAR_CLEAN.sub("|", ln)
        parts = [p.strip() for p in ln.split("|")]
        ln = " | ".join(p for p in parts if p)
        lines.append(ln)
    return "\\n".join(lines)


_REPLACEMENTS_CACHE: Optional[List[Tuple[re.Pattern, str]]] = None


def _load_replacements() -> List[Tuple[re.Pattern, str]]:
    global _REPLACEMENTS_CACHE
    if _REPLACEMENTS_CACHE is not None:
        return _REPLACEMENTS_CACHE

    root = Path(__file__).resolve().parent.parent
    replacements_path = root / "shared" / "chord_replacements.json"
    data = json.loads(replacements_path.read_text(encoding="utf-8"))
    compiled: List[Tuple[re.Pattern, str]] = []
    for entry in data:
        flags = 0
        for flag in entry.get("flags", ""):
            if flag == "i":
                flags |= re.IGNORECASE
            elif flag == "m":
                flags |= re.MULTILINE
        pattern = re.compile(entry["pattern"], flags)
        def _replace(match: re.Match[str]) -> str:
            digits = match.group(1)
            group_id = digits[0]
            suffix = digits[1:]
            return f"\\\\g<{group_id}>{suffix}"

        replacement = re.sub(r"\\$(\\d+)", _replace, entry["replacement"])
        compiled.append((pattern, replacement))

    _REPLACEMENTS_CACHE = compiled
    return compiled


def clean_tokens(txt: str) -> str:
    """Normalise chord symbols according to shared replacement rules."""

    result = txt
    for pattern, replacement in _load_replacements():
        result = pattern.sub(replacement, result)
    return result
`,d=`"""Helpers for style parsing and application."""
from typing import Callable, List, Tuple

__all__ = ["parse_styles", "apply_styles"]

def parse_styles(text: str, get_modo: Callable[[], str], get_armon: Callable[[], str]) -> Tuple[List[str], List[str], List[str]]:
    """Return mode, harmonisation and inversion lists for each chord."""
    segmentos_raw = [s.strip() for s in text.split("|") if s.strip()]
    segmentos: List[str] = []
    for seg in segmentos_raw:
        if seg == "%":
            if not segmentos:
                continue
            segmentos.append(segmentos[-1])
        else:
            segmentos.append(seg)
    num_chords = len(segmentos)
    modos = [get_modo()] * num_chords
    arms = [get_armon()] * num_chords
    invs = [None] * num_chords
    return modos, arms, invs


def apply_styles(base_text: str) -> str:
    """Return \`\`base_text\`\` unchanged."""
    return base_text
`,N=`from __future__ import annotations

"""Shared MIDI helper utilities used by both modes."""

from pathlib import Path
from typing import List
import random
import logging
import pretty_midi

__all__ = [
    "NOTAS_BASE",
    "leer_midi_referencia",
    "obtener_posiciones_referencia",
    "construir_posiciones_secuenciales",
    "construir_posiciones_por_ventanas",
]

# Baseline notes present in the reference MIDI to be replaced by generated voicings
NOTAS_BASE = [55, 57, 60, 64]  # G3, A3, C4, E4

logger = logging.getLogger(__name__)


def leer_midi_referencia(midi_path: Path):
    """Load reference MIDI and return its notes and the PrettyMIDI object."""
    pm = pretty_midi.PrettyMIDI(str(midi_path))
    instrumento = pm.instruments[0]
    notes = sorted(instrumento.notes, key=lambda n: n.start)
    for n in notes:
        nombre = pretty_midi.note_number_to_name(int(n.pitch))
        logger.debug("%s (%s)", n.pitch, nombre)
    logger.debug("Total de notas: %s", len(notes))
    return notes, pm


def obtener_posiciones_referencia(notes) -> List[dict]:
    """Return pitch, start, end and velocity for baseline notes in the reference."""
    posiciones = []
    for n in notes:
        pitch = int(n.pitch)
        if pitch in [int(p) for p in NOTAS_BASE]:
            posiciones.append(
                {
                    "pitch": pitch,
                    "start": n.start,
                    "end": n.end,
                    "velocity": n.velocity,
                }
            )
            nombre = pretty_midi.note_number_to_name(pitch)
            logger.debug("Nota base %s (%s) inicio %s", pitch, nombre, n.start)
    posiciones.sort(key=lambda x: (x["start"], x["pitch"]))
    logger.debug("Notas base encontradas: %s", len(posiciones))
    ejemplo = [(p["pitch"], p["start"]) for p in posiciones[:10]]
    logger.debug("Ejemplo primeros 10: %s", ejemplo)
    return posiciones


def construir_posiciones_secuenciales(
    posiciones_base: List[dict],
    total_cor_dest: int,
    total_cor_ref: int,
    grid_seg: float,
    *,
    inicio_cor: int = 0,
) -> List[dict]:
    """Build note positions repeating the reference sequentially."""

    grupos_ref: List[List[dict]] = [[] for _ in range(total_cor_ref)]
    for pos in posiciones_base:
        idx = int(round(pos["start"] / grid_seg))
        if 0 <= idx < total_cor_ref:
            grupos_ref[idx].append(
                {
                    "pitch": pos["pitch"],
                    "start": pos["start"] - idx * grid_seg,
                    "end": pos["end"] - idx * grid_seg,
                    "velocity": pos["velocity"],
                }
            )

    posiciones: List[dict] = []
    for dest_idx in range(total_cor_dest):
        ref_idx = (inicio_cor + dest_idx) % total_cor_ref
        for nota in grupos_ref[ref_idx]:
            posiciones.append(
                {
                    "pitch": nota["pitch"],
                    "start": round(dest_idx * grid_seg + nota["start"], 6),
                    "end": round(dest_idx * grid_seg + nota["end"], 6),
                    "velocity": nota["velocity"],
                }
            )

    posiciones.sort(key=lambda x: (x["start"], x["pitch"]))
    return posiciones


def construir_posiciones_por_ventanas(
    posiciones_base: List[dict],
    total_cor_dest: int,
    total_cor_ref: int,
    grid_seg: float,
    *,
    inicio_cor: int = 0,
    compases_ventana: int = 4,
    aleatorio: bool = True,
) -> List[dict]:
    """Build note positions choosing fixed-size windows from the reference."""

    inicio_cor = inicio_cor % total_cor_ref

    ventana_cor = compases_ventana * 8
    num_ventanas = max(1, total_cor_ref // ventana_cor)

    grupos_ref: List[List[dict]] = [[] for _ in range(total_cor_ref)]
    for pos in posiciones_base:
        idx = int(round(pos["start"] / grid_seg))
        if 0 <= idx < total_cor_ref:
            grupos_ref[idx].append(
                {
                    "pitch": pos["pitch"],
                    "start": pos["start"] - idx * grid_seg,
                    "end": pos["end"] - idx * grid_seg,
                    "velocity": pos["velocity"],
                }
            )

    posiciones: List[dict] = []
    start_block = inicio_cor // ventana_cor
    end_block = (inicio_cor + total_cor_dest - 1) // ventana_cor
    num_blocks = end_block - start_block + 1

    if aleatorio:
        orden_inicial = list(range(num_ventanas))
        random.shuffle(orden_inicial)
        ventanas_por_bloque = orden_inicial[:num_blocks]
        while len(ventanas_por_bloque) < num_blocks:
            ventanas_por_bloque.append(random.randint(0, num_ventanas - 1))
    else:
        ventanas_por_bloque = [
            (start_block + i) % num_ventanas for i in range(num_blocks)
        ]

    for dest_idx in range(total_cor_dest):
        cor_global = inicio_cor + dest_idx + 1
        pos_relativa = (cor_global - 1) % ventana_cor
        bloque = (cor_global - 1) // ventana_cor - start_block
        ventana = ventanas_por_bloque[bloque]
        ref_idx = (ventana * ventana_cor + pos_relativa) % total_cor_ref
        for nota in grupos_ref[ref_idx]:
            posiciones.append(
                {
                    "pitch": nota["pitch"],
                    "start": round(dest_idx * grid_seg + nota["start"], 6),
                    "end": round(dest_idx * grid_seg + nota["end"], 6),
                    "velocity": nota["velocity"],
                }
            )

    posiciones.sort(key=lambda x: (x["start"], x["pitch"]))
    return posiciones
`,F=`# -*- coding: utf-8 -*-
"""Helpers for reading, manipulating and exporting MIDI files."""

from pathlib import Path
from typing import Dict, List, Optional, Tuple
import math
import pretty_midi
import random
import logging
from .voicings import parsear_nombre_acorde, INTERVALOS_TRADICIONALES
from .midi_common import (
    NOTAS_BASE,
    leer_midi_referencia,
    obtener_posiciones_referencia,
    construir_posiciones_secuenciales,
    construir_posiciones_por_ventanas,
)

# All reference MIDI loops have the same length (32 bars with 8 eighth-notes
# each). Tempo information is ignored so the default player tempo is used.
NORMALIZED_BPM = 200.0  # Unused but kept for compatibility


logger = logging.getLogger(__name__)



# ==========================================================================
# MIDI export utilities
# ==========================================================================


def aplicar_voicings_a_referencia(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    *,
    debug: bool = False,
) -> Tuple[List[pretty_midi.Note], int]:
    """Reemplaza las notas de referencia por los voicings generados.

    Devuelve la lista de nuevas notas y el último índice de corchea utilizado.
    """

    # Mapeo corchea → índice de voicing
    mapa: Dict[int, int] = {}
    max_idx = -1
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i
            if ix > max_idx:
                max_idx = ix

    nuevas_notas: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue  # silencio
        voicing = sorted(voicings[mapa[corchea]])
        orden = NOTAS_BASE.index(pos["pitch"])  # posición dentro del voicing
        # Preserve the velocity of the reference note so dynamics match
        nueva_nota = pretty_midi.Note(
            velocity=pos["velocity"],
            pitch=voicing[orden],
            start=pos["start"],
            end=pos["end"],
        )
        if debug:
            logger.debug("Corchea %s: nota base %s -> %s", corchea, pos['pitch'], nueva_nota.pitch)
        nuevas_notas.append(nueva_nota)

    return nuevas_notas, max_idx


def _arm_octavas(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Duplicate each note one octave above."""

    resultado: List[pretty_midi.Note] = []
    for n in notas:
        resultado.append(n)
        if n.pitch > 0:
            resultado.append(
                pretty_midi.Note(
                    velocity=n.velocity,
                    pitch=n.pitch + 12,
                    start=n.start,
                    end=n.end,
                )
            )
    return resultado


def _arm_doble_octava(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Create notes an octave below and above, without keeping the original."""

    resultado: List[pretty_midi.Note] = []
    for n in notas:
        if n.pitch > 0:
            # Copy the velocity from the original note
            resultado.append(
                pretty_midi.Note(
                    velocity=n.velocity,
                    pitch=n.pitch - 12,
                    start=n.start,
                    end=n.end,
                )
            )
            resultado.append(
                pretty_midi.Note(
                    velocity=n.velocity,
                    pitch=n.pitch + 12,
                    start=n.start,
                    end=n.end,
                )
            )
    return resultado


def _arm_por_parejas(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    salto: int,
    *,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Generate notes in parallel motion (décimas or sixths).

    Each chord \`\`voicing\`\` is walked sequentially using the eighth-note
    positions assigned to it.  \`\`salto\`\` determines the pairing pattern:
    \`\`1\`\` produces décimas (third + octave) and \`\`2\`\` produces sixths.
    The rhythmic information (start, end and velocity) is taken from the
    reference \`\`posiciones\`\` list.
    """

    # Map each eighth index to the corresponding voicing/chord
    mapa: Dict[int, int] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i

    # Counter so each chord advances through its voicing in parallel
    contadores: Dict[int, int] = {}

    resultado: List[pretty_midi.Note] = []
    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx_voicing = mapa[corchea]
        paso = contadores.get(idx_voicing, 0)
        contadores[idx_voicing] = paso + 1

        voicing = sorted(voicings[idx_voicing])

        if salto == 1:  # décimas
            principal = voicing[paso % 4]
            agregada = voicing[(paso + 1) % 4] + 12
        else:  # antiguas sextas
            principal = voicing[(paso + 1) % 4]
            agregada = voicing[paso % 4] + 12

        # Ensure the upper note never sits in the same octave as the
        # principal voice.  This avoids "collapsed" intervals when the
        # voicing spans less than an octave.
        while agregada <= principal:
            agregada += 12

        for pitch in (principal, agregada):
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

        if debug:
            logger.debug("Corchea %s: paso %s -> %s / %s", corchea, paso, principal, agregada)

    return resultado


def _arm_decimas_intervalos(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    *,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Harmonize in parallel tenths following fixed functional pairs.

    Before processing the MIDI positions each chord is analysed so every
    pitch can be labelled as fundamental, third, fifth, sixth or seventh.
    The added note is then obtained with the exact interval mandated by the
    specification:

    * F → 3 (+12)
    * 3 → 5 (+12)
    * 5 → 7 (+12) or M7 (+12) on sixth chords
    * 6 or diminished 7 → F (+24)
    * 7 → 9 (+24)

    Velocity and timing from the reference are preserved verbatim.
    """

    # ------------------------------------------------------------------
    # Build a map from eighth index to voicing index and gather information
    # about each chord so that every pitch can be classified by function.
    # \`\`info\`\` stores the root pitch class, the four intervals of the chord
    # and flags indicating whether it is a sixth chord or a diminished
    # seventh.
    # ------------------------------------------------------------------
    mapa: Dict[int, int] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i

    info: List[Dict] = []
    for data in asignaciones:
        nombre = data[0]
        root_pc, suf = parsear_nombre_acorde(nombre)
        ints = INTERVALOS_TRADICIONALES[suf]
        is_sixth = suf.endswith("6") and "7" not in suf
        is_dim7 = suf == "º7"
        info.append(
            {
                "root_pc": root_pc,
                "intervals": ints,
                "is_sixth": is_sixth,
                "is_dim7": is_dim7,
                "suf": suf,
            }
        )

    contadores: Dict[int, int] = {}
    offsets: Dict[int, int] = {}
    bajo_anterior: Optional[int] = None
    arm_anterior: Optional[str] = None
    resultado: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx = mapa[corchea]
        paso = contadores.get(idx, 0)
        contadores[idx] = paso + 1

        datos = info[idx]
        voicing = sorted(voicings[idx])
        base = voicing[paso % 4]
        root_pc = datos["root_pc"]
        ints = datos["intervals"]
        is_sixth = datos["is_sixth"]
        is_dim7 = datos["is_dim7"]
        suf = datos["suf"]
        suf = datos["suf"]

        # --------------------------------------------------------------
        # Identify the function of \`\`base\`\` comparing its pitch class
        # against the intervals of the current chord.
        # --------------------------------------------------------------
        pc = base % 12
        func = None
        base_int = None
        if pc == (root_pc + ints[0]) % 12:
            func = "F"
            base_int = ints[0]
            target_int = ints[1]
        elif pc == (root_pc + ints[1]) % 12:
            func = "3"
            base_int = ints[1]
            target_int = ints[2]
        elif pc == (root_pc + ints[2]) % 12:
            func = "5"
            base_int = ints[2]
            target_int = 11 if is_sixth else ints[3]
        elif pc == (root_pc + ints[3]) % 12:
            base_int = ints[3]
            if is_sixth or is_dim7:
                func = "6"
                target_int = ints[0]
            else:
                func = "7"
                if suf in ("7(b9)", "+7(b9)", "7(b5)b9", "7sus4(b9)"):
                    target_int = ints[4]
                else:
                    target_int = 2
        else:
            base_int = pc
            target_int = pc

        # --------------------------------------------------------------
        # Compute the required interval (15 or 16 semitones) based on
        # \`\`base_int\`\` and \`\`target_int\`\`.  \`\`target_int\`\` is expected to be
        # higher than \`\`base_int\`\` within the chord definition.  The added
        # note is placed exactly \`\`diff\`\` semitones above \`\`base\`\`.
        # --------------------------------------------------------------
        diff = (target_int - base_int) + (24 if func in ("6", "7") else 12)
        # If the added note is the flat nine, force a minor tenth (15 semitones)
        # above the principal voice even if it exceeds the usual range.
        if func == "7" and target_int == 13:
            diff = (target_int - base_int) + 12
        agregada = base + diff

        if debug:
            logger.debug(
                "Corchea %s: paso %s %s %s (%s) -> %s",
                corchea,
                paso,
                asignaciones[idx][0],
                pretty_midi.note_number_to_name(base),
                func,
                pretty_midi.note_number_to_name(agregada),
            )

        for pitch in (base, agregada):
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

    return resultado


def _arm_treceavas_intervalos(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    *,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Generate inverted tenths resulting in thirteenths below.

    This uses the same functional logic as :func:\`_arm_decimas_intervalos\` but
    the pair of voices is inverted: the principal note is raised an octave and
    the added voice is placed a thirteenth (20 or 21 semitones) below it.
    """

    mapa: Dict[int, int] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i

    info: List[Dict] = []
    for data in asignaciones:
        nombre = data[0]
        root_pc, suf = parsear_nombre_acorde(nombre)
        ints = INTERVALOS_TRADICIONALES[suf]
        is_sixth = suf.endswith("6") and "7" not in suf
        is_dim7 = suf == "º7"
        info.append(
            {
                "root_pc": root_pc,
                "intervals": ints,
                "is_sixth": is_sixth,
                "is_dim7": is_dim7,
                "suf": suf,
            }
        )

    contadores: Dict[int, int] = {}
    resultado: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx = mapa[corchea]
        paso = contadores.get(idx, 0)
        contadores[idx] = paso + 1

        datos = info[idx]
        voicing = sorted(voicings[idx])
        base = voicing[paso % 4]
        root_pc = datos["root_pc"]
        ints = datos["intervals"]
        is_sixth = datos["is_sixth"]
        is_dim7 = datos["is_dim7"]

        pc = base % 12
        func = None
        base_int = None
        if pc == (root_pc + ints[0]) % 12:
            func = "F"
            base_int = ints[0]
            target_int = ints[1]
        elif pc == (root_pc + ints[1]) % 12:
            func = "3"
            base_int = ints[1]
            target_int = ints[2]
        elif pc == (root_pc + ints[2]) % 12:
            func = "5"
            base_int = ints[2]
            target_int = 11 if is_sixth else ints[3]
        elif pc == (root_pc + ints[3]) % 12:
            base_int = ints[3]
            if is_sixth or is_dim7:
                func = "6"
                target_int = ints[0]
            else:
                func = "7"
                if suf in ("7(b9)", "+7(b9)", "7(b5)b9", "7sus4(b9)"):
                    target_int = ints[4]
                else:
                    target_int = 2
        else:
            base_int = pc
            target_int = pc

        diff = (target_int - base_int) + (24 if func in ("6", "7") else 12)
        # Si la nota agregada es la novena menor, se fuerza una «décima menor»
        # (15 semitonos) por encima de la voz principal aunque se supere el
        # registro habitual.
        if func == "7" and target_int == 13:
            diff = (target_int - base_int) + 12
        agregada = base + diff

        principal = base + 12
        inferior = agregada - 24

        if debug:
            logger.debug(
                "Corchea %s: paso %s -> %s / %s",
                corchea,
                paso,
                pretty_midi.note_number_to_name(principal),
                pretty_midi.note_number_to_name(inferior),
            )

        for pitch in (principal, inferior):
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

    return resultado


def _arm_noop(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Placeholder for future harmonization types."""

    return notas


# Armonizaciones simples que no dependen del contexto del voicing
_ARMONIZADORES = {
    "octavas": _arm_octavas,
    "doble octava": _arm_doble_octava,
}


def _offset_octavacion(label: str) -> int:
    """Return the octave shift in semitones indicated by \`\`label\`\`."""

    etiqueta = label.lower().strip()
    if etiqueta == "octava arriba":
        return 12
    if etiqueta == "octava abajo":
        return -12
    return 0


def generar_notas_mixtas(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int], str]],
    grid_seg: float,
    *,
    octavaciones: Optional[List[str]] = None,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Generate notes applying per-chord harmonisation.

    \`\`asignaciones\`\` debe contener tuplas \`\`(acorde, indices, armonizacion)\`\`.
    """

    mapa: Dict[int, int] = {}
    armonias: Dict[int, str] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        arm = data[2]
        for ix in idxs:
            mapa[ix] = i
        armonias[i] = (arm or "").lower()

    info: List[Dict] = []
    for data in asignaciones:
        nombre = data[0]
        root_pc, suf = parsear_nombre_acorde(nombre)
        ints = INTERVALOS_TRADICIONALES[suf]
        is_sixth = suf.endswith("6") and "7" not in suf
        is_dim7 = suf == "º7"
        info.append(
            {
                "root_pc": root_pc,
                "intervals": ints,
                "is_sixth": is_sixth,
                "is_dim7": is_dim7,
                "suf": suf,
            }
        )

    contadores: Dict[int, int] = {}
    offset_por_idx: Dict[int, int] = {}

    if octavaciones:
        for idx, etiqueta in enumerate(octavaciones):
            offset_por_idx[idx] = _offset_octavacion(etiqueta or "")
    resultado: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx = mapa[corchea]
        arm = armonias.get(idx, "")
        paso = contadores.get(idx, 0)
        contadores[idx] = paso + 1
        voicing = sorted(voicings[idx])

        if arm in ("décimas", "treceavas"):
            datos = info[idx]
            base = voicing[paso % 4]
            root_pc = datos["root_pc"]
            ints = datos["intervals"]
            is_sixth = datos["is_sixth"]
            is_dim7 = datos["is_dim7"]
            suf = datos["suf"]

            pc = base % 12
            if pc == (root_pc + ints[0]) % 12:
                base_int = ints[0]
                target_int = ints[1]
                func = "F"
            elif pc == (root_pc + ints[1]) % 12:
                base_int = ints[1]
                target_int = ints[2]
                func = "3"
            elif pc == (root_pc + ints[2]) % 12:
                base_int = ints[2]
                target_int = 11 if is_sixth else ints[3]
                func = "5"
            elif pc == (root_pc + ints[3]) % 12:
                base_int = ints[3]
                if is_sixth or is_dim7:
                    target_int = ints[0]
                    func = "6"
                else:
                    if suf in ("7(b9)", "+7(b9)", "7(b5)b9", "7sus4(b9)"):
                        target_int = ints[4]
                    else:
                        target_int = 2
                    func = "7"
            else:
                base_int = pc
                target_int = pc
                func = "?"

            diff = (target_int - base_int) + (24 if func in ("6", "7") else 12)
            # For flat nine the interval is forced to a minor tenth (15 semitones)
            # above the principal voice even if it breaks range limits.
            if func == "7" and target_int == 13:
                diff = (target_int - base_int) + 12
            agregada = base + diff

            if arm == "décimas":
                notas = [base, agregada]
            else:  # treceavas
                notas = [base + 12, agregada - 24]
        else:
            # Procesamiento estandar del voicing base
            orden = NOTAS_BASE.index(pos["pitch"])
            base_pitch = voicing[orden]

            if arm == "octavas":
                notas = [base_pitch, base_pitch + 12]
            elif arm == "doble octava":
                notas = []
                if base_pitch > 0:
                    notas.extend([base_pitch - 12, base_pitch + 12])
            else:
                notas = [base_pitch]

        offset = offset_por_idx.get(idx, 0)

        if debug and paso == 0:
            logger.debug(
                "Corchea %s: paso %s -> %s", corchea, paso, [p + offset for p in notas]
            )

        for pitch in notas:
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch + offset,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

    return resultado


def aplicar_armonizacion(
    notas: List[pretty_midi.Note], opcion: str
) -> List[pretty_midi.Note]:
    """Apply the selected harmonization option using \`\`_ARMONIZADORES\`\`."""

    funcion = _ARMONIZADORES.get(opcion.lower())
    if funcion is None:
        return notas
    return funcion(notas)


def _grid_and_bpm(pm: pretty_midi.PrettyMIDI) -> Tuple[int, float, float]:
    """Return the reference length, eighth duration and BPM.

    The project assumes all reference templates span exactly 32 bars
    (\`\`256\`\` eighth-notes).  Tempo data in the files is ignored and a
    constant tempo of \`\`120\`\` BPM is used for every template so the
    resulting grid is always identical.
    """

    bpm = 120.0
    grid = 60.0 / bpm / 2  # seconds per eighth note
    cor = 256
    return cor, grid, bpm


def normalize_tempo(pm: pretty_midi.PrettyMIDI, target_bpm: float = NORMALIZED_BPM) -> pretty_midi.PrettyMIDI:
    """Return \`\`pm\`\` unchanged.

    Tempo normalization has been disabled because all templates already lack
    tempo messages.  The caller may still invoke this function for
    compatibility, but no processing is performed.
    """

    return pm


def _recortar_notas_a_limite(
    notas: List[pretty_midi.Note], limite: float
) -> List[pretty_midi.Note]:
    """Recorta las notas para que no se extiendan más allá de \`\`limite\`\`.

    Cualquier nota que termine después del instante indicado se acorta para
    que su atributo \`\`end\`\` coincida exactamente con \`\`limite\`\`.  Las notas
    cuyo \`\`start\`\` es posterior al límite se descartan.
    """

    recortadas: List[pretty_midi.Note] = []
    for n in notas:
        if n.start >= limite:
            continue
        if n.end > limite:
            n.end = limite
        recortadas.append(n)
    return recortadas


def _cortar_notas_superpuestas(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Shorten notes to avoid overlaps at the same pitch.

    If two consecutive notes share the same \`\`pitch\`\` and the first note
    extends beyond the start of the second, the first note is truncated so
    that it ends exactly when the following one begins.  This prevents MIDI
    artefacts caused by overlapping identical pitches.
    """

    agrupadas: Dict[int, List[pretty_midi.Note]] = {}
    for n in sorted(notas, key=lambda x: (x.pitch, x.start)):
        lista = agrupadas.setdefault(n.pitch, [])
        if lista and lista[-1].end > n.start:
            lista[-1].end = n.start
        lista.append(n)

    resultado = [n for lst in agrupadas.values() for n in lst]
    resultado.sort(key=lambda x: (x.start, x.pitch))
    return resultado


def exportar_montuno(
    midi_referencia_path: Path,
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int], str]],
    num_compases: int,
    output_path: Path,
    armonizacion: Optional[str] = None,
    *,
    inicio_cor: int = 0,
    debug: bool = False,
    aleatorio: bool = False,
    octavaciones: Optional[List[str]] = None,
) -> None:
    """Generate a new MIDI file with the given voicings.

    The resulting notes are trimmed so the output stops after the last
    eighth-note of the progression. \`\`inicio_cor\`\` is the global eighth-note
    index where this segment begins and is used to align the reference
    template so all segments stay perfectly in sync. \`\`armonizacion\`\`
    specifies how notes should be duplicated (for example, in octaves).
    """
    notes, pm = leer_midi_referencia(midi_referencia_path)
    posiciones_base = obtener_posiciones_referencia(notes)
    total_cor_ref, grid, bpm = _grid_and_bpm(pm)

    if debug:
        logger.debug("Asignacion de acordes a corcheas:")
        for acorde, idxs, arm, *_ in asignaciones:
            logger.debug("  %s (%s): %s", acorde, arm, idxs)

    if asignaciones:
        total_dest_cor = max(i for _, idxs, *_ in asignaciones for i in idxs) + 1
    else:
        total_dest_cor = num_compases * 8
    limite_cor = total_dest_cor
    # --------------------------------------------------------------
    # The reference must align with the absolute eighth-note position of
    # the progression so changes of mode or template never break the
    # continuity. \`\`inicio_cor\`\` indicates the global index where this
    # segment starts; use it modulo the reference length to pick the
    # correct starting point.
    # --------------------------------------------------------------
    inicio_ref = inicio_cor % total_cor_ref
    if aleatorio:
        posiciones = construir_posiciones_por_ventanas(
            posiciones_base,
            limite_cor,
            total_cor_ref,
            grid,
            inicio_cor=inicio_ref,
            compases_ventana=2,
            aleatorio=True,
        )
    else:
        posiciones = construir_posiciones_secuenciales(
            posiciones_base,
            limite_cor,
            total_cor_ref,
            grid,
            inicio_cor=inicio_ref,
        )

    limite = limite_cor * grid

    nuevas_notas = generar_notas_mixtas(
        posiciones,
        voicings,
        asignaciones,
        grid,
        octavaciones=octavaciones,
        debug=debug,
    )

    # Avoid overlapping notes at the same pitch which can cause MIDI
    # artefacts by trimming preceding notes when necessary.
    nuevas_notas = _cortar_notas_superpuestas(nuevas_notas)

    # ------------------------------------------------------------------
    # Ajuste final de duracion: todas las notas se recortan para que
    # terminen, como maximo, en la ultima corchea programada.
    # ------------------------------------------------------------------
    nuevas_notas = _recortar_notas_a_limite(nuevas_notas, limite)

    if limite > 0:
        has_start = any(n.start <= 0 < n.end and n.pitch > 0 for n in nuevas_notas)
        has_end = any(
            n.pitch > 0
            and n.start < limite
            and n.end > limite - grid
            for n in nuevas_notas
        )
        if not has_start:
            nuevas_notas.append(
                pretty_midi.Note(
                    velocity=1,
                    pitch=21,
                    start=0.0,
                    end=min(grid, limite),
                )
            )
        if not has_end:
            nuevas_notas.append(
                pretty_midi.Note(
                    velocity=1,
                    pitch=21,
                    start=max(0.0, limite - grid),
                    end=limite,
                )
            )

    pm_out = pretty_midi.PrettyMIDI()
    inst_out = pretty_midi.Instrument(
        program=pm.instruments[0].program,
        is_drum=pm.instruments[0].is_drum,
        name=pm.instruments[0].name,
    )
    inst_out.notes = nuevas_notas
    pm_out.instruments.append(inst_out)
    pm_out.write(str(output_path))


# ==========================================================================
# Traditional rhythmic grouping
# ==========================================================================

# ---------------------------------------------------------------------------
# Rhythmic pattern configuration
# ---------------------------------------------------------------------------
# \`\`PRIMER_BLOQUE\`\` y \`\`PATRON_REPETIDO\`\` definen el esquema de agrupación de
# corcheas utilizado por el modo tradicional.  El primer bloque se utiliza tal
# cual una única vez y a partir de entonces se repite \`\`PATRON_REPETIDO\`\` de
# forma indefinida.  Para cambiar el patrón basta con modificar estas dos
# listas.
PRIMER_BLOQUE: List[int] = [3, 4, 4, 3]
PATRON_REPETIDO: List[int] = [5, 4, 4, 3]

# \`\`PATRON_GRUPOS\`\` se mantiene solo como referencia para visualizar los
# primeros valores calculados con la configuración actual.
PATRON_GRUPOS: List[int] = PRIMER_BLOQUE + PATRON_REPETIDO * 3


def _siguiente_grupo(indice: int) -> int:
    """Devuelve la longitud del grupo de corcheas según \`\`indice\`\`.

    Los cuatro primeros valores provienen de \`\`PRIMER_BLOQUE\`\` y, a partir de
    ahí, se repite \`\`PATRON_REPETIDO\`\` tantas veces como sea necesario.
    """
    if indice < len(PRIMER_BLOQUE):
        return PRIMER_BLOQUE[indice]
    indice -= len(PRIMER_BLOQUE)
    return PATRON_REPETIDO[indice % len(PATRON_REPETIDO)]


def _indice_para_corchea(cor: int) -> int:
    """Return the pattern index corresponding to \`\`cor\`\` eighth-notes."""

    idx = 0
    pos = 0
    while pos < cor:
        pos += _siguiente_grupo(idx)
        idx += 1
    return idx


def procesar_progresion_en_grupos(
    texto: str,
    armonizacion_default: Optional[str] = None,
    *,
    inicio_cor: int = 0,
) -> Tuple[List[Tuple[str, List[int], str]], int]:
    """Asignar corcheas por compases según las barras \`\`|\`\`.

    Un segmento con un solo acorde ocupa dos grupos consecutivos de corcheas.
    Si contiene dos acordes cada uno recibe un grupo. Cualquier segmento con
    más de dos acordes genera un \`\`ValueError\`\`.
    """

    import re

    segmentos_raw = [s.strip() for s in texto.split("|") if s.strip()]

    segmentos: List[str] = []
    for seg in segmentos_raw:
        if seg == "%":
            if not segmentos:
                raise ValueError("% no puede ir en el primer compás")
            segmentos.append(segmentos[-1])
        else:
            segmentos.append(seg)

    resultado: List[Tuple[str, List[int], str]] = []
    indice_patron = _indice_para_corchea(inicio_cor)
    posicion = 0

    arm_actual = (armonizacion_default or "").capitalize()

    def procesar_token(token: str) -> Tuple[Optional[str], Optional[str]]:
        nonlocal arm_actual

        m = re.match(r"^\\[[A-Z]+\\](.*)$", token)
        if m:
            token = m.group(1)
            if not token:
                return None, None

        m = re.match(r"^\\((8|10|13|15)\\)(.*)$", token)
        if m:
            codigo, token = m.groups()
            arm_map = {
                "8": "Octavas",
                "15": "Doble octava",
                "10": "Décimas",
                "13": "Treceavas",
            }
            arm_actual = arm_map[codigo]
            if not token:
                return None, None

        if not token:
            return None, None

        return token, arm_actual

    for seg in segmentos:
        tokens = [t for t in seg.split() if t]
        acordes: List[tuple[str, str]] = []
        for tok in tokens:
            nombre, arm = procesar_token(tok)
            if nombre is None:
                continue
            acordes.append((nombre, arm or ""))
        if len(acordes) == 1:
            g1 = _siguiente_grupo(indice_patron)
            g2 = _siguiente_grupo(indice_patron + 1)
            dur = g1 + g2
            indices = list(range(posicion, posicion + dur))
            nombre, arm = acordes[0]
            resultado.append((nombre, indices, arm))
            posicion += dur
            indice_patron += 2
        elif len(acordes) == 2:
            g1 = _siguiente_grupo(indice_patron)
            indices1 = list(range(posicion, posicion + g1))
            posicion += g1
            indice_patron += 1

            g2 = _siguiente_grupo(indice_patron)
            indices2 = list(range(posicion, posicion + g2))
            posicion += g2
            indice_patron += 1

            (n1, a1), (n2, a2) = acordes
            resultado.append((n1, indices1, a1))
            resultado.append((n2, indices2, a2))
        elif len(acordes) == 0:
            continue
        else:
            raise ValueError(f"Cada segmento debe contener uno o dos acordes: {seg}")

    for acorde, idxs, arm in resultado:
        logger.debug("%s (%s): %s", acorde, arm, idxs)

    num_compases = len(segmentos)
    return resultado, num_compases
`,k=`# -*- coding: utf-8 -*-
"""Helpers for reading, manipulating and exporting MIDI files."""

from pathlib import Path
from typing import Dict, List, Optional, Tuple
import math
import pretty_midi
import random
import logging
from .voicings_tradicional import parsear_nombre_acorde, INTERVALOS_TRADICIONALES
from .midi_common import (
    NOTAS_BASE,
    leer_midi_referencia,
    obtener_posiciones_referencia,
    construir_posiciones_secuenciales,
    construir_posiciones_por_ventanas,
)

logger = logging.getLogger(__name__)

# ==========================================================================
# MIDI export utilities
# ==========================================================================


def aplicar_voicings_a_referencia(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    *,
    debug: bool = False,
) -> Tuple[List[pretty_midi.Note], int]:
    """Reemplaza las notas de referencia por los voicings generados.

    Devuelve la lista de nuevas notas y el último índice de corchea utilizado.
    """

    # Mapeo corchea → índice de voicing
    mapa: Dict[int, int] = {}
    max_idx = -1
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i
            if ix > max_idx:
                max_idx = ix

    nuevas_notas: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue  # silencio
        voicing = sorted(voicings[mapa[corchea]])
        orden = NOTAS_BASE.index(pos["pitch"])  # posición dentro del voicing
        # Preserve the velocity of the reference note so dynamics match
        nueva_nota = pretty_midi.Note(
            velocity=pos["velocity"],
            pitch=voicing[orden],
            start=pos["start"],
            end=pos["end"],
        )
        if debug:
            logger.debug("Corchea %s: nota base %s -> %s", corchea, pos['pitch'], nueva_nota.pitch)
        nuevas_notas.append(nueva_nota)

    return nuevas_notas, max_idx


def _arm_octavas(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Duplicate each note one octave above."""

    resultado: List[pretty_midi.Note] = []
    for n in notas:
        resultado.append(n)
        if n.pitch > 0:
            resultado.append(
                pretty_midi.Note(
                    velocity=n.velocity,
                    pitch=n.pitch + 12,
                    start=n.start,
                    end=n.end,
                )
            )
    return resultado


def _arm_doble_octava(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Create notes an octave below and above, without keeping the original."""

    resultado: List[pretty_midi.Note] = []
    for n in notas:
        if n.pitch > 0:
            # Copy the velocity from the original note
            resultado.append(
                pretty_midi.Note(
                    velocity=n.velocity,
                    pitch=n.pitch - 12,
                    start=n.start,
                    end=n.end,
                )
            )
            resultado.append(
                pretty_midi.Note(
                    velocity=n.velocity,
                    pitch=n.pitch + 12,
                    start=n.start,
                    end=n.end,
                )
            )
    return resultado


def _arm_por_parejas(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    salto: int,
    *,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Generate notes in parallel motion (décimas or sixths).

    Each chord \`\`voicing\`\` is walked sequentially using the eighth-note
    positions assigned to it.  \`\`salto\`\` determines the pairing pattern:
    \`\`1\`\` produces décimas (third + octave) and \`\`2\`\` produces sixths.
    The rhythmic information (start, end and velocity) is taken from the
    reference \`\`posiciones\`\` list.
    """

    # Map each eighth index to the corresponding voicing/chord
    mapa: Dict[int, int] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i

    # Counter so each chord advances through its voicing in parallel
    contadores: Dict[int, int] = {}

    resultado: List[pretty_midi.Note] = []
    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx_voicing = mapa[corchea]
        paso = contadores.get(idx_voicing, 0)
        contadores[idx_voicing] = paso + 1

        voicing = sorted(voicings[idx_voicing])

        if salto == 1:  # décimas
            principal = voicing[paso % 4]
            agregada = voicing[(paso + 1) % 4] + 12
        else:  # antiguas sextas
            principal = voicing[(paso + 1) % 4]
            agregada = voicing[paso % 4] + 12

        # Ensure the upper note never sits in the same octave as the
        # principal voice.  This avoids "collapsed" intervals when the
        # voicing spans less than an octave.
        while agregada <= principal:
            agregada += 12

        for pitch in (principal, agregada):
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

        if debug:
            logger.debug("Corchea %s: paso %s -> %s / %s", corchea, paso, principal, agregada)

    return resultado


def _arm_decimas_intervalos(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    *,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Harmonize in parallel tenths following fixed functional pairs.

    Before processing the MIDI positions each chord is analysed so every
    pitch can be labelled as fundamental, third, fifth, sixth or seventh.
    The added note is then obtained with the exact interval mandated by the
    specification:

    * F → 3 (+12)
    * 3 → 5 (+12)
    * 5 → 7 (+12) or M7 (+12) on sixth chords
    * 6 or diminished 7 → F (+24)
    * 7 → 9 (+24)

    Velocity and timing from the reference are preserved verbatim.
    """

    # ------------------------------------------------------------------
    # Build a map from eighth index to voicing index and gather information
    # about each chord so that every pitch can be classified by function.
    # \`\`info\`\` stores the root pitch class, the four intervals of the chord
    # and flags indicating whether it is a sixth chord or a diminished
    # seventh.
    # ------------------------------------------------------------------
    mapa: Dict[int, int] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i

    info: List[Dict] = []
    for data in asignaciones:
        nombre = data[0]
        root_pc, suf = parsear_nombre_acorde(nombre)
        ints = INTERVALOS_TRADICIONALES[suf]
        is_sixth = suf.endswith("6") and "7" not in suf
        is_dim7 = suf == "º7"
        info.append(
            {
                "root_pc": root_pc,
                "intervals": ints,
                "is_sixth": is_sixth,
                "is_dim7": is_dim7,
                "suf": suf,
            }
        )

    contadores: Dict[int, int] = {}
    offsets: Dict[int, int] = {}
    bajo_anterior: Optional[int] = None
    arm_anterior: Optional[str] = None
    resultado: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx = mapa[corchea]
        paso = contadores.get(idx, 0)
        contadores[idx] = paso + 1

        datos = info[idx]
        voicing = sorted(voicings[idx])
        base = voicing[paso % 4]
        root_pc = datos["root_pc"]
        ints = datos["intervals"]
        is_sixth = datos["is_sixth"]
        is_dim7 = datos["is_dim7"]
        suf = datos["suf"]

        # --------------------------------------------------------------
        # Identify the function of \`\`base\`\` comparing its pitch class
        # against the intervals of the current chord.
        # --------------------------------------------------------------
        pc = base % 12
        func = None
        base_int = None
        if pc == (root_pc + ints[0]) % 12:
            func = "F"
            base_int = ints[0]
            target_int = ints[1]
        elif pc == (root_pc + ints[1]) % 12:
            func = "3"
            base_int = ints[1]
            target_int = ints[2]
        elif pc == (root_pc + ints[2]) % 12:
            func = "5"
            base_int = ints[2]
            target_int = 11 if is_sixth else ints[3]
        elif pc == (root_pc + ints[3]) % 12:
            base_int = ints[3]
            if is_sixth or is_dim7:
                func = "6"
                target_int = ints[0]
            else:
                func = "7"
                # For chords with b9 the minor seventh always pairs
                # with the flat nine instead of the major nine.
                if suf == "m7(b5)":
                    target_int = 13
                elif suf in ("7(b9)", "+7(b9)", "7(b5)b9", "7sus4(b9)"):
                    target_int = ints[4]
                elif suf in {
                    "7(9)",
                    "7(13)",
                    "9",
                    "11",
                    "13",
                    "∆9",
                    "∆11",
                    "∆13",
                    "m9",
                    "m11",
                    "m13",
                    "m7(9)",
                    "m7(11)",
                    "m7(13)",
                }:
                    target_int = ints[4]
                else:
                    target_int = 2
        else:
            base_int = pc
            target_int = pc

        # --------------------------------------------------------------
        # Compute the required interval (15 or 16 semitones) based on
        # \`\`base_int\`\` and \`\`target_int\`\`.  \`\`target_int\`\` is expected to be
        # higher than \`\`base_int\`\` within the chord definition.  The added
        # note is placed exactly \`\`diff\`\` semitones above \`\`base\`\`.
        # --------------------------------------------------------------
        diff = (target_int - base_int) + (24 if func in ("6", "7") else 12)
        # If the added note is a flat nine, force a minor tenth (15 semitones)
        # above the principal voice even if this exceeds the usual range.
        if func == "7" and target_int == 13:
            diff = (target_int - base_int) + 12
        agregada = base + diff

        if debug:
            logger.debug(
                "Corchea %s: paso %s %s %s (%s) -> %s",
                corchea,
                paso,
                asignaciones[idx][0],
                pretty_midi.note_number_to_name(base),
                func,
                pretty_midi.note_number_to_name(agregada),
            )

        for pitch in (base, agregada):
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

    return resultado


def _arm_treceavas_intervalos(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int]]],
    grid_seg: float,
    *,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Generate inverted tenths resulting in thirteenths below.

    This uses the same functional logic as :func:\`_arm_decimas_intervalos\` but
    the pair of voices is inverted: the principal note is raised an octave and
    the added voice is placed a thirteenth (20 or 21 semitones) below it.
    """

    mapa: Dict[int, int] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        for ix in idxs:
            mapa[ix] = i

    info: List[Dict] = []
    for data in asignaciones:
        nombre = data[0]
        root_pc, suf = parsear_nombre_acorde(nombre)
        ints = INTERVALOS_TRADICIONALES[suf]
        is_sixth = suf.endswith("6") and "7" not in suf
        is_dim7 = suf == "º7"
        info.append(
            {
                "root_pc": root_pc,
                "intervals": ints,
                "is_sixth": is_sixth,
                "is_dim7": is_dim7,
                "suf": suf,
            }
        )

    contadores: Dict[int, int] = {}
    offsets: Dict[int, int] = {}
    bajo_anterior: Optional[int] = None
    arm_anterior: Optional[str] = None
    resultado: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx = mapa[corchea]
        paso = contadores.get(idx, 0)
        contadores[idx] = paso + 1

        datos = info[idx]
        voicing = sorted(voicings[idx])
        base = voicing[paso % 4]
        root_pc = datos["root_pc"]
        ints = datos["intervals"]
        is_sixth = datos["is_sixth"]
        is_dim7 = datos["is_dim7"]

        pc = base % 12
        func = None
        base_int = None
        if pc == (root_pc + ints[0]) % 12:
            func = "F"
            base_int = ints[0]
            target_int = ints[1]
        elif pc == (root_pc + ints[1]) % 12:
            func = "3"
            base_int = ints[1]
            target_int = ints[2]
        elif pc == (root_pc + ints[2]) % 12:
            func = "5"
            base_int = ints[2]
            target_int = 11 if is_sixth else ints[3]
        elif pc == (root_pc + ints[3]) % 12:
            base_int = ints[3]
            if is_sixth or is_dim7:
                func = "6"
                target_int = ints[0]
            else:
                func = "7"
                # En acordes con b9 la séptima menor se empareja
                # siempre con la novena bemol.
                if suf == "m7(b5)":
                    target_int = 13
                elif suf in ("7(b9)", "+7(b9)", "7(b5)b9", "7sus4(b9)"):
                    target_int = ints[4]
                elif suf in {
                    "7(9)",
                    "7(13)",
                    "9",
                    "11",
                    "13",
                    "∆9",
                    "∆11",
                    "∆13",
                    "m9",
                    "m11",
                    "m13",
                    "m7(9)",
                    "m7(11)",
                    "m7(13)",
                }:
                    target_int = ints[4]
                else:
                    target_int = 2
        else:
            base_int = pc
            target_int = pc

        diff = (target_int - base_int) + (24 if func in ("6", "7") else 12)
        # Si la nota agregada es la novena menor, se fuerza una décima menor
        # (15 semitonos) por encima de la voz principal aunque se supere el
        # registro habitual.
        if func == "7" and target_int == 13:
            diff = (target_int - base_int) + 12
        agregada = base + diff

        principal = base + 12
        inferior = agregada - 24

        if debug:
            logger.debug(
                "Corchea %s: paso %s -> %s / %s",
                corchea,
                paso,
                pretty_midi.note_number_to_name(principal),
                pretty_midi.note_number_to_name(inferior),
            )

        for pitch in (principal, inferior):
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

    return resultado


def _arm_noop(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Placeholder for future harmonization types."""

    return notas


# Armonizaciones simples que no dependen del contexto del voicing
_ARMONIZADORES = {
    "octavas": _arm_octavas,
    "doble octava": _arm_doble_octava,
}


def _offset_octavacion(label: str) -> int:
    """Return the octave shift in semitones indicated by \`\`label\`\`."""

    etiqueta = label.lower().strip()
    if etiqueta == "octava arriba":
        return 12
    if etiqueta == "octava abajo":
        return -12
    return 0


def generar_notas_mixtas(
    posiciones: List[dict],
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int], str]],
    grid_seg: float,
    *,
    octavaciones: Optional[List[str]] = None,
    debug: bool = False,
) -> List[pretty_midi.Note]:
    """Generate notes applying per-chord harmonisation.

    \`\`asignaciones\`\` debe contener tuplas \`\`(acorde, indices, armonizacion)\`\`.
    """

    mapa: Dict[int, int] = {}
    armonias: Dict[int, str] = {}
    for i, data in enumerate(asignaciones):
        idxs = data[1]
        arm = data[2]
        for ix in idxs:
            mapa[ix] = i
        armonias[i] = (arm or "").lower()

    info: List[Dict] = []
    for data in asignaciones:
        nombre = data[0]
        root_pc, suf = parsear_nombre_acorde(nombre)
        ints = INTERVALOS_TRADICIONALES[suf]
        is_sixth = suf.endswith("6") and "7" not in suf
        is_dim7 = suf == "º7"
        info.append(
            {
                "root_pc": root_pc,
                "intervals": ints,
                "is_sixth": is_sixth,
                "is_dim7": is_dim7,
                "suf": suf,
            }
        )

    contadores: Dict[int, int] = {}
    offset_por_idx: Dict[int, int] = {}

    if octavaciones:
        for idx, etiqueta in enumerate(octavaciones):
            offset_por_idx[idx] = _offset_octavacion(etiqueta or "")
    resultado: List[pretty_midi.Note] = []

    for pos in posiciones:
        corchea = int(round(pos["start"] / grid_seg))
        if corchea not in mapa:
            if debug:
                logger.debug("Corchea %s: silencio", corchea)
            continue

        idx = mapa[corchea]
        arm = armonias.get(idx, "")
        paso = contadores.get(idx, 0)
        contadores[idx] = paso + 1
        voicing = sorted(voicings[idx])

        if arm in ("décimas", "treceavas"):
            datos = info[idx]
            base = voicing[paso % 4]
            root_pc = datos["root_pc"]
            ints = datos["intervals"]
            is_sixth = datos["is_sixth"]
            is_dim7 = datos["is_dim7"]
            suf = datos["suf"]

            pc = base % 12
            if pc == (root_pc + ints[0]) % 12:
                base_int = ints[0]
                target_int = ints[1]
                func = "F"
            elif pc == (root_pc + ints[1]) % 12:
                base_int = ints[1]
                target_int = ints[2]
                func = "3"
            elif pc == (root_pc + ints[2]) % 12:
                base_int = ints[2]
                target_int = 11 if is_sixth else ints[3]
                func = "5"
            elif pc == (root_pc + ints[3]) % 12:
                base_int = ints[3]
                if is_sixth or is_dim7:
                    target_int = ints[0]
                    func = "6"
                else:
                    # En acordes con b9 la séptima menor se asocia a la b9
                    if suf == "m7(b5)":
                        target_int = 13
                    elif suf in ("7(b9)", "+7(b9)", "7(b5)b9", "7sus4(b9)"):
                        target_int = ints[4]
                    elif suf in {
                        "7(9)",
                        "7(13)",
                        "9",
                        "11",
                        "13",
                        "∆9",
                        "∆11",
                        "∆13",
                        "m9",
                        "m11",
                        "m13",
                        "m7(9)",
                        "m7(11)",
                        "m7(13)",
                    }:
                        target_int = ints[4]
                    else:
                        target_int = 2
                    func = "7"
            else:
                base_int = pc
                target_int = pc
                func = "?"

            diff = (target_int - base_int) + (24 if func in ("6", "7") else 12)
            # For flat nine the interval is forced to a minor tenth (15 semitones)
            # above the principal voice even if it breaks range limits.
            if func == "7" and target_int == 13:
                diff = (target_int - base_int) + 12
            agregada = base + diff

            if arm == "décimas":
                notas = [base, agregada]
            else:  # treceavas
                notas = [base + 12, agregada - 24]
        else:
            # Procesamiento estandar del voicing base
            orden = NOTAS_BASE.index(pos["pitch"])
            base_pitch = voicing[orden]

            if arm == "octavas":
                notas = [base_pitch, base_pitch + 12]
            elif arm == "doble octava":
                notas = []
                if base_pitch > 0:
                    notas.extend([base_pitch - 12, base_pitch + 12])
            else:
                notas = [base_pitch]

        offset = offset_por_idx.get(idx, 0)

        if debug and paso == 0:
            logger.debug(
                "Corchea %s: paso %s -> %s", corchea, paso, [p + offset for p in notas]
            )

        for pitch in notas:
            resultado.append(
                pretty_midi.Note(
                    velocity=pos["velocity"],
                    pitch=pitch + offset,
                    start=pos["start"],
                    end=pos["end"],
                )
            )

    return resultado


def aplicar_armonizacion(
    notas: List[pretty_midi.Note], opcion: str
) -> List[pretty_midi.Note]:
    """Apply the selected harmonization option using \`\`_ARMONIZADORES\`\`."""

    funcion = _ARMONIZADORES.get(opcion.lower())
    if funcion is None:
        return notas
    return funcion(notas)


def _grid_and_bpm(pm: pretty_midi.PrettyMIDI) -> Tuple[int, float, float]:
    """Return the reference length, eighth duration and BPM.

    All reference templates span exactly 32 bars (\`\`256\`\` eighth-notes).  Tempo
    information is ignored and \`\`120\`\` BPM is assumed to ensure every template
    aligns to the same grid regardless of its internal timing.
    """

    bpm = 120.0
    grid = 60.0 / bpm / 2
    cor = 256
    return cor, grid, bpm


def _recortar_notas_a_limite(
    notas: List[pretty_midi.Note], limite: float
) -> List[pretty_midi.Note]:
    """Recorta las notas para que no se extiendan más allá de \`\`limite\`\`.

    Cualquier nota que termine después del instante indicado se acorta para
    que su atributo \`\`end\`\` coincida exactamente con \`\`limite\`\`.  Las notas
    cuyo \`\`start\`\` es posterior al límite se descartan.
    """

    recortadas: List[pretty_midi.Note] = []
    for n in notas:
        if n.start >= limite:
            continue
        if n.end > limite:
            n.end = limite
        recortadas.append(n)
    return recortadas


def _cortar_notas_superpuestas(notas: List[pretty_midi.Note]) -> List[pretty_midi.Note]:
    """Shorten notes to avoid overlaps at the same pitch.

    If two consecutive notes share the same \`\`pitch\`\` and the first note
    extends beyond the start of the second, the first note is truncated so
    that it ends exactly when the following one begins.  This prevents MIDI
    artefacts caused by overlapping identical pitches.
    """

    agrupadas: Dict[int, List[pretty_midi.Note]] = {}
    for n in sorted(notas, key=lambda x: (x.pitch, x.start)):
        lista = agrupadas.setdefault(n.pitch, [])
        if lista and lista[-1].end > n.start:
            lista[-1].end = n.start
        lista.append(n)

    resultado = [n for lst in agrupadas.values() for n in lst]
    resultado.sort(key=lambda x: (x.start, x.pitch))
    return resultado


def exportar_montuno(
    midi_referencia_path: Path,
    voicings: List[List[int]],
    asignaciones: List[Tuple[str, List[int], str]],
    num_compases: int,
    output_path: Path,
    armonizacion: Optional[str] = None,
    *,
    inicio_cor: int = 0,
    debug: bool = False,
    return_pm: bool = False,
    aleatorio: bool = False,
    octavaciones: Optional[List[str]] = None,
) -> Optional[pretty_midi.PrettyMIDI]:
    """Generate a new MIDI file with the given voicings.

    The resulting notes are trimmed so the output stops after the last
    eighth-note of the progression. \`\`inicio_cor\`\` is the absolute
    eighth-note index where this segment starts and is used to align the
    reference material accordingly. \`\`armonizacion\`\` specifies how notes
    should be duplicated (for example, in octaves).
    """
    notes, pm = leer_midi_referencia(midi_referencia_path)
    posiciones_base = obtener_posiciones_referencia(notes)
    total_cor_ref, grid, bpm = _grid_and_bpm(pm)

    if debug:
        logger.debug("Asignacion de acordes a corcheas:")
        for acorde, idxs, arm, *_ in asignaciones:
            logger.debug("  %s (%s): %s", acorde, arm, idxs)

    if asignaciones:
        total_dest_cor = max(i for _, idxs, *_ in asignaciones for i in idxs) + 1
    else:
        total_dest_cor = num_compases * 8
    limite_cor = total_dest_cor
    # --------------------------------------------------------------
    # Align the reference with the absolute eighth-note offset of this
    # segment so mode switches never break the continuity.  \`\`inicio_cor\`\`
    # marks the global position where the segment begins; we map it
    # modulo the reference length to determine the starting point.
    # --------------------------------------------------------------
    inicio_ref = inicio_cor % total_cor_ref
    if aleatorio:
        posiciones = construir_posiciones_por_ventanas(
            posiciones_base,
            limite_cor,
            total_cor_ref,
            grid,
            inicio_cor=inicio_ref,
            compases_ventana=2,
            aleatorio=True,
        )
    else:
        posiciones = construir_posiciones_secuenciales(
            posiciones_base,
            limite_cor,
            total_cor_ref,
            grid,
            inicio_cor=inicio_ref,
        )

    limite = limite_cor * grid

    nuevas_notas = generar_notas_mixtas(
        posiciones,
        voicings,
        asignaciones,
        grid,
        octavaciones=octavaciones,
        debug=debug,
    )

    # Avoid overlapping notes at the same pitch which can cause MIDI
    # artefacts by trimming preceding notes when necessary.
    nuevas_notas = _cortar_notas_superpuestas(nuevas_notas)

    # ------------------------------------------------------------------
    # Ajuste final de duracion: todas las notas se recortan para que
    # terminen, como maximo, en la ultima corchea programada.
    # ------------------------------------------------------------------
    nuevas_notas = _recortar_notas_a_limite(nuevas_notas, limite)

    if limite > 0:
        has_start = any(n.start <= 0 < n.end and n.pitch > 0 for n in nuevas_notas)
        has_end = any(
            n.pitch > 0
            and n.start < limite
            and n.end > limite - grid
            for n in nuevas_notas
        )
        if not has_start:
            nuevas_notas.append(
                pretty_midi.Note(
                    velocity=1,
                    pitch=21,
                    start=0.0,
                    end=min(grid, limite),
                )
            )
        if not has_end:
            nuevas_notas.append(
                pretty_midi.Note(
                    velocity=1,
                    pitch=21,
                    start=max(0.0, limite - grid),
                    end=limite,
                )
            )

    pm_out = pretty_midi.PrettyMIDI()
    inst_out = pretty_midi.Instrument(
        program=pm.instruments[0].program,
        is_drum=pm.instruments[0].is_drum,
        name=pm.instruments[0].name,
    )
    inst_out.notes = nuevas_notas
    pm_out.instruments.append(inst_out)
    if return_pm:
        return pm_out

    pm_out.write(str(output_path))


# ==========================================================================
# Traditional rhythmic grouping
# ==========================================================================

# ---------------------------------------------------------------------------
# Rhythmic pattern configuration
# ---------------------------------------------------------------------------
# \`\`PRIMER_BLOQUE\`\` y \`\`PATRON_REPETIDO\`\` definen el esquema de agrupación de
# corcheas utilizado por el modo tradicional.  El primer bloque se utiliza tal
# cual una única vez y a partir de entonces se repite \`\`PATRON_REPETIDO\`\` de
# forma indefinida.  Para cambiar el patrón basta con modificar estas dos
# listas.
PRIMER_BLOQUE: List[int] = [3, 4, 4, 3]
PATRON_REPETIDO: List[int] = [5, 4, 4, 3]

# \`\`PATRON_GRUPOS\`\` se mantiene solo como referencia para visualizar los
# primeros valores calculados con la configuración actual.
PATRON_GRUPOS: List[int] = PRIMER_BLOQUE + PATRON_REPETIDO * 3


def _siguiente_grupo(indice: int) -> int:
    """Devuelve la longitud del grupo de corcheas según \`\`indice\`\`.

    Los cuatro primeros valores provienen de \`\`PRIMER_BLOQUE\`\` y, a partir de
    ahí, se repite \`\`PATRON_REPETIDO\`\` tantas veces como sea necesario.
    """
    if indice < len(PRIMER_BLOQUE):
        return PRIMER_BLOQUE[indice]
    indice -= len(PRIMER_BLOQUE)
    return PATRON_REPETIDO[indice % len(PATRON_REPETIDO)]


def _indice_para_corchea(cor: int) -> int:
    idx = 0
    pos = 0
    while pos < cor:
        pos += _siguiente_grupo(idx)
        idx += 1
    return idx


def procesar_progresion_en_grupos(
    texto: str,
    armonizacion_default: Optional[str] = None,
    *,
    inicio_cor: int = 0,
) -> Tuple[List[Tuple[str, List[int], str]], int]:
    """Asignar corcheas a los acordes por compases.

    Cada segmento delimitado por \`\`|\`\` puede contener uno o dos acordes. Si
    hay un solo acorde se asignan dos grupos consecutivos de corcheas; con dos
    acordes, cada uno recibe un grupo. Más de dos acordes en un mismo segmento
    provoca un \`\`ValueError\`\`.
    """

    import re

    segmentos_raw = [s.strip() for s in texto.split("|") if s.strip()]

    segmentos: List[str] = []
    for seg in segmentos_raw:
        if seg == "%":
            if not segmentos:
                raise ValueError("% no puede ir en el primer compás")
            segmentos.append(segmentos[-1])
        else:
            segmentos.append(seg)

    resultado: List[Tuple[str, List[int], str]] = []
    indice_patron = _indice_para_corchea(inicio_cor)
    posicion = 0

    arm_actual = (armonizacion_default or "").capitalize()

    def procesar_token(token: str) -> Tuple[Optional[str], Optional[str]]:
        nonlocal arm_actual

        m = re.match(r"^\\[[A-Z]+\\](.*)$", token)
        if m:
            token = m.group(1)
            if not token:
                return None, None

        m = re.match(r"^\\((8|10|13|15)\\)(.*)$", token)
        if m:
            codigo, token = m.groups()
            arm_map = {
                "8": "Octavas",
                "15": "Doble octava",
                "10": "Décimas",
                "13": "Treceavas",
            }
            arm_actual = arm_map[codigo]
            if not token:
                return None, None

        if not token:
            return None, None

        return token, arm_actual

    for seg in segmentos:
        tokens = [t for t in seg.split() if t]
        acordes: List[tuple[str, str]] = []
        for tok in tokens:
            nombre, arm = procesar_token(tok)
            if nombre is None:
                continue
            acordes.append((nombre, arm or ""))
        if len(acordes) == 1:
            g1 = _siguiente_grupo(indice_patron)
            g2 = _siguiente_grupo(indice_patron + 1)
            dur = g1 + g2
            indices = list(range(posicion, posicion + dur))
            nombre, arm = acordes[0]
            resultado.append((nombre, indices, arm))
            posicion += dur
            indice_patron += 2
        elif len(acordes) == 2:
            g1 = _siguiente_grupo(indice_patron)
            indices1 = list(range(posicion, posicion + g1))
            posicion += g1
            indice_patron += 1

            g2 = _siguiente_grupo(indice_patron)
            indices2 = list(range(posicion, posicion + g2))
            posicion += g2
            indice_patron += 1

            (n1, a1), (n2, a2) = acordes
            resultado.append((n1, indices1, a1))
            resultado.append((n2, indices2, a2))
        elif len(acordes) == 0:
            continue
        else:
            raise ValueError(f"Cada segmento debe contener uno o dos acordes: {seg}")

    for acorde, idxs, arm in resultado:
        logger.debug("%s (%s): %s", acorde, arm, idxs)

    num_compases = len(segmentos)
    return resultado, num_compases
`,C=`# -*- coding: utf-8 -*-
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
    """Wrap :func:\`midi_utils.exportar_montuno\` adding \`\`return_pm\`\` support."""

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
    "Extendido": montuno_extendido,
    "Salsa": montuno_salsa,
}
`,p=`# -*- coding: utf-8 -*-
# salsa.py
from pathlib import Path
from typing import List, Tuple, Dict, Optional, Set
import pretty_midi

import re

from .voicings import INTERVALOS_TRADICIONALES, parsear_nombre_acorde
from .midi_utils import (
    _grid_and_bpm,
    procesar_progresion_en_grupos,
    _cortar_notas_superpuestas,
    _recortar_notas_a_limite,
    _siguiente_grupo,
)

# ========================

# ========================
# Inversiones disponibles
# ========================
INVERSIONS = ["root", "third", "fifth", "seventh"]

# Notas que funcionan como aproximaciones en las plantillas de salsa.  Si el
# acorde cambia justo al inicio de la figura se ajustan al sonido estructural
# más cercano.
APPROACH_NOTES = {"D", "A", "B", "D#", "F", "G#", "C#"}

# Switch to enable adjusting approach notes to structural tones when a chord
# change occurs at the beginning of the pattern.  Set to \`\`True\`\` to keep the
# current behaviour.  When \`\`False\`\`, approach notes remain unchanged.
CONVERTIR_APROX_A_ESTRUCT = False


def _pitch_classes_en_acorde(cifrado: str) -> Set[int]:
    """Devuelve las clases de altura del acorde indicado."""

    try:
        root, suf = parsear_nombre_acorde(cifrado)
    except ValueError:
        base = re.sub(r"maj", "∆", cifrado, flags=re.IGNORECASE)
        base = re.sub(r"(9|11|13)$", "", base)
        root, suf = parsear_nombre_acorde(base)

    return {(root + interval) % 12 for interval in INTERVALOS_TRADICIONALES[suf]}


def _preferir_aproximacion_vecina(
    pitch: int, prev_classes: Optional[Set[int]], next_classes: Optional[Set[int]]
) -> int:
    """Ajusta una nota de aproximación hacia sonidos compartidos.

    Si la nota de aproximación está a un semitono de un sonido presente en el
    acorde previo o siguiente, se desplaza hacia ese sonido para favorecer la
    continuidad melódica.
    """

    pc = pitch % 12
    candidatos: List[Tuple[int, int, int]] = []  # (desplazamiento, prioridad, pitch)

    def _registrar(opcionales: Optional[Set[int]], prioridad: int) -> None:
        if not opcionales:
            return
        if pc in opcionales:
            candidatos.append((0, prioridad, pitch))
            return
        for delta in (-1, 1):
            candidato_pc = (pc + delta) % 12
            if candidato_pc in opcionales:
                candidatos.append((abs(delta), prioridad, pitch + delta))

    _registrar(prev_classes, 0)
    _registrar(next_classes, 1)

    if not candidatos:
        return pitch

    candidatos.sort()
    return candidatos[0][2]


def _ajustar_a_estructural_mas_cercano(note_name: str, cifrado: str, pitch: int) -> int:
    """Devuelve la fundamental, tercera o quinta más cercana a \`\`pitch\`\`."""

    try:
        root, suf = parsear_nombre_acorde(cifrado)
    except ValueError:
        base = re.sub(r"maj", "∆", cifrado, flags=re.IGNORECASE)
        base = re.sub(r"(9|11|13)$", "", base)
        root, suf = parsear_nombre_acorde(base)
    ints = INTERVALOS_TRADICIONALES[suf]
    octave = int(note_name[-1])

    def midi(interval: int) -> int:
        return root + interval + 12 * (octave + 1)

    opc1 = midi(0)
    opc2 = midi(5 if "sus" in suf else ints[1])
    opc3 = midi(ints[2])
    candidatos = [opc1, opc2, opc3]
    return min(candidatos, key=lambda p: abs(p - pitch))


# ========================
# Función para elegir la mejor inversión para cada acorde
# ========================

# La única restricción de rango: la primera voz grave debe ubicarse entre C3 y C4.
RANGO_BAJO_MIN = 48  # C3
RANGO_BAJO_MAX = 60  # C4


def _offset_octavacion(label: Optional[str]) -> int:
    """Return the octave displacement encoded in \`\`label\`\`."""

    if not label:
        return 0
    etiqueta = label.lower().strip()
    if etiqueta == "octava arriba":
        return 12
    if etiqueta == "octava abajo":
        return -12
    return 0


def _ajustar_rango_flexible(prev_pitch: Optional[int], pitch: int) -> int:
    """Coloca \`\`pitch\`\` lo más cerca posible de \`\`prev_pitch\`\`.

    Solo se limita la nota inicial al rango C3–C4. Las notas siguientes se
    ajustan por octavas para minimizar la distancia con la voz grave previa.
    """

    if prev_pitch is None:
        return _ajustar_primera_voz_grave(pitch)

    mejor = pitch
    mejor_dist = abs(pitch - prev_pitch)
    for offset in range(-5, 6):
        candidato = pitch + 12 * offset
        dist = abs(candidato - prev_pitch)
        if dist < mejor_dist:
            mejor = candidato
            mejor_dist = dist
    return mejor


def _ajustar_primera_voz_grave(pitch: int) -> int:
    """Garantiza que la primera nota grave quede entre C3 y C4."""

    while pitch < RANGO_BAJO_MIN:
        pitch += 12
    while pitch > RANGO_BAJO_MAX:
        pitch -= 12
    return pitch


def get_bass_pitch(cifrado: str, inversion: str) -> int:
    """Devuelve la nota MIDI de la voz grave para el acorde e inversión dada."""
    try:
        root, suf = parsear_nombre_acorde(cifrado)
    except ValueError:
        base = re.sub(r"maj", "∆", cifrado, flags=re.IGNORECASE)
        base = re.sub(r"(9|11|13)$", "", base)
        root, suf = parsear_nombre_acorde(base)
    ints = INTERVALOS_TRADICIONALES[suf]
    if inversion == "root":
        return root + 12 * 3  # C3 por default
    elif inversion == "third":
        return (root + ints[1]) % 12 + 12 * 3  # Tercera en C3, E3, etc.
    elif inversion == "fifth":
        return (root + ints[2]) % 12 + 12 * 3  # Quinta en G3, etc.
    elif inversion == "seventh":
        return (root + ints[3]) % 12 + 12 * 3  # Séptima en C3, B3, etc.
    else:
        raise ValueError(f"Inversión desconocida: {inversion}")


def seleccionar_inversion(
    anterior: Optional[int], cifrado: str, offset_octava: int = 0
) -> Tuple[str, int]:
    """Selecciona la inversión con la voz grave más cercana a \`\`anterior\`\`.

    Si la voz grave previa pertenece al acorde actual, se reutiliza como bajo.
    \`\`offset_octava\`\` permite incorporar el desplazamiento manual de registro en
    el cálculo de cercanía.
    """

    candidatos: List[Tuple[int, str, int, int]] = []
    for inv in INVERSIONS:
        base_pitch = get_bass_pitch(cifrado, inv) + offset_octava
        pitch = _ajustar_rango_flexible(anterior, base_pitch)
        distancia = 0 if anterior is None else abs(pitch - anterior)
        candidatos.append((distancia, inv, pitch, base_pitch % 12))

    if anterior is not None:
        objetivo_pc = anterior % 12
        coincidencias = [c for c in candidatos if c[3] == objetivo_pc]
        if coincidencias:
            coincidencias.sort()
            return coincidencias[0][1], coincidencias[0][2]

    candidatos.sort()
    mejor = candidatos[0]
    return mejor[1], mejor[2]


# ========================
# Traducción de notas plantilla → acorde cifrado
# ========================


def traducir_nota(note_name: str, cifrado: str) -> Tuple[int, bool]:
    """Traduce \`\`note_name\`\` según las reglas del modo salsa.

    Devuelve el \`\`pitch\`\` calculado y un flag indicando si la nota es de
    aproximación.
    """

    root, suf = parsear_nombre_acorde(cifrado)
    ints = INTERVALOS_TRADICIONALES[suf]

    is_minor = ints[1] - ints[0] == 3 or "m" in suf or "m7(b5)" in suf or "º" in suf
    has_b9 = "b9" in cifrado
    has_b13 = "b13" in cifrado
    has_b5 = "b5" in cifrado
    extra_b6 = "(b6)" in cifrado
    extra_b13 = "(b13)" in cifrado

    name = note_name[:-1]
    octave = int(note_name[-1])

    def midi(interval: int) -> int:
        return root + interval + 12 * (octave + 1)

    interval = None
    es_aprox = False

    if name == "C":
        interval = 0
    elif name == "E":
        interval = 5 if "sus" in suf else ints[1]
    elif name == "G":
        interval = ints[2]
    elif name == "D":
        if has_b5:
            interval = 1
        else:
            interval = 1 if has_b9 else 2
        es_aprox = True
    elif name == "A":
        if has_b9 or has_b13 or has_b5 or extra_b6 or extra_b13:
            interval = 8
        else:
            interval = 9
        es_aprox = True
    elif name == "B":
        if suf.endswith("6") and "7" not in suf:
            interval = 11
        else:
            interval = ints[3] if len(ints) > 3 else 11
        es_aprox = True
    elif name == "D#":
        third_int = 3 if is_minor else 4
        interval = third_int - 1
        es_aprox = True
    elif name == "F":
        interval = 5
        es_aprox = True
    elif name == "G#":
        interval = ints[2] - 1
        es_aprox = True
    elif name == "C#":
        interval = 11 if has_b9 else 1
        es_aprox = True
    else:
        return pretty_midi.note_name_to_number(note_name), False

    return midi(interval), es_aprox


def _extraer_grupos_con_nombres(
    posiciones_base: List[dict], total_cor_ref: int, grid_seg: float
) -> List[List[dict]]:
    """Agrupa \`\`posiciones_base\`\` por corchea conservando el nombre."""

    grupos_ref: List[List[dict]] = [[] for _ in range(total_cor_ref)]
    for pos in posiciones_base:
        idx = int(round(pos["start"] / grid_seg))
        if 0 <= idx < total_cor_ref:
            grupos_ref[idx].append(
                {
                    "pitch": pos["pitch"],
                    "start": pos["start"] - idx * grid_seg,
                    "end": pos["end"] - idx * grid_seg,
                    "velocity": pos["velocity"],
                    "name": pos["name"],
                }
            )

    return grupos_ref


def _cargar_grupos_por_inversion(
    plantillas: Dict[str, pretty_midi.PrettyMIDI],
) -> Tuple[Dict[str, List[List[Dict]]], int, float, float]:
    """Devuelve notas agrupadas por corchea para cada inversión."""

    grupos_por_inv: Dict[str, List[List[Dict]]] = {}
    total_cor_ref = None
    grid = bpm = None
    for inv, pm in plantillas.items():
        cor_ref, g, b = _grid_and_bpm(pm)
        if grid is None:
            grid = g
            bpm = b
            total_cor_ref = cor_ref
        posiciones_base: List[dict] = []
        for n in pm.instruments[0].notes:
            posiciones_base.append(
                {
                    "pitch": int(n.pitch),
                    "start": n.start,
                    "end": n.end,
                    "velocity": n.velocity,
                    "name": pretty_midi.note_number_to_name(int(n.pitch)),
                }
            )
        grupos_por_inv[inv] = _extraer_grupos_con_nombres(
            posiciones_base, cor_ref, grid
        )
    return grupos_por_inv, total_cor_ref, grid, bpm


def _indice_para_corchea(cor: int) -> int:
    idx = 0
    pos = 0
    while pos < cor:
        pos += _siguiente_grupo(idx)
        idx += 1
    return idx


def procesar_progresion_salsa(
    texto: str,
    armonizacion_default: Optional[str] = None,
    *,
    inicio_cor: int = 0,
) -> Tuple[List[Tuple[str, List[int], str, Optional[str]]], int]:
    """Procesa la progresión reconociendo extensiones específicas de salsa."""

    import re

    segmentos_raw = [s.strip() for s in texto.split("|") if s.strip()]

    # Expand symbol '%' to repeat the previous measure
    segmentos: List[str] = []
    for seg in segmentos_raw:
        if seg == "%":
            if not segmentos:
                raise ValueError("% no puede ir en el primer comp\\u00e1s")
            segmentos.append(segmentos[-1])
        else:
            segmentos.append(seg)

    num_compases = len(segmentos)

    resultado: List[Tuple[str, List[int], str, Optional[str]]] = []
    indice_patron = _indice_para_corchea(inicio_cor)
    posicion = 0
    arm_actual = (armonizacion_default or "").capitalize()
    inv_forzado: Optional[str] = None

    def procesar_token(token: str) -> Tuple[Optional[str], Optional[str]]:
        """Return \`\`(chord, inversion)\`\` parsed from \`\`token\`\`.

        The global \`\`arm_actual\`\` is updated if the token contains a
        harmonisation marker.  \`\`inversion\`\` may be \`\`None\`\` if no forced
        inversion was found.
        """

        nonlocal arm_actual
        inversion: Optional[str] = None

        arm_map = {
            "8": "Octavas",
            "15": "Doble octava",
            "10": "D\\u00e9cimas",
            "13": "Treceavas",
        }

        while True:
            # Strip optional mode/style token (e.g. \`\`[TRAD]\`\`)
            m = re.match(r"^\\[[A-Z]+\\](.*)$", token)
            if m:
                token = m.group(1)
                if not token:
                    return None, inversion
                continue

            m = re.match(r"^\\((8|10|13|15)\\)(.*)$", token)
            if m:
                codigo, token = m.groups()
                arm_actual = arm_map[codigo]
                continue
            break

        m = re.match(r"^(.*)/([1357])$", token)
        if m:
            token, codigo = m.groups()
            inv_map = {"1": "root", "3": "third", "5": "fifth", "7": "seventh"}
            inversion = inv_map[codigo]

        if not token:
            return None, inversion

        return token, inversion

    for seg in segmentos:
        tokens = [t for t in seg.split() if t]
        acordes: List[Tuple[str, str, Optional[str]]] = []
        for tok in tokens:
            nombre, inv_local = procesar_token(tok)
            if nombre is None:
                if inv_local is not None:
                    inv_forzado = inv_local
                continue
            acordes.append((nombre, arm_actual, inv_local or inv_forzado))
            inv_forzado = None
        if len(acordes) == 1:
            g1 = _siguiente_grupo(indice_patron)
            g2 = _siguiente_grupo(indice_patron + 1)
            dur = g1 + g2
            indices = list(range(posicion, posicion + dur))
            nombre, arm, inv = acordes[0]
            resultado.append((nombre, indices, arm, inv))
            posicion += dur
            indice_patron += 2
        elif len(acordes) == 2:
            g1 = _siguiente_grupo(indice_patron)
            indices1 = list(range(posicion, posicion + g1))
            posicion += g1
            indice_patron += 1

            g2 = _siguiente_grupo(indice_patron)
            indices2 = list(range(posicion, posicion + g2))
            posicion += g2
            indice_patron += 1

            (n1, a1, i1), (n2, a2, i2) = acordes
            resultado.append((n1, indices1, a1, i1))
            resultado.append((n2, indices2, a2, i2))
        elif len(acordes) == 0:
            continue
        else:
            raise ValueError("Cada segmento debe contener uno o dos acordes: " f"{seg}")

    return resultado, num_compases


# ========================
# Función principal para el modo salsa
# ========================


def montuno_salsa(
    progresion_texto: str,
    midi_ref: Path,
    output: Path,
    inversion_inicial: str = "root",
    *,
    inicio_cor: int = 0,
    inversiones_manual: Optional[List[str]] = None,
    return_pm: bool = False,
    variante: str = "A",   # <-- NUEVO parámetro
    asignaciones_custom: Optional[List[Tuple[str, List[int], str, Optional[str]]]] = None,
    octavacion_default: Optional[str] = None,
    octavaciones_custom: Optional[List[str]] = None,
) -> Optional[pretty_midi.PrettyMIDI]:
    """Genera montuno estilo salsa enlazando acordes e inversiones.

    \`\`inversion_inicial\`\` determina la posición del primer acorde y guía el
    enlace de los siguientes. \`\`inicio_cor\`\` indica la corchea global donde
    comienza este segmento para que la plantilla se alinee siempre con la
    progresión completa.
    """
    # Procesa la progresión. Cada compás puede contener uno o dos acordes
    print("[DEBUG] Texto que llega a procesar_progresion_salsa (Salsa):", repr(progresion_texto))
    if asignaciones_custom is None:
        asignaciones, compases = procesar_progresion_salsa(
            progresion_texto, inicio_cor=inicio_cor
        )
    else:
        asignaciones = asignaciones_custom
        compases = (
            (max(i for _, idxs, _, _ in asignaciones for i in idxs) + 7) // 8
            if asignaciones
            else 0
        )

    octavaciones = octavaciones_custom or [octavacion_default or "Original"] * len(
        asignaciones
    )

    # --------------------------------------------------------------
    # Selección de la inversión para cada acorde enlazando la voz grave
    # o usando la lista proporcionada por la interfaz
    # --------------------------------------------------------------
    if inversiones_manual is None:
        inversiones = []
        voz_grave_anterior = None
        bajos_objetivo: Dict[int, int] = {}
        for idx, (cifrado, _, _, inv_forzado) in enumerate(asignaciones):
            octava = _offset_octavacion(octavaciones[idx])
            if idx == 0:
                inv = inv_forzado or inversion_inicial
                base_pitch = get_bass_pitch(cifrado, inv) + octava
                pitch = _ajustar_rango_flexible(voz_grave_anterior, base_pitch)
            else:
                if inv_forzado:
                    inv = inv_forzado
                    base_pitch = get_bass_pitch(cifrado, inv) + octava
                    pitch = _ajustar_rango_flexible(voz_grave_anterior, base_pitch)
                else:
                    inv, pitch = seleccionar_inversion(
                        voz_grave_anterior, cifrado, octava
                    )
            inversiones.append(inv)
            bajos_objetivo[idx] = pitch
            voz_grave_anterior = pitch
    else:
        inversiones = inversiones_manual
        bajos_objetivo = {}
        voz_grave_anterior = None
        for idx, (cifrado, _, _, _) in enumerate(asignaciones):
            inv = inversiones[idx]
            octava = _offset_octavacion(octavaciones[idx])
            base_pitch = get_bass_pitch(cifrado, inv) + octava
            pitch = _ajustar_rango_flexible(voz_grave_anterior, base_pitch)
            bajos_objetivo[idx] = pitch
            voz_grave_anterior = pitch

    # Carga los midis de referencia una única vez por inversión y
    # construye las posiciones repetidas para toda la progresión
    plantillas: Dict[str, pretty_midi.PrettyMIDI] = {}
    parts = midi_ref.stem.split("_")
    base = "_".join(parts[:2]) if len(parts) >= 2 else midi_ref.stem
    if len(parts) >= 4:
        variante = parts[-1]
    plantilla_defecto: Optional[pretty_midi.PrettyMIDI] = None
    for inv in INVERSIONS:
        path = midi_ref.parent / f"{base}_{inv}_{variante}.mid"
        try:
            plantillas[inv] = pretty_midi.PrettyMIDI(str(path))
        except FileNotFoundError:
            if plantilla_defecto is None:
                plantilla_defecto = pretty_midi.PrettyMIDI(str(midi_ref))
            plantillas[inv] = plantilla_defecto

    # Número real de corcheas en la progresión según el patrón de clave
    total_dest_cor = max(i for _, idxs, _, _ in asignaciones for i in idxs) + 1

    grupos_por_inv, total_ref_cor, grid, bpm = _cargar_grupos_por_inversion(plantillas)
    pm_ref = plantillas[inversion_inicial]
    offset_ref = 0

    # Mapa corchea -> índice de acorde y límites de cada acorde
    mapa: Dict[int, int] = {}
    limites: Dict[int, int] = {}
    for i, (_, idxs, _, _) in enumerate(asignaciones):
        for ix in idxs:
            mapa[ix] = i
        limites[i] = idxs[-1] + 1

    clases_por_acorde: Dict[int, Set[int]] = {}
    for idx, (cifrado, _, _, _) in enumerate(asignaciones):
        clases_por_acorde[idx] = _pitch_classes_en_acorde(cifrado)

    offset_octava: Dict[int, int] = {}
    for i, etiqueta in enumerate(octavaciones):
        offset_octava[i] = _offset_octavacion(etiqueta)

    inv_por_cor: Dict[int, str] = {}
    for idx, (_, idxs, _, _) in enumerate(asignaciones):
        for ix in idxs:
            inv_por_cor[ix] = inversiones[idx]

    mas_grave_por_acorde: Dict[int, int] = {}
    for idx, (acorde, _, _, _) in enumerate(asignaciones):
        inv = inversiones[idx]
        base_min: Optional[int] = None
        for grupo in grupos_por_inv[inv]:
            for pos in grupo:
                pitch, _ = traducir_nota(pos["name"], acorde)
                if base_min is None or pitch < base_min:
                    base_min = pitch
        mas_grave_por_acorde[idx] = base_min if base_min is not None else 0

    ajuste_por_acorde: Dict[int, int] = {}
    for idx in range(len(asignaciones)):
        objetivo = bajos_objetivo.get(idx)
        base_min = mas_grave_por_acorde.get(idx, 0)
        octava = offset_octava.get(idx, 0)
        if objetivo is None:
            ajuste_por_acorde[idx] = 0
            continue
        diff = objetivo - (base_min + octava)
        ajuste_por_acorde[idx] = 12 * round(diff / 12)

    notas_finales: List[pretty_midi.Note] = []
    notas_por_acorde: Dict[int, List[pretty_midi.Note]] = {i: [] for i in range(len(asignaciones))}
    for cor in range(total_dest_cor):
        inv = inv_por_cor.get(cor)
        if inv is None:
            continue
        idx_acorde = mapa[cor]
        acorde, _, _, _ = asignaciones[idx_acorde]
        octava = offset_octava.get(idx_acorde, 0)
        ajuste = ajuste_por_acorde.get(idx_acorde, 0)
        grupos_act = grupos_por_inv
        ref_idx = (inicio_cor + cor + offset_ref) % total_ref_cor
        prev_classes = clases_por_acorde.get(idx_acorde - 1)
        next_classes = clases_por_acorde.get(idx_acorde + 1)
        for pos in grupos_act[inv][ref_idx]:
            pitch, es_aprox = traducir_nota(pos["name"], acorde)
            comienzo = asignaciones[idx_acorde][1][0]
            if CONVERTIR_APROX_A_ESTRUCT and es_aprox and cor == comienzo:
                pitch = _ajustar_a_estructural_mas_cercano(
                    pos["name"], cifrado=acorde, pitch=pitch
                )
            elif es_aprox:
                pitch = _preferir_aproximacion_vecina(
                    pitch, prev_classes, next_classes
                )
            inicio = cor * grid + pos["start"]
            fin = cor * grid + pos["end"]
            fin_limite = limites[idx_acorde] * grid
            end = min(fin, fin_limite)
            if end <= inicio:
                continue
            note_obj = pretty_midi.Note(
                velocity=pos["velocity"],
                pitch=pitch + octava + ajuste,
                start=inicio,
                end=end,
            )
            notas_finales.append(note_obj)
            notas_por_acorde[idx_acorde].append(note_obj)

    for idx, objetivo in bajos_objetivo.items():
        notas = [n for n in notas_por_acorde.get(idx, []) if n.pitch > 0]
        if not notas:
            continue
        nota_grave = min(notas, key=lambda n: n.pitch)
        nota_grave.pitch = objetivo

    # ------------------------------------------------------------------
    # Ajuste final de duración y bpm igual que en el modo tradicional
    # ------------------------------------------------------------------
    limite = total_dest_cor * grid
    notas_finales = _cortar_notas_superpuestas(notas_finales)
    notas_finales = _recortar_notas_a_limite(notas_finales, limite)
    if limite > 0:
        has_start = any(n.start <= 0 < n.end and n.pitch > 0 for n in notas_finales)
        has_end = any(
            n.pitch > 0 and n.start < limite and n.end > limite - grid for n in notas_finales
        )
        if not has_start:
            notas_finales.append(
                pretty_midi.Note(
                    velocity=1,
                    pitch=0,
                    start=0.0,
                    end=min(grid, limite),
                )
            )
        if not has_end:
            notas_finales.append(
                pretty_midi.Note(
                    velocity=1,
                    pitch=0,
                    start=max(0.0, limite - grid),
                    end=limite,
                )
            )

    pm_out = pretty_midi.PrettyMIDI()
    inst = pretty_midi.Instrument(
        program=pm_ref.instruments[0].program,
        is_drum=pm_ref.instruments[0].is_drum,
        name=pm_ref.instruments[0].name,
    )
    inst.notes = notas_finales
    pm_out.instruments.append(inst)

    if return_pm:
        return pm_out

    pm_out.write(str(output))
`,l=`# -*- coding: utf-8 -*-
"""Utilities for generating piano voicings."""

from typing import List, Tuple

# ---------------------------------------------------------------------------
# Pitch range limits for the generated voicings.  Notes are adjusted so that
# they remain within this interval when building the linked voicings.
# These limits should only affect the base voicings; harmonisation later on
# (octaves, double octaves, tenths or sixths) may exceed \`\`RANGO_MAX\`\`.
# ---------------------------------------------------------------------------
RANGO_MIN = 53  # F3
RANGO_MAX = 67  # G4

# ==========================================================================
# Dictionaries for chord suffixes and note names
# These are used to parse chord symbols and build chord voicings
# ===========================================================================

INTERVALOS_TRADICIONALES = {
    '6':      [0, 4, 7, 9],     # 1 3 5 6
    '7':      [0, 4, 7, 10],    # 1 3 5 b7
    '∆':      [0, 4, 7, 11],    # 1 3 5 7
    'm':      [0, 3, 7, 10],    # 1 b3 5 b7 (triad interpreted as m7)
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
    'm7(b5)': [0, 3, 6, 10],    # 1 b3 b5 b7
    '7(b5)':  [0, 4, 6, 10],    # 1 3 b5 b7
    '7(b9)':  [0, 4, 7, 10, 13],  # 1 3 5 b7 b9
    '+7(b9)': [0, 4, 8, 10, 13],  # 1 3 #5 b7 b9
    '7(b5)b9': [0, 4, 6, 10, 13],  # 1 3 b5 b7 b9
    '7sus4(b9)': [0, 5, 7, 10, 13],  # 1 4 5 b7 b9
    '∆(b5)':  [0, 4, 6, 11],    # 1 3 b5 7
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

def parsear_nombre_acorde(nombre: str) -> Tuple[int, str]:
    """Parse a chord name into root MIDI pitch class and suffix.

    Extra modifiers like \`\`(b6)\`\` or \`\`(b13)\`\` are ignored for the
    purposes of voicing generation but may be used elsewhere.
    """

    import re

    # Strip forced inversion notation at the end (e.g. C∆/3)
    base = re.sub(r"/[1357]$", "", nombre)
    # Remove optional extensions that are not part of the base dictionary
    base = re.sub(r"\\(b6\\)|\\(b13\\)", "", base)

    m = re.match(
        r'^([A-G][b#]?)(m6|m7|m∆|m|6|7|∆sus4|∆sus2|∆|\\+7|º7|º∆|m7\\(b5\\)|7sus4|7sus2|7\\(b5\\)|7\\(b9\\)|\\+7\\(b9\\)|7\\(b5\\)b9|7sus4\\(b9\\)|∆\\(b5\\))?$',
        base,
    )
    if not m:
        raise ValueError(f"Acorde no reconocido: {nombre}")

    root, suf = m.group(1), m.group(2) or '∆'
    return NOTAS[root], suf


def _ajustar_octava(pitch: int) -> int:
    """Confine \`\`pitch\`\` within \`\`RANGO_MIN\`\` .. \`\`RANGO_MAX\`\` by octaves."""

    while pitch < RANGO_MIN:
        pitch += 12
    while pitch > RANGO_MAX:
        pitch -= 12
    return pitch

SALTO_MAX = 8  # interval in semitones (minor sixth)


def generar_voicings_enlazados_tradicional(progresion: List[str]) -> List[List[int]]:
    """Generate linked four‑note voicings emulating the pre‑salsa behaviour.

    Each chord is evaluated in several octaves and the bass note chosen is the
    chord tone closest to the previous bass.  Only the first four intervals of
    the chord definition are used so any ninths present in the symbol are
    ignored.
    """

    voicings: List[List[int]] = []
    bajo_anterior = 43  # G2

    for nombre in progresion:
        root, suf = parsear_nombre_acorde(nombre)
        intervalos = INTERVALOS_TRADICIONALES[suf][:4]
        notas_base = [root + i for i in intervalos]

        candidatos: List[Tuple[int, int, List[int], int]] = []
        for o in range(1, 5):  # octavas razonables para graves
            acorde = [n + 12 * o for n in notas_base]
            for idx_bajo, n in enumerate(acorde):
                distancia = abs(n - bajo_anterior)
                candidatos.append((distancia, n, acorde, idx_bajo))

        candidatos_comunes = [c for c in candidatos if c[1] == bajo_anterior]
        if candidatos_comunes:
            mejor = min(candidatos_comunes, key=lambda x: x[0])
        else:
            mejor = min(candidatos, key=lambda x: x[0])

        nuevo_bajo = mejor[1]
        acorde = mejor[2]
        idx_bajo = mejor[3]

        resto = acorde[:idx_bajo] + acorde[idx_bajo + 1 :]
        resto.sort()
        voicing = [nuevo_bajo] + resto
        voicings.append(voicing)
        bajo_anterior = nuevo_bajo

    return voicings

# Future voicing strategies for other modes can be added here
`,M=`# -*- coding: utf-8 -*-
"""Utilities for generating piano voicings."""

from typing import Callable, Dict, List, Optional, Tuple
import logging
import re

# ---------------------------------------------------------------------------
# Pitch range limits for the generated voicings.  Notes are adjusted so that
# they remain within this interval when building the linked voicings.
# These limits should only affect the base voicings; harmonisation later on
# (octaves, double octaves, tenths or sixths) may exceed \`\`RANGO_MAX\`\`.
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
    'm':      [0, 3, 7, 10],    # 1 b3 5 b7 (triad interpreted as m7)
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
    """Confine \`\`pitch\`\` within \`\`RANGO_MIN\`\` .. \`\`RANGO_MAX\`\` by octaves."""

    while pitch < RANGO_MIN:
        pitch += 12
    while pitch > RANGO_MAX:
        pitch -= 12
    return pitch


def _ajustar_octava_flexible(pitch: int, prev: Optional[int]) -> int:
    """Adjust \`\`pitch\`\` preferring the fixed range but allowing a small extension."""

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
`,m=`"""Core helpers to drive montuno generation without a GUI."""
from .config import CLAVES, ClaveConfig, get_clave_tag
from .generation import MontunoGenerateResult, generate_montuno

__all__ = [
    "CLAVES",
    "ClaveConfig",
    "MontunoGenerateResult",
    "generate_montuno",
    "get_clave_tag",
]
`,P=`"""Static configuration shared between the desktop UI and the web core."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class ClaveConfig:
    """Configuration for a clave pattern and its reference MIDI prefix."""

    midi_prefix: str
    primer_bloque: List[int]
    patron_repetido: List[int]


CLAVES: Dict[str, ClaveConfig] = {
    "Clave 2-3": ClaveConfig(
        midi_prefix="tradicional_2-3",
        primer_bloque=[3, 4, 4, 3],
        patron_repetido=[5, 4, 4, 3],
    ),
    "Clave 3-2": ClaveConfig(
        midi_prefix="tradicional_3-2",
        primer_bloque=[3, 3, 5, 4],
        patron_repetido=[4, 3, 5, 4],
    ),
}


def get_clave_tag(config: ClaveConfig) -> str:
    """Return the short clave identifier used by reference MIDI filenames."""

    parts = config.midi_prefix.split("_", 1)
    return parts[1] if len(parts) > 1 else parts[0]
`,T=`"""Utilities to render montunos without relying on the Tk GUI."""
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
    """Return value for :func:\`generate_montuno\`."""

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
    # Use the provided \`\`default\`\` whenever an entry is missing or \`\`None\`\` so
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
        # \`\`inversion_limpia\`\` calculated above so the same base inversion is
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
`,G=`"""Simplified \`\`pretty_midi\`\` implementation for the Pyodide build.

The original project depends on compiled extensions which are not available in
Pyodide.  This module provides just enough of the public surface required by
our music generation code and relies exclusively on \`\`mido\`\` which *is*
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
    """Very small subset of :mod:\`pretty_midi\` used in the web worker."""

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
`,Y=`[
  { "pattern": "([A-G][b#]?)(mmaj7)", "replacement": "$1m∆", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(maj13)", "replacement": "$1∆13", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(maj11)", "replacement": "$1∆11", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(maj9)", "replacement": "$1∆9", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(M13)", "replacement": "$1∆13", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(M11)", "replacement": "$1∆11", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(M9)", "replacement": "$1∆9", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(mmaj9)", "replacement": "$1m∆", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(mmaj)", "replacement": "$1m∆", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(maj7[(]b5[)])", "replacement": "$1∆(b5)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(maj7b5)", "replacement": "$1∆(b5)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(maj7)", "replacement": "$1∆", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(Δsus4)", "replacement": "$1∆sus4", "flags": "g" },
  { "pattern": "([A-G][b#]?)(Δsus2)", "replacement": "$1∆sus2", "flags": "g" },
  { "pattern": "([A-G][b#]?)(Δ)", "replacement": "$1∆", "flags": "g" },
  { "pattern": "([A-G][b#]?)(mΔ)", "replacement": "$1m∆", "flags": "g" },
  { "pattern": "([A-G][b#]?)(mΔ7)", "replacement": "$1m∆", "flags": "g" },
  { "pattern": "([A-G][b#]?)(ø7)", "replacement": "$1m7(b5)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(ø)", "replacement": "$1m7(b5)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(Ø7)", "replacement": "$1m7(b5)", "flags": "g" },
  { "pattern": "([A-G][b#]?)(Ø)", "replacement": "$1m7(b5)", "flags": "g" },
  { "pattern": "([A-G][b#]?)(m7b5)", "replacement": "$1m7(b5)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(o7)", "replacement": "$1º7", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(o)", "replacement": "$1º7", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(°7)", "replacement": "$1º7", "flags": "g" },
  { "pattern": "([A-G][b#]?)(°)", "replacement": "$1º7", "flags": "g" },
  { "pattern": "([A-G][b#]?)(dim7)", "replacement": "$1º7", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(dim)", "replacement": "$1º7", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(7b5b9)", "replacement": "$17(b5)b9", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(7b5)", "replacement": "$17(b5)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(7sus4b9)", "replacement": "$17sus4(b9)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)([+]7b9)", "replacement": "$1+7(b9)", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(7#5)", "replacement": "$1+7", "flags": "gi" },
  { "pattern": "([A-G][b#]?)(aug7)", "replacement": "$1+7", "flags": "gi" }
]
`;const S={"backend/__init__.py":I,"backend/utils.py":w,"backend/style_utils.py":d,"backend/midi_common.py":N,"backend/midi_utils.py":F,"backend/midi_utils_tradicional.py":k,"backend/modos.py":C,"backend/salsa.py":p,"backend/voicings.py":l,"backend/voicings_tradicional.py":M,"backend/montuno_core/__init__.py":m,"backend/montuno_core/config.py":P,"backend/montuno_core/generation.py":T,"pretty_midi/__init__.py":G},h={"shared/chord_replacements.json":Y},D={"salsa_2-3_fifth.mid":"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","salsa_2-3_fifth_2chords.mid":"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","salsa_2-3_fifth_A.mid":"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","salsa_2-3_fifth_B.mid":"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","salsa_2-3_fifth_C.mid":"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","salsa_2-3_fifth_D.mid":"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","salsa_2-3_root.mid":"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","salsa_2-3_root_2chords.mid":"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","salsa_2-3_root_A.mid":"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","salsa_2-3_root_B.mid":"TVRoZAAAAAYAAAABAeBNVHJrAAAPtAD/IAEAAP8DEHNhbHNhXzItM19yb290X0IA/wQQU3RlaW53YXkgRCBHcmFuZAD/WAQEAhgIAP9ZAgAAAP9UBSEAAAAAAJA8XYEgNFAAQF0UgDxAgQyQN1QAQ1wagEAAHzQAZ5AwVgA8WgBIWhWAQwAaNwBuSAADkDRUAEBdB4AwABg8AIEBkDdWAENWDoA0AA5AAIEEQwAAkC9XADtaAEdeF4A3AIE2RwAjkDRWADdQAEBdCIAvAAQ7AIEINAASQABjNwCBV5AwVgA8XABIYYF1gEgADTwABzAAgVeQNFYAN1YAQGYAQ2WBH4BAAApDAFU0ADY3AIEskDJWAD5eAEplgTSASgAEPgAGMgCCIpAyVgA+YQBKYIELgEoAOj4ATTIAgU6QMFYAPFsASFpogEgAAjwACDAAfpAwVQA8WwBIVoE9gEgAM5A0TgBAUhCAMAA4PACBKJA3VABDWUOAQAADNACBKpAvVgA7WQBHWwaAQwABNwCBOTsAJUcAC5A3WBaALwCBWpAyVwA+XgBKZzeANwCBNUoABJA3SheAMgAsPgCBKjcAA5AwUwA8WgBIWm+APAAaSAAVMABSkDBUADxfAEhZgUqASAAmkDRSAEBdGoAwAAc8AIFPkDdRAENWJIBAAAI0AIEcQwAYNwAWkC9WADtXAEdWgXCARwAAkDdWC4A7AAovAIEmNwA1kC9XADtdAEdlgQmAOwAURwAjLwAwkDBYADxcAEhtWoBIAAc8ACkwAGaQMFgAPF0ASF2DJIBIADyQNFUAQGMOgDAAITwAgR9AACKQN1UAQ1sWgDQAgSRDADaQL1YAO1oAR1wbgDcAgVNHAAKQNFgKgC8AAjsAcjQAcpA0VwBAaQBDZ4FwN1oZgDQACEAAFEMAgTuQMFMAPFcASF0agDcASDwADkgAEzAAbZAwVQA8XwBIXYE3gEgAOZA0UwBAXRKAMAAXPACBR5A3VABDUy2AQAAJNABPQwBfNwAMkDJWAD5bAEpjgSGASgBPkDdWBIAyAAM+AIFpkDFUAD1hAElfCIA3AIFokDdUFIBJAAI9AA4xAIExNwAbkDBVADxXAEhVfYBIAAIwAAg8AGmQMFcAPF4ASFiBIYBIAE+QNFQAQFsSgDAAGzwAgUOQN1YAQ1QugEAAEzQAgS+QL1YAO1cAR1wtgDcAAEMAgQw7ADFHAAaQN1YVgC8AgVuQMlcAPmIASmkTgDcAgUNKABqQN0wGgDIADT4AgVs3AAKQMFUAPFwASFaCfoBIAAk8AFEwAAiQNFUAN1QAQFwAQ1+BQoBDAAhAAB80ACo3AIFNkDJWAD5ZAEpbbYBKAAU+ABMyAGuQMlYAPl4ASl9sgEoABD4AKjIAVpAyVgA+XwBKXVmASgATPgAxMgBTkDBWADxdAEhbgh6APAABSAAHMACBOpAwUwA8YABIXYEgNFMAQFQCgEgAHTAAAzwAfpA3VQBDUEOANAABQABckDBUADxeAEhbCoBDABA3AIEGkDRTAEBYBYBIABgwAAY8AH2QN1UAQ00agEAACTQAdzcABpAvVwA7VgBHW4EggEMANUcAGC8AA5A0VAA3VgBAXQBDVgWAOwCBE0AAO0MADjQANjcAgUmQMFYAPF8ASF+DFoBIADA8ABqQNFYAQGADgDAAgSZAAHI0AIFFkDJWAD5hAEpiggqASgASPgACMgCBQpAyVgA+YwBKX4E3gEoAOz4AHjIAgVCQMFQAPFwASFlcgDwAE0gAAzAAfpAwVAA8XQBIWoEkgEgATJA0TwBAWiOAMAAePACBL5A3VQBDW0mANAAAQAB3QwAwkC9WADtYAEddJ4A3AFc7ABJHAB4vAEKQL1AAO1oAR12BPIBHABU7AB+QNFUAQFoRgC8AgRBAAEc0AAiQL1cAO1sAR16BBIA7AANHAD8vACqQMFkAPF0ASGiCb4BIAF48ABOQNFQAQGUMgDAAgWQ0AACQN1QAQ1QQgEAAeEMAQDcAKJAyVAA+WABKWUyASgAePgANMgB5kDJWAD5bAEpfWoBKAAI+ABUyAH+QMlUAPl0ASltTgEoAGD4ACzIAepAwVQA8XQBIXYUCgEgATpA0VABAWimAPAACMACBRZA3VQBDWhqAQAAqNACBAkMAJTcABZAvVgA7WwBHXYFtgDsAA5A3Vg6ARwAKLwCBWJAyWAA+YQBKXxyANwCBVJA3Ty+ASgAeMgAAPgCBI5AwVQA8XQBIXAWANwCCQkgAEjwAEDAAd5A0WgA3WgBAbABDa4EkgEMACUAAajQAKDcAgSGQL1YAO1gAR12CbYBHAAI7AHGQNFYAN1QAQGUAQ10QgC8AgRFAAB9DADCQL0kAO1gAR1sEgDQAHC8ALzcAFTsAAEcAgQyQMFcAPFsASF2DK4BIADWQNFYAQF0jgDAACDwAgUWQN1QAQ1gmgEAAIDQAdUMANZAwTgA8WABIUU2ANwANSAAhPAAMMABpkC9UADtVAEdagVKARwAZOwAFkDRUADdUAEBaAENdPoAvAF1DAEg3AA2QL1UAO1YAR1stgEAAAzQAOTsAAi8AAEcAgQWQMFUAPFgASF1TgEgAFTwAGjAAbpAwVgA8XQBIW4FGgEgAKpA0VABAXiGAMAAMPACBQ5A3SQBDTAuAQABfNAAJQwA+NwA/kDJWAD5cAEpfbIA+AAlKABkyAGKQMlgAPl0ASlSBA4BKADU+ADAyAAiQNFQAN1QAQFsAQ19ygEAAGjcAAUMAETQAUpAwUgA8XABIXF2AMAACPAAASECBEZAwVAA8WwBIVYNgNFQAQF4GgEgAKDAAEzwAgS+QN00AQ1s3gEAAOjQAN0MASJAvVwA7VABHXBuANwCBRUcAEJA0VgSALwAPOwBlNAB4kDRWAEBjAENlgXA3VBWANAApQAAFQwCBLZAwVAA8WwBIXB+ANwCBUZA0VhOASAAhPAAJMAA0NAB/kDRXAEBrAENogXA3VBCAQAAXQwAlNACBJJAyVAA+WwBKWQWANwCBa5A3VheAPgACMgACSgCBKjcAK5AyUgA+YwBKXYFvgEoAAZA3TDuAPgAHMgCBLDcAApAwUwA8WwBIVnCAPAALMAARSABkkDBWADxdAEhUgW+ASAABkDRUAEBdM4A8ABowAIEjkDdSAENaIYBAABw0AIEhQwASkC9WADtXAEdaF4A3AIFIRwARkDRUB4A7ABAvAGI0AHeQNFQAQGMAQ1+BcDdRIoA0AApAABNDAIExkDBWADxdAEhYPoA3AH5IADSQNFYdgDAAGDwARDQAd5A0VgBAaQBDbYFwN1kBgEAAAEMADzQAgWCQMlcAPl4ASmsOgDcAgWKQN1UMgEoAHz4ACDIAgSQ3ABmQL1YAO18AR1qBK4BHAEWQN1AdgDsAGS8AgSs3AA+QME8APF0ASFqDF4BIAEmQNFQAQGUYgDwAHzAAgTmQN1MAQ1oWgEAAIjQASEMAcJAyVQA+XQBKXSqANwCBLUoALTIANT4AgSeQNFUAQGUAQ2CBcDdXI4A0AAxAAAhDAIE1NwAEkDBVADxdAEhXgTKASAA+kDRUKYAwACU8AC80AHOQNFYAQGcAQ22BcDdXJYBAAAs0AABDAIFAkDJXAD5hAEpoIYA3AIEiSgAtkDdUGIAyAAM+AIEeNwA3kC9VADtbAEdZgRuARwBVkDdUI4A7ABcvAIEkNwASkDBOADxfAEheeoA8AAdIAAowAGWQMFYAPFwASFuBOYBIADeQNFYAQFwXgDAAEzwAgUaQN04AQ1Q7gEAAIDQAHTcAGEMAYJAyVgA+VgBKWGCASgAQPgAbMgBlkDJWAD5bAEpQgQeASgBbPgAOkDRUADdXAEBUAENYCYAyAIEXN0ATQAABNAAKQwAykDJbAD5fAEpbXYAyQABKACo+AGmQMFYAPGIASFaCNIBIAEw8ADYwACqQNE4AQFuBcDdXAENaDIA0AA1AAGtDADU3ADeQL1YAO1kAR1t1gDsABkcACS8AbJAvVgA7VQBHXVyAOwALRwASLwB3kC9WADtVAEdeU4A7AA1HABcvAHmQMFYAPF0ASGWBZoA8ABtIAIFfMAAAkDBWADxeAEhegXA0VABAXQmASAAhMAAgPACBJpA3VABDWyWANAAQQACBE0MAKJAvVgA7UgBHWiWANwCBP0cADJA0VBmAOwACLwBlNABwkDRWAEBpAENngXA3Vg6ANAAkQwACQACBPJAwVgA8WwBIXDyANwCBNJA0VAyASAASMAAsPABANABmkDRWAEBlAENhgXA3VieANAAGQAAHQwCBMjcACpAyVgA+YwBKX4E3gEoAHD4AHZA3VhWAMgCBMDcAK5AxUwA9ZgBJZYFwN1IwgEkAAT0ABzEAgTiQMFcAPFgASE82gDcAM0gAHTwAKzAAP5AwVwA8XABIWYEygEgAPpA0UgBAXA2AMAA4PACBK5A3UwBDWBaANAANQACBTZAvVgA7VgBHWjGANwCBP5A0VgqARwANQwAMLwAKOwBKNAB5kDRXAEBpAENngXA3VCqANAADQAAQQwCBM5AwVgA8XgBIX0aANwB5SAAxkDRTIIAwAC88ADU0AGyQNFcAQGcAQ2GBcDdWJYA0AANAAANDAIFFkDBUADxaAEhfHYA3ADtIAA48AAswAH+QMlIAPl4ASmFWgEoAFD4ABTIAgQGQMlcAPlsASltNgEoALz4ADDIAaJAwVwA8YQBIXYUMgEgAKDwAHJA0UwBAZS2AMACBQ5A3VQBDWxOAQAAUNACBSZAwVQA8WwBIXTGANwBAQwB6SAAFkDdWEoAwAAc8AIFRNwAGkC9UADtfAEdhgXA3VROAOwAURwAKLwCBFzcAKJAwUwA8WwBIXXGASAADPAAhMABbkDBXADxeAEhagSiASABIkDRRAEBcGoAwABs8AIE7kDdUAENOHYBAABE0AHRDAE6QMlYAPloASl0TgDcAgVJKAAk+AAKQN1YQgDIAgTM3AC2QMlIAPmIASmGBZIBKAAyQN1MlgDIAGz4AgSA3ABCQMFYAPFsASE5tgDwAFkgAEzAAWpAwVgA8XABIXIETgEgAXZA0VQBAXyqAMAAFPACBQZA3VABDVhiANAATQACBRZAvVAA7VgBHVhyANwCBVJA0VRGARwAFQwAVLwACOwBXNABskDRWAEBmAENngXA3VSCANAARQAAIQwCBN5AwVgA8XABIWi2ANwCBCEgAO5A0VQ+AMAA1PABDNABpkDRWAEBlAENmgXA3WheANAAYQAADQwCBPpAwVAA8WABIWyyANwAqSAAEPAAWMACBAJAyVgA+XQBKY1eASgALPgAgMgBukDJXAD5dAEpaZYBKABY+AAUyAHCQMFUAPGEASF6DRIAwAAA8ABxIAIGWAP8vAA==","salsa_2-3_root_C.mid":"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","salsa_2-3_root_D.mid":"TVRoZAAAAAYAAAABAeBNVHJrAAAPvAD/IAEAAP8DEHNhbHNhXzItM19yb290X0QA/wQQU3RlaW53YXkgRCBHcmFuZAD/WAQEAhgIAP9ZAgAAAP9UBSEAAAAAAJA8WYFwgDxAAJA0VgBAXYFwN1QAQ1gmgEAAIDQAdUMANZAwTgA8WABIUU2ANwANSAAhPAAMMABpkC9UADtVAEdagVKARwAZOwAFkDRUADdUAEBaAENdPoAvAF1DAEg3AA2QL1UAO1YAR1stgEAAAzQAOTsAAi8AAEcAgQWQMFUAPFgASF1TgEgAFTwAGjAAbpAwVgA8XQBIW4FGgEgAKpA0VABAXiGAMAAMPACBQ5A3SQBDTAuAQABfNAAJQwA+NwA/kDJWAD5cAEpfbIA+AAlKABkyAGKQMlgAPl0ASlSBA4BKADU+ADAyAAiQNFQAN1QAQFsAQ19ygEAAGjcAAUMAETQAUpAwUgA8XABIXF2AMAACPAAASECBEZAwVAA8WwBIVYNgNFQAQF4GgEgAKDAAEzwAgS+QN00AQ1s3gEAAOjQAN0MASJAvVwA7VABHXBuANwCBRUcAEJA0VgSALwAPOwBlNAB4kDRWAEBjAENlgXA3VBWANAApQAAFQwCBLZAwVAA8WwBIXB+ANwCBUZA0VhOASAAhPAAJMAA0NAB/kDRXAEBrAENogXA3VBCAQAAXQwAlNACBJJAyVAA+WwBKWQWANwCBa5A3VheAPgACMgACSgCBKjcAK5AyUgA+YwBKXYFvgEoAAZA3TDuAPgAHMgCBLDcAApAwUwA8WwBIVnCAPAALMAARSABkkDBWADxdAEhUgW+ASAABkDRUAEBdM4A8ABowAIEjkDdSAENaIYBAABw0AIEhQwASkC9WADtXAEdaF4A3AIFIRwARkDRUB4A7ABAvAGI0AHeQNFQAQGMAQ1+BcDdRIoA0AApAABNDAIExkDBWADxdAEhYPoA3AH5IADSQNFYdgDAAGDwARDQAd5A0VgBAaQBDbYFwN1kBgEAAAEMADzQAgWCQMlcAPl4ASmsOgDcAgWKQN1UMgEoAHz4ACDIAgSQ3ABmQL1YAO18AR1qBK4BHAEWQN1AdgDsAGS8AgSs3AA+QME8APF0ASFqDF4BIAEmQNFQAQGUYgDwAHzAAgTmQN1MAQ1oWgEAAIjQASEMAcJAyVQA+XQBKXSqANwCBLUoALTIANT4AgSeQNFUAQGUAQ2CBcDdXI4A0AAxAAAhDAIE1NwAEkDBVADxdAEhXgTKASAA+kDRUKYAwACU8AC80AHOQNFYAQGcAQ22BcDdXJYBAAAs0AABDAIFAkDJXAD5hAEpoIYA3AIEiSgAtkDdUGIAyAAM+AIEeNwA3kC9VADtbAEdZgRuARwBVkDdUI4A7ABcvAIEkNwASkDBOADxfAEheeoA8AAdIAAowAGWQMFYAPFwASFuBOYBIADeQNFYAQFwXgDAAEzwAgUaQN04AQ1Q7gEAAIDQAHTcAGEMAYJAyVgA+VgBKWGCASgAQPgAbMgBlkDJWAD5bAEpQgQeASgBbPgAOkDRUADdXAEBUAENYCYAyAIEXN0ATQAABNAAKQwAykDJbAD5fAEpbXYAyQABKACo+AGmQMFYAPGIASFaCNIBIAEw8ADYwACqQNE4AQFuBcDdXAENaDIA0AA1AAGtDADU3ADeQL1YAO1kAR1t1gDsABkcACS8AbJAvVgA7VQBHXVyAOwALRwASLwB3kC9WADtVAEdeU4A7AA1HABcvAHmQMFYAPF0ASGWBZoA8ABtIAIFfMAAAkDBWADxeAEhegXA0VABAXQmASAAhMAAgPACBJpA3VABDWyWANAAQQACBE0MAKJAvVgA7UgBHWiWANwCBP0cADJA0VBmAOwACLwBlNABwkDRWAEBpAENngXA3Vg6ANAAkQwACQACBPJAwVgA8WwBIXDyANwCBNJA0VAyASAASMAAsPABANABmkDRWAEBlAENhgXA3VieANAAGQAAHQwCBMjcACpAyVgA+YwBKX4E3gEoAHD4AHZA3VhWAMgCBMDcAK5AxUwA9ZgBJZYFwN1IwgEkAAT0ABzEAgTiQMFcAPFgASE82gDcAM0gAHTwAKzAAP5AwVwA8XABIWYEygEgAPpA0UgBAXA2AMAA4PACBK5A3UwBDWBaANAANQACBTZAvVgA7VgBHWjGANwCBP5A0VgqARwANQwAMLwAKOwBKNAB5kDRXAEBpAENngXA3VCqANAADQAAQQwCBM5AwVgA8XgBIX0aANwB5SAAxkDRTIIAwAC88ADU0AGyQNFcAQGcAQ2GBcDdWJYA0AANAAANDAIFFkDBUADxaAEhfHYA3ADtIAA48AAswAH+QMlIAPl4ASmFWgEoAFD4ABTIAgQGQMlcAPlsASltNgEoALz4ADDIAaJAwVwA8YQBIXYUMgEgAKDwAHJA0UwBAZS2AMACBQ5A3VQBDWxOAQAAUNACBSZAwVQA8WwBIXTGANwBAQwB6SAAFkDdWEoAwAAc8AIFRNwAGkC9UADtfAEdhgXA3VROAOwAURwAKLwCBFzcAKJAwUwA8WwBIXXGASAADPAAhMABbkDBXADxeAEhagSiASABIkDRRAEBcGoAwABs8AIE7kDdUAENOHYBAABE0AHRDAE6QMlYAPloASl0TgDcAgVJKAAk+AAKQN1YQgDIAgTM3AC2QMlIAPmIASmGBZIBKAAyQN1MlgDIAGz4AgSA3ABCQMFYAPFsASE5tgDwAFkgAEzAAWpAwVgA8XABIXIETgEgAXZA0VQBAXyqAMAAFPACBQZA3VABDVhiANAATQACBRZAvVAA7VgBHVhyANwCBVJA0VRGARwAFQwAVLwACOwBXNABskDRWAEBmAENngXA3VSCANAARQAAIQwCBN5AwVgA8XABIWi2ANwCBCEgAO5A0VQ+AMAA1PABDNABpkDRWAEBlAENmgXA3WheANAAYQAADQwCBPpAwVAA8WABIWyyANwAqSAAEPAAWMACBAJAyVgA+XQBKY1eASgALPgAgMgBukDJXAD5dAEpaZYBKABY+AAUyAHCQMFUAPGEASF6DRIAwAAA8ABxIAACQPF2BIDRQAEBdFIA8QIEMkDdUAENcGoBAAB80AGeQMFYAPFoASFoVgEMAGjcAbkgAA5A0VABAXQeAMAAYPACBAZA3VgBDVg6ANAAOQACBBEMAAJAvVwA7WgBHXheANwCBNkcAI5A0VgA3UABAXQiALwAEOwCBCDQAEkAAYzcAgVeQMFYAPFwASGGBdYBIAA08AAcwAIFXkDRWADdWAEBmAENlgR+AQAAKQwBVNAA2NwCBLJAyVgA+XgBKZYE0gEoABD4ABjIAgiKQMlYAPmEASmCBC4BKADo+AE0yAIFOkDBWADxbAEhaaIBIAAI8AAgwAH6QMFUAPFsASFaBPYBIADOQNE4AQFIQgDAAODwAgSiQN1QAQ1lDgEAAAzQAgSqQL1YAO1kAR1sGgEMAATcAgTk7ACVHAAuQN1gWgC8AgVqQMlcAPl4ASmc3gDcAgTVKAASQN0oXgDIALD4AgSo3AAOQMFMAPFoASFpvgDwAGkgAFTAAUpAwVAA8XwBIWYFKgEgAJpA0UgBAXRqAMAAHPACBT5A3UQBDViSAQAACNACBHEMAGDcAFpAvVgA7VwBHVoFwgEcAAJA3VguAOwAKLwCBJjcANZAvVwA7XQBHZYEJgDsAFEcAIy8AMJAwWAA8XABIbVqASAAHPAApMABmkDBYADxdAEhdgySASAA8kDRVAEBjDoAwACE8AIEfQAAikDdVAENbFoA0AIEkQwA2kC9WADtaAEdcG4A3AIFTRwACkDRYCoAvAAI7AHI0AHKQNFcAQGkAQ2eBcDdaGYA0AAhAABRDAIE7kDBTADxXAEhdGoA3AEg8AA5IABMwAG2QMFUAPF8ASF2BN4BIADmQNFMAQF0SgDAAFzwAgUeQN1QAQ1MtgEAACTQAT0MAXzcADJAyVgA+WwBKY4EhgEoAT5A3VgSAMgADPgCBaZAxVAA9YQBJXwiANwCBaJA3VBSASQACPQAOMQCBMTcAG5AwVQA8VwBIVX2ASAACMAAIPABpkDBXADxeAEhYgSGASABPkDRUAEBbEoAwABs8AIFDkDdWAENULoBAABM0AIEvkC9WADtXAEdcLYA3AABDAIEMOwAxRwAGkDdWFYAvAIFbkDJXAD5iAEppE4A3AIFDSgAakDdMBoAyAA0+AIFbNwACkDBVADxcAEhWgn6ASAAJPABRMAAIkDRVADdUAEBcAENfgUKAQwAIQAAfNAAqNwCBTZAyVgA+WQBKW22ASgAFPgATMgBrkDJWAD5eAEpfbIBKAAQ+ACoyAFaQMlYAPl8ASl1ZgEoAEz4AMTIAU5AwVgA8XQBIW4IegDwAAUgABzAAgTqQMFMAPGAASF2BIDRTAEBUAoBIAB0wAAM8AH6QN1UAQ1BDgDQAAUAAXJAwVAA8XgBIWwqAQwAQNwCBBpA0UwBAWAWASAAYMAAGPAB9kDdVAENNGoBAAAk0AHc3AAaQL1cAO1YAR1uBIIBDADVHABgvAAOQNFQAN1YAQF0AQ1YFgDsAgRNAADtDAA40ADY3AIFJkDBWADxfAEhfgxaASAAwPAAakDRWAEBgA4AwAIEmQAByNACBRZAyVgA+YQBKYoIKgEoAEj4AAjIAgUKQMlYAPmMASl+BN4BKADs+AB4yAIFQkDBUADxcAEhZgV2APAATSAAAkDBUADxdAEhaA4AwAIEhSABMkDRPAEBaI4AwAB48AIEvkDdVAENbSYA0AABAAHdDADCQL1YAO1gAR10ngDcAVzsAEkcAHi8AQpAvUAA7WgBHXYE8gEcAFTsAH5A0VQBAWhGALwCBEEAARzQACJAvVwA7WwBHXoEEgDsAA0cAPy8AKpAwWQA8XQBIaIJvgEgAXjwAE5A0VABAZQyAMACBZDQAAJA3VABDVBCAQAB4QwBANwAokDJUAD5YAEpZTIBKAB4+AA0yAHmQMlYAPlsASl9agEoAAj4AFTIAf5AyVQA+XQBKW1OASgAYPgALMgB6kDBVADxdAEhdhQKASABOkDRUAEBaKYA8AAIwAIFFkDdVAENaGoBAACo0AIECQwAlNwAFkC9WADtbAEddgW2AOwADkDdWDoBHAAovAIFYkDJYAD5hAEpfHIA3AIFUkDdPL4BKAB4yAAA+AIEjkDBVADxdAEhcBYA3AIJCSAASPAAQMAB3kDRaADdaAEBsAENrgSSAQwAJQABqNAAoNwCBIZAvVgA7WABHXYJtgEcAAjsAcZA0VgA3VABAZQBDXRCALwCBEUAAH0MAMJAvSQA7WABHWwSANAAcLwAvNwAVOwAARwCBDJAwVwA8WwBIXYFwgDAAADwAAEgAgZYA/y8A","salsa_2-3_third.mid":"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","salsa_2-3_third_2chords.mid":"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","salsa_2-3_third_A.mid":"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","salsa_2-3_third_B.mid":"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","salsa_2-3_third_C.mid":"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","salsa_2-3_third_D.mid":"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","salsa_3-2_fifth_2chords.mid":"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","salsa_3-2_fifth_A.mid":"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","salsa_3-2_fifth_B.mid":"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","salsa_3-2_fifth_C.mid":"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","salsa_3-2_fifth_D.mid":"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","salsa_3-2_root_2chords.mid":"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","salsa_3-2_root_A.mid":"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","salsa_3-2_root_B.mid":"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","salsa_3-2_root_C.mid":"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","salsa_3-2_root_D.mid":"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","salsa_3-2_third_2chords.mid":"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","salsa_3-2_third_A.mid":"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","salsa_3-2_third_B.mid":"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","salsa_3-2_third_C.mid":"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","salsa_3-2_third_D.mid":"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","tradicional_2-3_A.mid":"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","tradicional_2-3_B.mid":"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","tradicional_2-3_C.mid":"TVRoZAAAAAYAAAABAeBNVHJrAAAGAgD/IAEAAP8DEXRyYWRpY2lvbmFsXzItM19DAP8EEFN0ZWlud2F5IEQgR3JhbmQA/1gEBAIYCAD/WQIAAAD/VAUhAAAAAACQPGyBeoA8AIFmkEBsgXA3YQqAQACBcjcAgWSQOWyCA4A5AIFdkDxwggeAPACBWZBAcIIrgEAAgTWQN2eBb4A3AIFxkDlyggCAOQCBYJA8c4EBgDwAb5A8bIIBgDwAgV+QQHOBRIBAACyQN2OBTYA3ACOQOXODXIA5AIF0kDx3ghCAPACBUJBAcYIRgEAAgU+QN2SCAoA3AIFekDlqgXA8ZASAOQCBGzwAUZA8boFtgDwAgXOQPGWBcEBjTYA8AIEHQAAckDdggX2ANwCBY5A5coFlgDkAgXuQPHGBcIA8AIFwkEBuggSAQACBXJA3ZIFWgDcAggqQOWyBYoA5AA6QPHCBEYA8AF+QPHCBVoA8AIIKkDx2gWaAPAAKkEBkgVeAQAAZkDdlgT6ANwAykDl2g0+AOQCCAZA8cYE9gDwAgiOQQG6BT4BAACGQN2OBOYA3ADeQOXKCD4A5AIFRkDxqb4A8AIEBkDxlcYA8AH+QPHSCQoA8AIEekEBsgWiAQACBeJA3aoFngDcAgXmQOXaBN4A5ADmQPGyBCoA8AGaQPHGBNoA8AIIqkDxzgTKAPAA+kEBigTqAQAA2kDdkgUuANwAlkDlzg0mAOQCCB5A8c4FbgDwAggWQQHCCJYBAAIE7kDdugVGANwAfkDlyghWAOQCBS5A8doNvgDwAgWGQQHCBZoBAAIF6kDdkggWANwCBW5A5c4F5gDkAgWeQPHJ1gDwAe5A8boFkgDwAgXyQQHOBJ4BAAEmQN2uBS4A3AIIVkDlygWmAOQCBd5A8aoICgDwAgV6QQGqBYYBAAIF/kDdfgW2ANwCBc5A5bIIEgDkAgVyQPHR8gDwAdJA8anmAPAB3kDxngUSAPAAskEBngWOAQAANkDdfgUWANwArkDlzg3SAOQCBXJA8c4FugDwAgXKQQHCBVIBAAByQN2qBR4A3ACmQOXaBb4A5AIFxkDx2gWGAPACBf5A8c4FagDwAggaQPGyBcEBkS4A8AHxAACmQN2OBcIA3AIFwkDlwgXWAOQCBa5A8doFygDwAgW6QQHCCH4BAAIFBkDdlgV+ANwCCAZA5bIE0gDkAPJA8cIFlgDwAgXuQPHeBb4A8AIFxkEBxgUmAQAAnkDdlgXKANwCBbpA5boF0gDkAgWyQPHGBXYA8AIIDkDxlgUSAPAAskEBjgUOAQAAtkDdjgWCANwCCAJA5boFwPGMGgDkAgSM8AEeQPGqBYIA8AIIAkDxzgXBAY0KAPACBD0AAH5A3Y4FCgDcALpA5coJ/gDkAglGQPHCBY4A8AIF9kEBzgV2AQACCA5A3Y4FrgDcAgXWQOXSBaoA5AAaQPF+BFYA8AFuQPGyBSYA8AIIXkDxugXBAYzyAPAB+QAA2kDdegWyANwCBdJA5bIFtgDkAgXOQPHGBV4A8AIIJkEBzgWuAQACBdZA3XIFVgDcAG5A5boFkgDkAgXyQPHaBVYA8AIILkDxygX6APACBYpBAc4FegEAAEpA3ZIIJgDcAgVeQOXCBVIA5AIIMkDxzgW6APACBcpBAa4IggEAAgUCQN2qBaYA3AIF3kDlzgheAOQCBSZA8cIEMgDwAZJA8Z4FggDwAggCQQHCBT4BAACGQN2WCBoA3AIFakDl2gW+AOQCBcZA8c4FlgDwAgXuQPG2BcEBlS4A8AG1AADiQN2OBdoA3AIFqkDl2gXA8YxmAOQCBAjwAVZA8boFBgDwAgh+QPHCBcEBhM4A8AIEkQAAZkDdigT6ANwAykDlugXKAOQCBbpA8doQggDwAgTCQQHOBeYBAAIFnkDdngXaANwCBapA5d4FwPGUVgDkAcTwAapA8c4FIgDwAghiQPHeBcEBnOYA8AH9AADiQN2OBbYA3AIFzkDl3gXmAOQCBZ5A8doF9gDwAgWOQQHSCFIBAAIFMkDdtgVyANwCCBJA5dIEZgDkAV5A8aYNggDwAgZYA/y8A","tradicional_2-3_D.mid":"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","tradicional_3-2_A.mid":"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","tradicional_3-2_B.mid":"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","tradicional_3-2_C.mid":"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","tradicional_3-2_D.mid":"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"};function _(g){if(typeof globalThis.atob=="function"){const B=globalThis.atob(g),n=B.length,Q=new Uint8Array(n);for(let E=0;E<n;E+=1)Q[E]=B.charCodeAt(E);return Q}const A=globalThis.Buffer;if(typeof A=="function"){const B=A.from(g,"base64");return new Uint8Array(B.buffer,B.byteOffset,B.length)}throw new Error("El entorno actual no soporta decodificación base64.")}const t=new Map,Z=Object.keys(D);function U(g){const A=t.get(g);if(A)return A;const B=D[g];if(!B)throw new Error(`Archivo de loop desconocido: ${g}`);const n=_(B);return t.set(g,n),n}const e=self;let a=null,i=null;const s=new Set;async function W(){if(e.loadPyodide)return;const g="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs",A="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";let B=null;if(!e.loadPyodide)try{const n=await import(g);e.loadPyodide=n.loadPyodide}catch(n){B=n,console.warn("Fallo al importar Pyodide como módulo, intentando con importScripts.",n)}if(!e.loadPyodide&&typeof e.importScripts=="function")try{e.importScripts(A)}catch(n){B=n,console.warn("Fallo al cargar Pyodide mediante importScripts, intentando evaluar el bundle clásico.",n)}if(!e.loadPyodide){const Q=await(await fetch(A)).text();B&&console.warn("Fallo al inicializar Pyodide con los métodos estándar, evaluando el bundle clásico.",B),e.eval(Q)}}function r(g,A){if(!A)return;const B=A.split("/").filter(Boolean);let n="";for(const Q of B){n=n?`${n}/${Q}`:Q;try{g.FS.mkdir(n)}catch(E){const o=E==null?void 0:E.errno;if(o!==17&&o!==20)throw E}}}function c(g,A,B){const n=A.split("/").slice(0,-1).join("/");r(g,n),g.FS.writeFile(A,B,{encoding:"utf8"})}function u(g,A,B){const n=A.split("/").slice(0,-1).join("/");r(g,n),g.FS.writeFile(A,B)}async function f(g){a||(a=(async()=>{await W();const B=await e.loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"});await B.loadPackage(["micropip","numpy","scipy"]),await B.runPythonAsync(`import micropip
await micropip.install(["mido"])`);for(const[n,Q]of Object.entries(S))c(B,n,Q);for(const[n,Q]of Object.entries(h))c(B,n,Q);return await B.runPythonAsync(["import json, base64, os, tempfile","from pathlib import Path","from backend.montuno_core import CLAVES","from backend.montuno_core.generation import generate_montuno","from backend.utils import clean_tokens","","def _midi_to_base64(pm):",'    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as tmp:',"        pm.write(tmp.name)","        tmp.flush()","        tmp.seek(0)","        data = tmp.read()","    os.unlink(tmp.name)",'    return base64.b64encode(data).decode("ascii")',"","def web_generate(payload_json):","    params = json.loads(payload_json)",'    progression = clean_tokens(params.get("progression", ""))',"    if not progression:",'        raise ValueError("Ingresa una progresión de acordes")','    params["progression"] = progression','    clave_name = params.get("clave")',"    if clave_name not in CLAVES:",'        raise KeyError(f"Clave no soportada: {clave_name}")',"    clave_cfg = CLAVES[clave_name]",'    chords = params.get("chords", [])','    modo_por_acorde = [c.get("modo") for c in chords] if chords else None','    armonias_por_indice = [c.get("armonizacion") for c in chords] if chords else None','    octavas_por_indice = [c.get("octavacion") for c in chords] if chords else None','    inversiones_por_indice = [c.get("inversion") for c in chords] if chords else None','    manual_edits = params.get("manualEdits") or None',"    result = generate_montuno(","        progression,","        clave_config=clave_cfg,",'        modo_default=params.get("modoDefault"),',"        modo_por_acorde=modo_por_acorde,",'        armonizacion_default=params.get("armonizacionDefault"),',"        armonias_por_indice=armonias_por_indice,","        octavas_por_indice=octavas_por_indice,",'        octavacion_default=params.get("octavacionDefault", "Original"),','        variacion=params.get("variation"),','        inversion=params.get("inversionDefault"),','        reference_root=Path(params.get("referenceRoot")),',"        inversiones_por_indice=inversiones_por_indice,","        manual_edits=manual_edits,",'        seed=params.get("seed"),','        bpm=params.get("bpm", 120),',"        return_pm=True,","    )","    midi_b64 = _midi_to_base64(result.midi)","    return json.dumps({",'        "midi_base64": midi_b64,','        "modo_tag": result.modo_tag,','        "clave_tag": result.clave_tag,','        "max_eighths": result.max_eighths,','        "reference_files": [str(path) for path in result.reference_files],',"    })"].join(`
`)),B})());const A=await a;return await x(A),i||(i=A.globals.get("web_generate")),A}async function x(g){for(const A of Z){if(s.has(A))continue;const B=U(A);u(g,`backend/reference_midi_loops/${A}`,B),s.add(A)}}async function R(g){const{id:A,payload:B}=g;try{const{baseUrl:n,...Q}=B,E=await f(String(n??"/"));if(!i)throw new Error("Python bridge no inicializado");const o=await i(JSON.stringify(Q)),V=typeof o=="string"?o:o.toString();typeof o.destroy=="function"&&o.destroy();const b=JSON.parse(V);e.postMessage({id:A,success:!0,result:b})}catch(n){const Q=n instanceof Error?n.message:"No se pudo generar el montuno.";e.postMessage({id:A,success:!1,error:Q})}}e.onmessage=g=>{const A=g.data;A.type==="generate"&&R(A)}})();
