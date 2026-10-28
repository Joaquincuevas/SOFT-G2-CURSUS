import type { UniversidadElegible, UsuarioSesion } from '@cursus/shared'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  json,
  renderConSesion,
  type RutaSimulada,
  superadminSinElegir,
  usuarioDePrueba,
} from '../test/sesion'

const UNIVERSIDADES: UniversidadElegible[] = [
  {
    id: 'universidad-norte',
    nombre: 'Universidad Demo Norte',
    facultades: [
      { id: 'economia-norte', nombre: 'Facultad de Economía y Negocios' },
      { id: 'ingenieria-norte', nombre: 'Facultad de Ingeniería' },
    ],
  },
  {
    id: 'universidad-sur',
    nombre: 'Universidad Demo Sur',
    facultades: [
      { id: 'salud-sur', nombre: 'Facultad de Ciencias de la Salud' },
    ],
  },
]

// El superadmin con Salud de Sur elegida, como responde la API al elegirla.
const EN_SALUD_SUR: UsuarioSesion = {
  ...usuarioDePrueba('SUPERADMIN'),
  universidadId: 'universidad-sur',
  universidadNombre: 'Universidad Demo Sur',
  facultadNombre: 'Facultad de Ciencias de la Salud',
}

const abrir = (
  path: string,
  usuario: UsuarioSesion,
  rutas: Record<string, RutaSimulada> = {},
) =>
  renderConSesion('SUPERADMIN', path, {
    '/api/auth/yo': () => usuario,
    '/api/superadmin/universidades': () => UNIVERSIDADES,
    ...rutas,
  })

const elegir = async (universidad: string, facultad: string) => {
  fireEvent.change(await screen.findByLabelText('Universidad'), {
    target: { value: universidad },
  })
  fireEvent.change(screen.getByLabelText('Facultad'), {
    target: { value: facultad },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Trabajar en esta facultad' }),
  )
}

describe('superadmin: universidad y facultad (MT-04)', () => {
  test('sin elegir, cualquier ruta lleva a elegir universidad y facultad', async () => {
    await abrir('/cursos', superadminSinElegir())

    expect(
      await screen.findByRole('heading', { name: 'Elige dónde trabajar' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Universidad y facultad' }),
    ).toBeInTheDocument()
    // El encabezado muestra su rol.
    expect(
      screen.getByRole('link', { name: 'Mi perfil: Superadmin, Superadmin' }),
    ).toBeInTheDocument()
  })

  test('la facultad se elige entre las de la universidad elegida', async () => {
    await abrir('/superadmin', superadminSinElegir())

    const facultad = await screen.findByLabelText('Facultad')
    expect(facultad).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Universidad'), {
      target: { value: 'universidad-sur' },
    })
    const opciones = within(screen.getByLabelText('Facultad'))
      .getAllByRole('option')
      .map((opcion) => opcion.textContent)
    expect(opciones).toEqual([
      'Elige una facultad',
      'Facultad de Ciencias de la Salud',
    ])
  })

  test('al elegir, guarda la elección y lleva a gestión académica', async () => {
    let cuerpo: unknown
    await abrir('/superadmin', superadminSinElegir(), {
      '/api/superadmin/contexto': (init) => {
        cuerpo = JSON.parse(String(init?.body))
        return EN_SALUD_SUR
      },
    })

    await elegir('universidad-sur', 'salud-sur')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Gestión académica',
      }),
    ).toBeInTheDocument()
    expect(cuerpo).toEqual({
      universidadId: 'universidad-sur',
      facultadId: 'salud-sur',
    })
    // El encabezado muestra la facultad elegida.
    expect(
      screen.getByText('Facultad de Ciencias de la Salud · Semestre 2026-2'),
    ).toBeInTheDocument()
  })

  test('avisa si la facultad ya no está disponible', async () => {
    await abrir('/superadmin', superadminSinElegir(), {
      '/api/superadmin/contexto': () =>
        json({ message: 'La facultad no existe en esa universidad' }, 404),
    })

    await elegir('universidad-norte', 'ingenieria-norte')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa facultad ya no está disponible',
    )
  })

  test('con una facultad elegida, trabaja en gestión y la puede cambiar desde el menú', async () => {
    await abrir('/cursos', usuarioDePrueba('SUPERADMIN'))

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Gestión académica',
      }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('link', { name: 'Universidad y facultad' }),
    )
    expect(
      await screen.findByText(
        'Ahora trabajas en Facultad de Ingeniería, Universidad Demo Norte.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Universidad')).toHaveValue(
      'universidad-norte',
    )
  })

  test('muestra un error si no se pueden cargar las universidades', async () => {
    await abrir('/superadmin', superadminSinElegir(), {
      '/api/superadmin/universidades': () => json({}, 500),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las universidades.',
    )
  })

  test.each(['ADMINISTRATIVO', 'DIRECTOR', 'PROFESOR'] as const)(
    'el rol %s no ve la opción en el menú',
    async (rol) => {
      const menu = await renderConSesion(rol)
      expect(
        within(menu).queryByRole('link', { name: 'Universidad y facultad' }),
      ).not.toBeInTheDocument()
    },
  )
})
