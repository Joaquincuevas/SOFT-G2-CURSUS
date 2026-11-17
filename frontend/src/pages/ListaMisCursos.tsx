import type { BloqueHorario, SeccionAlumno } from '@cursus/shared'
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
import { ENLACE } from './indicadores-formato'
import { nombresProfesores, rutaSeccion, textoBloque } from './misSecciones'
import { useDatos } from './useDatos'

// Una fila por inscripción activa del alumno en el período activo.
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
const NUMERO = 'text-right tabular-nums'

interface Fila {
  id: string
  codigo: string
  nombre: string
  numero: number
  horario: BloqueHorario[]
  profesores: string[]
}

const aFila = (s: SeccionAlumno): Fila => ({
  id: s.id,
  codigo: s.curso.codigo,
  nombre: s.curso.nombre,
  numero: s.numero,
  horario: s.horario,
  profesores: nombresProfesores(s),
})

// /mis-cursos del alumno: la lista completa de sus cursos, como «Todos los
// cursos» de Canvas. El Dashboard los resume en tarjetas. La API entrega solo
// el período activo.
export function ListaMisCursos() {
  const { user } = useSession()
  const navegar = useNavigate()
  const [respuesta, recargar] = useDatos<SeccionAlumno[]>(RUTA_SECCIONES_ALUMNO)
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
    {
      clave: 'horario',
      encabezado: 'Horario y sala',
      celda: (f) =>
        f.horario.length ? (
          <ul
            className="m-0 grid list-none gap-0.5 p-0"
            aria-label={`Horario de ${f.codigo}`}
          >
            {f.horario.map((b) => (
              <li key={`${b.dia}-${b.inicio}`}>{textoBloque(b)}</li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">Sin horario asignado</span>
        ),
    },
    {
      clave: 'profesores',
      encabezado: 'Profesores',
      celda: (f) =>
        f.profesores.length ? (
          f.profesores.join(', ')
        ) : (
          <span className="text-muted-foreground">Sin asignar</span>
        ),
    },
    {
      clave: 'inscrito',
      encabezado: 'Inscrito como',
      celda: () => <Badge variant="secondary">Alumno</Badge>,
    },
  ]

  const cantidad = (n: number) => `${n} ${n === 1 ? 'curso' : 'cursos'}`

  return (
    <section aria-label="Mis cursos" className="grid min-w-0 gap-4">
      <PageHeader
        titulo="Mis cursos"
        descripcion={`Período ${periodo}`}
        acciones={
          <Button asChild variant="outline">
            <Link to={RUTA_HISTORIAL}>Historial de notas</Link>
          </Button>
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
                  titulo="No tienes inscripciones en el período activo."
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
