import type { UsuarioSesion } from '@cursus/shared'
import { describe, expect, test } from 'vitest'
import { usuarioDePrueba } from '../test/sesion'
import { migasDe } from './migas'

const alumno = usuarioDePrueba('ALUMNO')
const profesor = usuarioDePrueba('PROFESOR')
const ayudante = usuarioDePrueba('AYUDANTE')
const admin = usuarioDePrueba('ADMINISTRATIVO')
const director = usuarioDePrueba('DIRECTOR')
const egresado: UsuarioSesion = { ...alumno, egresado: true }
const INICIO = { etiqueta: 'Inicio', to: '/' }

describe('pasos fijos (salen de navigation.ts)', () => {
  test('el Dashboard es un solo paso, sin camino', () => {
    expect(migasDe('/', profesor)).toEqual([
      { etiqueta: 'Bienvenido/a, Profesor Norte' },
    ])
    expect(migasDe('/', director)).toEqual([
      { etiqueta: 'Visión del Directorio' },
    ])
  })

  test.each([
    [director, '/cursos', 'Gestión académica'],
    [admin, '/cursos', 'Gestión académica'],
    [director, '/indicadores', 'Indicadores'],
    [director, '/accesos', 'Registro de accesos'],
    [director, '/universidades', 'Universidades'],
    [admin, '/carreras', 'Carreras'],
    [admin, '/periodos', 'Períodos académicos'],
    [admin, '/docentes', 'Profesores y ayudantes'],
    [admin, '/reporte-facultad', 'Reporte académico'],
    [alumno, '/mis-cursos', 'Mis Cursos'],
    [profesor, '/perfil', 'Mi perfil'],
    [usuarioDePrueba('SUPERADMIN'), '/superadmin', 'Administrar universidad'],
  ])(
    '%#: una sección del menú cuelga de Inicio y termina en su título',
    (usuario, ruta, titulo) => {
      expect(migasDe(ruta, usuario)).toEqual([INICIO, { etiqueta: titulo }])
    },
  )

  test('una ruta que no existe es la 404', () => {
    expect(migasDe('/no-existe', profesor)).toEqual([
      { etiqueta: 'Página no encontrada' },
    ])
  })

  test('el egresado solo tiene su historial, sin Inicio', () => {
    expect(migasDe('/mis-cursos/historial', egresado)).toEqual([
      { etiqueta: 'Mis Cursos' },
    ])
  })
})

describe('pasos con nombre propio', () => {
  test('el historial del alumno cuelga de Mis Cursos', () => {
    expect(migasDe('/mis-cursos/historial', alumno)).toEqual([
      INICIO,
      { etiqueta: 'Mis Cursos', to: '/mis-cursos' },
      { etiqueta: 'Historial' },
    ])
  })

  test('los pendientes del profesor cuelgan de Inicio', () => {
    expect(migasDe('/mis-cursos/pendientes-revision', profesor)).toEqual([
      INICIO,
      { etiqueta: 'Pendientes' },
    ])
  })

  test('crear un curso y los archivados cuelgan de la gestión de cursos', () => {
    const gestion = { etiqueta: 'Gestión académica', to: '/cursos' }
    expect(migasDe('/cursos/nuevo', admin)).toEqual([
      INICIO,
      gestion,
      { etiqueta: 'Nuevo curso' },
    ])
    expect(migasDe('/cursos/archivados', admin)).toEqual([
      INICIO,
      gestion,
      { etiqueta: 'Cursos archivados' },
    ])
  })

  test('comparar universidades cuelga de Indicadores', () => {
    expect(migasDe('/indicadores/comparar', director)).toEqual([
      INICIO,
      { etiqueta: 'Indicadores', to: '/indicadores' },
      { etiqueta: 'Comparar universidades' },
    ])
  })
})

