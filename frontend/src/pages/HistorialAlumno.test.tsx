import type {
  DetalleHistorialAlumno,
  PeriodoHistorialAlumno,
} from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderConSesion } from '../test/sesion'

const API = '/api/mis-cursos/historial'
const HISTORIAL = '/mis-cursos/historial'
const CURSO: DetalleHistorialAlumno = {
  seccionId: 'seccion-1',
  seccion: 1,
  curso: { id: 'curso-1', codigo: 'ICC101', nombre: 'Programación' },
  periodo: { id: 'p2014', anio: 2014, semestre: 2 },
  notaFinal: { tipo: 'FINAL', nota: 5.6, porcentajeEvaluado: 100 },
  evaluaciones: [
    {
      evaluacionId: 'e1',
      nombre: 'Control',
      fecha: '2014-09-01',
      ponderacion: 40,
      nota: 5,
      recorregida: false,
    },
    {
      evaluacionId: 'e2',
      nombre: 'Examen',
      fecha: '2014-11-01',
      ponderacion: 60,
      nota: 6,
      recorregida: false,
    },
  ],
}

test('muestra grupos por período, la nota final y el detalle en solo lectura', async () => {
  const { periodo, seccionId, seccion, curso, notaFinal } = CURSO
  const resumen = { seccionId, seccion, curso, notaFinal }
  const grupos: PeriodoHistorialAlumno[] = [
    {
      periodo: { id: 'p2018', anio: 2018, semestre: 2 },
      cursos: [
        {
          ...resumen,
          seccionId: 'seccion-2',
          curso: {
            id: 'curso-2',
            codigo: 'ICC202',
            nombre: 'Estructuras de Datos',
          },
        },
      ],
    },
    { periodo, cursos: [resumen] },
  ]
  await renderConSesion('ALUMNO', '/mis-cursos', {
    [API]: () => grupos,
    [`${API}/seccion-1`]: () => CURSO,
  })
  fireEvent.click(
    await screen.findByRole('link', { name: 'Historial de notas' }),
  )
  const anterior = await screen.findByRole('region', { name: 'Período 2014-2' })
  const reciente = screen.getByRole('region', { name: 'Período 2018-2' })
  expect(within(reciente).getByText('Estructuras de Datos')).toBeVisible()
  expect(within(anterior).getByText('Nota final 5,6')).toBeVisible()
  fireEvent.click(within(anterior).getByRole('link', { name: /Programación/ }))
  expect(await screen.findByText(/Solo lectura/)).toBeVisible()
  const tabla = screen.getByRole('table', { name: 'Mis notas por evaluación' })
  expect(within(tabla).getByText('Control')).toBeVisible()
  expect(within(tabla).getByText('6,0')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /editar|guardar|corregir/i }),
  ).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Volver al historial' }))
  expect(
    await screen.findByRole('region', { name: 'Período 2014-2' }),
  ).toBeVisible()
})

test('el profesor no puede abrir la ruta del historial del alumno', async () => {
  const leer = vi.fn()
  await renderConSesion('PROFESOR', HISTORIAL, { [API]: leer })
  expect(
    await screen.findByRole('heading', { name: 'Mis secciones del período' }),
  ).toBeVisible()
  expect(leer).not.toHaveBeenCalled()
})
