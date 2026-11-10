import type {
  HistorialNota,
  NotasEvaluacion,
  TipoEventoNota,
} from '@cursus/shared'
import { useState } from 'react'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

const TIPO: Record<TipoEventoNota, string> = {
  PROPUESTA: 'Propuesta',
  ENVIO: 'Envío a revisión',
  APROBACION: 'Aprobación',
  DEVOLUCION: 'Devolución',
  RECORRECCION: 'Recorrección',
  PUBLICACION: 'Publicación',
}

const fechaHora = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Santiago',
})

const decimal = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const nota = (valor: number | null) =>
  valor === null ? '—' : decimal.format(valor)

export function HistorialDeNota({ ruta }: { ruta: string }) {
  const [datos, recargar] = useDatos<NotasEvaluacion>(ruta)
  const [alumnoId, setAlumnoId] = useState('')
  if (datos === undefined) return <Cargando texto="Cargando alumnos…" />
  if (datos === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar los alumnos."
        onReintentar={recargar}
      />
    )
  }
  const alumno = datos.alumnos.find((fila) => fila.id === alumnoId)
  const titulo = `Historial de notas de ${datos.evaluacion.nombre}`

  return (
    <section className="notas__evaluacion" aria-label={titulo}>
      <h4 className="vista-seccion__subtitulo">{titulo}</h4>
      {datos.alumnos.length === 0 ? (
        <p className="dashboard__texto">
          La sección no tiene alumnos inscritos.
        </p>
      ) : (
        <label className="notas__campo">
          Alumno para consultar
          <select
            value={alumnoId}
            onChange={(e) => setAlumnoId(e.target.value)}
          >
            <option value="">Selecciona un alumno</option>
            {datos.alumnos.map(({ id, nombre }) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {alumno && (
        <EventosNota
          key={alumno.id}
          ruta={`${ruta}/${alumno.id}/historial`}
          alumno={alumno.nombre}
        />
      )}
    </section>
  )
}

function EventosNota({ ruta, alumno }: { ruta: string; alumno: string }) {
  const [datos, recargar] = useDatos<HistorialNota>(ruta)
  if (datos === undefined) return <Cargando texto="Cargando historial…" />
  if (datos === null) {
    return (
      <ErrorEstado
        mensaje="No pudimos cargar el historial de esta nota."
        onReintentar={recargar}
      />
    )
  }
  if (datos.eventos.length === 0) {
    return (
      <p className="dashboard__texto" role="status">
        Este alumno aún no tiene cambios de nota registrados.
      </p>
    )
  }
  return (
    <div className="notas__listado">
      <table className="notas__tabla">
        <caption>Historial de {alumno}</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Usuario</th>
            <th scope="col">Evento</th>
            <th scope="col">Nota anterior</th>
            <th scope="col">Nota nueva</th>
            <th scope="col">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {datos.eventos.map((evento) => (
            <tr key={evento.id}>
              <td>
                <time dateTime={evento.fecha}>
                  {fechaHora.format(new Date(evento.fecha))}
                </time>
              </td>
              <td>{evento.responsable.nombre}</td>
              <td>{TIPO[evento.tipo]}</td>
              <td>{nota(evento.notaAnterior)}</td>
              <td>{nota(evento.notaNueva)}</td>
              <td>{evento.motivo ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
