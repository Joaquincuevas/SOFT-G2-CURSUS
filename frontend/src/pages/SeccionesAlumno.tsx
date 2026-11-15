import type { SeccionAlumno } from '@cursus/shared'
import { useEffect } from 'react'
import { Link } from 'react-router'
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
} from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  nombresProfesores,
  rutaSeccion,
  textoBloque,
  textoProfesores,
} from './misSecciones'
import { RUTA_HISTORIAL } from './HistorialAlumno'
import { useDatos } from './useDatos'
import { EVENTO_LECTURA_ANUNCIOS } from './anuncios'

export const RUTA_SECCIONES_ALUMNO = '/api/dashboard/secciones-alumno'

export function SeccionesAlumno() {
  const [secciones, recargar] = useDatos<SeccionAlumno[]>(RUTA_SECCIONES_ALUMNO)
  useEffect(() => {
    window.addEventListener(EVENTO_LECTURA_ANUNCIOS, recargar)
    return () => window.removeEventListener(EVENTO_LECTURA_ANUNCIOS, recargar)
  }, [recargar])
  return (
    <section
      className="grid min-w-0 gap-5"
      aria-labelledby="cursos-alumno-titulo"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2
          id="cursos-alumno-titulo"
          className="m-0 text-xl font-semibold text-foreground"
        >
          Mis cursos del período
        </h2>
        <Link
          className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          to={RUTA_HISTORIAL}
        >
          Historial de notas{' '}
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      {secciones === undefined ? (
        <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">Cargando tus cursos…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : secciones === null ? (
        <ErrorState
          mensaje="No pudimos cargar tus cursos."
          onReintentar={recargar}
        />
      ) : secciones.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={BookOpen}
            titulo="No tienes inscripciones en el período activo."
            mensaje="Cuando te inscriban en una sección, aparecerá aquí."
          />
        </Card>
      ) : (
        <ul
          className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="Cursos del período activo"
        >
          {secciones.map((seccion) => (
            <li key={seccion.id} className="min-w-0">
              <TarjetaCursoAlumno seccion={seccion} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TarjetaCursoAlumno({ seccion }: { seccion: SeccionAlumno }) {
  const { id, curso, numero, horario, profesores, profesor, anunciosNuevos } =
    seccion
  return (
    <Link
      className="group block h-full rounded-xl text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      to={rutaSeccion(id)}
    >
      <Card className="h-full gap-0 overflow-hidden py-0 transition-colors group-hover:border-primary/50">
        <CardHeader className="gap-2 border-b bg-primary/10 px-5 py-4">
          <span className="flex items-center justify-between gap-2 text-xs font-semibold text-primary">
            {curso.codigo}
            <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
          </span>
          <h3 className="m-0 text-base font-semibold break-words">
            {curso.nombre}
          </h3>
          <p className="m-0 text-xs text-muted-foreground">Sección {numero}</p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 py-4 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <CalendarDays
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            {horario.length === 0 ? (
              <span>Sin horario asignado</span>
            ) : (
              <ul className="m-0 grid list-none gap-1 p-0" aria-label="Horario">
                {horario.map((bloque) => (
                  <li key={`${bloque.dia}-${bloque.inicio}`}>
                    {textoBloque(bloque)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="m-0 flex gap-2">
            <GraduationCap
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            <span className="min-w-0 break-words">
              {textoProfesores(nombresProfesores({ profesores, profesor }))}
            </span>
          </p>
          <Badge variant={anunciosNuevos > 0 ? 'default' : 'secondary'}>
            {anunciosNuevos === 1
              ? '1 anuncio nuevo'
              : `${anunciosNuevos} anuncios nuevos`}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  )
}