describe('pasos dinámicos (los aporta la página)', () => {
  test('el curso de una sección: el alumno pasa por Mis Cursos; el profesor y el ayudante, no', () => {
    const cola = [{ etiqueta: 'ICC101 · Sección 1' }]
    expect(migasDe('/mis-cursos/secciones/abc', alumno, cola)).toEqual([
      INICIO,
      { etiqueta: 'Mis Cursos', to: '/mis-cursos' },
      { etiqueta: 'ICC101 · Sección 1' },
    ])
    for (const docente of [profesor, ayudante])
      expect(migasDe('/mis-cursos/secciones/abc', docente, cola)).toEqual([
        INICIO,
        { etiqueta: 'ICC101 · Sección 1' },
      ])
  })

  test('la vista abierta del curso es el último paso y la sección pasa a ser un enlace', () => {
    const cola = [
      { etiqueta: 'ICC101 · Sección 1', to: '/mis-cursos/secciones/abc' },
      { etiqueta: 'Anuncios' },
    ]
    expect(migasDe('/mis-cursos/secciones/abc', alumno, cola)).toEqual([
      INICIO,
      { etiqueta: 'Mis Cursos', to: '/mis-cursos' },
      { etiqueta: 'ICC101 · Sección 1', to: '/mis-cursos/secciones/abc' },
      { etiqueta: 'Anuncios' },
    ])
  })

  test('mientras el nombre carga queda un paso sin etiqueta (esqueleto), nunca el id', () => {
    expect(migasDe('/mis-cursos/secciones/abc', profesor)).toEqual([
      INICIO,
      { etiqueta: null },
    ])
    expect(migasDe('/cursos/uuid-123', admin)).toEqual([
      INICIO,
      { etiqueta: 'Gestión académica', to: '/cursos' },
      { etiqueta: null },
    ])
  })

  test('un curso y su edición', () => {
    const gestion = { etiqueta: 'Gestión académica', to: '/cursos' }
    expect(
      migasDe('/cursos/c1', admin, [{ etiqueta: 'ICC101 · Intro' }]),
    ).toEqual([INICIO, gestion, { etiqueta: 'ICC101 · Intro' }])
    expect(
      migasDe('/cursos/c1/editar', admin, [
        { etiqueta: 'ICC101 · Intro', to: '/cursos/c1' },
        { etiqueta: 'Editar' },
      ]),
    ).toEqual([
      INICIO,
      gestion,
      { etiqueta: 'ICC101 · Intro', to: '/cursos/c1' },
      { etiqueta: 'Editar' },
    ])
  })

  test('los integrantes de una sección cuelgan del curso, que cuelga de la gestión', () => {
    expect(
      migasDe('/secciones/s1/integrantes', admin, [
        { etiqueta: 'ICC101 · Sección 1', to: '/cursos/c1' },
        { etiqueta: 'Integrantes' },
      ]),
    ).toEqual([
      INICIO,
      { etiqueta: 'Gestión académica', to: '/cursos' },
      { etiqueta: 'ICC101 · Sección 1', to: '/cursos/c1' },
      { etiqueta: 'Integrantes' },
    ])
  })

  test('un curso archivado cuelga de la lista de archivados', () => {
    expect(
      migasDe('/cursos/archivados/a1', admin, [{ etiqueta: 'ICC101 · Intro' }]),
    ).toEqual([
      INICIO,
      { etiqueta: 'Gestión académica', to: '/cursos' },
      { etiqueta: 'Cursos archivados', to: '/cursos/archivados' },
      { etiqueta: 'ICC101 · Intro' },
    ])
  })

  test('el historial de un curso anterior cuelga del historial', () => {
    expect(
      migasDe('/mis-cursos/historial/s1', alumno, [
        { etiqueta: 'ICC101 · Intro' },
      ]),
    ).toEqual([
      INICIO,
      { etiqueta: 'Mis Cursos', to: '/mis-cursos' },
      { etiqueta: 'Historial', to: '/mis-cursos/historial' },
      { etiqueta: 'ICC101 · Intro' },
    ])
  })

  test('el drill-down de Indicadores: la página aporta Indicadores con el período y no se repite', () => {
    const cola = [
      { etiqueta: 'Indicadores', to: '/indicadores?periodo=2026-1' },
      { etiqueta: 'Universidad Demo Norte', to: '/x' },
      { etiqueta: 'Facultad de Ingeniería', to: '/y' },
      { etiqueta: 'Ingeniería Civil', to: '/z' },
      { etiqueta: 'ICO201' },
    ]
    expect(
      migasDe(
        '/indicadores/universidades/u/facultades/f/carreras/c/cursos/k',
        director,
        cola,
      ),
    ).toEqual([INICIO, ...cola])
    expect(
      migasDe('/indicadores/universidades/u', director).map((m) => m.etiqueta),
    ).toEqual(['Inicio', 'Indicadores', null])
  })

  test('la universidad que administra el superadmin cuelga de su panel', () => {
    expect(
      migasDe('/superadmin/universidades/u1', usuarioDePrueba('SUPERADMIN'), [
        { etiqueta: 'Universidad Demo Norte' },
      ]),
    ).toEqual([
      INICIO,
      { etiqueta: 'Administrar universidad', to: '/superadmin' },
      { etiqueta: 'Universidad Demo Norte' },
    ])
  })
})
