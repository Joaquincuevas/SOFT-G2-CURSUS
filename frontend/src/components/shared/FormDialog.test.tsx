import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { Input } from '@/components/ui/input'
import { FormDialog } from './FormDialog'
import { FormField } from './FormField'

// Página mínima: un botón abre el diálogo con un campo precargado.
function Pagina({
  onGuardar,
  inicial = 'Ingeniería',
}: {
  onGuardar: (valor: string) => Promise<string | null>
  inicial?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState(inicial)
  return (
    <>
      <button onClick={() => setAbierto(true)}>Abrir</button>
      <FormDialog
        abierto={abierto}
        onAbiertoChange={setAbierto}
        titulo="Editar carrera"
        descripcion="Se guarda en tu facultad."
        sucio={valor !== inicial}
        onGuardar={() => onGuardar(valor)}
      >
        <FormField etiqueta="Nombre">
          {(c) => (
            <Input
              {...c}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          )}
        </FormField>
      </FormDialog>
    </>
  )
}

const abrir = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
  return screen.findByRole('dialog', { name: 'Editar carrera' })
}
const cerrado = () =>
  waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

describe('FormDialog', () => {
  test('abre con el título, los datos precargados y el foco en el primer campo', async () => {
    render(<Pagina onGuardar={async () => null} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const dialogo = within(await abrir())
    expect(dialogo.getByText('Se guarda en tu facultad.')).toBeInTheDocument()
    expect(dialogo.getByLabelText('Nombre')).toHaveValue('Ingeniería')
    expect(dialogo.getByLabelText('Nombre')).toHaveFocus()
    expect(
      dialogo.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeEnabled()
  })

  test('Cancelar, Escape y la X cierran sin guardar cuando no hay cambios', async () => {
    const guardar = vi.fn(async () => null)
    render(<Pagina onGuardar={guardar} />)
    for (const cerrar of [
      (d: ReturnType<typeof within>) =>
        fireEvent.click(d.getByRole('button', { name: 'Cancelar' })),
      (d: ReturnType<typeof within>) =>
        fireEvent.keyDown(d.getByLabelText('Nombre'), { key: 'Escape' }),
      (d: ReturnType<typeof within>) =>
        fireEvent.click(d.getByRole('button', { name: 'Cerrar' })),
    ]) {
      cerrar(within(await abrir()))
      await cerrado()
    }
    expect(guardar).not.toHaveBeenCalled()
  })

  test('al guardar bien se cierra', async () => {
    const guardar = vi.fn(async () => null)
    render(<Pagina onGuardar={guardar} />)
    const dialogo = within(await abrir())
    fireEvent.change(dialogo.getByLabelText('Nombre'), {
      target: { value: 'Otra' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Guardar cambios' }))
    await cerrado()
    expect(guardar).toHaveBeenCalledWith('Otra')
  })

  test('un error del servidor se muestra dentro, sin cerrar ni perder lo escrito', async () => {
    render(
      <Pagina
        onGuardar={async () => 'Ya existe una carrera con ese nombre.'}
      />,
    )
    const dialogo = within(await abrir())
    fireEvent.change(dialogo.getByLabelText('Nombre'), {
      target: { value: 'Otra' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: 'Guardar cambios' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent(
      'Ya existe una carrera',
    )
    expect(dialogo.getByLabelText('Nombre')).toHaveValue('Otra')
    expect(
      dialogo.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeEnabled()
  })

  test('si guardar lanza (sin conexión), avisa dentro del diálogo', async () => {
    render(
      <Pagina
        onGuardar={async () => {
          throw new TypeError('offline')
        }}
      />,
    )
    const dialogo = within(await abrir())
    fireEvent.click(dialogo.getByRole('button', { name: 'Guardar cambios' }))
    expect(await dialogo.findByRole('alert')).toHaveTextContent(
      'Comprueba tu conexión',
    )
  })

  test('mientras guarda: botón deshabilitado con progreso, y no se puede cerrar', async () => {
    let terminar!: (m: string | null) => void
    render(
      <Pagina
        onGuardar={() =>
          new Promise<string | null>((resolve) => {
            terminar = resolve
          })
        }
      />,
    )
    const dialogo = within(await abrir())
    fireEvent.click(dialogo.getByRole('button', { name: 'Guardar cambios' }))
    expect(
      await dialogo.findByRole('button', { name: 'Guardando…' }),
    ).toBeDisabled()
    expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    fireEvent.keyDown(dialogo.getByLabelText('Nombre'), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => terminar(null))
    await cerrado()
  })

  test('con cambios sin guardar pide confirmar: seguir editando conserva, descartar cierra', async () => {
    render(<Pagina onGuardar={async () => null} />)
    const dialogo = within(await abrir())
    fireEvent.change(dialogo.getByLabelText('Nombre'), {
      target: { value: 'Cambio' },
    })
    fireEvent.keyDown(dialogo.getByLabelText('Nombre'), { key: 'Escape' })
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Seguir editando',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(dialogo.getByLabelText('Nombre')).toHaveValue('Cambio')
    fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Descartar',
      }),
    )
    await cerrado()
  })
})
