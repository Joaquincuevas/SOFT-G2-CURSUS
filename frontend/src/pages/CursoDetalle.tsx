import type { CursoDetalle as DatosCurso, SeccionDetalle } from '@cursus/shared'
import { Link, useParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { usePuede } from '../session/session'
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

// Horario (GES-10), profesor y ayudantes (GES-12/13) y alumnos (GES-15) se
// muestran como "Sin asignar" hasta que existan.
function FilaSeccion({ seccion }: { seccion: SeccionDetalle }) {
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

// Detalle de un curso con sus secciones (GES-08), en /cursos/:id.
export function CursoDetalle() {
  const { id } = useParams()
  const [curso, recargar, status] = useDatos<DatosCurso>(`/api/cursos/${id}`)
  const puedeEditar = usePuede('update', 'Curso')
  const puedeCrearSeccion = usePuede('create', 'Seccion')

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
          {puedeCrearSeccion && <Proximamente texto="Crear sección" />}
        </div>
      )}
      {curso.secciones.length === 0 ? (
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
              </tr>
            </thead>
            <tbody>
              {curso.secciones.map((seccion) => (
                <FilaSeccion key={seccion.id} seccion={seccion} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
