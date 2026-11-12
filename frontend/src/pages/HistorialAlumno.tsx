import type {
  DetalleHistorialAlumno,
  PeriodoHistorialAlumno,
} from '@cursus/shared'
import { Link, Navigate, useParams } from 'react-router'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useSession } from '../session/session'
import { RegistroMisNotas } from './MisNotas'
import { textoNotaFinal } from './nota-final'
import { useDatos } from './useDatos'
import './Dashboard.css'

export const RUTA_HISTORIAL = '/mis-cursos/historial'
const API = '/api/mis-cursos/historial'

export function HistorialAlumno() {
  const { user } = useSession()
  const { seccionId } = useParams()
  if (user.rol !== 'ALUMNO') return <Navigate to="/" replace />
  return seccionId ? (
    <CursoAnterior key={seccionId} id={seccionId} />
  ) : (
    <PeriodosAnteriores />
  )
}

function PeriodosAnteriores() {
  const [periodos, recargar] = useDatos<PeriodoHistorialAlumno[]>(API)
  return (
    <section className="dashboard" aria-label="Historial de notas">
      <h2 className="dashboard__titulo">Historial de notas</h2>
      {periodos === undefined ? (
        <Cargando texto="Cargando tu historial…" />
      ) : periodos === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar tu historial de notas."
          onReintentar={recargar}
        />
      ) : periodos.length === 0 ? (
        <p className="dashboard__texto">
          Aún no tienes notas publicadas de cursos cerrados de períodos
          anteriores.
        </p>
      ) : (
        periodos.map(({ periodo, cursos }) => (
          <section
            key={periodo.id}
            aria-label={`Período ${periodo.anio}-${periodo.semestre}`}
          >
            <h3 className="vista-seccion__subtitulo">
              Período {periodo.anio}-{periodo.semestre}
            </h3>
            <ul className="dashboard__tarjetas">
              {cursos.map(({ seccionId, seccion, curso, notaFinal }) => (
                <li key={seccionId}>
                  <Link
                    className="dashboard__tarjeta"
                    to={`${RUTA_HISTORIAL}/${seccionId}`}
                  >
                    <span className="dashboard__codigo">{curso.codigo}</span>
                    <h4 className="dashboard__curso">{curso.nombre}</h4>
                    <p className="dashboard__seccion">Sección {seccion}</p>
                    <p className="dashboard__texto">
                      {textoNotaFinal(notaFinal)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  )
}

function CursoAnterior({ id }: { id: string }) {
  const [detalle, recargar, estado] = useDatos<DetalleHistorialAlumno>(
    `${API}/${id}`,
  )
  return (
    <section className="dashboard" aria-label="Notas del curso anterior">
      <Link to={RUTA_HISTORIAL}>Volver al historial</Link>
      {detalle === undefined ? (
        <Cargando texto="Cargando notas del curso…" />
      ) : detalle === null ? (
        estado === 404 || estado === 400 ? (
          <p className="dashboard__texto">
            El curso no está disponible en tu historial.
          </p>
        ) : (
          <ErrorEstado
            mensaje="No pudimos cargar las notas de este curso."
            onReintentar={recargar}
          />
        )
      ) : (
        <>
          <h2 className="dashboard__titulo">
            {detalle.curso.codigo} · {detalle.curso.nombre}
          </h2>
          <p className="dashboard__seccion">
            Período {detalle.periodo.anio}-{detalle.periodo.semestre} · Sección{' '}
            {detalle.seccion} · Solo lectura
          </p>
          <RegistroMisNotas datos={detalle} />
        </>
      )}
    </section>
  )
}
