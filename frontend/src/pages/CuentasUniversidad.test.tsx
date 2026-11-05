import type {
  CuentaUniversidad,
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
} from '../test/sesion'

// GES-24: el superadmin crea, edita y archiva las cuentas de una universidad.

const INGENIERIA = { id: 'ingenieria-norte', nombre: 'Facultad de Ingeniería' }
const NORTE: UniversidadElegible = {
  id: 'universidad-norte',
  nombre: 'Universidad Demo Norte',
  dominioCorreo: 'norte.cursus.test',
  color: '#1b4f72',
  facultades: [
    { id: 'economia-norte', nombre: 'Facultad de Economía y Negocios' },
    INGENIERIA,
  ],
}

const DIRECTORA: CuentaUniversidad = {
  id: 'cuenta-directora',
  nombre: 'Ana Directora',
  correo: 'ana@norte.cursus.test',
  rol: 'DIRECTOR',
  facultad: null,
}
const ADMINISTRATIVO: CuentaUniversidad = {
  id: 'cuenta-administrativo',
  nombre: 'Beto Administrativo',
  correo: 'beto@norte.cursus.test',
  rol: 'ADMINISTRATIVO',
  facultad: INGENIERIA,
}
const CUENTAS = [DIRECTORA, ADMINISTRATIVO]

const PAGINA = '/superadmin/universidades/universidad-norte/cuentas'
const API = '/api/superadmin/universidades/universidad-norte/cuentas'

const sinContenido = () => new Response(null, { status: 204 })

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
  rutas: Record<string, RutaSimulada> = {},
  usuario: UsuarioSesion = superadminSinElegir(),
) =>
  renderConSesion('SUPERADMIN', PAGINA, {
    '/api/auth/yo': () => usuario,
    '/api/superadmin/universidades': () => [NORTE],
    [API]: () => CUENTAS,
    ...rutas,
  })

const escribir = (etiqueta: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  })

const filas = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((fila) => fila.children[0].textContent)

