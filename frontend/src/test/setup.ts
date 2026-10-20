import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => localStorage.clear())

// Sin `globals: true`, RTL no registra su cleanup automático
afterEach(cleanup)
// Quita el fetch simulado de cada test.
afterEach(() => {
  vi.unstubAllGlobals()
})

// jsdom no implementa los diálogos modales: basta con abrir y cerrar.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true
}
