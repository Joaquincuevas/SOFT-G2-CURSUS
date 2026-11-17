import type {
  BloqueHorario,
  SeccionAlumno,
  SeccionAyudante,
  SeccionDashboard,
} from '@cursus/shared'
import { BookOpen, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  PageHeader,
  type Columna,
} from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession } from '../session/session'
import { RUTA_HISTORIAL } from './HistorialAlumno'
import { RUTA_SECCIONES_ALUMNO } from './SeccionesAlumno'
import { RUTA_SECCIONES_AYUDANTE } from './SeccionesAyudante'
import { ENLACE } from './indicadores-formato'
import {
  nombresProfesores,
  RUTA_MIS_SECCIONES,
  RUTA_PAGINA_PENDIENTES,
  rutaSeccion,
  textoBloque,
  textoPendientes,
} from './misSecciones'
import { useDatos } from './useDatos'

// Una fila por sección del usuario. Los tres endpoints del Dashboard traen
// campos distintos: el profesor, horario y alumnos; el ayudante, el profesor
// a cargo; el alumno, horario y profesor.
interface Fila {
  id: string
  codigo: string
  nombre: string
  numero: number
  horario?: BloqueHorario[]
  alumnos?: number
  profesores?: string[]
  pendientes: number
}

type Respuesta = SeccionDashboard | SeccionAyudante | SeccionAlumno

const aFila = (s: Respuesta): Fila => ({
  id: s.id,
  codigo: s.curso.codigo,
  nombre: s.curso.nombre,
  numero: s.numero,
  horario: 'horario' in s ? s.horario : undefined,
  alumnos: 'alumnos' in s ? s.alumnos : undefined,
  profesores: 'profesores' in s ? nombresProfesores(s) : undefined,
  pendientes: 'pendientesRevision' in s ? s.pendientesRevision : 0,
})

// Sin tildes ni mayúsculas: «programacion» encuentra «Programación».
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const RUTA_POR_ROL = {
  PROFESOR: RUTA_MIS_SECCIONES,
  AYUDANTE: RUTA_SECCIONES_AYUDANTE,
  ALUMNO: RUTA_SECCIONES_ALUMNO,
} as const
const ROL_EN_CURSO = {
  PROFESOR: 'Profesor',
  AYUDANTE: 'Ayudante',
  ALUMNO: 'Alumno',
} as const
const NUMERO = 'text-right tabular-nums'

