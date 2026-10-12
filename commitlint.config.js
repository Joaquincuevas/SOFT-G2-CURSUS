// Convención de commits del proyecto. Es la fuente única para el hook local
// (.husky/commit-msg) y para el job commitlint del CI. Si cambias TYPES o
// SCOPES, actualiza también .github/workflows/pr-title.yml y el README.

const TYPES = [
  'feat',
  'fix',
  'docs',
  'refactor',
  'test',
  'style',
  'chore',
  'ci',
]

// Un ámbito por épica del tablero
const SCOPES = [
  'infra',
  'auth',
  'multitenant',
  'ui',
  'gestion',
  'perfil',
  'espacio',
  'notas',
  'materiales',
  'anuncios',
  'asistencia',
  'metricas',
  'historial',
  'seguridad',
  'exportacion',
  'observabilidad',
]

module.exports = {
  extends: ['@commitlint/config-conventional'],
  formatter: './commitlint.formatter.mjs',
  helpUrl:
    'https://github.com/Joaquincuevas/SOFT-G2-CURSUS/blob/develop/README.md#conventional-commits',
  rules: {
    'type-enum': [2, 'always', TYPES],
    'scope-enum': [2, 'always', SCOPES],
    // El ámbito es opcional para cambios transversales
    'scope-empty': [0],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
  },
  TYPES,
  SCOPES,
}
