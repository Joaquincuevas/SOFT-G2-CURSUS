import type {
  Carrera,
  CursoCreado,
  CursoListado,
  OpcionPeriodo,
} from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const PERIODO = { id: 'periodo-2026-2', anio: 2026, semestre: 2 }

const CARRERAS: Carrera[] = [
  { id: 'carrera-1', nombre: 'Ingeniería Civil en Informática' },
]
// La API devuelve el período activo primero.
const PERIODOS: OpcionPeriodo[] = [
  { ...PERIODO, activo: true },
  { id: 'periodo-2026-1', anio: 2026, semestre: 1, activo: false },
]

const CURSO: CursoCreado = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Introducción a la Programación',
  carreraNombre: 'Ingeniería Civil en Informática',
  periodo: PERIODO,
}

const LISTADO: CursoListado = { ...CURSO, secciones: 0 }

// Rutas del formulario; `crear` responde POST /api/cursos. GET /api/cursos
// lista los cursos creados con éxito.
function rutas(crear: RutaSimulada): Record<string, RutaSimulada> {
  let listado: CursoListado[] = []
  return {
    '/api/carreras': () => CARRERAS,
    '/api/periodos': () => PERIODOS,
    '/api/cursos': (init) => {
      if (init?.method !== 'POST') return listado
      const respuesta = crear(init)
      if (respuesta instanceof Response && respuesta.ok) listado = [LISTADO]
      return respuesta
    },
  }
}

async function llenarYEnviar() {
  fireEvent.change(await screen.findByLabelText('Código'), {
    target: { value: 'icc101' },
  })
  fireEvent.change(screen.getByLabelText('Nombre del curso'), {
    target: { value: 'Introducción a la Programación' },
  })
  fireEvent.change(screen.getByLabelText('Carrera'), {
    target: { value: 'carrera-1' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear curso' }))
}

describe('crear curso', () => {
  test('los cuatro campos son obligatorios y el período activo viene elegido', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/nuevo',
      rutas(() => json(CURSO, 201)),
    )

    for (const campo of [
      'Código',
      'Nombre del curso',
      'Carrera',
      'Período académico',
    ]) {
      expect(await screen.findByLabelText(campo)).toBeRequired()
    }
    expect(screen.getByLabelText('Período académico')).toHaveValue(
      'periodo-2026-2',
    )
    expect(screen.getByLabelText('Carrera')).toHaveValue('')
  })

  test('al guardar vuelve a /cursos con el mensaje y el curso en el listado', async () => {
    const enviados: unknown[] = []
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/nuevo',
      rutas((init) => {
        enviados.push(JSON.parse(String(init?.body)))
        return json(CURSO, 201)
      }),
    )
    await llenarYEnviar()

    expect(await screen.findByText('Curso ICC101 creado.')).toHaveAttribute(
      'role',
      'status',
    )
    expect(
      await screen.findByRole('cell', {
        name: 'Introducción a la Programación',
      }),
    ).toBeInTheDocument()
    expect(enviados).toEqual([
      {
        codigo: 'icc101',
        nombre: 'Introducción a la Programación',
        carreraId: 'carrera-1',
        periodoId: 'periodo-2026-2',
      },
    ])
  })

  test('muestra el mensaje del 409 en el formulario', async () => {
    const mensaje =
      'Ya existe un curso con el código ICC101 en el período 2026-2'
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/nuevo',
      rutas(() => json({ statusCode: 409, message: mensaje }, 409)),
    )
    await llenarYEnviar()

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    // Sigue en el formulario, con lo que escribió.
    expect(screen.getByLabelText('Código')).toHaveValue('icc101')
    expect(screen.getByRole('button', { name: 'Crear curso' })).toBeEnabled()
  })

  test('si las listas no cargan, muestra el error y reintenta', async () => {
    let fallar = true
    await renderConSesion('ADMINISTRATIVO', '/cursos/nuevo', {
      '/api/carreras': () =>
        fallar ? new Response(null, { status: 500 }) : CARRERAS,
      '/api/periodos': () => PERIODOS,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las carreras y los períodos.',
    )
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('Carrera')).toBeInTheDocument()
  })

  test('sin permiso para crear, vuelve a /cursos', async () => {
    // El Director lee Gestión académica pero no puede crear cursos.
    await renderConSesion('DIRECTOR', '/cursos/nuevo', {
      '/api/cursos': () => [],
    })

    expect(
      await screen.findByRole('region', { name: 'Gestión de cursos' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Crear curso' }),
    ).not.toBeInTheDocument()
  })
})

describe('listado de cursos', () => {
  const columnas = async () =>
    within(await screen.findByRole('table'))
      .getAllByRole('columnheader')
      .map((th) => th.textContent)

  test('el Administrativo ve la tabla y el botón Crear curso', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos', {
      '/api/cursos': () => [LISTADO],
    })

    expect(await columnas()).toEqual([
      'Código',
      'Curso',
      'Carrera',
      'Período',
      'Secciones',
    ])
    expect(
      screen.getByRole('row', {
        name: 'ICC101 Introducción a la Programación Ingeniería Civil en Informática 2026-2 0',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Facultad de Ingeniería · Período 2026-2'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear curso' })).toHaveAttribute(
      'href',
      '/cursos/nuevo',
    )
  })

  test('el Director ve la columna Universidad y ningún botón para crear', async () => {
    await renderConSesion('DIRECTOR', '/cursos', {
      '/api/cursos': () => [
        { ...LISTADO, universidadNombre: 'Universidad Demo Sur' },
      ],
    })

    expect((await columnas())[0]).toBe('Universidad')
    expect(
      screen.getByRole('cell', { name: 'Universidad Demo Sur' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Crear curso' }),
    ).not.toBeInTheDocument()
  })

  test('sin cursos muestra el estado vacío con Crear curso', async () => {
    await renderConSesion('ADMINISTRATIVO', '/cursos', {
      '/api/cursos': () => [],
    })

    expect(
      await screen.findByText('Aún no hay cursos en tu facultad.'),
    ).toBeInTheDocument()
    // Un solo botón: el del estado vacío.
    expect(screen.getAllByRole('link', { name: 'Crear curso' })).toHaveLength(1)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('el estado vacío no ofrece Crear curso sin permiso', async () => {
    await renderConSesion('DIRECTOR', '/cursos', { '/api/cursos': () => [] })

    expect(
      await screen.findByText('Aún no hay cursos en tu facultad.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Crear curso' }),
    ).not.toBeInTheDocument()
  })

  test('si el listado falla, muestra el error y reintenta', async () => {
    let fallar = true
    await renderConSesion('ADMINISTRATIVO', '/cursos', {
      '/api/cursos': () =>
        fallar ? new Response(null, { status: 500 }) : [LISTADO],
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los cursos.',
    )
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})
