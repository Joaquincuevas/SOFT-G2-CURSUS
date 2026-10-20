import type {
  AlumnoInscrito,
  AlumnoQuitado,
  AlumnosSeccion as DatosAlumnos,
} from '@cursus/shared'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useAuth } from '../auth/auth'
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
// GES-15 y vuelve a pedir la lista sin desmontar la página. Quitar (GES-19)
// saca la fila y baja el total sin volver a pedirla.
function AlumnosSeccion() {
  const { id = '' } = useParams()
  const [datos, recargar, status] = useDatos<DatosAlumnos>(
    `/api/secciones/${id}/alumnos`,
  )
  const puedeAgregar = usePuede('create', 'Inscripcion')
  const [agregando, setAgregando] = useState(false)
  const puedeQuitar = usePuede('update', 'Inscripcion')
  const [porQuitar, setPorQuitar] = useState<AlumnoInscrito | null>(null)
  // Alumnos quitados aquí, que se ocultan hasta la próxima carga de la lista.
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(new Set())
  const [aviso, setAviso] = useState<string | null>(null)

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

  const { seccion } = datos
  const alumnos = datos.alumnos.filter((alumno) => !quitados.has(alumno.id))
  const total = datos.total - (datos.alumnos.length - alumnos.length)
  const agregar = puedeAgregar && (
    <button
      className="cursos__boton"
      type="button"
      onClick={() => {
        setAviso(null)
        setAgregando(true)
      }}
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
      {aviso && (
        <p className="cursos__exito" role="status">
          {aviso}
        </p>
      )}
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
                  {puedeQuitar && <th scope="col">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {alumnos.map((alumno) => (
                  <tr key={alumno.id}>
                    <td>{alumno.nombre}</td>
                    <td>{alumno.correo}</td>
                    {puedeQuitar && (
                      <td>
                        <button
                          className="cursos__boton cursos__boton--secundario"
                          type="button"
                          aria-label={`Quitar a ${alumno.nombre}`}
                          onClick={() => {
                            setAviso(null)
                            setPorQuitar(alumno)
                          }}
                        >
                          Quitar
                        </button>
                      </td>
                    )}
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
          onAgregado={({ alumno }) => {
            // Un alumno quitado y vuelto a agregar debe verse de nuevo.
            setQuitados((anteriores) => {
              const siguientes = new Set(anteriores)
              siguientes.delete(alumno.id)
              return siguientes
            })
            recargar()
          }}
          onCerrar={() => setAgregando(false)}
        />
      )}
      {porQuitar && (
        <ConfirmarQuitar
          seccionId={seccion.id}
          numero={seccion.numero}
          alumno={porQuitar}
          onQuitado={({ alumno }) => {
            setQuitados((anteriores) => new Set(anteriores).add(alumno.id))
            setAviso(`${alumno.nombre} fue quitado de la sección.`)
            setPorQuitar(null)
          }}
          onCerrar={() => setPorQuitar(null)}
        />
      )}
    </section>
  )
}

// Confirmación para quitar a un alumno (GES-19), con un diálogo modal nativo
// en vez de window.confirm. Quitar archiva la inscripción: la cuenta queda.
function ConfirmarQuitar({
  seccionId,
  numero,
  alumno,
  onQuitado,
  onCerrar,
}: {
  seccionId: string
  numero: number
  alumno: AlumnoInscrito
  onQuitado: (resultado: AlumnoQuitado) => void
  onCerrar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const dialogo = useRef<HTMLDialogElement>(null)
  const [quitando, setQuitando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogo.current?.showModal()
  }, [])

  async function quitar() {
    setQuitando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion(
        `/api/secciones/${seccionId}/alumnos/${alumno.id}/quitar`,
        { method: 'PATCH' },
      )
      const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<
        AlumnoQuitado & { message: unknown }
      >
      if (respuesta.ok) {
        onQuitado(cuerpo as AlumnoQuitado)
        return
      }
      setError(
        typeof cuerpo.message === 'string' && respuesta.status < 500
          ? cuerpo.message
          : 'No se pudo quitar al alumno.',
      )
    } catch {
      setError('No se pudo quitar al alumno.')
    }
    setQuitando(false)
  }

  return (
    <dialog
      ref={dialogo}
      className="cursos__dialogo"
      aria-labelledby="quitar-alumno-titulo"
      aria-describedby="quitar-alumno-detalle"
      // Mientras el PATCH está pendiente no se cierra (ni con Escape): así su
      // respuesta no cierra la confirmación de otro alumno ni pierde su error.
      onCancel={(event) => {
        if (quitando) event.preventDefault()
      }}
      onClose={onCerrar}
    >
      <h3 id="quitar-alumno-titulo" className="cursos__titulo-dialogo">
        Quitar alumno
      </h3>
      <p id="quitar-alumno-detalle" className="cursos__mensaje">
        ¿Quitar a {alumno.nombre} ({alumno.correo}) de la sección {numero}? Su
        cuenta no se elimina.
      </p>
      {error && (
        <p className="cursos__error" role="alert">
          {error}
        </p>
      )}
      <div className="cursos__acciones">
        <button
          className="cursos__boton cursos__boton--secundario"
          type="button"
          disabled={quitando}
          onClick={onCerrar}
        >
          Cancelar
        </button>
        <button
          className="cursos__boton"
          type="button"
          disabled={quitando}
          onClick={() => void quitar()}
        >
          Quitar
        </button>
      </div>
    </dialog>
  )
}
