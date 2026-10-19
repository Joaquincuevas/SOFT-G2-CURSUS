import { Link } from 'react-router'
import '../components/estados.css'

// 404 dentro del App Shell, para una ruta con sesión que no existe. El Header
// muestra "Página no encontrada".
export function NoEncontrada() {
  return (
    <section className="estado" aria-label="Página no encontrada">
      <h2 className="estado__titulo">Error 404</h2>
      <p className="estado__texto">
        La página que buscas no existe o cambió de dirección.
      </p>
      <Link className="estado__boton" to="/">
        Volver al inicio
      </Link>
    </section>
  )
}
