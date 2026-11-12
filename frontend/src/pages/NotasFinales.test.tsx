import type { NotasFinalesSeccion, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const NOTAS_FINALES = '/api/espacio/secciones/seccion-1/notas-finales'
const EVALUACIONES = '/api/espacio/secciones/seccion-1/evaluaciones'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'PROFESOR',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  profesores: ['Camila Rojas'],
  ayudantes: [],
}

const FINALES: NotasFinalesSeccion = {
  alumnos: [
    {
      id: 'a1',
      nombre: 'Ana Ávila',
      notaFinal: { tipo: 'FINAL', nota: 5.1, porcentajeEvaluado: 100 },
    },
    {
      id: 'a2',
      nombre: 'Bruno Díaz',
      notaFinal: { tipo: 'PARCIAL', nota: 4.5, porcentajeEvaluado: 60 },
    },
    {
      id: 'a3',
      nombre: 'Carla Soto',
      notaFinal: { tipo: 'PARCIAL', nota: null, porcentajeEvaluado: 0 },
    },
  ],
}

async function abrirNotas(
  rol: Rol,
  rutas: Record<string, (init?: RequestInit) => unknown> = {},
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    [EVALUACIONES]: () => ({ evaluaciones: [], sumaPonderaciones: 0 }),
    ...rutas,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
  return { panel: within(screen.getByRole('tabpanel', { name: 'Notas' })) }
}

describe('NOT-14: el profesor ve la nota final de cada alumno', () => {
  test('ve la nota final o parcial de cada alumno, como la calcula el backend', async () => {
    const { panel } = await abrirNotas('PROFESOR', {
      [NOTAS_FINALES]: () => FINALES,
    })

    const tabla = await panel.findByRole('table', {
      name: 'Nota final de cada alumno',
    })
    expect(
      within(tabla)
        .getAllByRole('row')
        .map((fila) => fila.textContent),
    ).toEqual([
      'AlumnoNota',
      'Ana ÁvilaNota final 5,1',
      'Bruno DíazNota parcial 4,5 (60 % evaluado)',
      'Carla SotoSin notas publicadas',
    ])
  })

  test('sin alumnos inscritos lo dice', async () => {
    const { panel } = await abrirNotas('PROFESOR')

    expect(
      await panel.findByText('Aún no hay alumnos inscritos'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const { panel } = await abrirNotas('PROFESOR', {
      [NOTAS_FINALES]: () => (++intentos === 1 ? json({}, 500) : FINALES),
    })

    const region = within(
      await panel.findByRole('region', { name: 'Notas finales' }),
    )
    expect(
      await region.findByText('No pudimos cargar las notas finales.'),
    ).toBeInTheDocument()
    fireEvent.click(region.getByRole('button', { name: 'Reintentar' }))
    expect(await region.findByText('Ana Ávila')).toBeInTheDocument()
  })

  test('al crear una evaluación sin notas, la nota final pasa a parcial', async () => {
    const control = {
      id: 'e1',
      nombre: 'Control 1',
      fecha: '2026-09-01',
      ponderacion: 100,
    }
    let creada = false
    const { panel } = await abrirNotas('PROFESOR', {
      [EVALUACIONES]: (init) => {
        if (init?.method === 'POST') {
          creada = true
          return json(
            {
              id: 'e2',
              nombre: 'Examen',
              fecha: '2026-12-01',
              ponderacion: 20,
            },
            201,
          )
        }
        return creada
          ? {
              evaluaciones: [
                control,
                {
                  id: 'e2',
                  nombre: 'Examen',
                  fecha: '2026-12-01',
                  ponderacion: 20,
                },
              ],
              sumaPonderaciones: 120,
            }
          : { evaluaciones: [control], sumaPonderaciones: 100 }
      },
      // El backend ya cuenta la evaluación nueva, sin nota publicada.
      [NOTAS_FINALES]: () => ({
        alumnos: [
          {
            id: 'a1',
            nombre: 'Ana Ávila',
            notaFinal: creada
              ? { tipo: 'PARCIAL', nota: 5.1, porcentajeEvaluado: 100 }
              : { tipo: 'FINAL', nota: 5.1, porcentajeEvaluado: 100 },
          },
        ],
      }),
    })

    const tabla = await panel.findByRole('table', {
      name: 'Nota final de cada alumno',
    })
    expect(await within(tabla).findByText('Nota final 5,1')).toBeInTheDocument()

    fireEvent.change(panel.getByLabelText('Nombre'), {
      target: { value: 'Examen' },
    })
    fireEvent.change(panel.getByLabelText('Fecha'), {
      target: { value: '2026-12-01' },
    })
    fireEvent.change(panel.getByLabelText('Ponderación (%)'), {
      target: { value: '20' },
    })
    fireEvent.click(panel.getByRole('button', { name: 'Crear evaluación' }))

    expect(
      await within(tabla).findByText('Nota parcial 5,1 (100 % evaluado)'),
    ).toBeInTheDocument()
    expect(within(tabla).queryByText('Nota final 5,1')).not.toBeInTheDocument()
  })

  test('vuelve a pedir las notas finales al leer las notas de una evaluación, sin borrar la tabla', async () => {
    const notasFinales = vi.fn(() => FINALES)
    let liberar = () => {}
    const { panel } = await abrirNotas('PROFESOR', {
      [EVALUACIONES]: () => ({
        evaluaciones: [
          {
            id: 'e1',
            nombre: 'Control 1',
            fecha: '2026-09-01',
            ponderacion: 100,
          },
        ],
        sumaPonderaciones: 100,
      }),
      [NOTAS_FINALES]: notasFinales,
      [`${EVALUACIONES}/e1/notas`]: () =>
        new Promise((resolver) => {
          liberar = () =>
            resolver({
              evaluacion: {
                id: 'e1',
                nombre: 'Control 1',
                fecha: '2026-09-01',
                ponderacion: 100,
              },
              estado: 'APROBADA',
              alumnos: [],
            })
        }),
    })

    expect(await panel.findByText('Ana Ávila')).toBeInTheDocument()
    expect(notasFinales).toHaveBeenCalledTimes(1)
    fireEvent.click(panel.getByRole('button', { name: 'Notas de Control 1' }))
    liberar()

    await vi.waitFor(() => expect(notasFinales).toHaveBeenCalledTimes(2))
    expect(panel.getByText('Ana Ávila')).toBeInTheDocument()
    expect(panel.queryByText('Cargando notas finales…')).not.toBeInTheDocument()
  })

  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s no ve ni pide las notas finales de la sección',
    async (rol) => {
      const notasFinales = vi.fn(() => FINALES)
      const { panel } = await abrirNotas(rol, {
        [NOTAS_FINALES]: notasFinales,
      })

      expect(
        await panel.findByRole('region', {
          name: rol === 'ALUMNO' ? 'Mis notas' : 'Evaluaciones',
        }),
      ).toBeInTheDocument()
      expect(
        panel.queryByRole('region', { name: 'Notas finales' }),
      ).not.toBeInTheDocument()
      expect(notasFinales).not.toHaveBeenCalled()
    },
  )
})
