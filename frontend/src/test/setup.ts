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

// jsdom no implementa varias APIs del navegador que usan los componentes de
// Radix (shadcn). Estos polyfills son los mínimos para que se monten y se abran
// en las pruebas; no simulan layout.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Selects, menús y diálogos de Radix capturan el puntero al abrirse.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}

// Radix y sonner mueven el foco o la vista al elemento activo.
Element.prototype.scrollIntoView ??= () => {}

// sonner consulta la preferencia de esquema de color.
window.matchMedia ??= (consulta: string) =>
  ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList
