import type { CursoArchivado } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { renderConSesion } from '../test/sesion'

const API = '/api/cursos-archivados'
const HISTORICO: CursoArchivado = {
  id: 'curso-historico',
  codigo: 'ICC101',
  nombre: 'Programación',
  carreraNombre: 'Ingeniería',
  archivadoEn: '2014-12-30T15:00:00Z',
  periodo: { id: 'periodo-2014-2', anio: 2014, semestre: 2 },
  secciones: [
    {
      id: 'seccion-1',
      numero: 1,
      evaluaciones: [
        {
          id: 'e1',
          nombre: 'Control 1',
          fecha: '2014-11-03',
          ponderacion: 100,
          notas: [{ alumnoId: 'a1', alumno: 'Ana Ávila', valor: 5.5 }],
        },
      ],
      clases: [
        {
          id: 'c1',
          fecha: '2014-11-03',
          inicio: '09:00',
          termino: '10:00',
          sala: 'A1',
          marcas: [{ alumnoId: 'a1', alumno: 'Ana Ávila', presente: true }],
        },
      ],
    },
  ],
}

test('filtra por período y conserva el filtro al volver de un curso histórico de solo lectura', async () => {
  const reciente = {
    ...HISTORICO,
    id: 'reciente',
    codigo: 'ICC202',
    periodo: { id: 'p2025', anio: 2025, semestre: 1 },
  }
  await renderConSesion('ADMINISTRATIVO', '/cursos', {
    [API]: () => [reciente, HISTORICO],
    [`${API}/${HISTORICO.id}`]: () => HISTORICO,
  })
  fireEvent.click(await screen.findByRole('link', { name: 'Archivados' }))
  const periodo = await screen.findByRole('combobox', { name: 'Período' })
  expect(screen.getByRole('link', { name: 'ICC202' })).toBeVisible()
  fireEvent.change(periodo, { target: { value: 'periodo-2014-2' } })
  expect(screen.queryByRole('link', { name: 'ICC202' })).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'ICC101' }))
  expect(await screen.findByText(/Solo lectura/)).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Sección 1' })).toBeVisible()
  fireEvent.click(screen.getByText(/Control 1 ·/))
  expect(
    within(screen.getByRole('table', { name: 'Notas de Control 1' })).getByText(
      '5,5',
    ),
  ).toBeVisible()
  fireEvent.click(screen.getByText(/09:00–10:00/))
  expect(
    within(
      screen.getByRole('table', { name: /Asistencia del 2014/ }),
    ).getByText('Presente'),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: /editar|guardar|corregir/i }),
  ).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Volver a archivados' }))
  expect(await screen.findByRole('combobox', { name: 'Período' })).toHaveValue(
    'periodo-2014-2',
  )
  expect(screen.queryByRole('link', { name: 'ICC202' })).toBeNull()
})

test('el Director no accede al archivo de una facultad', async () => {
  const leer = vi.fn()
  await renderConSesion('DIRECTOR', '/cursos/archivados', { [API]: leer })
  expect(
    await screen.findByRole('heading', { name: 'Gestión de cursos' }),
  ).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Archivados' })).toBeNull()
  expect(leer).not.toHaveBeenCalled()
})
