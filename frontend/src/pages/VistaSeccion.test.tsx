import type { Rol, SeccionResumen } from '@cursus/shared'
import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/espacio/secciones/seccion-1/resumen'
const VISTA = '/mis-cursos/secciones/seccion-1'

const RESUMEN: SeccionResumen = {
  id: 'seccion-1',
  numero: 1,
  curso: {
    id: 'curso-icc101',
    codigo: 'ICC101',
    nombre: 'Introducción a la Programación',
  },
  periodo: { id: 'periodo-2026-2', anio: 2026, semestre: 2 },
  rol: 'ALUMNO',
  horario: [
    { dia: 1, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
    { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Sala B-202' },
  ],
  profesor: { id: 'profesor-1', nombre: 'Camila Rojas' },
  ayudantes: [
    { id: 'ayudante-1', nombre: 'Diego Muñoz' },
    { id: 'ayudante-2', nombre: 'Sofía Pérez' },
  ],
}

const vista = async () =>
  within(await screen.findByRole('region', { name: 'Vista del curso' }))

describe('vista de la sección (ESP-04)', () => {
  test.each<[Rol, string]>([
    ['PROFESOR', 'Profesor'],
    ['AYUDANTE', 'Ayudante'],
    ['ALUMNO', 'Alumno'],
  ])(
    '%s ve curso, sección, horario con sala y equipo docente',
    async (rol, nombreRol) => {
      await renderConSesion(rol, VISTA, { [RUTA]: () => ({ ...RESUMEN, rol }) })

      const v = await vista()
      expect(v.getByText('ICC101')).toBeInTheDocument()
      expect(
        v.getByRole('heading', { name: 'Introducción a la Programación' }),
      ).toBeInTheDocument()
      expect(v.getByText('Sección 1')).toBeInTheDocument()
      expect(v.getByText(`Entras como ${nombreRol}`)).toBeInTheDocument()
      expect(
        within(v.getByRole('list', { name: 'Horario' }))
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([
        'Lunes 08:30–10:00 · Sala A-101',
        'Miércoles 10:00–11:30 · Sala B-202',
      ])
      expect(v.getByText('Camila Rojas')).toBeInTheDocument()
      expect(v.getByText('Diego Muñoz')).toBeInTheDocument()
      expect(v.getByText('Sofía Pérez')).toBeInTheDocument()
    },
  )

  test.each<Rol>(['PROFESOR', 'AYUDANTE', 'ALUMNO'])(
    '%s no ve acciones de gestión del Administrativo',
    async (rol) => {
      await renderConSesion(rol, VISTA, { [RUTA]: () => ({ ...RESUMEN, rol }) })

      const v = await vista()
      // Solo las pestañas deshabilitadas y el enlace de vuelta: ningún botón
      // de gestión (agregar o quitar alumnos, cargar CSV, asignar docentes,
      // editar horario).
      expect(v.queryAllByRole('button')).toEqual([])
      expect(
        v.queryByRole('button', {
          name: /agregar|quitar|cargar|asignar|editar/i,
        }),
      ).not.toBeInTheDocument()
      expect(v.getAllByRole('link').map((a) => a.textContent)).toEqual([
        'Volver al Dashboard',
      ])
    },
  )

  test('muestra las pestañas de la Fase 4 deshabilitadas', async () => {
    await renderConSesion('ALUMNO', VISTA, { [RUTA]: () => RESUMEN })

    const pestanas = within(
      (await vista()).getByRole('tablist', { name: 'Pestañas de la sección' }),
    ).getAllByRole('tab')
    expect(pestanas.map((p) => p.textContent)).toEqual([
      'Notas',
      'Material',
      'Anuncios',
      'Asistencia',
    ])
    for (const pestana of pestanas) expect(pestana).toBeDisabled()
    // Sin textos de trabajo pendiente en la UI.
    expect(document.body).not.toHaveTextContent(/TODO|pendiente|próximamente/i)
  })

  test('sin horario, profesor ni ayudantes lo indica', async () => {
    await renderConSesion('ALUMNO', VISTA, {
      [RUTA]: () => ({
        ...RESUMEN,
        horario: [],
        profesor: null,
        ayudantes: [],
      }),
    })

    const v = await vista()
    expect(v.getByText('Sin horario asignado')).toBeInTheDocument()
    expect(v.getByText('Sin profesor asignado')).toBeInTheDocument()
    expect(v.getByText('Sin ayudantes asignados')).toBeInTheDocument()
  })

  test('si no es integrante (403) lo indica y permite volver', async () => {
    await renderConSesion('ALUMNO', VISTA, { [RUTA]: () => json({}, 403) })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Sin acceso')
    expect(alerta).toHaveTextContent('No eres integrante de esta sección.')
    expect(
      within(alerta).getByRole('button', { name: 'Volver al Dashboard' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Vista del curso' }),
    ).not.toBeInTheDocument()
  })
})
