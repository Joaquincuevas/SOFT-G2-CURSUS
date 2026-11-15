import type { UsuarioSesion } from '@cursus/shared'
import { describe, expect, test } from 'vitest'
import { usuarioDePrueba } from '../test/sesion'
import { migasDe } from './migas'

const alumno = usuarioDePrueba('ALUMNO')
const profesor = usuarioDePrueba('PROFESOR')
const egresado: UsuarioSesion = { ...alumno, egresado: true }

describe('breadcrumb por ruta', () => {
  test('el Dashboard es un solo paso, sin camino', () => {
    expect(migasDe('/', profesor)).toEqual([
      { etiqueta: 'Bienvenido/a, Profesor Norte' },
    ])
    expect(migasDe('/', usuarioDePrueba('DIRECTOR'))).toEqual([
      { etiqueta: 'Visión del Directorio' },
    ])
  })

  test('una sección del menú cuelga de Inicio y termina en su título', () => {
    expect(migasDe('/mis-cursos', profesor)).toEqual([
      { etiqueta: 'Inicio', to: '/' },
      { etiqueta: 'Mis Cursos' },
    ])
    expect(migasDe('/cursos', usuarioDePrueba('DIRECTOR'))).toEqual([
      { etiqueta: 'Inicio', to: '/' },
      { etiqueta: 'Gestión académica' },
    ])
  })

  test('las subrutas de una sección usan el título del ítem', () => {
    expect(migasDe('/indicadores/universidades/u-1', profesor).at(-1)).toEqual({
      etiqueta: 'Indicadores',
    })
  })

  test('la sección de un curso cuelga de Inicio y lleva el nombre que aporta la página', () => {
    expect(
      migasDe('/mis-cursos/secciones/abc', profesor, 'ICC101 · Sección 1'),
    ).toEqual([
      { etiqueta: 'Inicio', to: '/' },
      { etiqueta: 'ICC101 · Sección 1' },
    ])
    // Mientras carga, no hay nombre: un paso genérico.
    expect(migasDe('/mis-cursos/secciones/abc', profesor).at(-1)).toEqual({
      etiqueta: 'Sección',
    })
  })

  test('el historial cuelga de Mis Cursos y no repite el título de la página', () => {
    expect(migasDe('/mis-cursos/historial', alumno)).toEqual([
      { etiqueta: 'Inicio', to: '/' },
      { etiqueta: 'Mis Cursos', to: '/mis-cursos' },
      { etiqueta: 'Historial' },
    ])
    expect(migasDe('/mis-cursos/pendientes-revision', profesor)).toEqual([
      { etiqueta: 'Inicio', to: '/' },
      { etiqueta: 'Pendientes' },
    ])
  })

  test('el egresado no tiene Inicio: solo su historial', () => {
    expect(migasDe('/mis-cursos/historial', egresado)).toEqual([
      { etiqueta: 'Mis Cursos' },
    ])
  })

  test('una ruta que no existe es la 404', () => {
    expect(migasDe('/no-existe', profesor)).toEqual([
      { etiqueta: 'Página no encontrada' },
    ])
  })

  test('solo el último paso carece de enlace', () => {
    for (const ruta of ['/mis-cursos', '/perfil', '/mis-cursos/historial']) {
      const migas = migasDe(ruta, alumno)
      expect(migas.slice(0, -1).every((m) => m.to)).toBe(true)
      expect(migas.at(-1)?.to).toBeUndefined()
    }
  })
})
