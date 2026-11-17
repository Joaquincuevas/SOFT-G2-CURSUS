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
  universidadColor: '#0a5c36',
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
      within(screen.getByRole('banner')).getAllByText('Superadmin'),
    ).toHaveLength(2) // el nombre de la cuenta de prueba y su rol
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
    expect(
      document.documentElement.style.getPropertyValue('--color-primary'),
    ).toBe('#0a5c36')
    // El menú lateral y la barra muestran la facultad elegida.
    expect(
      within(document.getElementById('sidebar')!).getByText(
        'Facultad de Ciencias de la Salud',
      ),
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
    await abrir('/cursos', EN_SALUD_SUR, {
      '/api/superadmin/contexto': (init) => {
        metodo = init?.method
        return superadminSinElegir()
      },
    })
    expect(
      document.documentElement.style.getPropertyValue('--color-primary'),
    ).toBe('#0a5c36')

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
      document.documentElement.style.getPropertyValue('--color-primary'),
    ).toBe('')
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

// UI/UX-09: estados y estructura del Dashboard migrado a shadcn.
describe('superadmin: Dashboard con shadcn (UI/UX-09)', () => {
  test('mientras carga muestra esqueletos y lo anuncia', async () => {
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/universidades': () => new Promise(() => {}),
    })
    expect(
      await screen.findByText('Cargando las universidades…'),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Nueva universidad' }),
    ).toBeNull()
  })

  test('el error de carga permite reintentar', async () => {
    let intentos = 0
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/universidades': () =>
        intentos++ === 0 ? json({}, 500) : UNIVERSIDADES,
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las universidades.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(
      await screen.findByRole('region', { name: 'Universidad Demo Norte' }),
    ).toBeInTheDocument()
  })

  test('sin universidades dice qué falta y ofrece crear la primera', async () => {
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/universidades': () => [],
    })
    expect(
      await screen.findByText('Todavía no hay universidades'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/0 universidades y 0 facultades/),
    ).toBeInTheDocument()
    const [encabezado, vacio] = screen.getAllByRole('button', {
      name: 'Nueva universidad',
    })
    expect(encabezado).toBeInTheDocument()
    fireEvent.click(vacio)
    expect(
      screen.getByRole('form', { name: 'Nueva universidad' }),
    ).toBeInTheDocument()
    // Con el formulario abierto, el botón de crear no se repite.
    expect(
      screen.queryByRole('button', { name: 'Nueva universidad' }),
    ).toBeNull()
  })

  test('resume cuántas universidades y facultades hay', async () => {
    await abrir('/', superadminSinElegir())
    expect(
      await screen.findByText(/2 universidades y 3 facultades\./),
    ).toBeInTheDocument()
  })

  test('cada universidad lleva a administrarla y a sus cuentas', async () => {
    await abrir('/', superadminSinElegir())
    const sur = within(
      await screen.findByRole('region', { name: 'Universidad Demo Sur' }),
    )
    expect(
      sur.getByRole('link', { name: 'Administrar Universidad Demo Sur' }),
    ).toHaveAttribute('href', '/superadmin/universidades/universidad-sur')
    expect(
      sur.getByRole('link', { name: 'Cuentas de Universidad Demo Sur' }),
    ).toHaveAttribute(
      'href',
      '/superadmin/universidades/universidad-sur/cuentas',
    )
  })

  test('una universidad sin facultades lo dice', async () => {
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/universidades': () => [
        { ...UNIVERSIDADES[0], facultades: [] },
      ],
    })
    const norte = within(
      await screen.findByRole('region', { name: 'Universidad Demo Norte' }),
    )
    expect(
      norte.getByText('Esta universidad no tiene facultades.'),
    ).toBeInTheDocument()
  })

  test('el color de cada universidad se muestra como muestra decorativa', async () => {
    await abrir('/', superadminSinElegir())
    const norte = await screen.findByRole('region', {
      name: 'Universidad Demo Norte',
    })
    const muestra = norte.querySelector('[aria-hidden="true"][style]')!
    expect(muestra).toHaveStyle({ background: '#1b4f72' })
  })

  test('crear una universidad avisa con un mensaje de éxito y cierra el formulario', async () => {
    const creada = {
      ...UNIVERSIDADES[1],
      id: 'u-nueva',
      nombre: 'Universidad Nueva',
    }
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/universidades': (init) =>
        init?.method === 'POST' ? creada : UNIVERSIDADES,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva universidad' }),
    )
    const formulario = screen.getByRole('form', { name: 'Nueva universidad' })
    fireEvent.change(within(formulario).getByLabelText('Nombre'), {
      target: { value: 'Universidad Nueva' },
    })
    fireEvent.change(within(formulario).getByLabelText('Dominio del correo'), {
      target: { value: 'nueva.cl' },
    })
    fireEvent.click(
      within(formulario).getByRole('button', { name: 'Crear universidad' }),
    )
    const aviso = await screen.findByText('Universidad Nueva creada')
    expect(aviso.closest('[data-slot="alert"]')).toHaveAttribute(
      'data-variant',
      'success',
    )
    expect(screen.queryByRole('form', { name: 'Nueva universidad' })).toBeNull()
  })

  test('el error de la API al crear se muestra en una alerta de peligro dentro del formulario', async () => {
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/universidades': (init) =>
        init?.method === 'POST'
          ? json({ message: 'Ya existe una universidad con ese nombre' }, 409)
          : UNIVERSIDADES,
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva universidad' }),
    )
    const formulario = screen.getByRole('form', { name: 'Nueva universidad' })
    fireEvent.change(within(formulario).getByLabelText('Nombre'), {
      target: { value: 'Universidad Demo Norte' },
    })
    fireEvent.change(within(formulario).getByLabelText('Dominio del correo'), {
      target: { value: 'otra.cl' },
    })
    fireEvent.click(
      within(formulario).getByRole('button', { name: 'Crear universidad' }),
    )
    const alerta = await within(formulario).findByRole('alert')
    expect(alerta).toHaveTextContent('Ya existe una universidad con ese nombre')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    // El formulario sigue abierto para corregir.
    expect(formulario).toBeInTheDocument()
  })

  test('Cancelar cierra el formulario y devuelve el botón', async () => {
    await abrir('/', superadminSinElegir())
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva universidad' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('form', { name: 'Nueva universidad' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Nueva universidad' }),
    ).toBeInTheDocument()
  })

  test('al elegir una facultad, el error de la API va en una alerta de peligro y se pueden elegir otras', async () => {
    await abrir('/', superadminSinElegir(), {
      '/api/superadmin/contexto': () => json({}, 500),
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Trabajar en Facultad de Ingeniería, Universidad Demo Norte',
      }),
    )
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('No se pudo entrar a la facultad.')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    expect(
      screen.getByRole('button', {
        name: 'Trabajar en Facultad de Ingeniería, Universidad Demo Norte',
      }),
    ).toBeEnabled()
  })

  test('la facultad en la que trabaja lleva la insignia y no es un botón', async () => {
    await abrir('/', EN_SALUD_SUR)
    const sur = within(
      await screen.findByRole('region', { name: 'Universidad Demo Sur' }),
    )
    expect(sur.queryByRole('button')).toBeNull()
    expect(sur.getByText('Trabajando aquí')).toHaveAttribute(
      'data-slot',
      'badge',
    )
  })

  test('los botones de facultad son de 44 px como mínimo', async () => {
    await abrir('/', superadminSinElegir())
    const boton = await screen.findByRole('button', {
      name: 'Trabajar en Facultad de Ingeniería, Universidad Demo Norte',
    })
    expect(boton).toHaveClass('min-h-11')
  })
})
