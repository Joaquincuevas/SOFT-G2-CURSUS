import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@/components/ui/table'
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
    <section
      className="grid min-w-0 gap-4 rounded-xl border bg-card p-4"
      aria-label={titulo}
    >
      <h4 className="m-0 text-base font-semibold">{titulo}</h4>
      {datos.alumnos.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          La sección no tiene alumnos inscritos.
        </p>
      ) : (
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
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
      <p className="m-0 text-sm text-muted-foreground" role="status">
        Este alumno aún no tiene cambios de nota registrados.
      </p>
    )
  }
  return (
    <div className="min-w-0 rounded-xl border bg-card">
      <Table className="[&_td]:whitespace-normal [&_th]:whitespace-normal">
        <caption>Historial de {alumno}</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Fecha</TableHead>
            <TableHead scope="col">Usuario</TableHead>
            <TableHead scope="col">Evento</TableHead>
            <TableHead scope="col">Nota anterior</TableHead>
            <TableHead scope="col">Nota nueva</TableHead>
            <TableHead scope="col">Motivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datos.eventos.map((evento) => (
            <TableRow key={evento.id}>
              <TableCell>
                <time dateTime={evento.fecha}>
                  {fechaHora.format(new Date(evento.fecha))}
                </time>
              </TableCell>
              <TableCell>{evento.responsable.nombre}</TableCell>
              <TableCell>{TIPO[evento.tipo]}</TableCell>
              <TableCell>{nota(evento.notaAnterior)}</TableCell>
              <TableCell>{nota(evento.notaNueva)}</TableCell>
              <TableCell>{evento.motivo ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
