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


def test_marcadores_se_mantienen_hasta_ser_reemplazados():
    progresion = "[ ] Am7 | E7 | Am7 | [Bb C#] Dm7 | A7 | [ ] Fmaj7 | [Ab] G7 | [ ] C |"

    _, _, aproximaciones = salsa.procesar_progresion_salsa(progresion)

    assert aproximaciones == [
        ["D", "F", "A", "B"],
        ["D", "F", "A", "B"],
        ["D", "F", "A", "B"],
        ["C#", "F", "A", "Bb"],
        ["C#", "F", "A", "Bb"],
        ["D", "F", "A", "B"],
        ["D", "F", "Ab", "B"],
        ["D", "F", "A", "B"],
    ]
