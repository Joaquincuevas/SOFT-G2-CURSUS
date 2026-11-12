import type { AlumnosSeccion as DatosAlumnos } from '@cursus/shared'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede } from '../session/session'
import { IntegrantesSeccion } from './IntegrantesSeccion'
import { useDatos } from './useDatos'
import './Cursos.css'

export function Secciones() {
  return (
    <Routes>
      <Route path=":id/integrantes" element={<IntegrantesSeccion />} />
      <Route path=":id/alumnos" element={<AlumnosSeccion />} />
      <Route path="*" element={<Navigate to="/cursos" replace />} />
    </Routes>
  )
}
// Los enlaces guardados del administrativo llevan al mismo flujo de GES-26.
// El Director conserva la lista de alumnos de su universidad en solo lectura.
function AlumnosSeccion() {
  const { id = '' } = useParams()
  const gestiona = usePuede('update', 'Seccion')
  return gestiona ? (
    <Navigate to={`/secciones/${id}/integrantes?rol=ALUMNO`} replace />
  ) : (
    <ListaAlumnos key={id} id={id} />
  )
}
function ListaAlumnos({ id }: { id: string }) {
  const [datos, recargar, status] = useDatos<DatosAlumnos>(
    `/api/secciones/${id}/alumnos`,
  )
  if (datos === undefined) return <Cargando texto="Cargando alumnos…" />
  if (datos === null && (status === 400 || status === 404))
    return (
      <section className="cursos">
        <Link to="/cursos" className="cursos__enlace">
          ← Volver a cursos
        </Link>
        <h2 className="cursos__titulo">Sección no encontrada</h2>
        <p>La sección no existe o no pertenece a tu universidad.</p>
      </section>
    )
  if (datos === null)
    return (
      <ErrorEstado
        mensaje="No se pudieron cargar los alumnos."
        onReintentar={recargar}
      />
    )
  const { seccion, alumnos, total } = datos
  return (
    <section className="cursos" aria-label="Alumnos de la sección">
      <Link className="cursos__enlace" to={`/cursos/${seccion.curso.id}`}>
        ← Volver al curso
      </Link>
      <header className="cursos__encabezado">
        <h2 className="cursos__titulo">
          Sección {seccion.numero} · {seccion.curso.codigo}{' '}
          {seccion.curso.nombre}
        </h2>
        <p className="cursos__subtitulo">
          {total === 1 ? '1 alumno inscrito' : `${total} alumnos inscritos`}
        </p>
      </header>
      {alumnos.length === 0 ? (
        <p className="cursos__mensaje">Esta sección aún no tiene alumnos.</p>
      ) : (
        <div className="cursos__tarjeta cursos__tabla-contenedor">
          <table className="cursos__tabla" aria-label="Alumnos">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map((alumno) => (
                <tr key={alumno.id}>
                  <td>{alumno.nombre}</td>
                  <td>{alumno.correo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
