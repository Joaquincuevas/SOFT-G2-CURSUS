import type { SeccionDashboard, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderConSesion } from '../test/sesion'

const seccion = (
  id: string,
  numero: number,
  codigo: string,
  nombre: string,
): SeccionDashboard => ({
  id,
  numero,
  curso: { id: `curso-${id}`, codigo, nombre },
  horario: [],
  alumnos: 10,
  pendientesRevision: 0,
})
const TRES = [
  seccion('s1', 1, 'ICC101', 'Introducción a la Programación'),
  seccion('s2', 2, 'ICC201', 'Estructuras de Datos'),
  seccion('s3', 1, 'ICC301', 'Bases de Datos'),
]
const resumen = (s: SeccionDashboard): SeccionResumen => ({
  id: s.id,
  numero: s.numero,
  curso: s.curso,
  periodo: { id: 'p', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: null,
  profesores: [],
  ayudantes: [],
})
const RUTA = '/api/dashboard/mis-secciones'

const menu = () =>
  within(screen.getByRole('navigation', { name: 'Navegación principal' }))
const cursos = async () =>
  within(await menu().findByRole('list', { name: 'Mis cursos' }))
const chevron = (codigo: string) =>
  menu().getByRole('button', { name: new RegExp(`las vistas de ${codigo}$`) })
const vistasAbiertas = () =>
  menu()
    .queryAllByRole('list', { name: /^Vistas de / })
    .map((l) => l.getAttribute('aria-label'))

describe('«Mis cursos» en el menú lateral', () => {
  test('en el Dashboard lista las secciones del período, todas colapsadas', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => TRES })
    const lista = await cursos()
    expect(menu().getByText('Mis cursos')).toBeInTheDocument()
    expect(
      lista
        .getAllByRole('link')
        .map((l) => [l.textContent, l.getAttribute('href')]),
    ).toEqual([
      [
        'ICC101 · Introducción a la ProgramaciónSección 1',
        '/mis-cursos/secciones/s1',
      ],
      ['ICC201 · Estructuras de DatosSección 2', '/mis-cursos/secciones/s2'],
      ['ICC301 · Bases de DatosSección 1', '/mis-cursos/secciones/s3'],
    ])
    expect(vistasAbiertas()).toEqual([])
    for (const codigo of ['ICC101', 'ICC201', 'ICC301'])
      expect(chevron(codigo)).toHaveAttribute('aria-expanded', 'false')
    // Va justo después del Dashboard.
    expect(menu().getAllByRole('link')[0]).toHaveTextContent('Dashboard')
  })

  test('con un solo curso queda abierto de partida', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => TRES.slice(0, 1) })
    await cursos()
    expect(vistasAbiertas()).toEqual(['Vistas de ICC101'])
  })

  test('dentro de un curso, ese queda abierto con su vista activa marcada', async () => {
    await renderConSesion('PROFESOR', '/mis-cursos/secciones/s2?vista=notas', {
      [RUTA]: () => TRES,
      '/api/espacio/secciones/s2/resumen': () => resumen(TRES[1]),
      '/api/espacio/secciones/s2/evaluaciones': () => ({
        evaluaciones: [],
        sumaPonderaciones: 0,
      }),
    })
    const vistas = within(
      await menu().findByRole('list', { name: 'Vistas de ICC201' }),
    )
    expect(vistasAbiertas()).toEqual(['Vistas de ICC201'])
    expect(vistas.getByRole('link', { name: 'Notas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(vistas.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  test('solo un curso abierto a la vez; el chevron solo abre y cierra, sin navegar', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => TRES })
    await cursos()
    fireEvent.click(chevron('ICC101'))
    expect(vistasAbiertas()).toEqual(['Vistas de ICC101'])
    fireEvent.click(chevron('ICC201'))
    expect(vistasAbiertas()).toEqual(['Vistas de ICC201'])
    expect(chevron('ICC101')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chevron('ICC201'))
    expect(vistasAbiertas()).toEqual([])
    // Sigue en el Dashboard.
    expect(
      screen.getByRole('heading', { level: 1, name: /^Bienvenido\/a/ }),
    ).toBeInTheDocument()
  })

  test('el nombre del curso lleva a su Home y lo abre', async () => {
    await renderConSesion('PROFESOR', '/', {
      [RUTA]: () => TRES,
      '/api/espacio/secciones/s3/resumen': () => resumen(TRES[2]),
    })
    fireEvent.click(
      (await cursos()).getByRole('link', { name: /^ICC301 · Bases de Datos/ }),
    )
    expect(
      await screen.findByRole('region', { name: 'Vista del curso' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(vistasAbiertas()).toEqual(['Vistas de ICC301']))
  })

  test('el nombre del curso actual lo vuelve a abrir aunque otro esté desplegado', async () => {
    await renderConSesion(
      'PROFESOR',
      '/mis-cursos/secciones/s1?vista=anuncios',
      {
        [RUTA]: () => TRES,
        '/api/espacio/secciones/s1/resumen': () => resumen(TRES[0]),
        '/api/espacio/secciones/s1/anuncios': () => [],
      },
    )
    await menu().findByRole('list', { name: 'Vistas de ICC101' })
    // Desde «Anuncios» de A se despliega B con su chevron.
    fireEvent.click(chevron('ICC201'))
    expect(vistasAbiertas()).toEqual(['Vistas de ICC201'])
    // El nombre de A lleva a su Home (misma sección) y lo vuelve a abrir.
    fireEvent.click(
      (await cursos()).getByRole('link', {
        name: /^ICC101 · Introducción a la Programación/,
      }),
    )
    await waitFor(() => expect(vistasAbiertas()).toEqual(['Vistas de ICC101']))
    expect(chevron('ICC201')).toHaveAttribute('aria-expanded', 'false')
    expect(
      within(menu().getByRole('list', { name: 'Vistas de ICC101' })).getByRole(
        'link',
        { name: 'Home' },
      ),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'ICC101 · Sección 1',
      }),
    ).toBeInTheDocument()
  })

  test('con el teclado: el nombre es un enlace y el chevron un botón que controla su lista', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => TRES })
    const lista = await cursos()
    const enlace = lista.getByRole('link', { name: /^ICC101/ })
    enlace.focus()
    expect(enlace).toHaveFocus()
    const boton = chevron('ICC101')
    expect(boton.tagName).toBe('BUTTON')
    boton.focus()
    expect(boton).toHaveFocus()
    fireEvent.click(boton)
    expect(document.getElementById(boton.getAttribute('aria-controls')!)).toBe(
      menu().getByRole('list', { name: 'Vistas de ICC101' }),
    )
  })

  test('con muchos cursos la lista se desplaza dentro del menú y el pie queda fijo', async () => {
    const muchos = Array.from({ length: 8 }, (_, i) =>
      seccion(`s${i + 1}`, 1, `ICC${i + 1}01`, `Curso ${i + 1}`),
    )
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => muchos })
    expect((await cursos()).getAllByRole('listitem')).toHaveLength(8)
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(nav.className).toContain('overflow-y-auto')
    expect(nav.className).toContain('min-h-0')
    // El pie (universidad y «Contraer menú») está fuera de la zona que se
    // desplaza.
    const contraer = screen.getByRole('button', { name: 'Contraer menú' })
    expect(nav.contains(contraer)).toBe(false)
  })

  test('con el menú contraído: iniciales con el nombre en un tooltip y las vistas en un panel', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => TRES })
    await cursos()
    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    const boton = menu().getByRole('button', {
      name: 'ICC201 · Estructuras de Datos (Sección 2)',
    })
    expect(boton).toHaveTextContent('ED')
    fireEvent.focus(boton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'ICC201 · Estructuras de Datos (Sección 2)',
    )
    fireEvent.click(boton)
    const panel = within(await screen.findByRole('dialog'))
    expect(panel.getByRole('link', { name: 'Anuncios' })).toHaveAttribute(
      'href',
      '/mis-cursos/secciones/s2?vista=anuncios',
    )
  })

  test.each(['AYUDANTE', 'ALUMNO'] as const)(
    '%s también tiene la lista',
    async (rol) => {
      await renderConSesion(rol, '/', {
        [rol === 'AYUDANTE'
          ? '/api/dashboard/secciones-ayudante'
          : '/api/dashboard/secciones-alumno']: () =>
          TRES.map((s) => ({
            ...s,
            profesor: null,
            profesores: [],
            anunciosNuevos: 0,
          })),
      })
      expect((await cursos()).getAllByRole('listitem')).toHaveLength(3)
      // Las vistas usan la etiqueta de su rol.
      fireEvent.click(chevron('ICC101'))
      expect(
        menu().getByRole('list', { name: 'Vistas de ICC101' }).lastElementChild
          ?.textContent,
      ).toBe('Académicos')
      if (rol === 'ALUMNO')
        // El alumno conserva su página «Mis Cursos», que encabeza la lista.
        expect(
          menu().getByRole('link', { name: 'Mis Cursos' }),
        ).toHaveAttribute('href', '/mis-cursos')
    },
  )

  test.each(['ADMINISTRATIVO', 'DIRECTOR'] as const)(
    '%s no tiene la lista de cursos',
    async (rol) => {
      await renderConSesion(rol, '/')
      await screen.findByRole('navigation', { name: 'Navegación principal' })
      expect(menu().queryByRole('list', { name: 'Mis cursos' })).toBeNull()
      expect(menu().queryByText('Mis cursos')).toBeNull()
    },
  )

  test('la lista del menú y el Dashboard comparten una sola carga', async () => {
    let pedidas = 0
    await renderConSesion('PROFESOR', '/', {
      [RUTA]: () => {
        pedidas++
        return TRES
      },
    })
    await cursos()
    await screen.findByRole('list', { name: 'Secciones del período activo' })
    expect(pedidas).toBe(1)
  })
})
