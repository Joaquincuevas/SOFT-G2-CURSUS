import './estados.css'

interface Props {
  mensaje: string
  onReintentar: () => void
  titulo?: string
  textoBoton?: string
  // Centrado en toda la ventana, por ejemplo en el ErrorBoundary.
  pantallaCompleta?: boolean
}

// Estado de error con acción para reintentar. No usa <Link> ni hooks del
// router: el ErrorBoundary lo muestra por fuera de BrowserRouter.
export function ErrorEstado({
  mensaje,
  onReintentar,
  titulo = 'No se pudo cargar',
  textoBoton = 'Reintentar',
  pantallaCompleta,
}: Props) {
  const tarjeta = (
    <section className="estado" role="alert">
      <h2 className="estado__titulo estado__titulo--error">{titulo}</h2>
      <p className="estado__texto">{mensaje}</p>
      <button className="estado__boton" type="button" onClick={onReintentar}>
        {textoBoton}
      </button>
    </section>
  )
  return pantallaCompleta ? (
    <main className="estado-pagina">{tarjeta}</main>
  ) : (
    tarjeta
  )
}
