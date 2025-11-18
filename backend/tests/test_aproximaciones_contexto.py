from backend import salsa


def test_marcadores_actualizan_aproximaciones():
    progresion = "[ ] Am7 | E7 | [Bb C#] Dm7 | A7 | [ ] C"
    asignaciones, _, aproximaciones = salsa.procesar_progresion_salsa(progresion)

    assert aproximaciones[0] == ["D", "F", "A", "B"]
    assert aproximaciones[1] == ["D", "F", "A", "B"]
    assert aproximaciones[2] == ["C#", "F", "A", "Bb"]
    assert aproximaciones[3] == ["C#", "F", "A", "Bb"]
    assert aproximaciones[4] == ["D", "F", "A", "B"]


def test_preparar_aproximaciones_usa_naturales_por_defecto():
    aproximaciones = salsa._preparar_aproximaciones(None, 3)

    assert len(aproximaciones) == 3
    assert all(item["notas"] == ["D", "F", "A", "B"] for item in aproximaciones)
