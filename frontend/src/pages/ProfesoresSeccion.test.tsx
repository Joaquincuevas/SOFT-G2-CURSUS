import type {
  CursoDetalle,
  ProfesorAsignable,
  ProfesorQuitado,
  ProfesorResumen,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const CURSO: CursoDetalle = {
  id: 'curso-1',
  codigo: 'ICC101',
  nombre: 'Programación',
  carreraNombre: 'Informática',
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  secciones: [
    {
      id: 'seccion-1',
      numero: 1,
      horario: null,
      profesor: 'Ana Profesora',
      profesores: ['Ana Profesora'],
      profesorId: 'profesor-1',
      ayudantes: [],
      alumnos: 0,
    },
  ],
}
const ANA: ProfesorResumen = {
  id: 'profesor-1',
  nombre: 'Ana Profesora',
  correo: 'ana@norte.cursus.test',
}
const BRUNO: ProfesorResumen = {
  id: 'profesor-2',
  nombre: 'Bruno Docente',
  correo: 'bruno@norte.cursus.test',
}
const opciones = (asignados: string[]): ProfesorAsignable[] =>
  [ANA, BRUNO].map((p) => ({ ...p, asignado: asignados.includes(p.id) }))

const RUTA = '/api/secciones/seccion-1/profesores'

async function abrir(rutas: Record<string, RutaSimulada>) {
  await renderConSesion('ADMINISTRATIVO', '/cursos/curso-1', {
    '/api/cursos/curso-1': () => CURSO,
    ...rutas,
  })
  fireEvent.click(
    await screen.findByRole('button', { name: 'Profesores de la sección 1' }),
  )
  return within(
    await screen.findByRole('dialog', { name: 'Profesores de la sección 1' }),
  )
}

const filaDeLaTabla = () =>
  within(screen.getByRole('table', { name: 'Secciones' }))
    .getAllByRole('row')[1]
    .querySelectorAll('td')[2].textContent

describe('profesores de una sección (GES-25)', () => {
  test('agrega un segundo profesor: lo lista, avisa y actualiza la tabla', async () => {
    const posts: unknown[] = []
    const dialogo = await abrir({
      [RUTA]: (init) => {
        if (init?.method === 'POST') {
          posts.push(JSON.parse(String(init.body)))
          return [ANA, BRUNO]
        }
        return opciones(['profesor-1'])
      },
    })

    const lista = await dialogo.findByRole('list', {
      name: 'Profesores asignados',
    })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1)
    const agregar = dialogo.getByRole('button', { name: 'Agregar' })
    expect(agregar).toBeDisabled()
    // Solo se ofrecen los que no están asignados.
    const select = dialogo.getByLabelText('Profesor a agregar')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Selecciona un profesor', 'Bruno Docente'])
    fireEvent.change(select, { target: { value: 'profesor-2' } })
    fireEvent.click(agregar)

    expect(await dialogo.findByRole('status')).toHaveTextContent(
      'Bruno Docente quedó como profesor de la sección 1.',
    )
    expect(posts).toEqual([{ profesorId: 'profesor-2' }])
    expect(
      within(dialogo.getByRole('list', { name: 'Profesores asignados' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining('Ana Profesora'),
      expect.stringContaining('Bruno Docente'),
    ])
    expect(filaDeLaTabla()).toBe('Ana Profesora, Bruno Docente')
  })

  test('quitar exige motivo, lo envía y deja a los demás', async () => {
    const patches: { ruta?: string; cuerpo: unknown }[] = []
    const dialogo = await abrir({
      [RUTA]: () => opciones(['profesor-1', 'profesor-2']),
      [`${RUTA}/profesor-2/quitar`]: (init) => {
        patches.push({ cuerpo: JSON.parse(String(init?.body)) })
        return {
          quitado: { id: 'profesor-2', nombre: 'Bruno Docente' },
          quitadoEn: '2026-11-09T12:00:00.000Z',
          quitadoPor: { id: 'admin', nombre: 'Administrativo' },
          motivo: 'Termina su reemplazo',
          profesores: [ANA],
        } satisfies ProfesorQuitado
      },
    })

    fireEvent.click(
      await dialogo.findByRole('button', { name: 'Quitar a Bruno Docente' }),
    )
    const formulario = within(
      dialogo.getByRole('form', { name: 'Quitar a Bruno Docente' }),
    )
    const confirmar = formulario.getByRole('button', {
      name: 'Quitar profesor',
    })
    expect(confirmar).toBeDisabled()
    fireEvent.change(formulario.getByLabelText('Motivo'), {
      target: { value: '   ' },
    })
    expect(confirmar).toBeDisabled()
    fireEvent.change(formulario.getByLabelText('Motivo'), {
      target: { value: 'Termina su reemplazo' },
    })
    fireEvent.click(confirmar)

    expect(await dialogo.findByRole('status')).toHaveTextContent(
      'Bruno Docente ya no es profesor de la sección 1.',
    )
    expect(patches).toEqual([{ cuerpo: { motivo: 'Termina su reemplazo' } }])
    expect(
      within(
        dialogo.getByRole('list', { name: 'Profesores asignados' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(1)
    expect(filaDeLaTabla()).toBe('Ana Profesora')
  })

  test('cancelar el quitar no envía nada', async () => {
    const dialogo = await abrir({
      [RUTA]: () => opciones(['profesor-1']),
    })
    fireEvent.click(
      await dialogo.findByRole('button', { name: 'Quitar a Ana Profesora' }),
    )
    fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(
      dialogo.queryByRole('form', { name: 'Quitar a Ana Profesora' }),
    ).not.toBeInTheDocument()
    expect(dialogo.getByRole('form', { name: 'Agregar profesor' })).toBeTruthy()
  })

  test('sin profesores lo dice', async () => {
    const dialogo = await abrir({ [RUTA]: () => opciones([]) })
    expect(
      await dialogo.findByText('La sección 1 no tiene profesores asignados.'),
    ).toBeInTheDocument()
  })

  test('si la lista no carga, muestra el error y Reintentar la vuelve a pedir', async () => {
    let intentos = 0
    const dialogo = await abrir({
      [RUTA]: () =>
        ++intentos === 1 ? json({}, 500) : opciones(['profesor-1']),
    })
    expect(
      await dialogo.findByText('No se pudieron cargar los profesores.'),
    ).toBeInTheDocument()
    fireEvent.click(dialogo.getByRole('button', { name: 'Reintentar' }))
    expect(
      await dialogo.findByRole('list', { name: 'Profesores asignados' }),
    ).toBeInTheDocument()
    expect(intentos).toBe(2)
  })

  test('un duplicado (409) muestra el mensaje y desbloquea', async () => {
    let terminar!: (respuesta: unknown) => void
    const dialogo = await abrir({
      [RUTA]: (init) =>
        init?.method === 'POST'
          ? new Promise((resolver) => {
              terminar = resolver
            })
          : opciones(['profesor-1']),
    })
    fireEvent.change(await dialogo.findByLabelText('Profesor a agregar'), {
      target: { value: 'profesor-2' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Agregar' }))

    expect(
      await dialogo.findByRole('button', { name: 'Agregando…' }),
    ).toBeDisabled()
    expect(dialogo.getByRole('button', { name: 'Cerrar' })).toBeDisabled()
    terminar(
      json(
        {
          statusCode: 409,
          message: 'Bruno Docente ya es profesor de esta sección',
        },
        409,
      ),
    )
    expect(await dialogo.findByRole('alert')).toHaveTextContent(
      'Bruno Docente ya es profesor de esta sección',
    )
    await waitFor(() =>
      expect(dialogo.getByRole('button', { name: 'Agregar' })).toBeEnabled(),
    )
    expect(filaDeLaTabla()).toBe('Ana Profesora')
  })

  test('un fallo de red al quitar muestra el error y desbloquea', async () => {
    const dialogo = await abrir({
      [RUTA]: () => opciones(['profesor-1']),
      [`${RUTA}/profesor-1/quitar`]: () =>
        Promise.reject(new TypeError('Failed to fetch')),
    })
    fireEvent.click(
      await dialogo.findByRole('button', { name: 'Quitar a Ana Profesora' }),
    )
    fireEvent.change(dialogo.getByLabelText('Motivo'), {
      target: { value: 'Error' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Quitar profesor' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent(
      'No se pudo quitar el profesor. Inténtalo nuevamente.',
    )
    expect(
      dialogo.getByRole('button', { name: 'Quitar profesor' }),
    ).toBeEnabled()
  })

  test('si otro ya lo quitó (404), muestra el mensaje y recarga la lista', async () => {
    let pedidos = 0
    const dialogo = await abrir({
      [RUTA]: () =>
        ++pedidos === 1
          ? opciones(['profesor-1', 'profesor-2'])
          : opciones(['profesor-1']),
      [`${RUTA}/profesor-2/quitar`]: () =>
        json(
          {
            statusCode: 404,
            message: 'El profesor no está asignado a esta sección',
          },
          404,
        ),
    })
    fireEvent.click(
      await dialogo.findByRole('button', { name: 'Quitar a Bruno Docente' }),
    )
    fireEvent.change(dialogo.getByLabelText('Motivo'), {
      target: { value: 'Cambio' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Quitar profesor' }))

    expect(await dialogo.findByRole('alert')).toHaveTextContent(
      'El profesor no está asignado a esta sección',
    )
    await waitFor(() =>
      expect(
        dialogo.queryByRole('button', { name: 'Quitar a Bruno Docente' }),
      ).not.toBeInTheDocument(),
    )
    expect(pedidos).toBe(2)
  })

  test('el Director no ve el botón', async () => {
    await renderConSesion('DIRECTOR', '/cursos/curso-1', {
      '/api/cursos/curso-1': () => CURSO,
    })
    await screen.findByRole('table', { name: 'Secciones' })
    expect(
      screen.queryByRole('button', { name: 'Profesores de la sección 1' }),
    ).not.toBeInTheDocument()
  })
})
