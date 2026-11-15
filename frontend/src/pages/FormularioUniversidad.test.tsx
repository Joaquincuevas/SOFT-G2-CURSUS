import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { FormularioUniversidad } from './FormularioUniversidad'

function abrir(
  onGuardar = vi.fn().mockResolvedValue(null),
  extra: Partial<Parameters<typeof FormularioUniversidad>[0]> = {},
) {
  render(
    <FormularioUniversidad
      titulo="Nueva universidad"
      textoBoton="Crear universidad"
      onGuardar={onGuardar}
      {...extra}
    />,
  )
  return onGuardar
}

const escribir = (etiqueta: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  })

describe('FormularioUniversidad', () => {
  test('cada campo tiene su etiqueta y la ayuda queda unida al campo', () => {
    abrir()
    expect(
      screen.getByRole('form', { name: 'Nueva universidad' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nueva universidad' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeRequired()
    const dominio = screen.getByLabelText('Dominio del correo')
    expect(dominio).toBeRequired()
    expect(dominio).toHaveAccessibleDescription(/terminan en @dominio/)
    const color = screen.getByLabelText('Color')
    expect(color).toHaveAttribute('type', 'color')
    expect(color).toHaveAccessibleDescription(/contraste mínimo es 4,5:1/)
    expect(screen.getByText('#1b4f72')).toBeInTheDocument()
  })

  test('envía los datos sin espacios de más, en minúsculas', async () => {
    const onGuardar = abrir()
    escribir('Nombre', '  Universidad   del Pacífico ')
    escribir('Dominio del correo', ' Pacifico.CL ')
    escribir('Color', '#AA3300')
    fireEvent.click(screen.getByRole('button', { name: 'Crear universidad' }))
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        nombre: 'Universidad del Pacífico',
        dominioCorreo: 'pacifico.cl',
        color: '#aa3300',
      }),
    )
  })

  test('un color sin contraste no se envía: marca el campo, avisa y se corrige', async () => {
    const onGuardar = abrir()
    escribir('Nombre', 'Nueva')
    escribir('Dominio del correo', 'nueva.cl')
    escribir('Color', '#ffff00')
    fireEvent.click(screen.getByRole('button', { name: 'Crear universidad' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('contraste mínimo 4,5:1')
    expect(alerta).toHaveAttribute('data-variant', 'danger')
    expect(screen.getByLabelText('Color')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(onGuardar).not.toHaveBeenCalled()

    escribir('Color', '#0a5c36')
    expect(screen.getByLabelText('Color')).not.toHaveAttribute('aria-invalid')
    fireEvent.click(screen.getByRole('button', { name: 'Crear universidad' }))
    await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  })

  test('mientras guarda deshabilita todo y muestra «Guardando…»', async () => {
    let terminar: (error: string | null) => void = () => {}
    const onGuardar = vi.fn(
      () => new Promise<string | null>((resolver) => (terminar = resolver)),
    )
    abrir(onGuardar, { onCancelar: () => {} })
    escribir('Nombre', 'Nueva')
    escribir('Dominio del correo', 'nueva.cl')
    fireEvent.click(screen.getByRole('button', { name: 'Crear universidad' }))
    const boton = await screen.findByRole('button', { name: 'Guardando…' })
    expect(boton).toBeDisabled()
    expect(screen.getByLabelText('Nombre')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    terminar(null)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Crear universidad' }),
      ).toBeEnabled(),
    )
  })

  test('muestra el error que devuelve quien guarda, en una alerta de peligro', async () => {
    abrir(vi.fn().mockResolvedValue('Ya existe una universidad con ese nombre'))
    escribir('Nombre', 'Norte')
    escribir('Dominio del correo', 'norte.cl')
    fireEvent.click(screen.getByRole('button', { name: 'Crear universidad' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una universidad con ese nombre',
    )
  })

  test('al editar parte de los datos actuales y Cancelar es opcional', () => {
    abrir(undefined, {
      titulo: 'Datos de la universidad',
      textoBoton: 'Guardar cambios',
      inicial: { nombre: 'Norte', dominioCorreo: 'norte.cl', color: '#0a5c36' },
    })
    expect(screen.getByLabelText('Nombre')).toHaveValue('Norte')
    expect(screen.getByLabelText('Dominio del correo')).toHaveValue('norte.cl')
    expect(screen.getByLabelText('Color')).toHaveValue('#0a5c36')
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  })

  test('Cancelar llama a quien lo abrió', () => {
    const onCancelar = vi.fn()
    abrir(undefined, { onCancelar })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancelar).toHaveBeenCalledOnce()
  })
})
