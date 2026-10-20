import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { json, renderConSesion } from '../test/sesion'

afterEach(() => {
  vi.unstubAllGlobals()
})

const campo = (nombre: string) =>
  screen.getByRole('textbox', { name: nombre }) as HTMLInputElement
const guardar = () => screen.getByRole('button', { name: 'Guardar cambios' })

describe('perfil (PER-01)', () => {
  test('se llega desde el nombre del encabezado y no aparece en el menú', async () => {
    const menu = await renderConSesion('ALUMNO')

    expect(
      within(menu).queryByRole('link', { name: 'Mi perfil' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('banner')).getByRole('link', {
        name: /Mi perfil/,
      }),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mi perfil' }),
    ).toBeInTheDocument()
  })

  test('muestra nombre, correo, rol, universidad y facultad', async () => {
    await renderConSesion('PROFESOR', '/perfil')

    expect(campo('Nombre').value).toBe('Profesor Norte')
    expect(campo('Correo institucional').value).toBe(
      'profesor@norte.cursus.test',
    )
    expect(campo('Rol').value).toBe('Profesor')
    expect(campo('Universidad').value).toBe('Universidad Demo Norte')
    expect(campo('Facultad').value).toBe('Facultad de Ingeniería')
  })

  test('solo el nombre es editable', async () => {
    await renderConSesion('ALUMNO', '/perfil')

    expect(campo('Nombre')).not.toHaveAttribute('readonly')
    for (const nombre of ['Correo institucional', 'Rol', 'Universidad']) {
      expect(campo(nombre)).toHaveAttribute('readonly')
    }
  })

  test('al guardar, el encabezado muestra el nombre nuevo de inmediato', async () => {
    const pedidos: unknown[] = []
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil': (init) => {
        pedidos.push(JSON.parse(String(init?.body)))
        return { nombre: 'Camila Rojas' }
      },
    })

    expect(guardar()).toBeDisabled()
    fireEvent.change(campo('Nombre'), { target: { value: 'Camila Rojas' } })
    fireEvent.click(guardar())

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nombre actualizado.',
    )
    expect(pedidos).toEqual([{ nombre: 'Camila Rojas' }])
    const encabezado = within(screen.getByRole('banner'))
    expect(encabezado.getByText('Camila Rojas')).toBeInTheDocument()
    expect(encabezado.getByText('CR')).toBeInTheDocument()
  })

  test('con un nombre inválido muestra el error y no cambia el encabezado', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil': () => json({ message: ['nombre'] }, 400),
    })

    fireEvent.change(campo('Nombre'), { target: { value: 'x' } })
    fireEvent.click(guardar())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El nombre no puede quedar vacío ni tener más de 120 caracteres.',
    )
    expect(
      within(screen.getByRole('banner')).getByText('Alumno Norte'),
    ).toBeInTheDocument()
  })

  test('si el servidor falla, avisa y deja intentar de nuevo', async () => {
    await renderConSesion('ALUMNO', '/perfil', {
      '/api/perfil': () => json({}, 500),
    })

    fireEvent.change(campo('Nombre'), { target: { value: 'Otro Nombre' } })
    fireEvent.click(guardar())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el nombre. Intenta de nuevo.',
    )
    await waitFor(() => expect(guardar()).toBeEnabled())
  })

  test('el Director ve su perfil en solo lectura, sin botón para guardar', async () => {
    await renderConSesion('DIRECTOR', '/perfil')

    expect(campo('Nombre')).toHaveAttribute('readonly')
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Como Director, tus datos son de solo lectura.'),
    ).toBeInTheDocument()
  })
})
