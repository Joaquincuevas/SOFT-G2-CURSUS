import type { SeccionAlumno } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { renderConSesion } from '../test/sesion'

const ALUMNO_RUTA = '/api/dashboard/secciones-alumno'

const ICC101 = {
  id: 'curso-icc101',
  codigo: 'ICC101',
  nombre: 'Introducción a la Programación',
}
const ICC201 = {
  id: 'curso-icc201',
  codigo: 'ICC201',
  nombre: 'Estructuras de Datos',
}
const HORARIO = [
  { dia: 1 as const, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
]

const ALUMNO: SeccionAlumno[] = [
  {
    id: 's-101-1',
    numero: 1,
    curso: ICC101,
    horario: HORARIO,
    profesor: { id: 'p', nombre: 'Profesor Norte' },
    profesores: ['Profesor Norte'],
    anunciosNuevos: 0,
  },
  {
    id: 's-201-2',
    numero: 2,
    curso: ICC201,
    horario: [],
    profesor: null,
    profesores: [],
    anunciosNuevos: 1,
  },
]

const abrir = async (ruta: string, datos: unknown) => {
  await renderConSesion('ALUMNO', '/mis-cursos', { [ruta]: () => datos })
  return within(await screen.findByRole('region', { name: 'Mis cursos' }))
}
const encabezados = () =>
  within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .map((c) => c.textContent?.trim())
describe('Mis cursos del Profesor y del Ayudante', () => {
  test.each<['PROFESOR' | 'AYUDANTE', string]>([
    ['PROFESOR', 'Bienvenido/a, Profesor Norte'],
    ['AYUDANTE', 'Bienvenido/a, Ayudante Norte'],
  ])(
    '%s: /mis-cursos redirige al Dashboard, con replace',
    async (rol, titulo) => {
      await renderConSesion(rol, '/mis-cursos')
      expect(
        await screen.findByRole('heading', { level: 1, name: titulo }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('table')).toBeNull()
      // replace: Atrás no vuelve a /mis-cursos (ni redirige otra vez).
      window.history.back()
      expect(screen.queryByRole('region', { name: 'Mis cursos' })).toBeNull()
    },
  )

  test('las rutas hijas siguen abiertas para el Profesor', async () => {
    await renderConSesion('PROFESOR', '/mis-cursos/pendientes-revision', {
      '/api/dashboard/pendientes-revision': () => [],
    })
    expect(
      await screen.findByRole('region', { name: 'Pendientes de revisión' }),
    ).toBeInTheDocument()
  })
})

describe('Mis cursos del Alumno', () => {
  test('lista sus cursos con horario, profesor y «Inscrito como»', async () => {
    const pagina = await abrir(ALUMNO_RUTA, ALUMNO)
    await pagina.findByRole('table')
    expect(encabezados()).toEqual([
      'Curso',
      'Sección',
      'Período',
      'Horario y sala',
      'Profesores',
      'Inscrito como',
    ])
    expect(
      within(screen.getByRole('table')).getAllByText('Alumno'),
    ).toHaveLength(2)
    expect(
      screen.getByText('Lunes 08:30–10:00 · Sala A-101'),
    ).toBeInTheDocument()
  })

  test('conserva el acceso al historial de notas como botón', async () => {
    const pagina = await abrir(ALUMNO_RUTA, ALUMNO)
    await pagina.findByRole('table')
    expect(
      pagina.getByRole('link', { name: 'Historial de notas' }),
    ).toHaveAttribute('href', '/mis-cursos/historial')
    expect(pagina.queryByText(/pendientes de revisión/)).toBeNull()
  })

  test('sin inscripciones muestra el estado vacío', async () => {
    await abrir(ALUMNO_RUTA, [])
    expect(
      await screen.findByText('No tienes inscripciones en el período activo.'),
    ).toBeInTheDocument()
  })

  test('con error ofrece reintentar', async () => {
    let intentos = 0
    await renderConSesion('ALUMNO', '/mis-cursos', {
      [ALUMNO_RUTA]: () =>
        ++intentos === 1 ? new Response(null, { status: 500 }) : ALUMNO,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  test('busca por código, nombre o sección, sin importar tildes, y se limpia', async () => {
    const pagina = await abrir(ALUMNO_RUTA, ALUMNO)
    await pagina.findByRole('table')
    const buscar = pagina.getByRole('searchbox', { name: 'Buscar' })
    const filas = () =>
      within(screen.getByRole('table')).getAllByRole('row').length - 1
    fireEvent.change(buscar, { target: { value: 'introduccion' } })
    expect(filas()).toBe(1)
    expect(screen.getByText('1 curso')).toBeInTheDocument()
    fireEvent.change(buscar, { target: { value: 'zzz' } })
    expect(
      screen.getByText('No hay cursos con esa búsqueda.'),
    ).toBeInTheDocument()
    fireEvent.click(
      pagina.getAllByRole('button', { name: 'Limpiar búsqueda' }).at(-1)!,
    )
    expect(buscar).toHaveValue('')
    expect(screen.getByText('2 cursos')).toBeInTheDocument()
  })
})
