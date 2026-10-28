import type { SeccionAlumno } from '@cursus/shared'
import { Link } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { rutaSeccion, textoBloque } from './misSecciones'
import { useDatos } from './useDatos'

export const RUTA_SECCIONES_ALUMNO = '/api/dashboard/secciones-alumno'

export function SeccionesAlumno() {
  const [secciones, recargar] = useDatos<SeccionAlumno[]>(RUTA_SECCIONES_ALUMNO)
  if (secciones === undefined) return <Cargando texto="Cargando tus cursos…" />
  if (secciones === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar tus cursos."
        onReintentar={recargar}
      />
    )
  }
  return (
    <>
      <h2 className="dashboard__titulo">Mis cursos del período</h2>
      {secciones.length === 0 ? (
        <p className="dashboard__texto">
          No tienes inscripciones en el período activo.
        </p>
      ) : (
        <ul className="dashboard__tarjetas">
          {secciones.map(
            ({ id, curso, numero, horario, profesor, anunciosNuevos }) => (
              <li key={id}>
                <Link className="dashboard__tarjeta" to={rutaSeccion(id)}>
                  <span className="dashboard__codigo">{curso.codigo}</span>
                  <h3 className="dashboard__curso">{curso.nombre}</h3>
                  <p className="dashboard__seccion">Sección {numero}</p>
                  <p className="dashboard__texto">
                    {anunciosNuevos === 1
                      ? '1 anuncio nuevo'
                      : `${anunciosNuevos} anuncios nuevos`}
                  </p>
                  {horario.length === 0 ? (
                    <p className="dashboard__horario">Sin horario asignado</p>
                  ) : (
                    <ul className="dashboard__horario" aria-label="Horario">
                      {horario.map((bloque) => (
                        <li key={`${bloque.dia}-${bloque.inicio}`}>
                          {textoBloque(bloque)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="dashboard__texto">
                    {profesor
                      ? `Profesor a cargo: ${profesor.nombre}`
                      : 'Sin profesor asignado'}
                  </p>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  )
}
