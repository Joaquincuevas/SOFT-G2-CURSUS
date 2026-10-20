import type { DocenteCreado } from '@cursus/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { json, renderConSesion, type RutaSimulada } from '../test/sesion'

const CREADO: DocenteCreado = {
  usuario: {
    id: 'usuario-nuevo',
    nombre: 'Ana Pérez',
    correo: 'ana@norte.cursus.test',
    rol: 'AYUDANTE',
  },
  passwordProvisoria: 'ABCD2345EFGH6789',
}

const abrir = (crear: RutaSimulada) =>
  renderConSesion('ADMINISTRATIVO', '/docentes', { '/api/usuarios': crear })

async function completar(campos: {
  nombre: string
  correo: string
  rol?: string
}) {
  fireEvent.change(await screen.findByLabelText('Nombre'), {
    target: { value: campos.nombre },
  })
  fireEvent.change(screen.getByLabelText('Correo institucional'), {
    target: { value: campos.correo },
  })
  if (campos.rol)
    fireEvent.click(screen.getByRole('radio', { name: campos.rol }))
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
}

describe('profesores y ayudantes (GES-21)', () => {
  test('el formulario pide nombre, correo y rol (Profesor por defecto)', async () => {
    await abrir(() => CREADO)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Profesores y ayudantes',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeRequired()
    expect(screen.getByLabelText('Correo institucional')).toHaveAttribute(
      'type',
      'email',
    )
    const rol = screen.getByRole('group', { name: 'Rol' })
    expect(within(rol).getByRole('radio', { name: 'Profesor' })).toBeChecked()
    expect(
      within(rol).getByRole('radio', { name: 'Ayudante' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('link', { name: 'Profesores y ayudantes' }),
    ).toHaveAttribute('href', '/docentes')
  })

  test('crea la cuenta y muestra la contraseña una sola vez, con copiar', async () => {
    const escribir = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: escribir },
    })
    let cuerpo: unknown
    await abrir((init) => {
      cuerpo = JSON.parse(String(init?.body))
      return json(CREADO, 201)
    })

    await completar({
      nombre: 'Ana Pérez',
      correo: 'ana@norte.cursus.test',
      rol: 'Ayudante',
    })
    const dialogo = await screen.findByRole('dialog', {
      name: 'Ayudante creado',
    })
    expect(cuerpo).toEqual({
      nombre: 'Ana Pérez',
      correo: 'ana@norte.cursus.test',
      rol: 'AYUDANTE',
    })
    expect(within(dialogo).getByText('ABCD2345EFGH6789')).toBeInTheDocument()
    expect(dialogo).toHaveTextContent('No se volverá a mostrar.')
    expect(dialogo).toHaveTextContent('entrégasela al ayudante')

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Copiar' }))
    expect(
      await within(dialogo).findByText('Contraseña copiada.'),
    ).toBeInTheDocument()
    expect(escribir).toHaveBeenCalledWith('ABCD2345EFGH6789')

    // Al cerrar se descarta: no queda en la página ni en localStorage, y el
    // formulario queda listo para otra cuenta.
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('ABCD2345EFGH6789')).toBeNull()
    expect(JSON.stringify({ ...localStorage })).not.toContain(
      'ABCD2345EFGH6789',
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })

  test('el botón se deshabilita durante el POST', async () => {
    let responder: (respuesta: Response) => void = () => {}
    await abrir(
      () =>
        new Promise<Response>((resolve) => {
          responder = resolve
        }),
    )
    await completar({ nombre: 'Ana Pérez', correo: 'ana@norte.cursus.test' })
    const boton = screen.getByRole('button', { name: 'Crear cuenta' })
    await waitFor(() => expect(boton).toBeDisabled())
    responder(
      json({ ...CREADO, usuario: { ...CREADO.usuario, rol: 'PROFESOR' } }, 201),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Profesor creado' }),
    ).toBeInTheDocument()
    expect(boton).toBeEnabled()
  })

  test.each([
    [400, 'El correo debe ser @norte.cursus.test'],
    [409, 'Ya existe una cuenta con ese correo'],
  ])(
    'muestra el error %i bajo el formulario sin abrir el diálogo',
    async (status, message) => {
      await abrir(() => json({ statusCode: status, message }, status))
      await completar({ nombre: 'Ana Pérez', correo: 'ana@norte.cursus.test' })
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.queryByRole('dialog')).toBeNull()
      // Los datos siguen en el formulario para corregirlos.
      expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez')
    },
  )

  test('muestra el primer error de validación del DTO', async () => {
    await abrir(() =>
      json(
        { statusCode: 400, message: ['El rol debe ser Profesor o Ayudante'] },
        400,
      ),
    )
    await completar({ nombre: 'Ana Pérez', correo: 'ana@norte.cursus.test' })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El rol debe ser Profesor o Ayudante',
    )
  })

  test('un error del servidor muestra un mensaje genérico', async () => {
    await abrir(() => new Response(null, { status: 500 }))
    await completar({ nombre: 'Ana Pérez', correo: 'ana@norte.cursus.test' })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo crear la cuenta.',
    )
  })

  test.each(['DIRECTOR', 'PROFESOR'] as const)(
    '%s no ve la página en el menú y vuelve al Dashboard',
    async (rol) => {
      await renderConSesion(rol, '/docentes')
      expect(
        screen.queryByRole('link', { name: 'Profesores y ayudantes' }),
      ).toBeNull()
      expect(screen.queryByRole('button', { name: 'Crear cuenta' })).toBeNull()
    },
  )
})
