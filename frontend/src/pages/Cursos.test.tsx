import type { CursoCreado, OpcionCarrera, OpcionPeriodo } from '@cursus/shared'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const PERIODO = { id: 'periodo-2026-2', anio: 2026, semestre: 2 }

const CARRERAS: OpcionCarrera[] = [
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

// Rutas del formulario; `crear` responde POST /api/cursos.
const rutas = (crear: RutaSimulada): Record<string, RutaSimulada> => ({
  '/api/carreras': () => CARRERAS,
  '/api/periodos': () => PERIODOS,
  '/api/cursos': crear,
})

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

  test('al guardar vuelve a /cursos con el mensaje de éxito', async () => {
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

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Curso ICC101 creado.',
    )
    expect(
      screen.getByRole('region', { name: 'Gestión de cursos' }),
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
    await renderConSesion('DIRECTOR', '/cursos/nuevo')

    expect(
      await screen.findByRole('region', { name: 'Gestión de cursos' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Crear curso' }),
    ).not.toBeInTheDocument()
  })
})

test('/cursos muestra Crear curso a quien puede crear', async () => {
  await renderConSesion('ADMINISTRATIVO', '/cursos')
  expect(
    await screen.findByRole('link', { name: 'Crear curso' }),
  ).toHaveAttribute('href', '/cursos/nuevo')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
