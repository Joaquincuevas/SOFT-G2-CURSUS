import type { MisNotasSeccion, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const VISTA = '/mis-cursos/secciones/seccion-1'
const RESUMEN_RUTA = '/api/espacio/secciones/seccion-1/resumen'
const MIS_NOTAS = '/api/espacio/secciones/seccion-1/mis-notas'
const EVALUACIONES = '/api/espacio/secciones/seccion-1/evaluaciones'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'periodo-1', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  horario: [],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [],
}

const NOTAS: MisNotasSeccion = {
  evaluaciones: [
    {
      evaluacionId: 'e1',
      nombre: 'Control 1',
      fecha: '2026-09-01',
      ponderacion: 20,
      nota: 5,
    },
    {
      evaluacionId: 'e2',
      nombre: 'Solemne 1',
      fecha: '2026-10-05',
      ponderacion: 30,
      nota: null,
    },
  ],
}

// Abre la pestaña Notas de la sección con el rol dado.
async function abrirNotas(
  rol: Rol,
  rutas: Record<string, (init?: RequestInit) => unknown> = {},
) {
  await renderConSesion(rol, VISTA, {
    [RESUMEN_RUTA]: () => ({ ...RESUMEN, rol }),
    ...rutas,
  })
  fireEvent.click(await screen.findByRole('tab', { name: 'Notas' }))
  return { panel: within(screen.getByRole('tabpanel', { name: 'Notas' })) }
}

describe('NOT-13: el alumno ve sus notas publicadas', () => {
  test('ve cada evaluación con su fecha, ponderación y nota', async () => {
    const { panel } = await abrirNotas('ALUMNO', { [MIS_NOTAS]: () => NOTAS })

    expect(panel.getByRole('region', { name: 'Mis notas' })).toBeInTheDocument()
    const filas = (await panel.findAllByRole('row')).map((f) => f.textContent)
    expect(filas).toEqual([
      'EvaluaciónFechaPonderaciónNota',
      'Control 12026-09-0120 %5,0',
      'Solemne 12026-10-0530 %Sin publicar',
    ])
  })

  test('no ve el formulario ni los botones de ingreso de notas', async () => {
    const { panel } = await abrirNotas('ALUMNO', { [MIS_NOTAS]: () => NOTAS })

    expect(await panel.findByText('Control 1')).toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Nueva evaluación' }),
    ).not.toBeInTheDocument()
    expect(panel.queryAllByRole('button')).toHaveLength(0)
  })

  test('sin evaluaciones muestra el estado vacío', async () => {
    const { panel } = await abrirNotas('ALUMNO')

    expect(
      await panel.findByText('Aún no hay evaluaciones'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    const { panel } = await abrirNotas('ALUMNO', {
      [MIS_NOTAS]: () => (++intentos === 1 ? json({}, 500) : NOTAS),
    })

    expect(
      await panel.findByText('No pudimos cargar tus notas.'),
    ).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(await panel.findByText('Control 1')).toBeInTheDocument()
  })

  test('el profesor sigue viendo la lista de evaluaciones, no mis-notas', async () => {
    const misNotas = vi.fn(() => NOTAS)
    const { panel } = await abrirNotas('PROFESOR', {
      [MIS_NOTAS]: misNotas,
      [EVALUACIONES]: () => ({ evaluaciones: [], sumaPonderaciones: 0 }),
    })

    expect(
      await panel.findByRole('form', { name: 'Nueva evaluación' }),
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('region', { name: 'Mis notas' }),
    ).not.toBeInTheDocument()
    expect(misNotas).not.toHaveBeenCalled()
  })
})