describe('lista de cuentas (GES-24)', () => {
  test('muestra nombre, correo, rol y facultad', async () => {
    await abrir()

    const fila = (await screen.findByText('Beto Administrativo')).closest('tr')
    expect(fila).toHaveTextContent('beto@norte.cursus.test')
    expect(fila).toHaveTextContent('Administrativo')
    expect(fila).toHaveTextContent('Facultad de Ingeniería')
    expect(screen.getByText('Ana Directora').closest('tr')).toHaveTextContent(
      'Sin facultad',
    )
  })

  test('busca por nombre o correo y filtra por rol', async () => {
    await abrir()
    await screen.findByText('Ana Directora')

    escribir('Buscar', 'BETO@')
    expect(filas()).toEqual(['Beto Administrativo'])
    escribir('Buscar', 'ana')
    expect(filas()).toEqual(['Ana Directora'])
    escribir('Buscar', 'nadie')
    expect(
      screen.getByText('Ninguna cuenta coincide con la búsqueda.'),
    ).toBeInTheDocument()

    escribir('Buscar', '')
    escribir('Filtrar por rol', 'ADMINISTRATIVO')
    expect(filas()).toEqual(['Beto Administrativo'])
  })

  test('si no carga, muestra el error y reintenta', async () => {
    let falla = true
    await abrir({
      [API]: () => (falla ? new Response(null, { status: 500 }) : CUENTAS),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las cuentas.',
    )
    falla = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Ana Directora')).toBeInTheDocument()
  })

  test('una universidad que no está muestra el aviso', async () => {
    await abrir({ '/api/superadmin/universidades': () => [] })

    expect(
      await screen.findByText('Universidad no disponible'),
    ).toBeInTheDocument()
  })

  test('se llega desde Administrar universidad', async () => {
    await renderConSesion(
      'SUPERADMIN',
      '/superadmin/universidades/universidad-norte',
      {
        '/api/auth/yo': () => superadminSinElegir(),
        '/api/superadmin/universidades': () => [NORTE],
        [API]: () => CUENTAS,
      },
    )

    fireEvent.click(
      await screen.findByRole('link', { name: 'Administrar cuentas' }),
    )
    expect(await screen.findByText('Ana Directora')).toBeInTheDocument()
  })

  test.each([
    ['ADMINISTRATIVO', /Bienvenido\/a/],
    ['DIRECTOR', 'Visión del Directorio'],
  ] as const)('el rol %s vuelve a su Dashboard', async (rol, titulo) => {
    const { pedidas, ruta } = registrar(() => CUENTAS)
    await renderConSesion(rol, PAGINA, { [API]: ruta })

    expect(
      await screen.findByRole('heading', { level: 1, name: titulo }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Cuentas de la universidad' }),
    ).toBeNull()
    expect(pedidas).toEqual([])
  })
})

describe('crear una cuenta', () => {
  const CREADA = {
    cuenta: { ...DIRECTORA, id: 'nueva', nombre: 'Nueva Persona' },
    passwordProvisoria: 'ABCD2345EFGH6789',
  }

  test('la facultad se pide solo para un Administrativo', async () => {
    await abrir()
    await screen.findByText('Ana Directora')

    expect(screen.queryByLabelText('Facultad')).toBeNull()
    escribir('Rol', 'ADMINISTRATIVO')
    expect(screen.getByLabelText('Facultad')).toBeRequired()
    escribir('Rol', 'PROFESOR')
    expect(screen.queryByLabelText('Facultad')).toBeNull()
  })

  test('crea un Director sin facultad y muestra la contraseña una sola vez', async () => {
    const { pedidas, ruta } = registrar((init) =>
      init?.method === 'POST' ? json(CREADA, 201) : CUENTAS,
    )
    await abrir({ [API]: ruta })
    await screen.findByText('Ana Directora')

    escribir('Nombre', '  Nueva   Persona ')
    escribir('Correo institucional', ' nueva@norte.cursus.test ')
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    const dialogo = await screen.findByRole('dialog', {
      name: 'Cuenta de Director creada',
    })
    expect(within(dialogo).getByText('ABCD2345EFGH6789')).toBeInTheDocument()
    expect(dialogo).toHaveTextContent('No se volverá a mostrar.')
    expect(pedidas.find((p) => p.metodo === 'POST')?.cuerpo).toEqual({
      nombre: 'Nueva Persona',
      correo: 'nueva@norte.cursus.test',
      rol: 'DIRECTOR',
    })
    expect(screen.getByLabelText('Nombre')).toHaveValue('')

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByText('ABCD2345EFGH6789')).toBeNull()
    expect(JSON.stringify({ ...localStorage })).not.toContain(
      'ABCD2345EFGH6789',
    )
  })

  test('envía la facultad del Administrativo', async () => {
    const { pedidas, ruta } = registrar((init) =>
      init?.method === 'POST' ? json(CREADA, 201) : CUENTAS,
    )
    await abrir({ [API]: ruta })
    await screen.findByText('Ana Directora')

    escribir('Nombre', 'Nueva Persona')
    escribir('Correo institucional', 'nueva@norte.cursus.test')
    escribir('Rol', 'ADMINISTRATIVO')
    escribir('Facultad', INGENIERIA.id)
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    await screen.findByRole('dialog')
    expect(pedidas.find((p) => p.metodo === 'POST')?.cuerpo).toMatchObject({
      rol: 'ADMINISTRATIVO',
      facultadId: INGENIERIA.id,
    })
  })

  test.each([
    [400, 'El correo debe ser @norte.cursus.test'],
    [409, 'Ya existe una cuenta con ese correo, vigente o archivada'],
  ])(
    'muestra el mensaje del %s y conserva lo escrito',
    async (status, message) => {
      await abrir({
        [API]: (init) =>
          init?.method === 'POST'
            ? json({ statusCode: status, message }, status)
            : CUENTAS,
      })
      await screen.findByText('Ana Directora')

      escribir('Nombre', 'Nueva Persona')
      escribir('Correo institucional', 'nueva@otro.cl')
      fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.getByLabelText('Correo institucional')).toHaveValue(
        'nueva@otro.cl',
      )
      expect(screen.queryByRole('dialog')).toBeNull()
    },
  )
})

