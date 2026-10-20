import type {
  AsignarProfesor as CuerpoAsignar,
  CursoDetalle as DatosCurso,
  ProfesorOpcion,
  SeccionDetalle,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede, useSession } from '../session/session'
import { AgregarAlumnoDialogo } from './AgregarAlumno'
import './Cursos.css'
import { useDatos } from './useDatos'

const SIN_ASIGNAR = 'Sin asignar'

// Horario (GES-10) y ayudantes (GES-13) se muestran como "Sin asignar" hasta
// que existan. Con verAlumnos, el número de alumnos enlaza a su lista
// (GES-18). Con onAsignar u onAgregarAlumno, la fila tiene la columna de
// acciones: asignar o cambiar el profesor (GES-12) y agregar un alumno
// (GES-15).
function FilaSeccion({
  seccion,
  verAlumnos,
  onAsignar,
  onAgregarAlumno,
}: {
  seccion: SeccionDetalle
  verAlumnos: boolean
  onAsignar?: () => void
  onAgregarAlumno?: () => void
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
      {(onAsignar || onAgregarAlumno) && (
        <td>
          <div className="cursos__acciones">
            {onAsignar && (
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                aria-label={`${seccion.profesor ? 'Cambiar' : 'Asignar'} profesor de la sección ${seccion.numero}`}
                onClick={onAsignar}
              >
                {seccion.profesor ? 'Cambiar profesor' : 'Asignar profesor'}
              </button>
            )}
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
          </div>
        </td>
      )}
    </tr>
  )
}

// Formulario para asignar el profesor de una sección (GES-12). Si la sección
// ya tiene uno, pide confirmar el reemplazo antes de guardar.
function AsignarProfesor({
  seccion,
  profesores,
  onReintentar,
  onAsignada,
  onCancelar,
}: {
  seccion: SeccionDetalle
  profesores: ProfesorOpcion[] | null | undefined
  onReintentar: () => void
  onAsignada: (seccion: SeccionDetalle) => void
  onCancelar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [profesorId, setProfesorId] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const elegido = profesores?.find((profesor) => profesor.id === profesorId)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion(
        `/api/secciones/${seccion.id}/profesor`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profesorId } satisfies CuerpoAsignar),
        },
      )
      const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<
        SeccionDetalle & { message: string }
      >
      if (respuesta.ok) {
        onAsignada(cuerpo as SeccionDetalle)
        return
      }
      // El 404 (sección o profesor que ya no existen) trae un mensaje.
      setError(
        typeof cuerpo.message === 'string'
          ? cuerpo.message
          : 'No se pudo asignar el profesor.',
      )
    } catch {
      setError('No se pudo asignar el profesor.')
    }
    setConfirmando(false)
    setGuardando(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (seccion.profesor && !confirmando) {
      setConfirmando(true)
      return
    }
    void guardar()
  }

  let contenido
  if (profesores === undefined) {
    contenido = <Cargando texto="Cargando profesores…" />
  } else if (profesores === null) {
    contenido = (
      <ErrorEstado
        mensaje="No se pudieron cargar los profesores."
        onReintentar={onReintentar}
      />
    )
  } else {
    contenido = (
      <>
        <label className="cursos__campo">
          Profesor
          <select
            className="cursos__input"
            name="profesorId"
            value={profesorId}
            disabled={confirmando || guardando}
            onChange={(event) => setProfesorId(event.target.value)}
            required
          >
            <option value="" disabled>
              Selecciona un profesor
            </option>
            {profesores.map((profesor) => (
              <option key={profesor.id} value={profesor.id}>
                {profesor.nombre}
              </option>
            ))}
          </select>
        </label>
        {confirmando && (
          <p className="cursos__mensaje" role="status">
            La sección {seccion.numero} ya tiene a {seccion.profesor} como
            profesor a cargo. ¿Reemplazarlo por {elegido?.nombre}?
          </p>
        )}
        {error && (
          <p className="cursos__error" role="alert">
            {error}
          </p>
        )}
        <div className="cursos__acciones">
          <button className="cursos__boton" type="submit" disabled={guardando}>
            {confirmando ? 'Reemplazar' : 'Guardar'}
          </button>
          <button
            className="cursos__boton cursos__boton--secundario"
            type="button"
            onClick={confirmando ? () => setConfirmando(false) : onCancelar}
          >
            {confirmando ? 'Volver' : 'Cancelar'}
          </button>
        </div>
      </>
    )
  }

  return (
    <form
      className="cursos__tarjeta"
      aria-label={`Profesor de la sección ${seccion.numero}`}
      onSubmit={handleSubmit}
    >
      <h3 className="cursos__titulo">
        Profesor de la sección {seccion.numero}
      </h3>
      {contenido}
    </form>
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
  const puedeAsignar = usePuede('update', 'Seccion')
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
  const [agregados, setAgregados] = useState<Record<string, number>>({})
  // GES-12: sección cuyo profesor se está asignando, y profesores asignados
  // aquí (id de sección → nombre), que reemplazan al de la tabla sin volver a
  // pedir el curso. La lista de profesores se pide al abrir el formulario.
  const [asignando, setAsignando] = useState<SeccionDetalle>()
  const [asignados, setAsignados] = useState<Record<string, string>>({})
  const [pedirProfesores, setPedirProfesores] = useState(false)
  const [profesores, recargarProfesores] = useDatos<ProfesorOpcion[]>(
    pedirProfesores ? '/api/profesores' : null,
  )

  function abrirAsignacion(seccion: SeccionDetalle) {
    setPedirProfesores(true)
    setAviso(undefined)
    setInscribirEn(null)
    setAsignando(seccion)
  }

  function asignada(seccion: SeccionDetalle) {
    setAsignados((anteriores) => ({
      ...anteriores,
      [seccion.id]: seccion.profesor as string,
    }))
    setAsignando(undefined)
    setAviso({
      exito: true,
      texto: `${seccion.profesor} quedó a cargo de la sección ${seccion.numero}.`,
    })
  }

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
    profesor: asignados[seccion.id] ?? seccion.profesor,
    alumnos: seccion.alumnos + (agregados[seccion.id] ?? 0),
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
                {(puedeAsignar || puedeInscribir) && (
                  <th scope="col">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {secciones.map((seccion) => (
                <FilaSeccion
                  key={seccion.id}
                  seccion={seccion}
                  onAsignar={
                    puedeAsignar ? () => abrirAsignacion(seccion) : undefined
                  }
                  verAlumnos={verAlumnos}
                  onAgregarAlumno={
                    puedeInscribir
                      ? () => {
                          setAviso(undefined)
                          setAsignando(undefined)
                          setInscribirEn(seccion)
                        }
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {asignando && (
        <AsignarProfesor
          // La key reinicia el formulario al pasar a otra sección.
          key={asignando.id}
          seccion={asignando}
          profesores={profesores}
          onReintentar={recargarProfesores}
          onAsignada={asignada}
          onCancelar={() => setAsignando(undefined)}
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
    </section>
  )
}
