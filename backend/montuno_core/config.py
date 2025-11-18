"""Static configuration shared between the desktop UI and the web core."""
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
        midi_prefix="salsa_2-3",
        primer_bloque=[3, 4, 4, 3],
        patron_repetido=[5, 4, 4, 3],
    ),
    "Clave 3-2": ClaveConfig(
        midi_prefix="salsa_3-2",
        primer_bloque=[3, 3, 5, 4],
        patron_repetido=[4, 3, 5, 4],
    ),
}


def get_clave_tag(config: ClaveConfig) -> str:
    """Return the short clave identifier used by reference MIDI filenames."""

    parts = config.midi_prefix.split("_", 1)
    return parts[1] if len(parts) > 1 else parts[0]
