import { ESLint } from 'eslint'
import { describe, expect, test } from 'vitest'

// Prueba la regla no-restricted-syntax de eslint.config.js (AUTH-08): insertar
// HTML a mano debe fallar con punto y con cadena literal.
// Vitest corre en frontend/ (npm test --workspaces), donde está eslint.config.js.
const eslint = new ESLint({ cwd: process.cwd() })

async function errores(codigo: string): Promise<number> {
  const [resultado] = await eslint.lintText(codigo, {
    filePath: 'src/prueba.tsx',
  })
  return resultado.messages.filter(
    (mensaje) => mensaje.ruleId === 'no-restricted-syntax',
  ).length
}

const ANTES = `export function f(el: HTMLElement, html: string) {\n`
const DESPUES = `\n}\n`

describe('no-restricted-syntax prohíbe insertar HTML', () => {
  test.each([
    ['innerHTML con punto', 'el.innerHTML = html'],
    ['innerHTML con cadena', "el['innerHTML'] = html"],
    ['innerHTML con +=', 'el.innerHTML += html'],
    ['outerHTML con punto', 'el.outerHTML = html'],
    ['outerHTML con cadena', 'el["outerHTML"] = html'],
    [
      'insertAdjacentHTML con punto',
      "el.insertAdjacentHTML('beforeend', html)",
    ],
    [
      'insertAdjacentHTML con cadena',
      "el['insertAdjacentHTML']('beforeend', html)",
    ],
    [
      'insertAdjacentHTML con encadenamiento opcional',
      "el?.insertAdjacentHTML('beforeend', html)",
    ],
    [
      'dangerouslySetInnerHTML como atributo JSX',
      'return <div dangerouslySetInnerHTML={{ __html: html }} />',
    ],
    [
      'dangerouslySetInnerHTML dentro de props',
      'return <div {...{ dangerouslySetInnerHTML: { __html: html } }} />',
    ],
    [
      'dangerouslySetInnerHTML como clave con cadena',
      "return { 'dangerouslySetInnerHTML': { __html: html } }",
    ],
  ])('%s', async (_caso, linea) => {
    expect(await errores(ANTES + linea + DESPUES)).toBe(1)
  })

  test('no marca el código que muestra texto', async () => {
    const codigo = [
      'el.textContent = html',
      "el['textContent'] = html",
      'const visto = el.innerHTML',
      'return <p>{html}</p>',
    ].join('\n')
    expect(await errores(ANTES + codigo + DESPUES)).toBe(0)
  })
})
