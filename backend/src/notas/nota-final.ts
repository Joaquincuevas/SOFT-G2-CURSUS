import { SUMA_PONDERACIONES_REQUERIDA, type NotaFinal } from '@cursus/shared'

// Una evaluación activa de la sección con la nota publicada del alumno, o
// null si aún no la tiene.
export interface NotaPonderada {
  ponderacion: number
  nota: number | null
}

// NOT-14 (RE-02): única regla de la nota final; la usan mis-notas (alumno) y
// notas-finales (profesor), para que ambos vean lo mismo.
//
// - nota: promedio ponderado de las notas publicadas, sobre el porcentaje
//   evaluado, redondeado a un decimal (5,05 → 5,1).
// - FINAL: todas las evaluaciones activas tienen nota publicada y las
//   ponderaciones suman 100 (RN-10/NOT-02). Si no, PARCIAL.
//
// Las notas tienen un decimal y las ponderaciones son enteras: el cálculo va
// en décimas con enteros, sin errores de redondeo de punto flotante.
export function calcularNotaFinal(evaluaciones: NotaPonderada[]): NotaFinal {
  let ponderacionTotal = 0
  let porcentajeEvaluado = 0
  let sumaDecimas = 0
  for (const { ponderacion, nota } of evaluaciones) {
    ponderacionTotal += ponderacion
    if (nota === null) continue
    porcentajeEvaluado += ponderacion
    sumaDecimas += Math.round(nota * 10) * ponderacion
  }
  const completa =
    evaluaciones.length > 0 &&
    porcentajeEvaluado === ponderacionTotal &&
    ponderacionTotal === SUMA_PONDERACIONES_REQUERIDA
  return {
    tipo: completa ? 'FINAL' : 'PARCIAL',
    nota:
      porcentajeEvaluado === 0
        ? null
        : // Redondeo a la décima más cercana, la mitad hacia arriba.
          Math.floor(
            (2 * sumaDecimas + porcentajeEvaluado) / (2 * porcentajeEvaluado),
          ) / 10,
    porcentajeEvaluado,
  }
}
