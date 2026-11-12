import type { NotaFinal } from '@cursus/shared'

// Notas con un decimal y coma, como en Chile (5,0).
export const FORMATO_NOTA = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

// NOT-14 (RE-02): el backend calcula la nota; aquí solo se muestra igual
// para el alumno y el profesor.
export function textoNotaFinal({
  tipo,
  nota,
  porcentajeEvaluado,
}: NotaFinal): string {
  if (nota === null) return 'Sin notas publicadas'
  const valor = FORMATO_NOTA.format(nota)
  return tipo === 'FINAL'
    ? `Nota final ${valor}`
    : `Nota parcial ${valor} (${porcentajeEvaluado} % evaluado)`
}
