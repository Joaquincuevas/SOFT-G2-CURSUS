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
  profesores: ['Camila Rojas'],
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
      recorregida: false,
    },
    {
      evaluacionId: 'e2',
      nombre: 'Solemne 1',
      fecha: '2026-10-05',
      ponderacion: 30,
      nota: null,
      recorregida: false,
    },
  ],
  notaFinal: { tipo: 'PARCIAL', nota: 5, porcentajeEvaluado: 20 },
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

  test('no ve el formulario, los estados del ayudante ni el historial', async () => {
    const { panel } = await abrirNotas('ALUMNO', { [MIS_NOTAS]: () => NOTAS })

    expect(await panel.findByText('Control 1')).toBeInTheDocument()
    expect(
      panel.queryByRole('form', { name: 'Nueva evaluación' }),
    ).not.toBeInTheDocument()
    expect(panel.queryAllByRole('button')).toHaveLength(0)
    // Ni los estados y comentarios del ayudante (NOT-09) ni el historial de
    // una nota (NOT-16).
    expect(
      panel.queryByRole('columnheader', { name: 'Estado del envío' }),
    ).not.toBeInTheDocument()
    expect(panel.queryByRole('note')).not.toBeInTheDocument()
    expect(
      panel.queryByRole('button', { name: 'Historial de notas de Control 1' }),
    ).not.toBeInTheDocument()
  })

  test('muestra la nota nueva y la marca solo en una nota publicada recorregida', async () => {
    const { panel } = await abrirNotas('ALUMNO', {
      [MIS_NOTAS]: () => ({
        ...NOTAS,
        evaluaciones: [
          { ...NOTAS.evaluaciones[0], nota: 6.2, recorregida: true },
          NOTAS.evaluaciones[1],
          { ...NOTAS.evaluaciones[0], evaluacionId: 'e3', nombre: 'Control 2' },
        ],
      }),
    })

    const tabla = await panel.findByRole('table', {
      name: 'Mis notas por evaluación',
    })
    const corregida = within(
      within(tabla).getByText('Control 1').closest('tr')!,
    )
    expect(corregida.getByText('6,2', { exact: false })).toBeInTheDocument()
    expect(corregida.getByText('Recorregida')).toBeInTheDocument()
    expect(within(tabla).getAllByText('Recorregida')).toHaveLength(1)
    expect(within(tabla).queryByText('5,5')).not.toBeInTheDocument()
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

describe('NOT-14: el alumno ve su nota final', () => {
  test('mientras falten notas ve la nota parcial con el porcentaje evaluado', async () => {
    const { panel } = await abrirNotas('ALUMNO', { [MIS_NOTAS]: () => NOTAS })

    expect(await panel.findByLabelText('Nota del curso')).toHaveTextContent(
      'Nota parcial 5,0 (20 % evaluado)',
    )
  })

  test('con todas las notas publicadas ve la nota final con un decimal', async () => {
    const { panel } = await abrirNotas('ALUMNO', {
      [MIS_NOTAS]: () => ({
        ...NOTAS,
        notaFinal: { tipo: 'FINAL', nota: 5.1, porcentajeEvaluado: 100 },
      }),
    })

    expect(await panel.findByLabelText('Nota del curso')).toHaveTextContent(
      /^Nota final 5,1$/,
    )
  })

  test('sin notas publicadas lo dice, sin inventar un promedio', async () => {
    const { panel } = await abrirNotas('ALUMNO', {
      [MIS_NOTAS]: () => ({
        ...NOTAS,
        notaFinal: { tipo: 'PARCIAL', nota: null, porcentajeEvaluado: 0 },
      }),
    })

    expect(await panel.findByLabelText('Nota del curso')).toHaveTextContent(
      /^Sin notas publicadas$/,
    )
  })

  test('con un backend que aún no envía notaFinal, la tabla sigue disponible', async () => {
    const { panel } = await abrirNotas('ALUMNO', {
      [MIS_NOTAS]: () => ({ evaluaciones: NOTAS.evaluaciones }),
    })

    expect(
      await panel.findByRole('table', { name: 'Mis notas por evaluación' }),
    ).toBeInTheDocument()
    expect(panel.getByText('Control 1')).toBeInTheDocument()
    expect(panel.queryByLabelText('Nota del curso')).not.toBeInTheDocument()
    expect(
      panel.queryByText('No pudimos cargar tus notas.'),
    ).not.toBeInTheDocument()
  })
})
