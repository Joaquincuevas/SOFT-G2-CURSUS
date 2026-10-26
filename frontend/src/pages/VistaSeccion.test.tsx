import type { AlumnosEspacio, Rol, SeccionResumen } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
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

  test('muestra las pestañas de la Fase 4; solo las implementadas se habilitan', async () => {
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
    // Implementadas: Asistencia (ASI-01). Las demás siguen deshabilitadas.
    const HABILITADAS = ['Asistencia']
    for (const pestana of pestanas) {
      if (HABILITADAS.includes(pestana.textContent ?? '')) {
        expect(pestana).toBeEnabled()
      } else {
        expect(pestana).toBeDisabled()
      }
      expect(pestana).toHaveAttribute('aria-selected', 'false')
    }
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

describe('alumnos de la sección (ESP-05)', () => {
  const ALUMNOS = '/api/espacio/secciones/seccion-1/alumnos'
  const LISTA: AlumnosEspacio = {
    total: 3,
    // El backend ya los entrega ordenados por nombre.
    alumnos: [
      {
        id: 'alumno-1',
        nombre: 'Ángela Mora',
        correo: 'angela.mora@norte.cursus.test',
      },
      {
        id: 'alumno-2',
        nombre: 'Nadia León',
        correo: 'nadia.leon@norte.cursus.test',
      },
      {
        id: 'alumno-3',
        nombre: 'Ñandú Pérez',
        correo: 'nandu.perez@norte.cursus.test',
      },
    ],
  }
  const comoProfesor = { ...RESUMEN, rol: 'PROFESOR' as const }
  const seccionAlumnos = async (nombre: string | RegExp) =>
    within(await screen.findByRole('region', { name: nombre }))

  test('el profesor ve el total y la lista con nombre y correo, en orden', async () => {
    await renderConSesion('PROFESOR', VISTA, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => LISTA,
    })

    const alumnos = await seccionAlumnos('Alumnos (3)')
    expect(
      within(alumnos.getByRole('list', { name: 'Alumnos inscritos' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Ángela Moraangela.mora@norte.cursus.test',
      'Nadia Leónnadia.leon@norte.cursus.test',
      'Ñandú Péreznandu.perez@norte.cursus.test',
    ])
  })

  test('la lista es de solo lectura: sin botones ni enlaces', async () => {
    await renderConSesion('PROFESOR', VISTA, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => LISTA,
    })

    const alumnos = await seccionAlumnos('Alumnos (3)')
    expect(alumnos.queryAllByRole('button')).toEqual([])
    expect(alumnos.queryAllByRole('link')).toEqual([])
    expect(
      screen.queryByRole('button', { name: /agregar|quitar|cargar/i }),
    ).not.toBeInTheDocument()
  })

  test('sin alumnos inscritos muestra el estado vacío', async () => {
    await renderConSesion('PROFESOR', VISTA, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => ({ total: 0, alumnos: [] }),
    })

    const alumnos = await seccionAlumnos('Alumnos (0)')
    expect(
      alumnos.getByText('Aún no hay alumnos inscritos'),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    await renderConSesion('PROFESOR', VISTA, {
      [RUTA]: () => comoProfesor,
      [ALUMNOS]: () => (++intentos === 1 ? json({}, 500) : LISTA),
    })

    const alumnos = await seccionAlumnos('Alumnos')
    expect(
      await alumnos.findByText('No pudimos cargar los alumnos.'),
    ).toBeInTheDocument()
    fireEvent.click(alumnos.getByRole('button', { name: 'Reintentar' }))

    expect(await seccionAlumnos('Alumnos (3)')).toBeTruthy()
  })

  test.each<Rol>(['AYUDANTE', 'ALUMNO'])(
    '%s no ve la sección de alumnos ni la pide',
    async (rol) => {
      let pedidas = 0
      await renderConSesion(rol, VISTA, {
        [RUTA]: () => ({ ...RESUMEN, rol }),
        [ALUMNOS]: () => {
          pedidas++
          return LISTA
        },
      })

      await vista()
      expect(
        screen.queryByRole('region', { name: /^Alumnos/ }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByText('angela.mora@norte.cursus.test'),
      ).not.toBeInTheDocument()
      expect(pedidas).toBe(0)
    },
  )
})
