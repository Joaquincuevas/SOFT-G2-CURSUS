import type {
  CursoDetalle,
  CursoListado,
  Periodo,
  ProfesorOpcion,
} from '@cursus/shared'
import { BookOpen, CheckCircle2, GraduationCap } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState, ErrorState } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '../auth/auth'
import { useSession } from '../session/session'
import { useEffect, useMemo, useState } from 'react'
import { useDatos } from './useDatos'

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
      {puedeLeerCursos && <Pendientes cursos={cursos} />}
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

// Lo que hay que corregir, calculado con los endpoints que ya existen: el
// detalle de cada curso del período activo (secciones, horario, profesores y
// alumnos) y la lista de períodos.
const DIAS_AVISO = 14
const DIA_MS = 86_400_000
// AAAA-MM-DD de la fecha en la zona del navegador.
const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface Pendiente {
  clave: string
  titulo: string
  // Dónde se corrige: los cursos afectados (hasta 3) o una ruta.
  afectados: { id: string; texto: string; ruta: string }[]
  cantidad: number
  detalle?: string
  ruta: string
}

function usePendientes(cursos: CursoListado[] | null | undefined) {
  const { fetchConSesion } = useAuth()
  const [intento, setIntento] = useState(0)
  const [resultado, setResultado] = useState<{
    clave: string
    datos: { detalles: CursoDetalle[]; periodos: Periodo[] } | null
  } | null>(null)
  const claveCursos = cursos ? cursos.map((c) => c.id).join(',') : null
  const clave = `${intento}:${claveCursos}`

  useEffect(() => {
    if (claveCursos === null) return
    let vigente = true
    const pedir = async <T,>(ruta: string) => {
      const res = await fetchConSesion(ruta)
      if (!res.ok) throw new Error(String(res.status))
      return (await res.json()) as T
    }
    void Promise.all([
      Promise.all(
        (claveCursos ? claveCursos.split(',') : []).map((id) =>
          pedir<CursoDetalle>(`/api/cursos/${id}`),
        ),
      ),
      pedir<Periodo[]>('/api/periodos'),
    ]).then(
      ([detalles, periodos]) =>
        vigente && setResultado({ clave, datos: { detalles, periodos } }),
      () => vigente && setResultado({ clave, datos: null }),
    )
    return () => {
      vigente = false
    }
  }, [fetchConSesion, claveCursos, clave])

  return [
    cursos === null
      ? null
      : resultado?.clave === clave
        ? resultado.datos
        : undefined,
    () => setIntento((n) => n + 1),
  ] as const
}

function Pendientes({ cursos }: { cursos: CursoListado[] | null | undefined }) {
  const [datos, recargar] = usePendientes(cursos)
  const [hoy] = useState(() => new Date())

  const pendientes = useMemo<Pendiente[] | null>(() => {
    if (!datos) return null
    const afectados = (
      filtro: (d: CursoDetalle) => number,
    ): Pendiente['afectados'] =>
      datos.detalles
        .filter((d) => filtro(d) > 0)
        .map((d) => ({
          id: d.id,
          texto: `${d.codigo} · ${filtro(d)}`,
          ruta: `/cursos/${d.id}`,
        }))
    const item = (
      clave: string,
      titulo: string,
      filtro: (d: CursoDetalle) => number,
    ): Pendiente => {
      const lista = afectados(filtro)
      return {
        clave,
        titulo,
        afectados: lista.slice(0, 3),
        cantidad: datos.detalles.reduce((n, d) => n + filtro(d), 0),
        ruta: '/cursos',
      }
    }
    const sin =
      (f: (s: CursoDetalle['secciones'][number]) => boolean) =>
      (d: CursoDetalle) =>
        d.secciones.filter(f).length
    const lista: Pendiente[] = [
      item(
        'sin-profesor',
        'Secciones sin profesor asignado',
        sin((s) => s.profesores.length === 0),
      ),
      item(
        'sin-horario',
        'Secciones sin horario',
        sin((s) => !s.horario),
      ),
      item(
        'sin-alumnos',
        'Secciones sin alumnos',
        sin((s) => s.alumnos === 0),
      ),
    ]
    const activo = datos.periodos.find((p) => p.activo)
    if (!activo) {
      lista.push({
        clave: 'periodo',
        titulo: 'Sin período activo',
        afectados: [],
        cantidad: 1,
        ruta: '/periodos',
      })
    } else {
      // Días de calendario hasta el término (0 = termina hoy).
      const dias = Math.round(
        (Date.parse(activo.fechaTermino) - Date.parse(fechaLocal(hoy))) /
          DIA_MS,
      )
      if (dias <= DIAS_AVISO)
        lista.push({
          clave: 'periodo',
          titulo:
            dias < 0
              ? `El período ${activo.anio}-${activo.semestre} ya terminó`
              : `El período ${activo.anio}-${activo.semestre} termina pronto`,
          detalle:
            dias < 0
              ? 'Activa el período vigente.'
              : dias === 0
                ? 'Termina hoy.'
                : `Termina en ${dias} ${dias === 1 ? 'día' : 'días'}.`,
          afectados: [],
          cantidad: 1,
          ruta: '/periodos',
        })
    }
    return lista.filter((p) => p.cantidad > 0)
  }, [datos, hoy])

  return (
    <section aria-labelledby="pendientes-administrativo" className="grid gap-3">
      <h3
        id="pendientes-administrativo"
        className="m-0 text-base font-semibold"
      >
        Pendientes
      </h3>
      {datos === null ? (
        <ErrorState
          mensaje="No pudimos calcular los pendientes."
          onReintentar={recargar}
        />
      ) : datos === undefined || !pendientes ? (
        <div role="status" className="grid gap-2">
          <span className="sr-only">Calculando pendientes…</span>
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : pendientes.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={CheckCircle2}
            titulo="Todo al día"
            mensaje="No hay secciones ni períodos por corregir."
          />
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {pendientes.map((p) => (
            <li key={p.clave} className="min-w-0">
              <Card className="h-full gap-2 py-4">
                <CardContent className="grid gap-2 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="m-0 text-sm font-medium">{p.titulo}</p>
                    <Badge variant="secondary" className="tabular-nums">
                      {p.cantidad}
                    </Badge>
                  </div>
                  {p.detalle && (
                    <p className="m-0 text-sm text-muted-foreground">
                      {p.detalle}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {p.afectados.map((a) => (
                      <Link
                        key={a.id}
                        to={a.ruta}
                        className="rounded-sm font-medium text-primary no-underline underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {a.texto}
                      </Link>
                    ))}
                    <Link
                      to={p.ruta}
                      className="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {p.ruta === '/periodos' ? 'Ir a períodos' : 'Ver cursos'}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
