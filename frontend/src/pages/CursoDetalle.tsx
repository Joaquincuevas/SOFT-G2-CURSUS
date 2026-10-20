import type { CursoDetalle as DatosCurso, SeccionDetalle } from '@cursus/shared'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede } from '../session/session'
import { AgregarAlumnoDialogo } from './AgregarAlumno'
import './Cursos.css'
import { useDatos } from './useDatos'

const SIN_ASIGNAR = 'Sin asignar'

// Botón de una acción que llega en otra tarjeta: deshabilitado, con el tooltip
// "Próximamente". aria-disabled en vez de disabled, para que se pueda enfocar
// y el tooltip se vea en todos los navegadores.
function Proximamente({ texto }: { texto: string }) {
  return (
    <button
      className="cursos__boton cursos__boton--secundario"
      type="button"
      aria-disabled="true"
      title="Próximamente"
    >
      {texto}
    </button>
  )
}

// Horario (GES-10), profesor y ayudantes (GES-12/13) se muestran como "Sin
// asignar" hasta que existan. Con onAgregarAlumno, la fila tiene el botón
// "Agregar alumno" (GES-15).
function FilaSeccion({
  seccion,
  onAgregarAlumno,
}: {
  seccion: SeccionDetalle
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
      <td>{seccion.alumnos}</td>
      {onAgregarAlumno && (
        <td>
          <button
            className="cursos__boton cursos__boton--secundario"
            type="button"
            aria-label={`Agregar alumno a la sección ${seccion.numero}`}
            onClick={onAgregarAlumno}
          >
            Agregar alumno
          </button>
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
  const [inscribirEn, setInscribirEn] = useState<SeccionDetalle | null>(null)
  const [agregados, setAgregados] = useState<Record<string, number>>({})

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
  const secciones = [...curso.secciones, ...nuevas].map((seccion) => ({
    ...seccion,
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
          {puedeEditar && <Proximamente texto="Editar curso" />}
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
                {puedeInscribir && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {secciones.map((seccion) => (
                <FilaSeccion
                  key={seccion.id}
                  seccion={seccion}
                  onAgregarAlumno={
                    puedeInscribir
                      ? () => {
                          setAviso(undefined)
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
