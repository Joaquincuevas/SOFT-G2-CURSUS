import type { SeccionDetalle } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { json, renderConSesion, usuarioDePrueba } from '../test/sesion'

const usuario = usuarioDePrueba('ADMINISTRATIVO')

const seccion = (
  numero: number,
  extra: Partial<SeccionDetalle> = {},
): SeccionDetalle => ({
  id: `s${numero}`,
  numero,
  horario: 'Lunes 08:30–10:00',
  profesor: 'Camila Rojas',
  profesorId: 'p1',
  profesores: ['Camila Rojas'],
  ayudantes: [],
  alumnos: 12,
  ...extra,
})
const detalle = (id: string, secciones: SeccionDetalle[]) => ({
  id,
  codigo: id.toUpperCase(),
  nombre: `Curso ${id}`,
  carreraNombre: 'Ingeniería',
  periodo: { id: 'p', anio: 2026, semestre: 2 },
  secciones,
})
// Fecha ISO (AAAA-MM-DD) a `dias` días de hoy.
const enDias = (dias: number) => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const periodo = (dias: number) => ({
  id: 'per',
  anio: 2026,
  semestre: 2,
  fechaInicio: '2026-03-01',
  fechaTermino: enDias(dias),
  activo: true,
})

test('el dashboard administrativo cuenta cursos y profesores con el alcance visible', async () => {
  const universidades = vi.fn(() => [])
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': (_, url) => {
      expect(url).toBe('/api/cursos?periodoId=' + usuario.periodoActivo?.id)
      return [{ id: 'c1' }, { id: 'c2' }]
    },
    '/api/cursos/c1': () => detalle('c1', []),
    '/api/cursos/c2': () => detalle('c2', []),
    '/api/profesores': () => [{ id: 'p1', nombre: 'Camila Rojas' }],
    '/api/superadmin/universidades': universidades,
  })
  const dashboard = within(
    await screen.findByRole('region', { name: 'Dashboard' }),
  )
  expect(dashboard.getByText(usuario.universidadNombre!)).toBeVisible()
  expect(dashboard.getByText(usuario.facultadNombre!)).toBeVisible()
  const cursosActivos = within(
    dashboard.getByRole('region', { name: 'Cursos del período activo' }),
  )
  expect(await cursosActivos.findByText('2', { exact: true })).toBeVisible()
  expect(cursosActivos.getByText('De tu facultad')).toBeVisible()
  const profesores = within(
    dashboard.getByRole('region', { name: 'Cuentas de profesores' }),
  )
  expect(await profesores.findByText('1', { exact: true })).toBeVisible()
  expect(profesores.getByText('De toda la universidad')).toBeVisible()
  // «Accesos directos» repetía el menú lateral.
  expect(dashboard.queryByText('Accesos directos')).toBeNull()
  expect(dashboard.queryByRole('link', { name: 'Gestionar cursos' })).toBeNull()
  expect(universidades).not.toHaveBeenCalled()
})

test('un error en profesores se puede reintentar sin ocultar el total de cursos', async () => {
  let falla = true
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': () => [{ id: 'c1' }],
    '/api/cursos/c1': () => detalle('c1', []),
    '/api/profesores': () => (falla ? json({}, 500) : []),
  })
  const cursosActivos = within(
    await screen.findByRole('region', { name: 'Cursos del período activo' }),
  )
  expect(await cursosActivos.findByText('1', { exact: true })).toBeVisible()
  const profesores = within(
    screen.getByRole('region', { name: 'Cuentas de profesores' }),
  )
  expect(await profesores.findByRole('alert')).toHaveTextContent(
    'No se pudo cargar el total.',
  )
  falla = false
  fireEvent.click(profesores.getByRole('button', { name: 'Reintentar' }))
  expect(await profesores.findByText('0', { exact: true })).toBeVisible()
})

test('Pendientes cuenta secciones sin profesor, sin horario y sin alumnos, y el período por vencer', async () => {
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': () => [{ id: 'c1' }, { id: 'c2' }],
    '/api/cursos/c1': () =>
      detalle('c1', [
        seccion(1, { profesores: [], horario: null, alumnos: 0 }),
        seccion(2, { alumnos: 0 }),
      ]),
    '/api/cursos/c2': () => detalle('c2', [seccion(1)]),
    '/api/periodos': () => [periodo(5)],
  })
  const panel = within(
    await screen.findByRole('region', { name: 'Pendientes' }),
  )
  const item = async (titulo: string) =>
    (await panel.findByText(titulo)).closest('li') as HTMLElement
  const contador = async (titulo: string) =>
    within(await item(titulo)).getByText(/^\d+$/, {
      selector: '[data-slot=badge]',
    }).textContent
  expect(await contador('Secciones sin profesor asignado')).toBe('1')
  expect(await contador('Secciones sin horario')).toBe('1')
  expect(await contador('Secciones sin alumnos')).toBe('2')
  const sinProfesor = within(await item('Secciones sin profesor asignado'))
  expect(sinProfesor.getByRole('link', { name: 'C1 · 1' })).toHaveAttribute(
    'href',
    '/cursos/c1',
  )
  expect(sinProfesor.getByRole('link', { name: 'Ver cursos' })).toHaveAttribute(
    'href',
    '/cursos',
  )
  const periodoItem = await item('El período 2026-2 termina pronto')
  expect(periodoItem).toHaveTextContent('Termina en 5 días.')
  expect(
    within(periodoItem).getByRole('link', { name: 'Ir a períodos' }),
  ).toHaveAttribute('href', '/periodos')
})

test('Pendientes avisa un período ya vencido', async () => {
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': () => [],
    '/api/periodos': () => [periodo(-3)],
  })
  expect(
    await screen.findByText('El período 2026-2 ya terminó'),
  ).toBeInTheDocument()
})

test('sin pendientes muestra «Todo al día»', async () => {
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': () => [{ id: 'c1' }],
    '/api/cursos/c1': () => detalle('c1', [seccion(1)]),
    '/api/periodos': () => [periodo(60)],
  })
  expect(await screen.findByText('Todo al día')).toBeInTheDocument()
})

test('si no se pueden calcular los pendientes ofrece reintentar', async () => {
  let falla = true
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': () => [{ id: 'c1' }],
    '/api/cursos/c1': () =>
      falla ? json({}, 500) : detalle('c1', [seccion(1)]),
    '/api/periodos': () => [periodo(60)],
  })
  expect(
    await screen.findByText('No pudimos calcular los pendientes.'),
  ).toBeInTheDocument()
  falla = false
  fireEvent.click(
    within(
      (await screen.findByText('No pudimos calcular los pendientes.')).closest(
        'section',
      ) as HTMLElement,
    ).getByRole('button', { name: 'Reintentar' }),
  )
  expect(await screen.findByText('Todo al día')).toBeInTheDocument()
})
