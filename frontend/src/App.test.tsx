import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import App from './App'
import { SessionProvider } from './session/SessionProvider'

test('renderiza la app', () => {
  render(
    <MemoryRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
})
