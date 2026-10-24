import type { Rol, SeccionDashboard } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

const RUTA = '/api/dashboard/mis-secciones'

const SECCIONES: SeccionDashboard[] = [
  {
    id: 'seccion-icc101-1',
    numero: 1,
    curso: {
      id: 'curso-icc101',
      codigo: 'ICC101',
      nombre: 'Introducción a la Programación',
    },
    horario: [
      { dia: 1, inicio: '08:30', termino: '10:00', sala: 'Sala A-101' },
      { dia: 3, inicio: '10:00', termino: '11:30', sala: 'Sala B-202' },
    ],
    alumnos: 32,
  },
  {
    id: 'seccion-icc201-2',
    numero: 2,
    curso: {
      id: 'curso-icc201',
      codigo: 'ICC201',
      nombre: 'Estructuras de Datos',
    },
    horario: [],
    alumnos: 1,
  },
]

const tarjetas = async () =>
  within(
    await screen.findByRole('region', { name: 'Dashboard' }),
  ).findAllByRole('link')

describe('dashboard del profesor (ESP-01)', () => {
  test('muestra una tarjeta por sección con curso, sección, horario y alumnos', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => SECCIONES })

    const [icc101, icc201] = await tarjetas()
    expect(
      screen.getByRole('heading', { name: 'Mis secciones del período' }),
    ).toBeInTheDocument()

    const primera = within(icc101)
    expect(primera.getByText('ICC101')).toBeInTheDocument()
    expect(
      primera.getByRole('heading', { name: 'Introducción a la Programación' }),
    ).toBeInTheDocument()
    expect(primera.getByText('Sección 1')).toBeInTheDocument()
    expect(
      within(primera.getByRole('list', { name: 'Horario' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Lunes 08:30–10:00 · Sala A-101',
      'Miércoles 10:00–11:30 · Sala B-202',
    ])
    expect(primera.getByText('32 alumnos')).toBeInTheDocument()

    const segunda = within(icc201)
    expect(segunda.getByText('Sección 2')).toBeInTheDocument()
    expect(segunda.getByText('Sin horario asignado')).toBeInTheDocument()
    expect(segunda.getByText('1 alumno')).toBeInTheDocument()
  })

  test('al hacer clic en una tarjeta se abre la vista del curso', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => SECCIONES })

    const [icc101] = await tarjetas()
    expect(icc101).toHaveAttribute(
      'href',
      '/mis-cursos/secciones/seccion-icc101-1',
    )
    fireEvent.click(icc101)

    const vista = within(
      await screen.findByRole('region', { name: 'Vista del curso' }),
    )
    expect(
      vista.getByRole('heading', { name: 'Introducción a la Programación' }),
    ).toBeInTheDocument()
    expect(vista.getByText('ICC101')).toBeInTheDocument()
    expect(vista.getByText('Sección 1')).toBeInTheDocument()
    expect(vista.getByText('Profesor a cargo · 32 alumnos')).toBeInTheDocument()
    // Sin textos de trabajo pendiente en la UI.
    expect(document.body).not.toHaveTextContent(/TODO|pendiente|próximamente/i)
  })

  test('la vista del curso también carga al entrar directo por la URL', async () => {
    await renderConSesion(
      'PROFESOR',
      '/mis-cursos/secciones/seccion-icc201-2',
      {
        [RUTA]: () => SECCIONES,
      },
    )

    const vista = within(
      await screen.findByRole('region', { name: 'Vista del curso' }),
    )
    expect(
      vista.getByRole('heading', { name: 'Estructuras de Datos' }),
    ).toBeInTheDocument()
    expect(vista.getByText('Sección 2')).toBeInTheDocument()
  })

  test('una sección que no es suya muestra un mensaje neutro', async () => {
    await renderConSesion('PROFESOR', '/mis-cursos/secciones/otra', {
      [RUTA]: () => SECCIONES,
    })

    expect(
      await screen.findByText(
        'Esta sección no está entre tus secciones del período activo.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Volver al Dashboard' }))
    expect(await tarjetas()).toHaveLength(2)
  })

  test('sin secciones muestra el estado vacío', async () => {
    await renderConSesion('PROFESOR', '/', { [RUTA]: () => [] })

    expect(
      await screen.findByText(
        'No tienes secciones a tu cargo en el período activo.',
      ),
    ).toBeInTheDocument()
  })

  test('si falla la carga permite reintentar', async () => {
    let intentos = 0
    await renderConSesion('PROFESOR', '/', {
      [RUTA]: () => (++intentos === 1 ? json({}, 500) : SECCIONES),
    })

    expect(
      await screen.findByText('No pudimos cargar tus secciones.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await tarjetas()).toHaveLength(2)
  })

  test.each<Rol>(['DIRECTOR', 'ADMINISTRATIVO', 'AYUDANTE', 'ALUMNO'])(
    '%s no ve tarjetas ni pide las secciones del profesor',
    async (rol) => {
      let pedidas = 0
      await renderConSesion(rol, '/', {
        [RUTA]: () => {
          pedidas++
          return SECCIONES
        },
      })

      const dashboard = await screen.findByRole('region', { name: 'Dashboard' })
      expect(within(dashboard).queryByRole('link')).not.toBeInTheDocument()
      expect(pedidas).toBe(0)
    },
  )
})
