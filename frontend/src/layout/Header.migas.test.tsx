import { screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { renderConSesion } from '../test/sesion'

// El encabezado publica su último paso para que PageHeader no lo repita.
const publicar = vi.hoisted(() => vi.fn())
vi.mock('./migas-contexto', async (original) => {
  const modulo = await original<typeof import('./migas-contexto')>()
  return {
    ...modulo,
    usePublicarMigaActual: (etiqueta: string) => {
      publicar(etiqueta)
      return modulo.usePublicarMigaActual(etiqueta)
    },
  }
})

describe('encabezado', () => {
  test('publica el título de la página como último paso', async () => {
    await renderConSesion('PROFESOR', '/')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Bienvenido/a, Profesor Norte',
    )
    expect(publicar).toHaveBeenCalledWith('Bienvenido/a, Profesor Norte')
  })
})
