# -*- coding: utf-8 -*-
# salsa.py
from pathlib import Path
from typing import List, Tuple, Dict, Optional, Set, Iterable
import pretty_midi

import re

from .voicings import INTERVALOS_TRADICIONALES, parsear_nombre_acorde
from .midi_utils import (
    _grid_and_bpm,
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
# change occurs at the beginning of the pattern.  Set to ``True`` to keep the
# current behaviour.  When ``False``, approach notes remain unchanged.
CONVERTIR_APROX_A_ESTRUCT = True


def _normalizar_token_nota(token: str) -> str:
    token = token.strip()
    if not token:
        return ""
    return token[0].upper() + token[1:]


def _normalizar_nota_tonal(token: str) -> Optional[str]:
    token = _normalizar_token_nota(token)
    if not token:
        return None
    if len(token) >= 2 and token[1] in {"b", "#"}:
        base = token[:2].upper()
        resto = token[2:]
    else:
        base = token[0].upper()
        resto = token[1:]
    return base + resto


def _parsear_cifrado_seguro(cifrado: str) -> Tuple[int, str]:
    try:
        return parsear_nombre_acorde(cifrado)
    except ValueError:
        base = re.sub(r"maj", "∆", cifrado, flags=re.IGNORECASE)
        base = re.sub(r"(9|11|13)$", "", base)
        return parsear_nombre_acorde(base)


def _prefer_flat_names(cifrado: str) -> bool:
    root_symbol = re.match(r"^[A-G](b|#)?", cifrado)
    if not root_symbol:
        return False
    return "b" in root_symbol.group(0)


def _pc_to_note(pc: int, use_flats: bool) -> str:
    pc = pc % 12
    flat_names = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    sharp_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    names = flat_names if use_flats else sharp_names
    return names[pc]


def _detalles_intervalos(cifrado: str) -> Tuple[int, List[int]]:
    root, suf = _parsear_cifrado_seguro(cifrado)
    return root, INTERVALOS_TRADICIONALES[suf]


def _calcular_aproximaciones_default(cifrado: str) -> List[str]:
    """Devuelve las 4 notas de aproximación (2, 4, 6, 7) según las reglas nuevas."""

    root, ints = _detalles_intervalos(cifrado)
    text = cifrado.lower()
    third = ints[1] if len(ints) > 1 else 4
    fifth = ints[2] if len(ints) > 2 else 7
    seventh = ints[3] if len(ints) > 3 else None

    has_b9 = "b9" in text
    has_sharp9 = "#9" in text or "+9" in text
    has_natural_9 = "9" in text and not has_b9 and not has_sharp9

    if has_b9:
        second_int = 1
    elif has_sharp9:
        second_int = 3
    elif has_natural_9:
        second_int = 2
    else:
        second_int = 2

    fifth_simple = fifth - (ints[0] if ints else 0)
    use_flats = _prefer_flat_names(cifrado) or has_b9 or fifth_simple == 6

    minor_third = third - (ints[0] if ints else 0) == 3 or "m7(b5)" in text or "ø" in text or "º" in text
    fourth_int = 5 if minor_third else 6
    if fifth_simple == 6:
        sixth_int = 8
    elif fifth_simple == 8:
        sixth_int = 8
    else:
        sixth_int = 9

    if seventh is not None or "7" in text:
        seventh_int = seventh if seventh is not None else 10
    else:
        seventh_int = 10

    pcs = [second_int, fourth_int, sixth_int, seventh_int]
    return [_pc_to_note(root + interval, use_flats) for interval in pcs]


def get_default_approach_notes_for_chord(cifrado: str) -> List[str]:
    """Wrapper público para exponer las 4 aproximaciones por acorde."""

    return _calcular_aproximaciones_default(cifrado)


def _normalizar_lista_aproximaciones(raw: Optional[Iterable[str]], defaults: List[str]) -> List[str]:
    if raw is None:
        return defaults
    cleaned: List[str] = []
    for token in raw:
        norm = _normalizar_nota_tonal(str(token))
        if norm:
            cleaned.append(norm)
    if len(cleaned) < 4:
        cleaned.extend(defaults[len(cleaned) :])
    return cleaned[:4]


def _preparar_aproximaciones(
    aproximaciones_por_acorde: Optional[List[Optional[List[str]]]],
    asignaciones: List[Tuple[str, List[int], str, Optional[str]]],
) -> List[Dict[str, object]]:
    aproximaciones: List[Dict[str, object]] = []
    for idx, (cifrado, _, _, _) in enumerate(asignaciones):
        defaults = _calcular_aproximaciones_default(cifrado)
        raw = aproximaciones_por_acorde[idx] if aproximaciones_por_acorde and idx < len(aproximaciones_por_acorde) else None
        notas = _normalizar_lista_aproximaciones(raw, defaults)
        aproximaciones.append({"tokens": set(APPROACH_NOTES), "notas": notas})
    return aproximaciones


def _pitch_classes_en_acorde(cifrado: str) -> Set[int]:
    """Devuelve las clases de altura del acorde indicado."""

    try:
        root, suf = parsear_nombre_acorde(cifrado)
    except ValueError:
        base = re.sub(r"maj", "∆", cifrado, flags=re.IGNORECASE)
        base = re.sub(r"(9|11|13)$", "", base)
        root, suf = parsear_nombre_acorde(base)

    return {(root + interval) % 12 for interval in INTERVALOS_TRADICIONALES[suf]}


def _ajustar_a_estructural_mas_cercano(note_name: str, cifrado: str, pitch: int) -> int:
    """Devuelve la fundamental, tercera o quinta más cercana a ``pitch``."""

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
    """Return the octave displacement encoded in ``label``."""

    if not label:
        return 0
    etiqueta = label.lower().strip()
    if etiqueta == "octava arriba":
        return 12
    if etiqueta == "octava abajo":
        return -12
    return 0


def _ajustar_rango_flexible(prev_pitch: Optional[int], pitch: int) -> int:
    """Coloca ``pitch`` lo más cerca posible de ``prev_pitch``.

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

    candidatos: List[int] = []
    for offset in range(-2, 3):
        candidato = pitch + 12 * offset
        while candidato < RANGO_BAJO_MIN:
            candidato += 12
        while candidato > RANGO_BAJO_MAX:
            candidato -= 12
        candidatos.append(candidato)

    objetivo = RANGO_BAJO_MAX
    return min(candidatos, key=lambda nota: (abs(nota - objetivo), -nota))


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
    """Selecciona la inversión con la voz grave más cercana a ``anterior``.

    Si la voz grave previa pertenece al acorde actual, se reutiliza como bajo.
    ``offset_octava`` permite incorporar el desplazamiento manual de registro en
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


def _intervalo_por_nota_aproximacion(
    role: str, root: int, aproximaciones: Dict[str, object], defaults: List[str]
) -> int:
    notes = aproximaciones.get("notas") if isinstance(aproximaciones, dict) else None
    notas = notes if isinstance(notes, list) else defaults
    index_map = {"2": 0, "4": 1, "6": 2, "7": 3}
    idx = index_map[role]
    nota_objetivo = notas[idx] if idx < len(notas) else defaults[idx]
    pc_map = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    pc = pc_map.get(nota_objetivo, 0)
    return (pc - root) % 12


def traducir_nota(
    note_name: str, cifrado: str, aproximaciones: Optional[Dict[str, object]] = None
) -> Tuple[int, bool]:
    """Traduce ``note_name`` según las reglas del modo salsa."""

    root, suf = _parsear_cifrado_seguro(cifrado)
    ints = INTERVALOS_TRADICIONALES[suf]
    approx_cfg: Dict[str, object] = aproximaciones or {}
    approx_tokens = set(APPROACH_NOTES)
    if isinstance(aproximaciones, dict):
        tokens = aproximaciones.get("tokens")
        if isinstance(tokens, set) and tokens:
            approx_tokens = approx_tokens.union(tokens)

    name = note_name[:-1]
    octave = int(note_name[-1])

    def midi(interval: int) -> int:
        return root + interval + 12 * (octave + 1)

    es_aprox = name in approx_tokens
    interval = None

    third = ints[1] if len(ints) > 1 else 4
    fifth = ints[2] if len(ints) > 2 else 7
    seventh = ints[3] if len(ints) > 3 else None

    aprox_default = _calcular_aproximaciones_default(cifrado)

    def intervalo_aprox(role: str) -> int:
        return _intervalo_por_nota_aproximacion(role, root, approx_cfg, aprox_default)

    if name == "C":
        interval = 0
    elif name == "E":
        interval = 5 if "sus" in suf else third
    elif name == "G":
        interval = fifth
    elif name == "D":
        interval = intervalo_aprox("2")
        es_aprox = True
    elif name == "C#":
        interval = intervalo_aprox("2")
        es_aprox = True
    elif name == "D#":
        interval = intervalo_aprox("2")
        es_aprox = True
    elif name == "F":
        interval = intervalo_aprox("4")
        es_aprox = True
    elif name == "A":
        interval = intervalo_aprox("6")
        es_aprox = True
    elif name == "G#":
        interval = intervalo_aprox("6")
        es_aprox = True
    elif name == "B":
        if suf.endswith("6") and "7" not in suf and seventh is None:
            interval = 11
            es_aprox = False
        else:
            interval = intervalo_aprox("7")
            es_aprox = True
    else:
        return pretty_midi.note_name_to_number(note_name), es_aprox

    return midi(interval), es_aprox


def _extraer_grupos_con_nombres(
    posiciones_base: List[dict], total_cor_ref: int, grid_seg: float
) -> List[List[dict]]:
    """Agrupa ``posiciones_base`` por corchea conservando el nombre."""

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
                raise ValueError("% no puede ir en el primer comp\u00e1s")
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
        """Return ``(chord, inversion)`` parsed from ``token``.

        The global ``arm_actual`` is updated if the token contains a
        harmonisation marker.  ``inversion`` may be ``None`` if no forced
        inversion was found.
        """

        nonlocal arm_actual
        inversion: Optional[str] = None

        arm_map = {
            "8": "Octavas",
            "15": "Doble octava",
            "10": "D\u00e9cimas",
            "13": "Treceavas",
        }

        while True:
            # Strip optional mode/style token (e.g. ``[TRAD]``)
            m = re.match(r"^\[[A-Z]+\](.*)$", token)
            if m:
                token = m.group(1)
                if not token:
                    return None, inversion
                continue

            m = re.match(r"^\((8|10|13|15)\)(.*)$", token)
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
    aproximaciones_por_acorde: Optional[List[Optional[List[str]]]] = None,
    register_offsets: Optional[List[int]] = None,
) -> Optional[pretty_midi.PrettyMIDI]:
    """Genera montuno estilo salsa enlazando acordes e inversiones.

    ``inversion_inicial`` determina la posición del primer acorde y guía el
    enlace de los siguientes. ``inicio_cor`` indica la corchea global donde
    comienza este segmento para que la plantilla se alinee siempre con la
    progresión completa.
    """
    # Procesa la progresión. Cada compás puede contener uno o dos acordes
    if asignaciones_custom is None:
        asignaciones, _ = procesar_progresion_salsa(
            progresion_texto, inicio_cor=inicio_cor
        )
    else:
        asignaciones = asignaciones_custom

    octavaciones = octavaciones_custom or [octavacion_default or "Original"] * len(
        asignaciones
    )
    aproximaciones = _preparar_aproximaciones(aproximaciones_por_acorde, asignaciones)

    # --------------------------------------------------------------
    # Selección de la inversión para cada acorde enlazando la voz grave
    # o usando la lista proporcionada por la interfaz
    # --------------------------------------------------------------
    offsets_registro = register_offsets or []

    def _offset_registro(idx: int) -> int:
        if 0 <= idx < len(offsets_registro) and offsets_registro[idx] is not None:
            return offsets_registro[idx] * 12
        return 0

    if inversiones_manual is None:
        inversiones = []
        voz_grave_anterior = None
        bajos_objetivo: Dict[int, int] = {}
        for idx, (cifrado, _, _, inv_forzado) in enumerate(asignaciones):
            octava = _offset_octavacion(octavaciones[idx])
            if idx == 0:
                inv = inv_forzado or inversion_inicial
                base_pitch = get_bass_pitch(cifrado, inv) + octava + _offset_registro(idx)
                pitch = _ajustar_rango_flexible(voz_grave_anterior, base_pitch)
            else:
                if inv_forzado:
                    inv = inv_forzado
                    base_pitch = get_bass_pitch(cifrado, inv) + octava + _offset_registro(idx)
                    pitch = _ajustar_rango_flexible(voz_grave_anterior, base_pitch)
                else:
                    inv, pitch = seleccionar_inversion(
                        voz_grave_anterior, cifrado, octava + _offset_registro(idx)
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
            base_pitch = get_bass_pitch(cifrado, inv) + octava + _offset_registro(idx)
            pitch = base_pitch
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
                pitch, _ = traducir_nota(pos["name"], acorde, aproximaciones[idx])
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
        traducciones = []
        comienzo = asignaciones[idx_acorde][1][0]
        for pos in grupos_act[inv][ref_idx]:
            pitch_base, es_aprox = traducir_nota(
                pos["name"], acorde, aproximaciones[idx_acorde]
            )
            pitch_ajustado = pitch_base
            if CONVERTIR_APROX_A_ESTRUCT and es_aprox and cor == comienzo:
                pitch_ajustado = _ajustar_a_estructural_mas_cercano(
                    pos["name"], cifrado=acorde, pitch=pitch_base
                )
            traducciones.append(
                {
                    "pos": pos,
                    "pitch_base": pitch_base,
                    "pitch_ajustado": pitch_ajustado,
                    "pc": pos["name"][:-1],
                }
            )

        deltas_por_pc: Dict[str, int] = {}
        for trad in traducciones:
            delta = trad["pitch_ajustado"] - trad["pitch_base"]
            pc = trad["pc"]
            if pc not in deltas_por_pc or (deltas_por_pc[pc] == 0 and delta != 0):
                deltas_por_pc[pc] = delta

        for trad in traducciones:
            pos = trad["pos"]
            delta = deltas_por_pc.get(trad["pc"], 0)
            pitch = trad["pitch_base"] + delta

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
