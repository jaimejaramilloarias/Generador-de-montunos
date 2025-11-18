from pathlib import Path

import pretty_midi

from backend import midi_utils_tradicional


def test_exportar_montuno_writes_file(tmp_path):
    midi_ref = Path("backend/reference_midi_loops/tradicional_2-3_A.mid")
    output = tmp_path / "out.mid"

    voicings = [[60, 64, 67, 71]]
    asignaciones = [("C∆", list(range(8)), "Octavas")]

    result = midi_utils_tradicional.exportar_montuno(
        midi_ref,
        voicings,
        asignaciones,
        num_compases=1,
        output_path=output,
        armonizacion="Octavas",
        octavaciones=["Octavas"],
        return_pm=True,
    )

    assert output.exists()
    assert output.stat().st_size > 0
    assert isinstance(result, pretty_midi.PrettyMIDI)
