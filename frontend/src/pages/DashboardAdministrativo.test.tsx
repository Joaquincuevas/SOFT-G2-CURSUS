import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { json, renderConSesion, usuarioDePrueba } from '../test/sesion'

const usuario = usuarioDePrueba('ADMINISTRATIVO')

test('el dashboard administrativo cuenta cursos y profesores con el alcance visible', async () => {
  const universidades = vi.fn(() => [])
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': (_, url) => {
      expect(url).toBe('/api/cursos?periodoId=' + usuario.periodoActivo?.id)
      return [{ id: 'c1' }, { id: 'c2' }]
    },
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
  expect(
    dashboard.getByRole('link', { name: 'Gestionar cursos' }),
  ).toHaveAttribute('href', '/cursos')
  expect(
    dashboard.getByRole('link', { name: 'Profesores y ayudantes' }),
  ).toHaveAttribute('href', '/docentes')
  expect(universidades).not.toHaveBeenCalled()
})

test('un error en profesores se puede reintentar sin ocultar el total de cursos', async () => {
  let falla = true
  await renderConSesion('ADMINISTRATIVO', '/', {
    '/api/cursos': () => [{ id: 'c1' }],
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
