import { Link } from 'react-router'
import './estados.css'

// MT-04: el superadmin sin universidad elegida no ve las vistas del
// Administrativo (la API le responde 403). En vez de redirigirlo, la vista le
// explica qué falta y lo lleva al Dashboard, donde elige.
export function AvisoElegirFacultad() {
  return (
    <section className="estado" role="status">
      <h2 className="estado__titulo">Elige una universidad primero</h2>
      <p className="estado__texto">
        Para ver esta sección, elige en el Dashboard la universidad y la
        facultad en las que quieres trabajar.
      </p>
      <Link className="estado__boton" to="/">
        Elegir universidad
      </Link>
    </section>
  )
}
