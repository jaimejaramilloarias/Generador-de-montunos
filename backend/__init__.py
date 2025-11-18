"""Backend package exposing the montuno generation core."""

from . import midi_common, midi_utils, salsa, style_utils, utils, voicings
from .montuno_core import CLAVES, ClaveConfig, MontunoGenerateResult, generate_montuno, get_clave_tag

__all__ = [
    "CLAVES",
    "ClaveConfig",
    "MontunoGenerateResult",
    "generate_montuno",
    "get_clave_tag",
    "midi_common",
    "midi_utils",
    "salsa",
    "style_utils",
    "utils",
    "voicings",
]
