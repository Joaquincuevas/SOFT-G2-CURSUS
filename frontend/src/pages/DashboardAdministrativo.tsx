import type { CursoListado, ProfesorOpcion } from '@cursus/shared'
import {
  ArrowUpRight,
  BookOpen,
  CalendarRange,
  GraduationCap,
  Milestone,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router'
import { ErrorState } from '@/components/shared'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from '../session/session'
import { useDatos } from './useDatos'

const ACCESOS = [
  {
    ruta: '/cursos',
    texto: 'Gestionar cursos',
    icono: BookOpen,
    accion: 'read',
    sujeto: 'GestionAcademica',
  },
  {
    ruta: '/carreras',
    texto: 'Gestionar carreras',
    icono: Milestone,
    accion: 'create',
    sujeto: 'Carrera',
  },
  {
    ruta: '/periodos',
    texto: 'Gestionar períodos',
    icono: CalendarRange,
    accion: 'create',
    sujeto: 'Periodo',
  },
  {
    ruta: '/docentes',
    texto: 'Profesores y ayudantes',
    icono: UsersRound,
    accion: 'create',
    sujeto: 'Usuario',
  },
] as const

export function DashboardAdministrativo() {
  const { user, ability } = useSession()
  const periodo = user.periodoActivo
  const puedeLeerCursos = ability.can('read', 'Curso')
  const puedeLeerProfesores = ability.can('update', 'Seccion')
  const ruta = periodo
    ? '/api/cursos?' + new URLSearchParams({ periodoId: periodo.id })
    : '/api/cursos'
  const [cursos, recargarCursos] = useDatos<CursoListado[]>(
    puedeLeerCursos ? ruta : null,
  )
  const [profesores, recargarProfesores] = useDatos<ProfesorOpcion[]>(
    puedeLeerProfesores ? '/api/profesores' : null,
  )

  return (
    <div className="grid gap-6">
      <div>
        <p className="m-0 text-sm font-medium text-primary">
          {user.universidadNombre}
        </p>
        <h2 className="m-0 mt-1 text-xl font-semibold">
          {user.facultadNombre ?? 'Gestión académica'}
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          {periodo
            ? `Período activo ${periodo.anio}-${periodo.semestre}`
            : 'Sin período activo'}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {puedeLeerCursos && (
          <Resumen
            titulo={periodo ? 'Cursos del período activo' : 'Cursos vigentes'}
            contexto="De tu facultad"
            cantidad={cursos?.length}
            error={cursos === null}
            recargar={recargarCursos}
            icono={BookOpen}
          />
        )}
        {puedeLeerProfesores && (
          <Resumen
            titulo="Cuentas de profesores"
            contexto="De toda la universidad"
            cantidad={profesores?.length}
            error={profesores === null}
            recargar={recargarProfesores}
            icono={GraduationCap}
          />
        )}
      </div>
      <section aria-labelledby="accesos-administrativo" className="grid gap-3">
        <h3 id="accesos-administrativo" className="m-0 text-base font-semibold">
          Accesos directos
        </h3>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {ACCESOS.filter(({ accion, sujeto }) =>
            ability.can(accion, sujeto),
          ).map(({ ruta: destino, texto, icono: Icono }) => (
            <li key={destino} className="min-w-0">
              <Link
                to={destino}
                className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground no-underline hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icono
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
                <span className="flex-1">{texto}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Resumen({
  titulo,
  contexto,
  cantidad,
  error,
  recargar,
  icono: Icono,
}: {
  titulo: string
  contexto: string
  cantidad: number | undefined
  error: boolean
  recargar: () => void
  icono: typeof BookOpen
}) {
  return (
    <Card
      role="region"
      aria-label={titulo}
      className="gap-3 border-t-4 border-t-primary py-4"
    >
      <CardHeader className="px-4">
        <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">
          <Icono aria-hidden="true" className="size-4 text-primary" />
          {titulo}
        </h3>
      </CardHeader>
      <CardContent className="px-4">
        {error ? (
          <ErrorState
            mensaje="No se pudo cargar el total."
            onReintentar={recargar}
          />
        ) : cantidad === undefined ? (
          <div role="status">
            <span className="sr-only">Cargando {titulo.toLowerCase()}…</span>
            <Skeleton className="h-8 w-14" />
          </div>
        ) : (
          <p className="m-0 text-3xl font-semibold tabular-nums">{cantidad}</p>
        )}
        <p className="m-0 mt-1 text-sm text-muted-foreground">{contexto}</p>
      </CardContent>
    </Card>
  )
}
