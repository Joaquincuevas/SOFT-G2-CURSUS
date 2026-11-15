import { describe, expect, test } from 'vitest'

// UIX-01: jsdom no trae estas APIs y los componentes de Radix las usan. El
// setup las agrega; si alguien lo cambia, estas pruebas lo dicen antes de que
// falle un componente.
describe('polyfills de jsdom para Radix', () => {
  test('ResizeObserver se puede crear y usar', () => {
    const observador = new ResizeObserver(() => {})
    const nodo = document.createElement('div')
    expect(() => {
      observador.observe(nodo)
      observador.unobserve(nodo)
      observador.disconnect()
    }).not.toThrow()
  })

  test('captura del puntero', () => {
    const nodo = document.createElement('div')
    expect(nodo.hasPointerCapture(1)).toBe(false)
    expect(() => {
      nodo.setPointerCapture(1)
      nodo.releasePointerCapture(1)
    }).not.toThrow()
  })

  test('scrollIntoView', () => {
    expect(() => document.createElement('div').scrollIntoView()).not.toThrow()
  })

  test('matchMedia responde que no coincide', () => {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    expect(consulta.matches).toBe(false)
    expect(() => consulta.addEventListener('change', () => {})).not.toThrow()
  })
})
