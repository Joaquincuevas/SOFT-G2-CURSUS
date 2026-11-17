import type { SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Introducción' },
  periodo: { id: 'p', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  horario: [],
  profesor: null,
  profesores: [],
  ayudantes: [],
}
const SECCION = '/api/espacio/secciones/seccion-1'
const rutas = (rol: SeccionResumen['rol']) => ({
  [`${SECCION}/resumen`]: () => ({ ...RESUMEN, rol }),
  [`${SECCION}/anuncios`]: () => [],
})
const migas = () =>
  within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
const pasos = () =>
  migas()
    .getAllByRole('listitem')
    .map((li) => li.textContent)

describe('breadcrumb del encabezado', () => {
  test('el alumno ve Inicio › Mis Cursos › sección › vista, y el último no es un enlace', async () => {
    await renderConSesion(
      'ALUMNO',
      '/mis-cursos/secciones/seccion-1?vista=anuncios',
      rutas('ALUMNO'),
    )
    expect(
      await migas().findByRole('link', { name: 'ICC101 · Sección 1' }),
    ).toHaveAttribute('href', '/mis-cursos/secciones/seccion-1')
    expect(pasos()).toEqual([
      'Inicio',
      'Mis Cursos',
      'ICC101 · Sección 1',
      'Anuncios',
    ])
    expect(migas().getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(migas().getByRole('link', { name: 'Mis Cursos' })).toHaveAttribute(
      'href',
      '/mis-cursos',
    )
    // El último paso es el h1 y la página actual: sin enlace.
    expect(migas().queryByRole('link', { name: 'Anuncios' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Anuncios',
    )
    expect(migas().getByText('Anuncios')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('en el Home de la sección el último paso es la sección', async () => {
    await renderConSesion(
      'ALUMNO',
      '/mis-cursos/secciones/seccion-1',
      rutas('ALUMNO'),
    )
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'ICC101 · Sección 1',
      }),
    ).toBeInTheDocument()
    expect(pasos()).toEqual(['Inicio', 'Mis Cursos', 'ICC101 · Sección 1'])
  })

  test.each(['PROFESOR', 'AYUDANTE'] as const)(
    '%s no pasa por Mis Cursos, que no existe para su rol',
    async (rol) => {
      await renderConSesion(
        rol,
        '/mis-cursos/secciones/seccion-1?vista=notas',
        {
          ...rutas(rol),
          [`${SECCION}/evaluaciones`]: () => ({
            evaluaciones: [],
            sumaPonderaciones: 0,
          }),
        },
      )
      await migas().findByRole('link', { name: 'ICC101 · Sección 1' })
      expect(pasos()).toEqual(['Inicio', 'ICC101 · Sección 1', 'Notas'])
    },
  )

  test('mientras carga muestra un esqueleto corto y nunca el id', async () => {
    await renderConSesion('PROFESOR', '/mis-cursos/secciones/seccion-1', {
      [`${SECCION}/resumen`]: () => new Promise(() => {}),
    })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByRole('status')).toHaveTextContent('Cargando…')
    expect(nav).not.toHaveTextContent('seccion-1')
    expect(document.querySelector('header [data-slot=skeleton]')).not.toBeNull()
  })

  test('un nombre largo se trunca y su texto completo está en el enlace', async () => {
    const largo =
      'Introducción a la Programación Avanzada de Sistemas Distribuidos'
    await renderConSesion(
      'ALUMNO',
      '/mis-cursos/secciones/seccion-1?vista=material',
      {
        ...rutas('ALUMNO'),
        [`${SECCION}/resumen`]: () => ({
          ...RESUMEN,
          curso: { ...RESUMEN.curso, codigo: largo },
        }),
        [`${SECCION}/materiales`]: () => [],
      },
    )
    const enlace = await migas().findByRole('link', {
      name: `${largo} · Sección 1`,
    })
    expect(enlace.className).toContain('truncate')
    fireEvent.focus(enlace)
    fireEvent.pointerMove(enlace)
    expect(enlace).toHaveTextContent(largo)
  })

  test.each([
    ['DIRECTOR', '/cursos'],
    ['ADMINISTRATIVO', '/carreras'],
    ['ALUMNO', '/mis-cursos'],
  ] as const)('%s: Inicio apunta al Dashboard de su rol', async (rol, ruta) => {
    await renderConSesion(rol, ruta, {
      '/api/superadmin/universidades': () => json([]),
    })
    expect(
      await migas().findByRole('link', { name: 'Inicio' }),
    ).toHaveAttribute('href', '/')
  })

  test('en pantallas angostas queda «‹ paso anterior» como enlace de vuelta', async () => {
    await renderConSesion(
      'ALUMNO',
      '/mis-cursos/secciones/seccion-1?vista=anuncios',
      rutas('ALUMNO'),
    )
    await migas().findByRole('link', { name: 'ICC101 · Sección 1' })
    const volver = screen.getByRole('link', {
      name: 'Paso anterior: ICC101 · Sección 1',
    })
    expect(volver).toHaveAttribute('href', '/mis-cursos/secciones/seccion-1')
    expect(volver.className).toContain('sm:hidden')
  })
})
