import type { CursoDetalle as DatosCurso, SeccionDetalle } from '@cursus/shared'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede, useSession } from '../session/session'
import { AgregarAlumnoDialogo } from './AgregarAlumno'
import { CargarAlumnosCsvDialogo } from './CargarAlumnosCsv'
import { AsignarAyudantesDialogo } from './AsignarAyudantes'
import './Cursos.css'
import { useDatos } from './useDatos'

const SIN_ASIGNAR = 'Sin asignar'

// Acciones por sección según los permisos de la sesión.
function FilaSeccion({
  seccion,
  verAlumnos,
  onAgregarAlumno,
  onCargarCsv,
  onAsignarAyudantes,
}: {
  seccion: SeccionDetalle
  verAlumnos: boolean
  onAgregarAlumno?: () => void
  onCargarCsv?: () => void
  onAsignarAyudantes?: () => void
}) {
  return (
    <tr>
      <td>{seccion.numero}</td>
      <td>{seccion.horario ?? SIN_ASIGNAR}</td>
      <td>{seccion.profesor ?? SIN_ASIGNAR}</td>
      <td>
        {seccion.ayudantes.length > 0
          ? seccion.ayudantes.join(', ')
          : SIN_ASIGNAR}
      </td>
      <td>
        {verAlumnos ? (
          <Link
            className="cursos__enlace"
            to={`/secciones/${seccion.id}/alumnos`}
            aria-label={`Ver los ${seccion.alumnos} alumnos de la sección ${seccion.numero}`}
          >
            {seccion.alumnos}
          </Link>
        ) : (
          seccion.alumnos
        )}
      </td>
      {(onAgregarAlumno || onAsignarAyudantes) && (
        <td>
          <div className="cursos__acciones">
            {onAgregarAlumno && (
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                aria-label={`Agregar alumno a la sección ${seccion.numero}`}
                onClick={onAgregarAlumno}
              >
                Agregar alumno
              </button>
            )}
            {onCargarCsv && (
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                aria-label={`Cargar CSV en la sección ${seccion.numero}`}
                onClick={onCargarCsv}
              >
                Cargar CSV
              </button>
            )}
            {onAsignarAyudantes && (
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                aria-label={`Asignar ayudantes a la sección ${seccion.numero}`}
                onClick={onAsignarAyudantes}
              >
                Asignar ayudantes
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

function VolverACursos() {
  return (
    <Link className="cursos__enlace" to="/cursos">
      ← Volver a cursos
    </Link>
  )
}

// Detalle de un curso con sus secciones (GES-08), en /cursos/:id. La key
// reinicia el estado (secciones nuevas, avisos) al pasar a otro curso.
export function CursoDetalle() {
  const { id = '' } = useParams()
  return <Detalle key={id} id={id} />
}

function Detalle({ id }: { id: string }) {
  const { fetchConSesion } = useAuth()
  const [curso, recargar, status] = useDatos<DatosCurso>(`/api/cursos/${id}`)
  const puedeEditar = usePuede('update', 'Curso')
  const puedeCrearSeccion = usePuede('create', 'Seccion')
  // Secciones creadas aquí (GES-09): se agregan a la tabla sin volver a pedir
  // el curso.
  const [nuevas, setNuevas] = useState<SeccionDetalle[]>([])
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState<{ exito: boolean; texto: string }>()
  // GES-15: sección con el diálogo abierto, y alumnos agregados aquí por
  // sección, que se suman al conteo sin volver a pedir el curso.
  const puedeInscribir = usePuede('create', 'Inscripcion')
  // La lista de alumnos es solo de la universidad de la sesión: el Director
  // no la ve en los cursos de otras universidades (el backend responde 404).
  const { user } = useSession()
  const puedeVerAlumnos = usePuede('read', 'Inscripcion')
  const [inscribirEn, setInscribirEn] = useState<SeccionDetalle | null>(null)
  const [csvEn, setCsvEn] = useState<SeccionDetalle | null>(null)
  const [agregados, setAgregados] = useState<Record<string, number>>({})
  const puedeAsignarAyudantes = usePuede('update', 'Seccion')
  const [asignarEn, setAsignarEn] = useState<SeccionDetalle | null>(null)
  const [ayudantesAsignados, setAyudantesAsignados] = useState<
    Record<string, string[]>
  >({})

  async function crearSeccion() {
    setCreando(true)
    setAviso(undefined)
    try {
      const respuesta = await fetchConSesion(`/api/cursos/${id}/secciones`, {
        method: 'POST',
      })
      if (!respuesta.ok) throw new Error()
      const seccion = (await respuesta.json()) as SeccionDetalle
      setNuevas((anteriores) => [...anteriores, seccion])
      setAviso({ exito: true, texto: `Sección ${seccion.numero} creada.` })
    } catch {
      setAviso({ exito: false, texto: 'No se pudo crear la sección.' })
    }
    setCreando(false)
  }

  if (curso === undefined) {
    return <Cargando texto="Cargando curso…" />
  }
  if (curso === null && (status === 404 || status === 400)) {
    return (
      <section className="cursos" aria-label="Curso no encontrado">
        <VolverACursos />
        <div className="cursos__tarjeta cursos__vacio">
          <h2 className="cursos__titulo">Curso no encontrado</h2>
          <p className="cursos__mensaje">
            El curso no existe o no pertenece a tu facultad.
          </p>
        </div>
      </section>
    )
  }
  if (curso === null) {
    return (
      <ErrorEstado
        mensaje="No se pudo cargar el curso."
        onReintentar={recargar}
      />
    )
  }

  const { periodo } = curso
  const verAlumnos =
    puedeVerAlumnos &&
    (!curso.universidadId || curso.universidadId === user.universidadId)
  const secciones = [...curso.secciones, ...nuevas].map((seccion) => ({
    ...seccion,
    alumnos: seccion.alumnos + (agregados[seccion.id] ?? 0),
    ayudantes: ayudantesAsignados[seccion.id] ?? seccion.ayudantes,
  }))
  const subtitulo = [
    curso.universidadNombre,
    curso.carreraNombre,
    `Período ${periodo.anio}-${periodo.semestre}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="cursos" aria-label="Detalle del curso">
      <VolverACursos />
      <div className="cursos__encabezado">
        <h2 className="cursos__titulo">
          {curso.codigo} · {curso.nombre}
        </h2>
        <p className="cursos__subtitulo">{subtitulo}</p>
      </div>
      {(puedeEditar || puedeCrearSeccion) && (
        <div className="cursos__acciones">
          {puedeEditar && (
            <Link
              className="cursos__boton cursos__boton--secundario"
              to={`/cursos/${id}/editar`}
            >
              Editar curso
            </Link>
          )}
          {puedeCrearSeccion && (
            <button
              className="cursos__boton"
              type="button"
              disabled={creando}
              onClick={() => void crearSeccion()}
            >
              Crear sección
            </button>
          )}
        </div>
      )}
      {aviso?.exito && (
        <p className="cursos__exito" role="status">
          {aviso.texto}
        </p>
      )}
      {aviso?.exito === false && (
        <p className="cursos__error" role="alert">
          {aviso.texto}
        </p>
      )}
      {secciones.length === 0 ? (
        <div className="cursos__tarjeta cursos__vacio">
          <p className="cursos__mensaje">Este curso aún no tiene secciones.</p>
        </div>
      ) : (
        <div className="cursos__tarjeta cursos__tabla-contenedor">
          <table className="cursos__tabla" aria-label="Secciones">
            <thead>
              <tr>
                <th scope="col">Sección</th>
                <th scope="col">Horario</th>
                <th scope="col">Profesor</th>
                <th scope="col">Ayudantes</th>
                <th scope="col">Alumnos</th>
                {(puedeInscribir || puedeAsignarAyudantes) && (
                  <th scope="col">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {secciones.map((seccion) => (
                <FilaSeccion
                  key={seccion.id}
                  seccion={seccion}
                  verAlumnos={verAlumnos}
                  onCargarCsv={
                    puedeInscribir ? () => setCsvEn(seccion) : undefined
                  }
                  onAgregarAlumno={
                    puedeInscribir
                      ? () => {
                          setAviso(undefined)
                          setInscribirEn(seccion)
                        }
                      : undefined
                  }
                  onAsignarAyudantes={
                    puedeAsignarAyudantes
                      ? () => {
                          setAviso(undefined)
                          setAsignarEn(seccion)
                        }
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {asignarEn && (
        <AsignarAyudantesDialogo
          seccionId={asignarEn.id}
          numero={asignarEn.numero}
          onAsignados={(ayudantes) => {
            setAyudantesAsignados((anteriores) => ({
              ...anteriores,
              [asignarEn.id]: ayudantes.map((a) => a.nombre),
            }))
            setAviso({
              exito: true,
              texto: `Ayudantes asignados a la sección ${asignarEn.numero}.`,
            })
          }}
          onCerrar={() => setAsignarEn(null)}
        />
      )}
      {inscribirEn && (
        <AgregarAlumnoDialogo
          seccionId={inscribirEn.id}
          numero={inscribirEn.numero}
          onAgregado={({ alumno }) => {
            setAgregados((anteriores) => ({
              ...anteriores,
              [inscribirEn.id]: (anteriores[inscribirEn.id] ?? 0) + 1,
            }))
            setAviso({
              exito: true,
              texto: `${alumno.nombre} agregado a la sección ${inscribirEn.numero}.`,
            })
          }}
          onCerrar={() => setInscribirEn(null)}
        />
      )}
      {csvEn && (
        <CargarAlumnosCsvDialogo
          seccionId={csvEn.id}
          numero={csvEn.numero}
          onCargados={(cantidad) => {
            setAgregados((anteriores) => ({
              ...anteriores,
              [csvEn.id]: (anteriores[csvEn.id] ?? 0) + cantidad,
            }))
            setAviso({
              exito: true,
              texto: `${cantidad} alumnos cargados a la sección ${csvEn.numero}.`,
            })
          }}
          onCerrar={() => setCsvEn(null)}
        />
      )}
    </section>
  )
}
