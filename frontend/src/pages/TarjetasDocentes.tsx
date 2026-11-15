import { ArrowUpRight, BookOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState } from '@/components/shared'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { rutaSeccion } from './misSecciones'

interface Seccion {
  id: string
  curso: { codigo: string; nombre: string }
  numero: number
}

export function TarjetasDocentes<T extends Seccion>({
  secciones,
  recargar,
  mensajeVacio,
  pendientes,
  resumen,
}: {
  secciones: T[] | null | undefined
  recargar: () => void
  mensajeVacio: string
  pendientes?: ReactNode
  resumen: (seccion: T) => ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <h2 className="m-0 text-xl font-semibold">Mis secciones del período</h2>
      {pendientes}
      {secciones === undefined ? (
        <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">Cargando tus secciones…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : secciones === null ? (
        <ErrorState
          mensaje="No pudimos cargar tus secciones."
          onReintentar={recargar}
        />
      ) : secciones.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={BookOpen}
            titulo={mensajeVacio}
            mensaje="Las secciones aparecerán aquí cuando estén asignadas en el período activo."
          />
        </Card>
      ) : (
        <ul
          aria-label="Secciones del período activo"
          className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3"
        >
          {secciones.map((seccion) => (
            <li key={seccion.id} className="min-w-0">
              <Link
                to={rutaSeccion(seccion.id)}
                className="group block h-full rounded-xl text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Card className="h-full gap-0 overflow-hidden py-0 transition-colors group-hover:border-primary/50">
                  <CardHeader className="gap-2 border-b bg-primary/10 px-5 py-4">
                    <span className="flex items-center justify-between gap-2 text-xs font-semibold text-primary">
                      {seccion.curso.codigo}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    </span>
                    <h3 className="m-0 text-base font-semibold break-words">
                      {seccion.curso.nombre}
                    </h3>
                    <p className="m-0 text-xs text-muted-foreground">
                      Sección {seccion.numero}
                    </p>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-5 py-4 text-sm text-muted-foreground">
                    {resumen(seccion)}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
