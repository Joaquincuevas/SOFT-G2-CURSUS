import { formatearFecha } from '@/lib/fechas'
import type { MisNotasSeccion } from '@cursus/shared'
import { ClipboardList } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FORMATO_NOTA, textoNotaFinal } from './nota-final'
import { useDatos } from './useDatos'

// NOT-13 (RE-02): el alumno ve, en la pestaña Notas de la sección, cada
// evaluación con su fecha, ponderación y su nota si ya está publicada. Las
// notas propuestas (en borrador, en revisión o devueltas) no se muestran.
// NOT-14: arriba, su nota final o parcial, calculada en el backend.
// Si el frontend se despliega antes que el backend, mis-notas aún no trae
// notaFinal: se omite el resumen y la tabla sigue disponible.
type RespuestaMisNotas = Omit<MisNotasSeccion, 'notaFinal'> &
  Partial<Pick<MisNotasSeccion, 'notaFinal'>>

export function MisNotas({ seccionId }: { seccionId: string }) {
  const [datos, recargar] = useDatos<RespuestaMisNotas>(
    `/api/espacio/secciones/${seccionId}/mis-notas`,
  )

  return (
    <section className="grid min-w-0 gap-4" aria-label="Mis notas">
      <h3 className="m-0 text-lg font-semibold text-foreground">Mis notas</h3>
      {datos === undefined ? (
        <div role="status" className="grid gap-3">
          <span className="sr-only">Cargando mis notas…</span>
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      ) : datos === null ? (
        <ErrorState
          mensaje="No pudimos cargar tus notas."
          onReintentar={recargar}
        />
      ) : datos.evaluaciones.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={ClipboardList}
            titulo="Aún no hay evaluaciones"
            mensaje="Las evaluaciones y sus notas publicadas aparecerán aquí."
          />
        </Card>
      ) : (
        <RegistroMisNotas datos={datos} />
      )}
    </section>
  )
}

export function RegistroMisNotas({ datos }: { datos: RespuestaMisNotas }) {
  return (
    <>
      {datos.notaFinal && (
        <Card className="border-primary/20 bg-primary/5 py-4">
          <CardContent>
            <p
              className="m-0 text-base font-semibold text-foreground"
              aria-label="Nota del curso"
              data-tipo={datos.notaFinal.tipo}
            >
              {textoNotaFinal(datos.notaFinal)}
            </p>
          </CardContent>
        </Card>
      )}
      <Card className="min-w-0 py-0">
        <Table aria-label="Mis notas por evaluación">
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead scope="col" className="pl-4">
                Evaluación
              </TableHead>
              <TableHead scope="col">Fecha</TableHead>
              <TableHead scope="col" className="text-right">
                Ponderación
              </TableHead>
              <TableHead scope="col" className="pr-4 text-right">
                Nota
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datos.evaluaciones.map((evaluacion) => (
              <TableRow key={evaluacion.evaluacionId}>
                <TableCell className="min-w-24 pl-4 font-medium whitespace-normal break-words">
                  {evaluacion.nombre}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <time dateTime={evaluacion.fecha}>
                    {formatearFecha(evaluacion.fecha)}
                  </time>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {evaluacion.ponderacion} %
                </TableCell>
                <TableCell className="pr-4 text-right tabular-nums">
                  {evaluacion.nota === null ? (
                    <Badge variant="secondary">Sin publicar</Badge>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <strong>{FORMATO_NOTA.format(evaluacion.nota)}</strong>
                      {evaluacion.recorregida && (
                        <Badge variant="outline">Recorregida</Badge>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
