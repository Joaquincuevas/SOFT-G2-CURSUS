import type {
  CrearUniversidad,
  UniversidadElegible,
  UsuarioSesion,
} from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import {
  json,
  renderConSesion,
  type RutaSimulada,
  superadminSinElegir,
  usuarioDePrueba,
} from '../test/sesion'

// GES-23: el superadmin crea universidades desde su Dashboard y administra
// cada una (datos, facultades y archivar) en su propia página.

const NORTE: UniversidadElegible = {
  id: 'universidad-norte',
  nombre: 'Universidad Demo Norte',
  dominioCorreo: 'norte.cursus.test',
  color: '#1b4f72',
  facultades: [
    { id: 'economia-norte', nombre: 'Facultad de Economía y Negocios' },
    { id: 'ingenieria-norte', nombre: 'Facultad de Ingeniería' },
  ],
}

const RUTA_NORTE = '/superadmin/universidades/universidad-norte'
const API_NORTE = '/api/superadmin/universidades/universidad-norte'

const sinContenido = () => new Response(null, { status: 204 })

// Registra las peticiones a una ruta simulada: método y cuerpo.
function registrar(respuesta: RutaSimulada) {
  const pedidas: { metodo?: string; cuerpo?: unknown }[] = []
  const ruta: RutaSimulada = (init, url) => {
    pedidas.push({
      metodo: init?.method,
      cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return respuesta(init, url)
  }
  return { pedidas, ruta }
}

const abrir = (
  path: string,
  rutas: Record<string, RutaSimulada> = {},
  usuario: UsuarioSesion = superadminSinElegir(),
) =>
  renderConSesion('SUPERADMIN', path, {
    '/api/auth/yo': () => usuario,
    '/api/superadmin/universidades': () => [NORTE],
    ...rutas,
  })

const escribir = (etiqueta: string, valor: string, dentro?: HTMLElement) =>
  fireEvent.change(
    (dentro ? within(dentro) : screen).getByLabelText(etiqueta),
    { target: { value: valor } },
  )

describe('Dashboard: nueva universidad (GES-23)', () => {
  test('rechaza un color sin contraste antes de enviar y permite corregirlo', async () => {
    const { pedidas, ruta } = registrar((init) =>
      init?.method === 'POST' ? { ...NORTE, nombre: 'Nueva' } : [NORTE],
    )
    await abrir('/', { '/api/superadmin/universidades': ruta })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva universidad' }),
    )
    const form = screen.getByRole('form', { name: 'Nueva universidad' })
    escribir('Nombre', 'Nueva', form)
    escribir('Dominio del correo', 'nueva.cl', form)
    escribir('Color', '#ffff00', form)
    fireEvent.click(
      within(form).getByRole('button', { name: 'Crear universidad' }),
    )
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'contraste mínimo 4,5:1',
    )
    expect(pedidas.some((p) => p.metodo === 'POST')).toBe(false)
    escribir('Color', '#0a5c36', form)
    fireEvent.click(
      within(form).getByRole('button', { name: 'Crear universidad' }),
    )
    await waitFor(() =>
      expect(pedidas.find((p) => p.metodo === 'POST')?.cuerpo).toMatchObject({
        color: '#0a5c36',
      }),
    )
  })

  test('crea una universidad con nombre, dominio y color', async () => {
    const creada: UniversidadElegible = {
      id: 'universidad-pacifico',
      nombre: 'Universidad del Pacífico',
      dominioCorreo: 'pacifico.cl',
      color: '#aa3300',
      facultades: [],
    }
    const { pedidas, ruta } = registrar((init) =>
      init?.method === 'POST' ? creada : [NORTE],
    )
    await abrir('/', { '/api/superadmin/universidades': ruta })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva universidad' }),
    )
    const formulario = screen.getByRole('form', { name: 'Nueva universidad' })
    escribir('Nombre', '  Universidad   del Pacífico ', formulario)
    escribir('Dominio del correo', ' Pacifico.CL ', formulario)
    escribir('Color', '#aa3300', formulario)
    fireEvent.click(
      within(formulario).getByRole('button', { name: 'Crear universidad' }),
    )

    expect(
      await screen.findByText('Universidad del Pacífico creada'),
    ).toBeInTheDocument()
    expect(pedidas.find((p) => p.metodo === 'POST')?.cuerpo).toEqual({
      nombre: 'Universidad del Pacífico',
      dominioCorreo: 'pacifico.cl',
      color: '#aa3300',
    })
    expect(
      screen.queryByRole('form', { name: 'Nueva universidad' }),
    ).not.toBeInTheDocument()
  })

  test('muestra el motivo si la API la rechaza', async () => {
    await abrir('/', {
      '/api/superadmin/universidades': (init) =>
        init?.method === 'POST'
          ? json({ message: 'Ya existe una universidad con ese nombre' }, 409)
          : [NORTE],
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva universidad' }),
    )
    const formulario = screen.getByRole('form', { name: 'Nueva universidad' })
    escribir('Nombre', 'Universidad Demo Norte', formulario)
    escribir('Dominio del correo', 'otra.cl', formulario)
    fireEvent.click(
      within(formulario).getByRole('button', { name: 'Crear universidad' }),
    )

    expect(await within(formulario).findByRole('alert')).toHaveTextContent(
      'Ya existe una universidad con ese nombre',
    )
  })

  test('cada universidad muestra su dominio y lleva a administrarla', async () => {
    await abrir('/')

    const norte = await screen.findByRole('region', {
      name: 'Universidad Demo Norte',
    })
    expect(within(norte).getByText('@norte.cursus.test')).toBeInTheDocument()
    fireEvent.click(
      within(norte).getByRole('link', {
        name: 'Administrar Universidad Demo Norte',
      }),
    )

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Administrar universidad',
      }),
    ).toBeInTheDocument()
  })
})

