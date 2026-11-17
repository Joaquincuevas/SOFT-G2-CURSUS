// Resumen de cobertura para el resumen del workflow de CI ($GITHUB_STEP_SUMMARY):
// una tabla en Markdown con las cuatro métricas de cada workspace, leídas de
// coverage/coverage-summary.json (reporter json-summary de Vitest).
import { existsSync, readFileSync } from 'node:fs'

const WORKSPACES = ['backend', 'frontend']
const METRICAS = [
  ['lines', 'Lines'],
  ['statements', 'Statements'],
  ['functions', 'Functions'],
  ['branches', 'Branches'],
]

const filas = WORKSPACES.map((workspace) => {
  const archivo = `${workspace}/coverage/coverage-summary.json`
  if (!existsSync(archivo)) {
    return `| ${workspace} | ${METRICAS.map(() => 'sin datos').join(' | ')} |`
  }
  const { total } = JSON.parse(readFileSync(archivo, 'utf8'))
  const celdas = METRICAS.map(([clave]) => `${total[clave].pct.toFixed(2)} %`)
  return `| ${workspace} | ${celdas.join(' | ')} |`
})

console.log(
  [
    '## Cobertura de los tests',
    '',
    `| Workspace | ${METRICAS.map(([, nombre]) => nombre).join(' | ')} |`,
    `| --- | ${METRICAS.map(() => '---').join(' | ')} |`,
    ...filas,
    '',
    'Mínimo exigido: 95 % de lines, statements y functions (ver "Tests y cobertura" en el README).',
  ].join('\n'),
)
