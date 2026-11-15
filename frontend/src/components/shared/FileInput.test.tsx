import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { FileInput } from './FileInput'
import { FormField } from './FormField'

function elegir(entrada: HTMLElement, archivos: File[]) {
  Object.defineProperty(entrada, 'files', {
    value: archivos,
    configurable: true,
  })
  fireEvent.change(entrada)
}

const pdf = (nombre = 'informe.pdf') =>
  new File(['contenido'], nombre, { type: 'application/pdf' })

describe('FileInput', () => {
  test('está en español: botón «Seleccionar archivo» y «Ningún archivo seleccionado»', () => {
    render(<FileInput />)
    expect(screen.getByText('Seleccionar archivo')).toBeInTheDocument()
    expect(screen.getByText('Ningún archivo seleccionado')).toBeInTheDocument()
    expect(screen.queryByText(/choose file|no file chosen/i)).toBeNull()
  })

  test('el control es el input nativo de archivo, con la etiqueta «Seleccionar archivo»', () => {
    render(<FileInput name="informe" accept=".pdf,.docx" />)
    const entrada = screen.getByLabelText('Seleccionar archivo')
    expect(entrada).toHaveAttribute('type', 'file')
    expect(entrada).toHaveAttribute('name', 'informe')
    expect(entrada).toHaveAttribute('accept', '.pdf,.docx')
  })

  test('al elegir un archivo muestra su nombre y avisa con los archivos', () => {
    const alElegir = vi.fn()
    render(<FileInput onChange={alElegir} />)
    const archivo = pdf()
    elegir(screen.getByLabelText('Seleccionar archivo'), [archivo])
    expect(screen.getByText('informe.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Ningún archivo seleccionado')).toBeNull()
    expect(alElegir).toHaveBeenCalledWith([archivo])
  })

  test('con varios archivos junta los nombres; sin archivos vuelve al texto inicial', () => {
    render(<FileInput multiple />)
    const entrada = screen.getByLabelText('Seleccionar archivo')
    expect(entrada).toBeInTheDocument()
    elegir(entrada, [pdf('uno.pdf'), pdf('dos.pdf')])
    expect(screen.getByText('uno.pdf, dos.pdf')).toBeInTheDocument()
    elegir(entrada, [])
    expect(screen.getByText('Ningún archivo seleccionado')).toBeInTheDocument()
  })

  test('el nombre del archivo describe al control y se anuncia sin interrumpir', () => {
    render(<FileInput />)
    const entrada = screen.getByLabelText('Seleccionar archivo')
    expect(entrada).toHaveAccessibleDescription('Ningún archivo seleccionado')
    elegir(entrada, [pdf()])
    expect(entrada).toHaveAccessibleDescription('informe.pdf')
    expect(screen.getByText('informe.pdf')).toHaveAttribute(
      'aria-live',
      'polite',
    )
  })

  test('dentro de un FormField toma su etiqueta, su ayuda, su error y su obligatoriedad', () => {
    render(
      <FormField
        etiqueta="Informe"
        ayuda="Solo PDF, hasta 10 MB."
        error="Falta el informe."
        requerido
      >
        {(control) => <FileInput {...control} accept=".pdf" />}
      </FormField>,
    )
    const entrada = screen.getByLabelText(/Informe/)
    expect(entrada).toHaveAttribute('type', 'file')
    expect(entrada).toBeRequired()
    expect(entrada).toBeInvalid()
    expect(entrada).toHaveAccessibleDescription(
      'Solo PDF, hasta 10 MB. Falta el informe. Ningún archivo seleccionado',
    )
  })

  test('el teclado y el foco funcionan sobre el input: se enfoca y el botón muestra el foco', () => {
    render(<FileInput />)
    const entrada = screen.getByLabelText('Seleccionar archivo')
    expect(entrada).not.toHaveAttribute('tabindex', '-1')
    entrada.focus()
    expect(entrada).toHaveFocus()
    const boton = screen.getByText('Seleccionar archivo')
    expect(boton.tagName).toBe('LABEL')
    expect(boton).toHaveClass('peer-focus-visible:ring-[3px]')
  })

  test('deshabilitado no se puede usar y se ve apagado', () => {
    render(<FileInput disabled />)
    expect(screen.getByLabelText('Seleccionar archivo')).toBeDisabled()
    expect(screen.getByText('Seleccionar archivo')).toHaveClass(
      'peer-disabled:opacity-50',
    )
  })
})