describe('Administrar una universidad (GES-23)', () => {
  test('avisa del color antiguo sin contraste y retira el aviso al corregirlo', async () => {
    let universidad = { ...NORTE, color: '#ffff00' }
    await abrir(
      RUTA_NORTE,
      {
        '/api/superadmin/universidades': () => [universidad],
        [API_NORTE]: (init) => {
          universidad = {
            ...universidad,
            ...(JSON.parse(String(init?.body)) as CrearUniversidad),
          }
          return universidad
        },
      },
      { ...usuarioDePrueba('SUPERADMIN'), universidadColor: universidad.color },
    )
    expect(
      await screen.findByRole('status', { name: 'Color institucional' }),
    ).toHaveTextContent('CURSUS como respaldo')
    expect(
      document.documentElement.style.getPropertyValue('--color-primary'),
    ).toBe('')
    const form = screen.getByRole('form', { name: 'Datos de la universidad' })
    expect(within(form).getByLabelText('Color')).toHaveValue('#ffff00')
    escribir('Color', '#0a5c36', form)
    fireEvent.click(
      within(form).getByRole('button', { name: 'Guardar cambios' }),
    )
    await screen.findByText('Datos de la universidad guardados')
    await waitFor(() => {
      const actualizado = screen.getByRole('form', {
        name: 'Datos de la universidad',
      })
      expect(within(actualizado).getByLabelText('Color')).toHaveValue('#0a5c36')
      expect(
        screen.queryByRole('status', { name: 'Color institucional' }),
      ).not.toBeInTheDocument()
      expect(
        document.documentElement.style.getPropertyValue('--color-primary'),
      ).toBe('#0a5c36')
    })
  })

  test('aplica inmediatamente el color guardado si es la universidad elegida', async () => {
    let universidad = NORTE
    await abrir(
      RUTA_NORTE,
      {
        '/api/superadmin/universidades': () => [universidad],
        [API_NORTE]: (init) => {
          universidad = { ...NORTE, ...JSON.parse(String(init?.body)) }
          return universidad
        },
      },
      usuarioDePrueba('SUPERADMIN'),
    )
    const form = await screen.findByRole('form', {
      name: 'Datos de la universidad',
    })
    escribir('Color', '#6b2d84', form)
    fireEvent.click(
      within(form).getByRole('button', { name: 'Guardar cambios' }),
    )
    await screen.findByText('Datos de la universidad guardados')
    expect(
      document.documentElement.style.getPropertyValue('--color-primary'),
    ).toBe('#6b2d84')
  })

  test('funciona sin facultad elegida y muestra sus datos y facultades', async () => {
    await abrir(RUTA_NORTE)

    const datos = await screen.findByRole('form', {
      name: 'Datos de la universidad',
    })
    expect(within(datos).getByLabelText('Nombre')).toHaveValue(
      'Universidad Demo Norte',
    )
    expect(within(datos).getByLabelText('Dominio del correo')).toHaveValue(
      'norte.cursus.test',
    )
    expect(within(datos).getByLabelText('Color')).toHaveValue('#1b4f72')
    expect(
      screen.getByRole('table', {
        name: 'Facultades de Universidad Demo Norte',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Elige una universidad primero' }),
    ).not.toBeInTheDocument()
  })

  test('guarda los datos y muestra el motivo de un rechazo', async () => {
    let respuesta: unknown = { ...NORTE, color: '#003366' }
    const { pedidas, ruta } = registrar(() => respuesta)
    await abrir(RUTA_NORTE, { [API_NORTE]: ruta })

    const datos = await screen.findByRole('form', {
      name: 'Datos de la universidad',
    })
    escribir('Color', '#003366', datos)
    fireEvent.click(
      within(datos).getByRole('button', { name: 'Guardar cambios' }),
    )
    expect(
      await screen.findByText('Datos de la universidad guardados'),
    ).toBeInTheDocument()
    expect(pedidas[0]).toEqual({
      metodo: 'PATCH',
      cuerpo: {
        nombre: 'Universidad Demo Norte',
        dominioCorreo: 'norte.cursus.test',
        color: '#003366',
      },
    })

    const mensaje =
      'No se puede cambiar el dominio de una universidad con usuarios: dejarían de poder iniciar sesión'
    respuesta = json({ message: mensaje }, 409)
    const otraVez = await screen.findByRole('form', {
      name: 'Datos de la universidad',
    })
    escribir('Dominio del correo', 'otro-norte.cl', otraVez)
    fireEvent.click(
      within(otraVez).getByRole('button', { name: 'Guardar cambios' }),
    )
    expect(await within(otraVez).findByRole('alert')).toHaveTextContent(mensaje)
  })

  test('crea, renombra y archiva facultades', async () => {
    const creadas = registrar(() => ({
      id: 'artes',
      nombre: 'Facultad de Artes',
    }))
    const editadas = registrar(() => ({
      id: 'economia-norte',
      nombre: 'Facultad de Negocios',
    }))
    const archivadas = registrar(sinContenido)
    await abrir(RUTA_NORTE, {
      [`${API_NORTE}/facultades`]: creadas.ruta,
      '/api/superadmin/facultades/economia-norte': editadas.ruta,
      '/api/superadmin/facultades/ingenieria-norte/archivar': archivadas.ruta,
    })

    escribir(
      'Nueva facultad',
      'Facultad de Artes',
      await screen.findByRole('form', { name: 'Nueva facultad' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Crear facultad' }))
    expect(await screen.findByText('Facultad creada')).toBeInTheDocument()
    expect(creadas.pedidas).toEqual([
      { metodo: 'POST', cuerpo: { nombre: 'Facultad de Artes' } },
    ])

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Editar Facultad de Economía y Negocios',
      }),
    )
    escribir('Nuevo nombre de la facultad', 'Facultad de Negocios')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar facultad' }))
    expect(await screen.findByText('Facultad guardada')).toBeInTheDocument()
    expect(editadas.pedidas).toEqual([
      { metodo: 'PATCH', cuerpo: { nombre: 'Facultad de Negocios' } },
    ])

    fireEvent.click(
      screen.getByRole('button', { name: 'Archivar Facultad de Ingeniería' }),
    )
    // Pide confirmación antes de archivar.
    expect(archivadas.pedidas).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(
      await screen.findByText('Facultad de Ingeniería archivada'),
    ).toBeInTheDocument()
    expect(archivadas.pedidas).toEqual([{ metodo: 'PATCH', cuerpo: undefined }])
  })

  test('explica por qué no se archiva una facultad en uso', async () => {
    const mensaje =
      'No se puede archivar: la facultad tiene 4 carreras, 12 cursos y 36 usuarios vigentes'
    await abrir(RUTA_NORTE, {
      '/api/superadmin/facultades/ingenieria-norte/archivar': () =>
        json({ message: mensaje }, 409),
    })

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Archivar Facultad de Ingeniería',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
  })

  test('muestra los usuarios afectados, exige el motivo y vuelve al Dashboard', async () => {
    const archivada = registrar(sinContenido)
    await abrir(RUTA_NORTE, {
      [`${API_NORTE}/usuarios-afectados`]: () => ({ usuarios: 36 }),
      [`${API_NORTE}/archivar`]: archivada.ruta,
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Archivar universidad' }),
    )
    const confirmar = screen.getByRole('form', { name: 'Confirmar archivo' })
    expect(
      await within(confirmar).findByText(
        '36 usuarios dejarán de poder iniciar sesión.',
      ),
    ).toBeInTheDocument()
    const boton = within(confirmar).getByRole('button', {
      name: 'Sí, archivar Universidad Demo Norte',
    })
    // Sin motivo no se archiva.
    expect(boton).toBeDisabled()
    escribir('Motivo', '   ', confirmar)
    expect(boton).toBeDisabled()
    expect(archivada.pedidas).toEqual([])

    escribir('Motivo', '  La universidad dejó el directorio ', confirmar)
    fireEvent.click(boton)

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Universidades' }),
    ).toBeInTheDocument()
    expect(archivada.pedidas).toEqual([
      {
        metodo: 'PATCH',
        cuerpo: { motivo: 'La universidad dejó el directorio' },
      },
    ])
  })

  test('cancelar no archiva y olvida el motivo', async () => {
    await abrir(RUTA_NORTE, {
      [`${API_NORTE}/usuarios-afectados`]: () => ({ usuarios: 1 }),
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Archivar universidad' }),
    )
    expect(
      await screen.findByText('1 usuario dejará de poder iniciar sesión.'),
    ).toBeInTheDocument()
    escribir('Motivo', 'Error')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(
      screen.queryByRole('form', { name: 'Confirmar archivo' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Archivar universidad' }),
    )
    expect(screen.getByLabelText('Motivo')).toHaveValue('')
  })

  test('no deja archivar si no se pudo contar a sus usuarios', async () => {
    let falla = true
    await abrir(RUTA_NORTE, {
      [`${API_NORTE}/usuarios-afectados`]: () =>
        falla ? json({ message: 'Error' }, 500) : { usuarios: 2 },
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Archivar universidad' }),
    )
    const confirmar = screen.getByRole('form', { name: 'Confirmar archivo' })
    expect(await within(confirmar).findByRole('alert')).toHaveTextContent(
      'No se pudo contar a sus usuarios.',
    )
    escribir('Motivo', 'La universidad dejó el directorio', confirmar)
    expect(
      within(confirmar).getByRole('button', {
        name: 'Sí, archivar Universidad Demo Norte',
      }),
    ).toBeDisabled()

    falla = false
    fireEvent.click(
      within(confirmar).getByRole('button', { name: 'Reintentar' }),
    )
    expect(
      await within(confirmar).findByText(
        '2 usuarios dejarán de poder iniciar sesión.',
      ),
    ).toBeInTheDocument()
    expect(
      within(confirmar).getByRole('button', {
        name: 'Sí, archivar Universidad Demo Norte',
      }),
    ).toBeEnabled()
  })

  test('avisa si la universidad no existe o está archivada', async () => {
    await abrir('/superadmin/universidades/otra')

    expect(
      await screen.findByRole('heading', { name: 'Universidad no disponible' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Volver al Dashboard' }),
    ).toBeInTheDocument()
  })

  test.each(['ADMINISTRATIVO', 'DIRECTOR'] as const)(
    'el rol %s vuelve a su Dashboard',
    async (rol) => {
      await renderConSesion(rol, RUTA_NORTE)

      await waitFor(() =>
        expect(
          screen.queryByRole('heading', {
            level: 1,
            name: 'Administrar universidad',
          }),
        ).not.toBeInTheDocument(),
      )
      expect(
        screen.queryByRole('button', { name: 'Nueva universidad' }),
      ).not.toBeInTheDocument()
    },
  )
})
