import type { AlumnosSeccion } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/secciones/s1/alumnos'
const DATOS: AlumnosSeccion = {
  seccion: {
    id: 's1',
    numero: 1,
    curso: { id: 'c1', codigo: 'ICC101', nombre: 'Programación' },
  },
  total: 2,
  alumnos: [
    { id: 'a1', nombre: 'Ana', correo: 'ana@u.cl' },
    { id: 'a2', nombre: 'Beto', correo: 'beto@u.cl' },
  ],
}
test('el Director conserva el listado ordenado y el total sin acciones', async () => {
  await renderConSesion('DIRECTOR', '/secciones/s1/alumnos', {
    [RUTA]: () => DATOS,
  })
  const tabla = await screen.findByRole('table', { name: 'Alumnos' })
  expect(
    within(tabla)
      .getAllByRole('row')
      .map((f) => f.textContent),
  ).toEqual(['NombreCorreo', 'Anaana@u.cl', 'Betobeto@u.cl'])
  expect(screen.getByText('2 alumnos inscritos')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Quitar' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: '← Volver al curso' }),
  ).toHaveAttribute('href', '/cursos/c1')
})
test('singular y estado vacío del listado de solo lectura', async () => {
  await renderConSesion('DIRECTOR', '/secciones/s1/alumnos', {
    [RUTA]: () => ({ ...DATOS, total: 0, alumnos: [] }),
  })
  expect(
    await screen.findByText('Esta sección aún no tiene alumnos.'),
  ).toBeInTheDocument()
})
test('una sección ajena responde no encontrada', async () => {
  await renderConSesion('DIRECTOR', '/secciones/s1/alumnos', {
    [RUTA]: () => json({}, 404),
  })
  expect(await screen.findByText('Sección no encontrada')).toBeInTheDocument()
})
test('reintenta la lectura después de un error', async () => {
  let intentos = 0
  await renderConSesion('DIRECTOR', '/secciones/s1/alumnos', {
    [RUTA]: () => (++intentos === 1 ? json({}, 500) : DATOS),
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('2 alumnos inscritos')).toBeInTheDocument()
})
test('el enlace anterior del administrativo redirige a Integrantes, en Alumnos', async () => {
  await renderConSesion('ADMINISTRATIVO', '/secciones/s1/alumnos', {
    '/api/secciones/s1/integrantes': () => ({
      seccion: DATOS.seccion,
      integrantes: DATOS.alumnos.map((a) => ({ ...a, rol: 'ALUMNO' })),
    }),
  })
  expect(
    await screen.findByRole('heading', { name: 'Integrantes · Sección 1' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Alumnos (2)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
test('el alumno no puede abrir la gestión de integrantes', async () => {
  await renderConSesion('ALUMNO', '/secciones/s1/integrantes')
  expect(
    screen.queryByRole('heading', { name: 'Integrantes · Sección 1' }),
  ).not.toBeInTheDocument()
})
