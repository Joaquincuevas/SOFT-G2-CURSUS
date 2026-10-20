import type { CursoDetalle, CursoListado } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const PERIODO = { id: 'periodo-2026-2', anio: 2026, semestre: 2 }
const SECCION = {
  horario: null,
  profesor: null,
  ayudantes: [],
  alumnos: 0,
}

const CURSO: CursoDetalle = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Introducción a la Programación',
  carreraNombre: 'Ingeniería Civil en Informática',
  periodo: PERIODO,
  secciones: [
    { id: 'seccion-1', numero: 1, ...SECCION },
    { id: 'seccion-2', numero: 2, ...SECCION },
  ],
}

const ruta = (respuesta: RutaSimulada): Record<string, RutaSimulada> => ({
  '/api/cursos/curso-1': respuesta,
})

const filasDe = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((fila) =>
      within(fila)
        .getAllByRole('cell')
        .map((celda) => celda.textContent),
    )

describe('detalle de un curso', () => {
  test('muestra los datos del curso y sus secciones', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => CURSO),
    )

    expect(
      await screen.findByRole('heading', {
        name: 'ICC101 · Introducción a la Programación',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Ingeniería Civil en Informática · Período 2026-2'),
    ).toBeInTheDocument()
    const tabla = screen.getByRole('table', { name: 'Secciones' })
    expect(
      within(tabla)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Sección', 'Horario', 'Profesor', 'Ayudantes', 'Alumnos'])
    // Lo que todavía no se asigna aparece como "Sin asignar", y alumnos en 0.
    expect(filasDe(tabla)).toEqual([
      ['1', 'Sin asignar', 'Sin asignar', 'Sin asignar', '0'],
      ['2', 'Sin asignar', 'Sin asignar', 'Sin asignar', '0'],
    ])
  })

  test('Editar curso sigue deshabilitado con "Próximamente"', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => CURSO),
    )

    const editar = await screen.findByRole('button', { name: 'Editar curso' })
    expect(editar).toHaveAttribute('aria-disabled', 'true')
    expect(editar).toHaveAttribute('title', 'Próximamente')
    const crear = screen.getByRole('button', { name: 'Crear sección' })
    expect(crear).not.toHaveAttribute('aria-disabled')
    expect(crear).not.toHaveAttribute('title')
  })

  test('el Director ve el detalle sin acciones y con la universidad', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/cursos/curso-1',
      ruta(() => ({ ...CURSO, universidadNombre: 'Universidad Demo Sur' })),
    )

    expect(
      await screen.findByText(
        'Universidad Demo Sur · Ingeniería Civil en Informática · Período 2026-2',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar curso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Crear sección' })).toBeNull()
  })

  test('sin secciones muestra el estado vacío', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => ({ ...CURSO, secciones: [] })),
    )

    expect(
      await screen.findByText('Este curso aún no tiene secciones.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  test('un curso que no existe muestra el 404 con vuelta al listado', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => json({ statusCode: 404, message: 'El curso no existe' }, 404)),
    )

    expect(
      await screen.findByRole('heading', { name: 'Curso no encontrado' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← Volver a cursos' }),
    ).toHaveAttribute('href', '/cursos')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  test('si falla, muestra el error y reintenta', async () => {
    let fallar = true
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => (fallar ? new Response(null, { status: 500 }) : CURSO)),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el curso.',
    )
    fallar = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('table', { name: 'Secciones' }),
    ).toBeInTheDocument()
  })
})

describe('crear una sección (GES-09)', () => {
  const NUEVA = { id: 'seccion-3', numero: 3, ...SECCION }
  const conCreacion = (crear: RutaSimulada) => ({
    ...ruta(() => CURSO),
    '/api/cursos/curso-1/secciones': crear,
  })

  test('crea la sección y la agrega a la tabla con un aviso', async () => {
    let pedidosDelCurso = 0
    let metodo: string | undefined
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => {
        pedidosDelCurso++
        return CURSO
      },
      '/api/cursos/curso-1/secciones': (init) => {
        metodo = init?.method
        return json(NUEVA, 201)
      },
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Crear sección' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sección 3 creada.',
    )
    expect(
      filasDe(screen.getByRole('table', { name: 'Secciones' })).map(
        ([numero]) => numero,
      ),
    ).toEqual(['1', '2', '3'])
    expect(metodo).toBe('POST')
    // Sin volver a pedir el curso.
    expect(pedidosDelCurso).toBe(1)
  })

  test('el botón se deshabilita mientras se crea', async () => {
    let responder: (respuesta: Response) => void = () => {}
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      conCreacion(
        () =>
          new Promise<Response>((resolve) => {
            responder = resolve
          }),
      ),
    )

    const boton = await screen.findByRole('button', { name: 'Crear sección' })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).toBeDisabled())
    responder(json(NUEVA, 201))
    await waitFor(() => expect(boton).toBeEnabled())
  })

  test('si falla, muestra un error y no agrega nada', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      conCreacion(() => new Response(null, { status: 500 })),
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Crear sección' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo crear la sección.',
    )
    expect(
      filasDe(screen.getByRole('table', { name: 'Secciones' })),
    ).toHaveLength(2)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

test('cada curso del listado enlaza a su detalle', async () => {
  const LISTADO: CursoListado = {
    id: 'curso-1',
    codigo: 'ICC101',
    nombre: 'Introducción a la Programación',
    carreraNombre: 'Ingeniería Civil en Informática',
    periodo: PERIODO,
    secciones: 2,
  }
  await renderConSesion('ADMINISTRATIVO', '/cursos', {
    '/api/cursos': () => [LISTADO],
    '/api/cursos/curso-1': () => CURSO,
  })

  fireEvent.click(await screen.findByRole('link', { name: 'ICC101' }))
  expect(
    await screen.findByRole('table', { name: 'Secciones' }),
  ).toBeInTheDocument()
})
