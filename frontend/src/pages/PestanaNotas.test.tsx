import type { EvaluacionesSeccion, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const EVALUACIONES = '/api/espacio/secciones/seccion-1/evaluaciones'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [],
}

const LISTA: EvaluacionesSeccion = {
  evaluaciones: [
    { id: 'e1', nombre: 'Control 1', fecha: '2026-09-01', ponderacion: 20 },
    { id: 'e2', nombre: 'Solemne 1', fecha: '2026-10-05', ponderacion: 30 },
  ],
  sumaPonderaciones: 50,
}

// Abre la vista de la sección con el rol dado y entra a la pestaña Notas.
async function abrirNotas(
  rol: Rol,
  evaluaciones: (init?: RequestInit) => unknown = () => LISTA,
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [EVALUACIONES]: evaluaciones,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
  expect(screen.getByRole('tab', { name: 'Notas' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  return { panel: within(screen.getByRole('tabpanel', { name: 'Notas' })) }
}

describe('pestaña Notas (NOT-01)', () => {
  test('el profesor ve el formulario y la lista con la suma de ponderaciones', async () => {
    const { panel } = await abrirNotas('PROFESOR')

    expect(
      panel.getByRole('form', { name: 'Nueva evaluación' }),
    ).toBeInTheDocument()
    const filas = (await panel.findAllByRole('row')).map((f) => f.textContent)
    expect(filas).toEqual([
      'EvaluaciónFechaPonderación',
      'Control 12026-09-0120 %',
      'Solemne 12026-10-0530 %',
      'Suma de ponderaciones50 %',
    ])
  })

  test('crear envía los tres campos y vuelve a pedir la lista', async () => {
    const enviados: unknown[] = []
    let creada = false
    const { panel } = await abrirNotas('PROFESOR', (init) => {
      if (init?.method === 'POST') {
        enviados.push(JSON.parse(init.body as string))
        creada = true
        return json(
          { id: 'e3', nombre: 'Examen', fecha: '2026-12-01', ponderacion: 50 },
          201,
        )
      }
      return creada
        ? {
            evaluaciones: [
              ...LISTA.evaluaciones,
              {
                id: 'e3',
                nombre: 'Examen',
                fecha: '2026-12-01',
                ponderacion: 50,
              },
            ],
            sumaPonderaciones: 100,
          }
        : LISTA
    })
    await panel.findByText('Control 1')

    fireEvent.change(panel.getByLabelText('Nombre'), {
      target: { value: 'Examen' },
    })
    fireEvent.change(panel.getByLabelText('Fecha'), {
      target: { value: '2026-12-01' },
    })
    fireEvent.change(panel.getByLabelText('Ponderación (%)'), {
      target: { value: '50' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Crear evaluación' }))

    expect(await panel.findByText('Evaluación creada')).toBeInTheDocument()
    expect(enviados).toEqual([
      { nombre: 'Examen', fecha: '2026-12-01', ponderacion: 50 },
    ])
    expect(await panel.findByText('Examen')).toBeInTheDocument()
    expect(panel.getByText('100 %')).toBeInTheDocument()
    expect(panel.getByLabelText('Nombre')).toHaveValue('')

    // Al empezar la siguiente evaluación se borra el aviso.
    fireEvent.change(panel.getByLabelText('Nombre'), {
      target: { value: 'Otra' },
    })
    expect(panel.queryByText('Evaluación creada')).not.toBeInTheDocument()
  })

  test('un 400 del backend muestra su mensaje', async () => {
    const mensaje =
      'La fecha debe estar dentro del período del curso (del 2026-08-03 al 2026-12-18)'
    const { panel } = await abrirNotas('PROFESOR', (init) =>
      init?.method === 'POST'
        ? json({ statusCode: 400, message: mensaje }, 400)
        : LISTA,
    )
    await panel.findByText('Control 1')
    fireEvent.change(panel.getByLabelText('Nombre'), {
      target: { value: 'Tarde' },
    })
    fireEvent.change(panel.getByLabelText('Fecha'), {
      target: { value: '2027-01-10' },
    })
    fireEvent.change(panel.getByLabelText('Ponderación (%)'), {
      target: { value: '10' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Crear evaluación' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(mensaje)
  })

  // El Director lee por la API (db-spec), pero no tiene ruta a esta vista:
  // /mis-cursos no está en su menú.
  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s ve la lista pero no el formulario',
    async (rol) => {
      const { panel } = await abrirNotas(rol)

      expect(await panel.findByText('Control 1')).toBeInTheDocument()
      expect(panel.getByText('50 %')).toBeInTheDocument()
      expect(
        panel.queryByRole('form', { name: 'Nueva evaluación' }),
      ).not.toBeInTheDocument()
      expect(
        panel.queryByRole('button', { name: 'Crear evaluación' }),
      ).not.toBeInTheDocument()
      // NOT-05: el ayudante solo tiene el botón para ingresar las notas.
      expect(
        panel.queryAllByRole('button').map((b) => b.getAttribute('aria-label')),
      ).toEqual(
        rol === 'AYUDANTE' ? ['Notas de Control 1', 'Notas de Solemne 1'] : [],
      )
    },
  )

  test('sin evaluaciones muestra el estado vacío', async () => {
    const { panel } = await abrirNotas('AYUDANTE', () => ({
      evaluaciones: [],
      sumaPonderaciones: 0,
    }))

    expect(
      await panel.findByText('Aún no hay evaluaciones'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const { panel } = await abrirNotas('ALUMNO', () =>
      ++intentos === 1 ? json({}, 500) : LISTA,
    )

    expect(
      await panel.findByText('No pudimos cargar las evaluaciones.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Control 1')).toBeInTheDocument()
  })
})
