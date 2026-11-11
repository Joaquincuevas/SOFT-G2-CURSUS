import type {
  CursoDetalle as DatosCurso,
  HorarioSeccion,
  SeccionDetalle,
} from '@cursus/shared'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede, useSession } from '../session/session'
import { EditarHorarioDialogo } from './EditarHorario'
import './Cursos.css'
import { nombresProfesores } from './misSecciones'
import { useDatos } from './useDatos'

const SIN_ASIGNAR = 'Sin asignar'

// Lo que no está asignado se muestra como "Sin asignar". Con verAlumnos, el
// número de alumnos enlaza a su lista (GES-18). Las acciones por sección
// dependen de los permisos de la sesión: los profesores de la sección
// se gestionan en Integrantes (GES-26); el horario conserva su edición.
function FilaSeccion({
  seccion,
  verAlumnos,
  gestionar,
  onHorario,
}: {
  seccion: SeccionDetalle
  verAlumnos: boolean
  gestionar: boolean
  onHorario?: () => void
}) {
  const integrantes = `/secciones/${seccion.id}/integrantes`
  return (
    <tr>
      <td>{seccion.numero}</td>
      <td>{seccion.horario ?? SIN_ASIGNAR}</td>
      <td>
        {seccion.profesores.length
          ? seccion.profesores.join(', ')
          : SIN_ASIGNAR}
      </td>
      <td>
        {seccion.ayudantes.length ? seccion.ayudantes.join(', ') : SIN_ASIGNAR}
      </td>
      <td>
        {verAlumnos ? (
          <Link
            className="cursos__enlace"
            to={
              gestionar
                ? `${integrantes}?rol=ALUMNO`
                : `/secciones/${seccion.id}/alumnos`
            }
            aria-label={`Ver los ${seccion.alumnos} alumnos de la sección ${seccion.numero}`}
          >
            {seccion.alumnos}
          </Link>
        ) : (
          seccion.alumnos
        )}
      </td>
      {(gestionar || onHorario) && (
        <td>
          <div className="cursos__acciones">
            {gestionar && (
              <Link
                className="cursos__boton cursos__boton--secundario"
                to={integrantes}
                aria-label={`Integrantes de la sección ${seccion.numero}`}
              >
                Integrantes
              </Link>
            )}
            {onHorario && (
              <button
                className="cursos__boton cursos__boton--secundario"
                type="button"
                aria-label={`${seccion.horario ? 'Editar' : 'Asignar'} horario de la sección ${seccion.numero}`}
                onClick={onHorario}
              >
                {seccion.horario ? 'Editar horario' : 'Asignar horario'}
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
  const puedeAsignar = usePuede('update', 'Seccion')
  // Secciones creadas aquí (GES-09): se agregan a la tabla sin volver a pedir
  // el curso.
  const [nuevas, setNuevas] = useState<SeccionDetalle[]>([])
  const [creando, setCreando] = useState(false)
  const [aviso, setAviso] = useState<{ exito: boolean; texto: string }>()
  const puedeInscribir = usePuede('create', 'Inscripcion')
  const { user } = useSession()
  const puedeVerAlumnos = usePuede('read', 'Inscripcion')
  const [editarHorarioEn, setEditarHorarioEn] = useState<SeccionDetalle | null>(
    null,
  )
  const [horariosGuardados, setHorariosGuardados] = useState<
    Record<string, HorarioSeccion>
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
    profesores: nombresProfesores(seccion),
    horario: horariosGuardados[seccion.id]
      ? horariosGuardados[seccion.id].resumen
      : seccion.horario,
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
                <th scope="col">Profesores</th>
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
                  onHorario={
                    puedeAsignar
                      ? () => {
                          setAviso(undefined)
                          setEditarHorarioEn(seccion)
                        }
                      : undefined
                  }
                  gestionar={puedeAsignar}
                  verAlumnos={verAlumnos}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editarHorarioEn && (
        <EditarHorarioDialogo
          seccionId={editarHorarioEn.id}
          numero={editarHorarioEn.numero}
          onGuardado={(horario) => {
            setHorariosGuardados((anteriores) => ({
              ...anteriores,
              [editarHorarioEn.id]: horario,
            }))
            setAviso({
              exito: true,
              texto: `Horario de la sección ${editarHorarioEn.numero} guardado.`,
            })
          }}
          onCerrar={() => setEditarHorarioEn(null)}
        />
      )}
    </section>
  )
}
