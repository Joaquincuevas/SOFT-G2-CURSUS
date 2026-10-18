import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Sin `globals: true`, RTL no registra su cleanup automático
afterEach(cleanup)
// Quita el fetch simulado de cada test.
afterEach(() => {
  vi.unstubAllGlobals()
})