describe('FileInput al restablecer el formulario', () => {
  // El reset nativo vacía los archivos del input después del evento `reset`; jsdom
  // no lo hace con los archivos que se le inyectan, así que se simula igual.
  function conFormulario(alElegir = vi.fn()) {
    render(
      <form aria-label="Entrega">
        <FileInput onChange={alElegir} />
        <button type="reset">Limpiar</button>
      </form>,
    )
    const formulario = screen.getByRole('form', { name: 'Entrega' })
    const entrada = screen.getByLabelText('Seleccionar archivo')
    const vaciarAlRestablecer = () =>
      formulario.addEventListener('reset', () =>
        Object.defineProperty(entrada, 'files', {
          value: [],
          configurable: true,
        }),
      )
    return { alElegir, entrada, formulario, vaciarAlRestablecer }
  }

  test('selecciona un archivo, restablece el formulario y vuelve a «Ningún archivo seleccionado»', async () => {
    const { alElegir, entrada, vaciarAlRestablecer } = conFormulario()
    elegir(entrada, [pdf()])
    expect(screen.getByText('informe.pdf')).toBeInTheDocument()

    vaciarAlRestablecer()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

    expect(
      await screen.findByText('Ningún archivo seleccionado'),
    ).toBeInTheDocument()
    expect(screen.queryByText('informe.pdf')).toBeNull()
    expect(entrada).toHaveAccessibleDescription('Ningún archivo seleccionado')
    // Quien usa el selector se entera de que ya no hay archivo.
    expect(alElegir).toHaveBeenLastCalledWith([])
  })

  test('también con form.reset() desde el código', async () => {
    const { entrada, formulario, vaciarAlRestablecer } = conFormulario()
    elegir(entrada, [pdf('uno.pdf'), pdf('dos.pdf')])
    expect(screen.getByText('uno.pdf, dos.pdf')).toBeInTheDocument()

    vaciarAlRestablecer()
    ;(formulario as HTMLFormElement).reset()

    expect(
      await screen.findByText('Ningún archivo seleccionado'),
    ).toBeInTheDocument()
  })

  test('si el restablecimiento se cancela, el archivo sigue y se sigue mostrando', async () => {
    const { alElegir, entrada, formulario } = conFormulario()
    elegir(entrada, [pdf()])
    alElegir.mockClear()
    formulario.addEventListener('reset', (evento) => evento.preventDefault())

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    await new Promise((resolver) => setTimeout(resolver, 20))

    expect(screen.getByText('informe.pdf')).toBeInTheDocument()
    expect(alElegir).not.toHaveBeenCalled()
  })

  test('restablecer sin archivo elegido no avisa ni cambia nada', async () => {
    const { alElegir } = conFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    await new Promise((resolver) => setTimeout(resolver, 20))
    expect(screen.getByText('Ningún archivo seleccionado')).toBeInTheDocument()
    expect(alElegir).not.toHaveBeenCalled()
  })

  test('puede elegir otro archivo después de restablecer', async () => {
    const { entrada, vaciarAlRestablecer } = conFormulario()
    elegir(entrada, [pdf()])
    vaciarAlRestablecer()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    await screen.findByText('Ningún archivo seleccionado')

    elegir(entrada, [pdf('nuevo.pdf')])
    expect(screen.getByText('nuevo.pdf')).toBeInTheDocument()
  })
})
