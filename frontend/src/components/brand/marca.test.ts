/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// La ruta va en una variable para que Vite no la trate como un asset.
const raiz = '../../../'
const ruta = (archivo: string) => new URL(raiz + archivo, import.meta.url)
const html = readFileSync(ruta('index.html'), 'utf8')

describe('favicon y metadatos', () => {
  test('el título, el color del navegador y los íconos están en index.html', () => {
    expect(html).toContain('<title>CURSUS</title>')
    expect(html).toContain('<meta name="theme-color" content="#1b4f72" />')
    expect(html).toContain(
      'rel="icon" type="image/svg+xml" href="/favicon.svg"',
    )
    expect(html).toContain('sizes="32x32" href="/favicon-32.png"')
    expect(html).toContain(
      'rel="apple-touch-icon" href="/apple-touch-icon.png"',
    )
  })

  test.each([
    'public/favicon.svg',
    'public/favicon-32.png',
    'public/apple-touch-icon.png',
    'public/icon-192.png',
    'public/icon-512.png',
    'public/brand/cursus-isotipo-azul.png',
    'public/brand/cursus-isotipo-blanco.png',
    'src/assets/cursus-isotipo.svg',
  ])('%s existe', (archivo) => {
    expect(existsSync(ruta(archivo))).toBe(true)
  })

  test('el favicon lleva el azul fijo de CURSUS: no hereda el tema', () => {
    const svg = readFileSync(ruta('public/favicon.svg'), 'utf8')
    expect(svg).toContain('fill="#1b4f72"')
    expect(svg).not.toContain('currentColor')
  })

  test('el SVG de origen sigue con currentColor', () => {
    const svg = readFileSync(ruta('src/assets/cursus-isotipo.svg'), 'utf8')
    expect(svg).toContain('fill="currentColor"')
  })
})
