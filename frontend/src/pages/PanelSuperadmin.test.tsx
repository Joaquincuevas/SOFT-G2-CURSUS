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
    dominioCorreo: 'norte.cursus.test',
    color: '#1b4f72',
    facultades: [
      { id: 'economia-norte', nombre: 'Facultad de Economía y Negocios' },
      { id: 'ingenieria-norte', nombre: 'Facultad de Ingeniería' },
    ],
  },
  {
    id: 'universidad-sur',
    nombre: 'Universidad Demo Sur',
    dominioCorreo: 'sur.cursus.test',
    color: '#0a5c36',
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

const contexto = () => screen.getByRole('region', { name: 'Contexto' })

describe('superadmin: Dashboard de universidades (MT-04)', () => {
  test('al entrar ve las universidades con sus facultades, en la vista global', async () => {
    await abrir('/', superadminSinElegir())

    const sur = await screen.findByRole('region', {
      name: 'Universidad Demo Sur',
    })
    expect(
      within(sur)
        .getAllByRole('button')
        .map((boton) => boton.textContent),
    ).toEqual(['Facultad de Ciencias de la Salud'])
    expect(
      screen.getByRole('region', { name: 'Universidad Demo Norte' }),
    ).toBeInTheDocument()
    expect(contexto()).toHaveTextContent(
      'Vista global: no estás trabajando en ninguna universidad.',
    )
    // El encabezado muestra su rol.
    expect(
      screen.getByRole('link', { name: 'Mi perfil: Superadmin, Superadmin' }),
    ).toBeInTheDocument()
  })

  test('sin elegir, las vistas del Administrativo avisan y llevan al Dashboard', async () => {
    await abrir('/cursos', superadminSinElegir())

    expect(
      await screen.findByRole('heading', {
        name: 'Elige una universidad primero',
      }),
    ).toBeInTheDocument()
    // No redirige: sigue en la ruta pedida.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Gestión académica' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Elegir universidad' }))
    expect(
      await screen.findByRole('region', { name: 'Universidad Demo Norte' }),
    ).toBeInTheDocument()
  })

  test('sin elegir, puede ver su perfil', async () => {
    await abrir('/perfil', superadminSinElegir())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi perfil' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Elige una universidad primero' }),
    ).not.toBeInTheDocument()
  })

  test('al elegir una facultad, la guarda y lleva a gestión académica', async () => {
    let cuerpo: unknown
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/contexto': (init) => {
        cuerpo = JSON.parse(String(init?.body))
        return EN_SALUD_SUR
      },
    })

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Trabajar en Facultad de Ciencias de la Salud, Universidad Demo Sur',
      }),
    )

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
    // El encabezado y la barra muestran la facultad elegida.
    expect(
      screen.getByText('Facultad de Ciencias de la Salud · Semestre 2026-2'),
    ).toBeInTheDocument()
    expect(contexto()).toHaveTextContent(
      'Trabajando en Facultad de Ciencias de la Salud, Universidad Demo Sur',
    )
  })

  test('avisa si la facultad ya no está disponible', async () => {
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/contexto': () =>
        json({ message: 'La facultad no existe en esa universidad' }, 404),
    })

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Trabajar en Facultad de Ingeniería, Universidad Demo Norte',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa facultad ya no está disponible',
    )
  })

  test('con una facultad elegida, la marca y "Cambiar" vuelve al Dashboard', async () => {
    await abrir('/cursos', usuarioDePrueba('SUPERADMIN'))

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Gestión académica',
      }),
    ).toBeInTheDocument()
    fireEvent.click(within(contexto()).getByRole('link', { name: 'Cambiar' }))

    const norte = await screen.findByRole('region', {
      name: 'Universidad Demo Norte',
    })
    expect(within(norte).getByText('Trabajando aquí')).toBeInTheDocument()
    // La facultad actual no se vuelve a elegir; las demás sí.
    expect(
      within(norte)
        .getAllByRole('button')
        .map((boton) => boton.textContent),
    ).toEqual(['Facultad de Economía y Negocios'])
  })

  test('al salir de la universidad vuelve a la vista global', async () => {
    let metodo: string | undefined
    await abrir('/cursos', usuarioDePrueba('SUPERADMIN'), {
      '/api/superadmin/contexto': (init) => {
        metodo = init?.method
        return superadminSinElegir()
      },
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Salir de la universidad' }),
    )

    expect(
      await screen.findByText(
        'Vista global: no estás trabajando en ninguna universidad.',
      ),
    ).toBeInTheDocument()
    expect(metodo).toBe('DELETE')
    expect(
      await screen.findByRole('region', { name: 'Universidad Demo Norte' }),
    ).toBeInTheDocument()
  })

  test('avisa si no puede salir de la universidad', async () => {
    await abrir('/cursos', usuarioDePrueba('SUPERADMIN'), {
      '/api/superadmin/contexto': () => json({}, 500),
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Salir de la universidad' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo salir de la universidad.',
    )
    expect(contexto()).toHaveTextContent('Trabajando en')
  })

  test('muestra un error si no se pueden cargar las universidades', async () => {
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/universidades': () => json({}, 500),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las universidades.',
    )
  })

  test.each(['ADMINISTRATIVO', 'DIRECTOR', 'PROFESOR'] as const)(
    'el rol %s no ve la barra del superadmin',
    async (rol) => {
      await renderConSesion(rol)
      expect(
        screen.queryByRole('region', { name: 'Contexto' }),
      ).not.toBeInTheDocument()
    },
  )
})
