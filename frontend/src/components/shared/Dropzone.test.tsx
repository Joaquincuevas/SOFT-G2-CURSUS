import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { Dropzone } from './Dropzone'

const pdf = (nombre = 'silabo.pdf', bytes = 2048) =>
  new File([new Uint8Array(bytes)], nombre, { type: 'application/pdf' })

const soloPdf = (archivo: File) =>
  archivo.name.endsWith('.pdf') ? null : 'El sílabo debe ser un PDF.'

function Controlado({
  validar,
  alCambiar = () => {},
}: {
  validar?: (archivo: File) => string | null
  alCambiar?: (archivo: File | null) => void
}) {
  const [archivo, setArchivo] = useState<File | null>(null)
  return (
    <>
      <label htmlFor="zona">Archivo</label>
      <Dropzone
        id="zona"
        archivo={archivo}
        validar={validar}
        accept=".pdf"
        descripcion="PDF, hasta 10 MiB"
        onArchivoChange={(nuevo) => {
          setArchivo(nuevo)
          alCambiar(nuevo)
        }}
      />
    </>
  )
}

describe('Dropzone', () => {
  test('invita a arrastrar o hacer clic, en español, y nombra el campo con su etiqueta', () => {
    render(<Controlado />)
    expect(
      screen.getByText('Arrastra un archivo aquí o haz clic para seleccionar'),
    ).toBeInTheDocument()
    const entrada = screen.getByLabelText('Archivo')
    expect(entrada).toHaveAttribute('type', 'file')
    expect(entrada).toHaveAttribute('accept', '.pdf')
    expect(entrada).toHaveAccessibleDescription('PDF, hasta 10 MiB')
    expect(screen.queryByText(/Choose File|No file chosen/)).toBeNull()
  })

  test('al elegir un archivo muestra su nombre y tamaño, y se puede quitar', () => {
    const alCambiar = vi.fn()
    render(<Controlado alCambiar={alCambiar} />)
    fireEvent.change(screen.getByLabelText('Archivo'), {
      target: { files: [pdf('programa.pdf', 2048)] },
    })
    expect(screen.getByText('programa.pdf')).toBeInTheDocument()
    expect(screen.getByText('2 KB')).toBeInTheDocument()
    expect(alCambiar).toHaveBeenLastCalledWith(expect.any(File))

    fireEvent.click(screen.getByRole('button', { name: 'Quitar programa.pdf' }))
    expect(alCambiar).toHaveBeenLastCalledWith(null)
    expect(
      screen.getByText('Arrastra un archivo aquí o haz clic para seleccionar'),
    ).toBeInTheDocument()
  })

  test('un archivo que no sirve no se entrega y el motivo queda junto al campo', () => {
    const alCambiar = vi.fn()
    render(<Controlado validar={soloPdf} alCambiar={alCambiar} />)
    const entrada = screen.getByLabelText('Archivo')
    fireEvent.change(entrada, {
      target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El sílabo debe ser un PDF.',
    )
    expect(entrada).toHaveAttribute('aria-invalid', 'true')
    expect(entrada).toHaveAccessibleDescription(/El sílabo debe ser un PDF\./)
    expect(alCambiar).toHaveBeenLastCalledWith(null)

    // Uno válido borra el motivo.
    fireEvent.change(entrada, { target: { files: [pdf()] } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(entrada).not.toHaveAttribute('aria-invalid')
  })

  test('tras un rechazo vacía el input, así el mismo archivo se vuelve a validar', () => {
    const validar = vi.fn(soloPdf)
    render(<Controlado validar={validar} />)
    const entrada = screen.getByLabelText('Archivo') as HTMLInputElement
    // jsdom no deja escribir un valor en un input de archivo: se simula el que
    // deja el navegador al elegir uno.
    let valor = ''
    Object.defineProperty(entrada, 'value', {
      configurable: true,
      get: () => valor,
      set: (nuevo: string) => {
        valor = nuevo
      },
    })
    const elegirFoto = () => {
      valor = 'C:\\fakepath\\foto.png'
      fireEvent.change(entrada, {
        target: {
          files: [new File(['x'], 'foto.png', { type: 'image/png' })],
        },
      })
    }

    elegirFoto()
    expect(entrada.value).toBe('')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El sílabo debe ser un PDF.',
    )

    elegirFoto()
    expect(validar).toHaveBeenCalledTimes(2)
    expect(entrada.value).toBe('')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El sílabo debe ser un PDF.',
    )
    expect(entrada).toHaveAttribute('aria-invalid', 'true')
  })

  test('acepta un archivo soltado sobre la zona', () => {
    const alCambiar = vi.fn()
    render(<Controlado alCambiar={alCambiar} />)
    const zona = screen
      .getByText('Arrastra un archivo aquí o haz clic para seleccionar')
      .closest('div')!
    fireEvent.dragOver(zona)
    expect(zona).toHaveAttribute('data-encima', 'true')
    const soltar = createEvent.drop(zona)
    Object.defineProperty(soltar, 'dataTransfer', {
      value: { files: [pdf('soltado.pdf')] },
    })
    fireEvent(zona, soltar)
    expect(screen.getByText('soltado.pdf')).toBeInTheDocument()
  })

  test('hacer clic en la zona abre el selector del sistema', () => {
    render(<Controlado />)
    const entrada = screen.getByLabelText('Archivo') as HTMLInputElement
    const abrir = vi.spyOn(entrada, 'click')
    fireEvent.click(
      screen.getByText('Arrastra un archivo aquí o haz clic para seleccionar'),
    )
    expect(abrir).toHaveBeenCalled()
  })

  test('el input recibe el foco con el teclado (no se oculta del orden de tabulación)', () => {
    render(<Controlado />)
    const entrada = screen.getByLabelText('Archivo')
    expect(entrada).not.toHaveAttribute('tabindex', '-1')
    entrada.focus()
    expect(entrada).toHaveFocus()
  })

  test('deshabilitado no acepta archivos soltados', () => {
    const alCambiar = vi.fn()
    render(
      <Dropzone
        archivo={null}
        onArchivoChange={alCambiar}
        disabled
        aria-label="Archivo"
      />,
    )
    const zona = screen
      .getByText('Arrastra un archivo aquí o haz clic para seleccionar')
      .closest('div')!
    const soltar = createEvent.drop(zona)
    Object.defineProperty(soltar, 'dataTransfer', {
      value: { files: [pdf()] },
    })
    fireEvent(zona, soltar)
    expect(alCambiar).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Archivo')).toBeDisabled()
  })
})