// /mis-cursos: la lista completa de cursos del usuario, como «Todos los
// cursos» de Canvas. El Dashboard los resume en tarjetas. Las tres respuestas
// son del período activo: la API no entrega períodos anteriores.
export function ListaMisCursos({
  rol,
}: {
  rol: 'PROFESOR' | 'AYUDANTE' | 'ALUMNO'
}) {
  const { user } = useSession()
  const navegar = useNavigate()
  const [respuesta, recargar] = useDatos<Respuesta[]>(RUTA_POR_ROL[rol])
  const [busqueda, setBusqueda] = useState('')

  const todas = useMemo(() => respuesta?.map(aFila), [respuesta])
  const filas = useMemo(() => {
    const texto = normalizar(busqueda.trim())
    if (!todas || !texto) return todas ?? []
    return todas.filter((f) =>
      normalizar(`${f.codigo} ${f.nombre} ${f.numero}`).includes(texto),
    )
  }, [todas, busqueda])

  const periodo = user.periodoActivo
    ? `${user.periodoActivo.anio}-${user.periodoActivo.semestre}`
    : '—'
  const pendientes = todas?.reduce((n, f) => n + f.pendientes, 0) ?? 0

  const columnas: Columna<Fila>[] = [
    {
      clave: 'curso',
      encabezado: 'Curso',
      valor: (f) => f.codigo,
      celda: (f) => (
        <Link to={rutaSeccion(f.id)} className={ENLACE}>
          <span className="tabular-nums">{f.codigo}</span>
          <span className="font-normal text-foreground"> · {f.nombre}</span>
        </Link>
      ),
    },
    {
      clave: 'seccion',
      encabezado: 'Sección',
      valor: (f) => f.numero,
      celda: (f) => f.numero,
      className: NUMERO,
    },
    {
      clave: 'periodo',
      encabezado: 'Período',
      celda: () => periodo,
    },
    ...(rol === 'AYUDANTE'
      ? []
      : [
          {
            clave: 'horario',
            encabezado: 'Horario y sala',
            celda: (f: Fila) =>
              f.horario?.length ? (
                <ul
                  className="m-0 grid list-none gap-0.5 p-0"
                  aria-label={`Horario de ${f.codigo}`}
                >
                  {f.horario.map((b) => (
                    <li key={`${b.dia}-${b.inicio}`}>{textoBloque(b)}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">
                  Sin horario asignado
                </span>
              ),
          },
        ]),
    ...(rol === 'PROFESOR'
      ? [
          {
            clave: 'alumnos',
            encabezado: 'Alumnos',
            valor: (f: Fila) => f.alumnos,
            celda: (f: Fila) => f.alumnos ?? '—',
            className: NUMERO,
          },
        ]
      : [
          {
            clave: 'profesores',
            encabezado: 'Profesores',
            celda: (f: Fila) =>
              f.profesores?.length ? (
                f.profesores.join(', ')
              ) : (
                <span className="text-muted-foreground">Sin asignar</span>
              ),
          },
          {
            clave: 'inscrito',
            encabezado: 'Inscrito como',
            celda: () => <Badge variant="secondary">{ROL_EN_CURSO[rol]}</Badge>,
          },
        ]),
  ]

  const cantidad = (n: number) => `${n} ${n === 1 ? 'curso' : 'cursos'}`

  return (
    <section aria-label="Mis cursos" className="grid min-w-0 gap-4">
      <PageHeader
        titulo="Mis cursos"
        descripcion={`Período ${periodo}`}
        acciones={
          <>
            {rol === 'PROFESOR' && pendientes > 0 && (
              <Link to={RUTA_PAGINA_PENDIENTES} className="no-underline">
                <Badge variant="secondary" className="hover:bg-secondary/70">
                  {textoPendientes(pendientes)}
                </Badge>
              </Link>
            )}
            {rol === 'ALUMNO' && (
              <Button asChild variant="outline">
                <Link to={RUTA_HISTORIAL}>Historial de notas</Link>
              </Button>
            )}
          </>
        }
      />
      {respuesta === null ? (
        <ErrorState
          mensaje="No pudimos cargar tus cursos."
          onReintentar={recargar}
        />
      ) : (
        <>
          <div
            role="search"
            aria-label="Buscar cursos"
            className="flex flex-wrap items-end justify-between gap-3"
          >
            <FormField etiqueta="Buscar" className="w-full min-w-0 sm:max-w-sm">
              {(control) => (
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    {...control}
                    type="search"
                    placeholder="Código, nombre o sección"
                    className="w-full pr-9 pl-8 [&::-webkit-search-cancel-button]:hidden"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                  {busqueda && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Limpiar búsqueda"
                      className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
                      onClick={() => setBusqueda('')}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </FormField>
            <p
              className="m-0 min-h-8 text-sm text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {todas === undefined
                ? 'Cargando cursos…'
                : cantidad(filas.length)}
            </p>
          </div>
          <DataTable
            etiqueta="Mis cursos"
            columnas={columnas}
            filas={filas}
            claveFila={(f) => f.id}
            cargando={todas === undefined}
            textoDeCarga="Cargando tus cursos…"
            alHacerClic={(f) => void navegar(rutaSeccion(f.id))}
            vacio={
              todas?.length ? (
                <EmptyState
                  icono={BookOpen}
                  titulo="No hay cursos con esa búsqueda."
                  mensaje="Prueba con otro código, nombre o sección."
                  accion={
                    <Button variant="outline" onClick={() => setBusqueda('')}>
                      Limpiar búsqueda
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icono={BookOpen}
                  titulo={
                    rol === 'PROFESOR'
                      ? 'No tienes secciones a tu cargo en el período activo.'
                      : rol === 'AYUDANTE'
                        ? 'No eres ayudante de ninguna sección en el período activo.'
                        : 'No tienes inscripciones en el período activo.'
                  }
                  mensaje="Tus cursos aparecerán aquí cuando estén asignados."
                />
              )
            }
          />
        </>
      )}
    </section>
  )
}
