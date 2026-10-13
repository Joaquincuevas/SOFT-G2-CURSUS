// Formatter de commitlint: usa el formato por defecto y, si hay errores,
// agrega el formato esperado y la lista de tipos y ámbitos válidos.
import { createRequire } from 'node:module'
import format from '@commitlint/format'

const { TYPES, SCOPES } = createRequire(import.meta.url)(
  './commitlint.config.js',
)

export default function formatter(report, options) {
  const output = format(report, options)
  if (report.valid) return output

  const help = [
    'Formato esperado: <tipo>(<ámbito>): <descripción>',
    '  - el ámbito es opcional:  <tipo>: <descripción>',
    '  - un solo ámbito; si el cambio es transversal, se omite',
    '  - descripción en minúsculas y sin punto final',
    '',
    `Tipos válidos:   ${TYPES.join(', ')}`,
    `Ámbitos válidos: ${SCOPES.join(', ')}`,
    '',
    'Ejemplo: feat(notas): agrega ingreso de notas por evaluación',
    '',
  ].join('\n')

  return `${output}\n${help}`
}
