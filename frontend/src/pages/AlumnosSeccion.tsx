import type { AlumnosSeccion as DatosAlumnos } from '@cursus/shared'
import { useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede } from '../session/session'
import { AgregarAlumnoDialogo } from './AgregarAlumno'
import './Cursos.css'
import { useDatos } from './useDatos'

// Rutas de /secciones: por ahora solo la lista de alumnos (GES-18).
export function Secciones() {
  return (
    <Routes>
      <Route path=":id/alumnos" element={<AlumnosSeccion />} />
      <Route path="*" element={<Navigate to="/cursos" replace />} />
    </Routes>
  )
}

// Alumnos inscritos en una sección, en /secciones/:id/alumnos. El backend los
// entrega ordenados por nombre. Agregar un alumno reutiliza el diálogo de
// GES-15 y vuelve a pedir la lista sin desmontar la página.
function AlumnosSeccion() {
  const { id = '' } = useParams()
  const [datos, recargar, status] = useDatos<DatosAlumnos>(
    `/api/secciones/${id}/alumnos`,
  )
  const puedeAgregar = usePuede('create', 'Inscripcion')
  const [agregando, setAgregando] = useState(false)

  if (datos === undefined) {
    return <Cargando texto="Cargando alumnos…" />
  }
  if (datos === null && (status === 404 || status === 400)) {
    return (
      <section className="cursos" aria-label="Sección no encontrada">
        <Link className="cursos__enlace" to="/cursos">
          ← Volver a cursos
        </Link>
        <div className="cursos__tarjeta cursos__vacio">
          <h2 className="cursos__titulo">Sección no encontrada</h2>
          <p className="cursos__mensaje">
            La sección no existe o no pertenece a tu facultad.
          </p>
        </div>
      </section>
    )
  }
  if (datos === null) {
    return (
      <ErrorEstado
        mensaje="No se pudieron cargar los alumnos."
        onReintentar={recargar}
      />
    )
  }

  const { seccion, alumnos, total } = datos
  const agregar = puedeAgregar && (
    <button
      className="cursos__boton"
      type="button"
      onClick={() => setAgregando(true)}
    >
      Agregar alumno
    </button>
  )

  return (
    <section className="cursos" aria-label="Alumnos de la sección">
      <Link className="cursos__enlace" to={`/cursos/${seccion.curso.id}`}>
        ← Volver al curso
      </Link>
      <div className="cursos__encabezado">
        <h2 className="cursos__titulo">
          Sección {seccion.numero} · {seccion.curso.codigo}{' '}
          {seccion.curso.nombre}
        </h2>
        <p className="cursos__subtitulo">
          {total === 1 ? '1 alumno inscrito' : `${total} alumnos inscritos`}
        </p>
      </div>
      {alumnos.length === 0 ? (
        <div className="cursos__tarjeta cursos__vacio">
          <p className="cursos__mensaje">Esta sección aún no tiene alumnos.</p>
          {puedeAgregar && (
            <div className="cursos__acciones">
              {agregar}
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                aria-disabled="true"
                title="Próximamente"
              >
                Cargar CSV
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {agregar && <div className="cursos__acciones">{agregar}</div>}
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
        </>
      )}
      {agregando && (
        <AgregarAlumnoDialogo
          seccionId={seccion.id}
          numero={seccion.numero}
          onAgregado={recargar}
          onCerrar={() => setAgregando(false)}
        />
      )}
    </section>
  )
}
