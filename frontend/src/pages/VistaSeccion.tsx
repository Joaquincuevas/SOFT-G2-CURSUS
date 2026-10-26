import type { AlumnosEspacio, SeccionResumen } from '@cursus/shared'
import { useId, useState, type ComponentType } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { ROL_LABEL } from '../session/roles'
import './Dashboard.css'
import './VistaSeccion.css'
import { textoBloque } from './misSecciones'
import { PestanaNotas } from './PestanaNotas'
import { useDatos } from './useDatos'

// Pestañas del espacio de la sección que agrega la Fase 4.
const PESTANAS = ['Notas', 'Material', 'Anuncios', 'Asistencia'] as const
type Pestana = (typeof PESTANAS)[number]

export interface PropsPestana {
  seccionId: string
  rol: SeccionResumen['rol']
}

// Contenido de cada pestaña ya implementada; las demás siguen deshabilitadas.
const CONTENIDO: Partial<Record<Pestana, ComponentType<PropsPestana>>> = {
  Notas: PestanaNotas,
}

// ESP-04 (RE-04): vista general de una sección, la misma para profesor,
// ayudante y alumno. Hoy no hay acciones por rol: llegan en la Fase 4 con
// las pestañas.
export function VistaSeccion() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [activa, setActiva] = useState<Pestana | null>(null)
  const [seccion, recargar, status] = useDatos<SeccionResumen>(
    `/api/espacio/secciones/${id}/resumen`,
  )

  if (seccion === undefined) {
    return <Cargando />
  }
  if (seccion === null) {
    // 403: no es integrante; 404 (o 400, id inválido): no existe o está
    // archivada. Reintentar no cambia nada, así que se vuelve al dashboard.
    if (status === 403 || status === 404 || status === 400) {
      return (
        <ErrorEstado
          titulo={status === 403 ? 'Sin acceso' : 'Sección no encontrada'}
          mensaje={
            status === 403
              ? 'No eres integrante de esta sección.'
              : 'La sección no existe o ya no está disponible.'
          }
          textoBoton="Volver al Dashboard"
          onReintentar={() => void navigate('/')}
        />
      )
    }
    return (
      <ErrorEstado
        mensaje="No pudimos cargar la sección."
        onReintentar={recargar}
      />
    )
  }
  const { curso, numero, rol, horario, profesor, ayudantes } = seccion
  const Contenido = activa && CONTENIDO[activa]
  return (
    <section className="dashboard" aria-label="Vista del curso">
      <span className="dashboard__codigo">{curso.codigo}</span>
      <h2 className="dashboard__titulo">{curso.nombre}</h2>
      <p className="dashboard__seccion">Sección {numero}</p>
      <p className="dashboard__texto">Entras como {ROL_LABEL[rol]}</p>

      <div
        className="vista-seccion__pestanas"
        role="tablist"
        aria-label="Pestañas de la sección"
      >
        {PESTANAS.map((pestana) => (
          <button
            key={pestana}
            type="button"
            role="tab"
            aria-selected={activa === pestana}
            className="vista-seccion__pestana"
            disabled={!CONTENIDO[pestana]}
            onClick={() => setActiva(activa === pestana ? null : pestana)}
          >
            {pestana}
          </button>
        ))}
      </div>
      {Contenido && (
        <div role="tabpanel" aria-label={activa ?? undefined}>
          <Contenido key={id} seccionId={id} rol={rol} />
        </div>
      )}

      <h3 className="vista-seccion__subtitulo">Horario y sala</h3>
      {horario.length === 0 ? (
        <p className="dashboard__texto">Sin horario asignado</p>
      ) : (
        <ul className="dashboard__horario" aria-label="Horario">
          {horario.map((bloque) => (
            <li key={`${bloque.dia}-${bloque.inicio}`}>
              {textoBloque(bloque)}
            </li>
          ))}
        </ul>
      )}

      <h3 className="vista-seccion__subtitulo">Equipo docente</h3>
      <dl className="vista-seccion__equipo">
        <dt>Profesor</dt>
        <dd>{profesor?.nombre ?? 'Sin profesor asignado'}</dd>
        <dt>Ayudantes</dt>
        {ayudantes.length === 0 ? (
          <dd>Sin ayudantes asignados</dd>
        ) : (
          ayudantes.map((ayudante) => (
            <dd key={ayudante.id}>{ayudante.nombre}</dd>
          ))
        )}
      </dl>

      {/* key: al cambiar de sección la lista vuelve a cargar, sin mostrar
          la de la sección anterior. */}
      {rol === 'PROFESOR' && <AlumnosDeLaSeccion key={id} seccionId={id} />}

      <Link to="/">Volver al Dashboard</Link>
    </section>
  )
}

// ESP-05 (RN-06): alumnos inscritos, solo para el profesor de la sección y en
// solo lectura. Agregar o quitar alumnos es del Administrativo (GES-15 y
// GES-19). El backend los entrega ordenados por nombre.
function AlumnosDeLaSeccion({ seccionId }: { seccionId: string }) {
  const [datos, recargar] = useDatos<AlumnosEspacio>(
    `/api/espacio/secciones/${seccionId}/alumnos`,
  )
  const tituloId = useId()

  return (
    <section className="vista-seccion__alumnos" aria-labelledby={tituloId}>
      <h3 id={tituloId} className="vista-seccion__subtitulo">
        {datos ? `Alumnos (${datos.total})` : 'Alumnos'}
      </h3>
      {datos === undefined ? (
        <Cargando texto="Cargando alumnos…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar los alumnos."
          onReintentar={recargar}
        />
      ) : datos.alumnos.length === 0 ? (
        <p className="dashboard__texto">Aún no hay alumnos inscritos</p>
      ) : (
        <ul className="vista-seccion__lista" aria-label="Alumnos inscritos">
          {datos.alumnos.map((alumno) => (
            <li key={alumno.id}>
              <span className="vista-seccion__nombre">{alumno.nombre}</span>
              <span>{alumno.correo}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
