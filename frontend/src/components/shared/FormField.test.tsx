import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from './FormField'

describe('FormField', () => {
  test('la etiqueta y el control quedan unidos por label y id', () => {
    render(
      <FormField etiqueta="Correo institucional">
        {(control) => <Input {...control} />}
      </FormField>,
    )
    const campo = screen.getByLabelText('Correo institucional')
    expect(campo.tagName).toBe('INPUT')
    expect(campo).not.toHaveAttribute('aria-describedby')
    expect(campo).not.toHaveAttribute('aria-invalid')
    expect(campo).not.toBeRequired()
  })

  test('la ayuda describe al control con aria-describedby', () => {
    render(
      <FormField etiqueta="Nombre" ayuda="Como aparece en tu carnet.">
        {(control) => <Input {...control} />}
      </FormField>,
    )
    expect(screen.getByLabelText('Nombre')).toHaveAccessibleDescription(
      'Como aparece en tu carnet.',
    )
  })

  test('el error marca el control inválido, se anuncia y suma a la descripción', () => {
    render(
      <FormField
        etiqueta="Nombre"
        ayuda="Como aparece en tu carnet."
        error="El nombre es obligatorio."
      >
        {(control) => <Input {...control} />}
      </FormField>,
    )
    const campo = screen.getByLabelText('Nombre')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toBeInvalid()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El nombre es obligatorio.',
    )
    expect(campo).toHaveAccessibleDescription(
      'Como aparece en tu carnet. El nombre es obligatorio.',
    )
  })

  test('requerido muestra el asterisco, que no entra en el nombre, y marca el control', () => {
    render(
      <FormField etiqueta="Correo" requerido>
        {(control) => <Input {...control} />}
      </FormField>,
    )
    expect(screen.getByText('*')).toBeVisible()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
    // El asterisco es solo visual: el nombre accesible sigue siendo «Correo».
    const campo = screen.getByRole('textbox', { name: 'Correo' })
    expect(campo).toBeRequired()
  })

  test('cada campo tiene sus propios ids', () => {
    render(
      <>
        <FormField etiqueta="Uno" ayuda="Ayuda uno">
          {(control) => <Input {...control} />}
        </FormField>
        <FormField etiqueta="Dos" ayuda="Ayuda dos">
          {(control) => <Input {...control} />}
        </FormField>
      </>,
    )
    const uno = screen.getByLabelText('Uno')
    const dos = screen.getByLabelText('Dos')
    expect(uno.id).not.toBe(dos.id)
    expect(uno).toHaveAccessibleDescription('Ayuda uno')
    expect(dos).toHaveAccessibleDescription('Ayuda dos')
  })

  test('sirve con un textarea y con un select', () => {
    render(
      <>
        <FormField etiqueta="Comentario" error="Falta el comentario.">
          {(control) => <Textarea {...control} />}
        </FormField>
        <FormField etiqueta="Carrera" requerido>
          {(control) => (
            <NativeSelect {...control}>
              <option value="">Elige una</option>
            </NativeSelect>
          )}
        </FormField>
      </>,
    )
    expect(screen.getByLabelText('Comentario')).toBeInvalid()
    expect(screen.getByRole('combobox', { name: 'Carrera' })).toBeRequired()
  })
})
