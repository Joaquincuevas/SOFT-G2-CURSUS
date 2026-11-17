import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { AvisoElegirFacultad } from './AvisoElegirFacultad'

test('explica qué falta y lleva al Dashboard, donde se elige', () => {
  render(
    <MemoryRouter>
      <AvisoElegirFacultad />
    </MemoryRouter>,
  )
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Elige una universidad primero' }),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/elige en el Dashboard la universidad y la facultad/),
  ).toBeInTheDocument()
  const enlace = screen.getByRole('link', { name: 'Elegir universidad' })
  expect(enlace).toHaveAttribute('href', '/')
  expect(enlace).toHaveAttribute('data-slot', 'button')
})
