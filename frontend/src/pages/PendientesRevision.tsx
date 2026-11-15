import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { PendienteRevision } from '@cursus/shared'
import { Fragment, useState } from 'react'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { NotasDeEvaluacion } from './NotasDeEvaluacion'
import { RUTA_PENDIENTES_REVISION, textoSinNota } from './misSecciones'
import { useDatos } from './useDatos'

// NOT-10: evaluaciones enviadas a revisión en las secciones del profesor, de
// la más antigua a la más nueva. Al abrir una se ven todas las notas
// propuestas en solo lectura y aprobarlas y publicarlas (NOT-11) o
// devolverlas al ayudante con un comentario (NOT-12).
export function PendientesRevision() {
  const [pendientes, recargar, status] = useDatos<PendienteRevision[]>(
    RUTA_PENDIENTES_REVISION,
  )
  const [abierta, setAbierta] = useState<PendienteRevision | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <section className="grid min-w-0 gap-4" aria-label="Pendientes de revisión">
      <h2 className="m-0 text-xl font-semibold">
        Evaluaciones pendientes de revisión
      </h2>
      {/* Fuera de la lista: sigue visible cuando la recarga la saca. */}
      {aviso && (
        <p className="m-0 text-sm text-(color:--color-success)" role="status">
          {aviso}
        </p>
      )}
      {pendientes === undefined ? (
        <Cargando texto="Cargando pendientes…" />
      ) : pendientes === null && status === 403 ? (
        // La ruta está bajo Mis Cursos, que ven todos los roles: reintentar
        // no cambiaría el 403.
        <p className="m-0 text-sm text-muted-foreground">
          Solo el profesor ve las evaluaciones pendientes de revisión.
        </p>
      ) : pendientes === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar las evaluaciones pendientes."
          onReintentar={recargar}
        />
      ) : pendientes.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          No tienes evaluaciones pendientes de revisión.
        </p>
      ) : (
        <Table className="[&_td]:whitespace-normal [&_th]:whitespace-normal">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Curso</TableHead>
              <TableHead scope="col">Sección</TableHead>
              <TableHead scope="col">Evaluación</TableHead>
              <TableHead scope="col">Ayudante</TableHead>
              <TableHead scope="col">Enviada</TableHead>
              <TableHead scope="col">Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendientes.map((p) => {
              const esAbierta = abierta?.evaluacion.id === p.evaluacion.id
              return (
                <Fragment key={p.evaluacion.id}>
                  <TableRow>
                    <TableCell>
                      {p.curso.codigo} {p.curso.nombre}
                    </TableCell>
                    <TableCell>{p.seccion.numero}</TableCell>
                    <TableCell>
                      {p.evaluacion.nombre}
                      {/* NOT-08: alumnos inscritos después del envío. */}
                      {p.sinNota > 0 && (
                        <small> ({textoSinNota(p.sinNota)})</small>
                      )}
                    </TableCell>
                    <TableCell>{p.ayudante?.nombre ?? '—'}</TableCell>
                    <TableCell>
                      {p.enviadaEl
                        ? new Date(p.enviadaEl).toLocaleString('es-CL', {
                            dateStyle: 'long',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto justify-start px-0 py-1 whitespace-normal text-left"
                        aria-pressed={esAbierta}
                        aria-label={`Notas de ${p.evaluacion.nombre} (${p.curso.codigo}, sección ${p.seccion.numero})`}
                        onClick={() => {
                          setAviso(null)
                          setAbierta(esAbierta ? null : p)
                        }}
                      >
                        {esAbierta ? 'Ocultar' : 'Ver notas'}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {/* Las notas se abren bajo su fila, no al final de la lista. */}
                  {esAbierta && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <NotasDeEvaluacion
                          rol="PROFESOR"
                          seccionId={p.seccion.id}
                          evaluacionId={p.evaluacion.id}
                          // Aprobada o devuelta (o ya no pendiente): se
                          // cierra y la recarga la saca de la lista.
                          alRevisar={(texto) => {
                            setAviso(`${p.evaluacion.nombre}: ${texto}`)
                            setAbierta(null)
                            recargar()
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
