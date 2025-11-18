from backend import salsa


def test_aproximacion_se_ajusta_a_vecino_con_misma_letra():
    asignaciones = [('B7', [], '', None), ('C', [], '', None)]
    aproximaciones = salsa._preparar_aproximaciones([None, None], asignaciones)

    assert aproximaciones[0]["notas"][0] == "C"
    assert aproximaciones[0]["notas"][1] == "Fb"


def test_aproximacion_prefiere_vecino_con_misma_letra():
    asignaciones = [('F', [], '', None), ('E7', [], '', None), ('G', [], '', None)]
    aproximaciones = salsa._preparar_aproximaciones([None, None, None], asignaciones)

    assert aproximaciones[1]["notas"][0] == "F"


def test_aproximacion_ajusta_sin_letra_coincidente():
    asignaciones = [('B7', [], '', None), ('D', [], '', None)]
    aproximaciones = salsa._preparar_aproximaciones([None, None], asignaciones)

    assert aproximaciones[0]["notas"][0] == "D"