describe('editar una cuenta', () => {
  test('carga sus datos, guarda y actualiza la lista', async () => {
    const guardada = { ...ADMINISTRATIVO, nombre: 'Beto Editado' }
    const { pedidas, ruta } = registrar(() => guardada)
    let editada = false
    await abrir({
      [`${API}/${ADMINISTRATIVO.id}`]: (init, url) => {
        editada = true
        return ruta(init, url)
      },
      [API]: () => (editada ? [DIRECTORA, guardada] : CUENTAS),
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Beto Administrativo' }),
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('Beto Administrativo')
    expect(screen.getByLabelText('Facultad')).toHaveValue(INGENIERIA.id)
    expect(
      screen.getByText('Si cambias el rol, se cerrarán sus sesiones abiertas.'),
    ).toBeInTheDocument()

    escribir('Nombre', 'Beto Editado')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Cuenta de Beto Editado guardada'),
    ).toBeInTheDocument()
    expect(pedidas).toEqual([
      {
        metodo: 'PATCH',
        cuerpo: {
          nombre: 'Beto Editado',
          correo: 'beto@norte.cursus.test',
          rol: 'ADMINISTRATIVO',
          facultadId: INGENIERIA.id,
        },
      },
    ])
    expect(screen.getByRole('form', { name: 'Nueva cuenta' })).toBeTruthy()
    expect(await screen.findByText('Beto Editado')).toBeInTheDocument()
  })

  test('muestra el 409 de un cambio de rol con asignaciones', async () => {
    const message =
      'No se puede cambiar el rol: tiene 2 secciones a cargo, 0 ayudantías y 0 inscripciones activas. Quítaselas primero'
    await abrir({
      [`${API}/${DIRECTORA.id}`]: () => json({ statusCode: 409, message }, 409),
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Ana Directora' }),
    )
    escribir('Rol', 'ALUMNO')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('form', { name: 'Editar cuenta' })).toBeTruthy()
  })

  test('cancelar vuelve al formulario de cuenta nueva', async () => {
    await abrir()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Ana Directora' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }))

    expect(screen.getByRole('form', { name: 'Nueva cuenta' })).toBeTruthy()
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })
})

describe('archivar una cuenta', () => {
  test('pide confirmación con lo que implica, y Cancelar no archiva', async () => {
    const { pedidas, ruta } = registrar(sinContenido)
    await abrir({ [`${API}/${DIRECTORA.id}/archivar`]: ruta })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Archivar Ana Directora' }),
    )
    expect(
      screen.getByText(/Ana Directora dejará de poder iniciar sesión/),
    ).toHaveTextContent('seguirán mostrándola')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText(/dejará de poder iniciar sesión/)).toBeNull()
    expect(pedidas).toEqual([])
  })

  test('al confirmar archiva y la quita de la lista', async () => {
    let archivada = false
    await abrir({
      [`${API}/${DIRECTORA.id}/archivar`]: () => {
        archivada = true
        return sinContenido()
      },
      [API]: () => (archivada ? [ADMINISTRATIVO] : CUENTAS),
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Archivar Ana Directora' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(
      await screen.findByText('Cuenta de Ana Directora archivada'),
    ).toBeInTheDocument()
    await waitFor(() => expect(filas()).toEqual(['Beto Administrativo']))
  })

  test('si falla, muestra el error y la cuenta sigue', async () => {
    await abrir({
      [`${API}/${DIRECTORA.id}/archivar`]: () =>
        new Response(null, { status: 500 }),
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Archivar Ana Directora' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar. Inténtalo nuevamente.',
    )
    expect(filas()).toContain('Ana Directora')
  })
})
