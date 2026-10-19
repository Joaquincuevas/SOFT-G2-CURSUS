import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorEstado } from './ErrorEstado'

interface Props {
  children: ReactNode
  // Solo para tests: jsdom no permite reemplazar window.location.reload.
  recargar?: () => void
}

// Ante un error de render muestra una página de error en vez de una pantalla en
// blanco. Envuelve a BrowserRouter (main.tsx), así que no usa el router: el
// botón recarga la página. El error va a la consola, nunca a la pantalla.
export class ErrorBoundary extends Component<Props, { hayError: boolean }> {
  state = { hayError: false }

  static getDerivedStateFromError() {
    return { hayError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Error inesperado en la interfaz', error, info.componentStack)
  }

  render() {
    if (!this.state.hayError) return this.props.children
    return (
      <ErrorEstado
        pantallaCompleta
        titulo="Algo salió mal"
        mensaje="Ocurrió un error inesperado. Recarga la página para continuar."
        textoBoton="Recargar"
        onReintentar={this.props.recargar ?? (() => window.location.reload())}
      />
    )
  }
}
