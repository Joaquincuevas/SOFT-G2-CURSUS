import type { CursoDetalle, CursoListado } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const PERIODO = { id: 'periodo-2026-2', anio: 2026, semestre: 2 }
const SECCION = {
  horario: null,
  profesor: null,
  profesores: [],
  profesorId: null,
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
  test('pide confirmación y muestra qué notas faltan antes de poder cerrar', async () => {
    const fecha = '2026-12-15T18:00:00Z'
    const cerrar = vi
      .fn<RutaSimulada>()
      .mockReturnValueOnce(
        json(
          {
            message: 'Hay requisitos pendientes para cerrar el curso.',
            ponderaciones: [
              { seccion: 1, sumaPonderaciones: 120, faltan: 0, sobran: 20 },
            ],
            pendientes: [
              {
                evaluacionId: 'prueba',
                nombre: 'Prueba 1',
                seccion: 2,
                notasPendientes: 2,
              },
            ],
          },
          409,
        ),
      )
      .mockReturnValueOnce(json({ fecha, responsableId: 'admin' }))
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      ...ruta(() => CURSO),
      '/api/cursos/curso-1/cierre': cerrar,
    })

    const iniciar = await screen.findByRole('button', { name: 'Cerrar curso' })
    fireEvent.click(iniciar)
    expect(screen.getByText(/no se puede deshacer/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(cerrar).not.toHaveBeenCalled()
    fireEvent.click(iniciar)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sección 2 · Prueba 1 · 2 notas sin publicar',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sección 1 · Las ponderaciones suman 120 %. Sobran 20 puntos porcentuales',
    )
    expect(cerrar.mock.calls[0][0]?.method).toBe('POST')

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }))
    expect(await screen.findByText(/Curso cerrado el/)).toHaveTextContent(
      'Curso cerrado el',
    )
    expect(screen.queryByRole('button', { name: 'Cerrar curso' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Archivar curso' })).toBeVisible()
    expect(cerrar).toHaveBeenCalledTimes(2)
  })

  test('archiva un curso cerrado después de confirmar y vuelve al listado', async () => {
    const archivar = vi.fn<RutaSimulada>(
      () => new Response(null, { status: 204 }),
    )
    await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
      ...ruta(() => ({
        ...CURSO,
        cierre: { fecha: '2026-12-15T18:00:00Z', responsableId: 'admin' },
      })),
      '/api/cursos/curso-1/archivar': archivar,
      '/api/cursos': () => [],
    })
    const iniciar = await screen.findByRole('button', {
      name: 'Archivar curso',
    })
    fireEvent.click(iniciar)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(archivar).not.toHaveBeenCalled()
    fireEvent.click(iniciar)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar archivo' }))
    expect(await screen.findByText('Curso ICC101 archivado.')).toBeVisible()
    expect(archivar).toHaveBeenCalledTimes(1)
    expect(archivar.mock.calls[0][0]?.method).toBe('PATCH')
    expect(screen.queryByText(/Introducción a la Programación/)).toBeNull()
  })

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
    expect(screen.queryByRole('button', { name: 'Archivar curso' })).toBeNull()
    const tabla = screen.getByRole('table', { name: 'Secciones' })
    expect(
      within(tabla)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Sección',
      'Horario',
      'Profesores',
      'Ayudantes',
      'Alumnos',
      'Acciones',
    ])
    // Lo que todavía no se asigna aparece como "Sin asignar", y la columna
    // Acciones conserva profesores (GES-25), alumnos, CSV, ayudantes y
    // horario.
    const ACCIONES = 'IntegrantesAsignar horario'
    expect(filasDe(tabla)).toEqual([
      ['1', 'Sin asignar', 'Sin asignar', 'Sin asignar', '0', ACCIONES],
      ['2', 'Sin asignar', 'Sin asignar', 'Sin asignar', '0', ACCIONES],
    ])
  })

  test('Editar curso enlaza al formulario de edición', async () => {
    await renderConSesion(
      'ADMINISTRATIVO',
      '/cursos/curso-1',
      ruta(() => CURSO),
    )

    const editar = await screen.findByRole('link', { name: 'Editar curso' })
    expect(editar).toHaveAttribute('href', '/cursos/curso-1/editar')
    const crear = screen.getByRole('button', { name: 'Crear sección' })
    expect(crear).not.toHaveAttribute('aria-disabled')
    expect(crear).not.toHaveAttribute('title')
  })

  test('el Director ve el detalle sin acciones y con la universidad', async () => {
    await renderConSesion(
      'DIRECTOR',
      '/cursos/curso-1',
      ruta(() => ({
        ...CURSO,
        universidadNombre: 'Universidad Demo Sur',
        cierre: { fecha: '2026-12-15T18:00:00Z', responsableId: 'admin' },
      })),
    )

    expect(
      await screen.findByText(
        'Universidad Demo Sur · Ingeniería Civil en Informática · Período 2026-2',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar curso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Crear sección' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cerrar curso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archivar curso' })).toBeNull()
    // Sin la columna Acciones (GES-12, GES-13 y GES-15).
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(screen.queryByRole('button', { name: /profesor/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Agregar alumno/ })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Asignar ayudantes/ }),
    ).toBeNull()
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

describe('profesores en el detalle del curso (GES-12 y GES-25)', () => {
  test('la tabla muestra a todos los profesores de cada sección', async () => {
    await renderConSesion('DIRECTOR', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => ({
        ...CURSO,
        secciones: [
          {
            id: 'seccion-1',
            numero: 1,
            ...SECCION,
            profesor: 'Camila Rojas',
            profesores: ['Camila Rojas', 'Matías Muñoz'],
            profesorId: 'profesor-1',
          },
          { id: 'seccion-2', numero: 2, ...SECCION },
        ],
      }),
    })

    const tabla = await screen.findByRole('table', { name: 'Secciones' })
    expect(filasDe(tabla).map((fila) => fila[2])).toEqual([
      'Camila Rojas, Matías Muñoz',
      'Sin asignar',
    ])
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

// GES-25: con un backend anterior (deploy desfasado) la respuesta no trae
// profesores; se usa el campo deprecado en vez de fallar.
describe('compatibilidad con un backend anterior (GES-25)', () => {
  test('sin profesores, muestra el profesor deprecado', async () => {
    const anterior: Record<string, unknown> = {
      id: 'seccion-1',
      numero: 1,
      ...SECCION,
      profesor: 'Camila Rojas',
      profesorId: 'profesor-1',
    }
    delete anterior.profesores
    await renderConSesion('DIRECTOR', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => ({ ...CURSO, secciones: [anterior] }),
    })
    const tabla = await screen.findByRole('table', { name: 'Secciones' })
    expect(filasDe(tabla).map((fila) => fila[2])).toEqual(['Camila Rojas'])
  })
})
