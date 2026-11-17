import type { CursoListado } from '@cursus/shared'
import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  type Columna,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useSession } from '../session/session'
import { ENLACE } from './indicadores-formato'

const POR_PAGINA = 25
const NUMERO = 'text-right tabular-nums'
const nombrePeriodo = (c: CursoListado) =>
  `${c.periodo.anio}-${c.periodo.semestre}`
const colador = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
const unicos = (valores: string[]) =>
  [...new Set(valores.filter(Boolean))].sort(colador.compare)
// Sin tildes ni mayúsculas: «introduccion» encuentra «Introducción».
const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

interface Filtros {
  busqueda: string
  universidad: string
  carrera: string
  periodo: string
}
const SIN_FILTROS: Filtros = {
  busqueda: '',
  universidad: '',
  carrera: '',
  periodo: '',
}

const COLUMNAS: Columna<CursoListado>[] = [
  {
    clave: 'universidad',
    encabezado: 'Universidad',
    valor: (c) => c.universidadNombre,
    celda: (c) => c.universidadNombre,
    className: 'hidden min-w-40 whitespace-normal md:table-cell',
  },
  {
    clave: 'codigo',
    encabezado: 'Código',
    valor: (c) => c.codigo,
    celda: (c) => (
      <Link className={ENLACE} to={`/cursos/${c.id}`}>
        {c.codigo}
      </Link>
    ),
  },
  {
    clave: 'curso',
    encabezado: 'Curso',
    valor: (c) => c.nombre,
    celda: (c) => (
      <div className="grid gap-0.5">
        <span>{c.nombre}</span>
        <span className="text-xs text-muted-foreground md:hidden">
          {c.universidadNombre} · {c.carreraNombre} · {nombrePeriodo(c)}
        </span>
      </div>
    ),
    className: 'whitespace-normal sm:min-w-40',
  },
  {
    clave: 'carrera',
    encabezado: 'Carrera',
    valor: (c) => c.carreraNombre,
    celda: (c) => c.carreraNombre,
    className: 'hidden min-w-36 whitespace-normal md:table-cell',
  },
  {
    clave: 'periodo',
    encabezado: 'Período',
    valor: nombrePeriodo,
    celda: nombrePeriodo,
    className: 'hidden tabular-nums md:table-cell',
  },
  {
    clave: 'secciones',
    encabezado: 'Secciones',
    valor: (c) => c.secciones,
    celda: (c) => c.secciones,
    className: NUMERO,
  },
]

// Gestión académica del Director: los cursos de todas las universidades del
// Directorio, en solo lectura. GET /api/cursos ya entrega la lista completa
// (sin paginar), así que la búsqueda, los filtros, el orden y las páginas se
// resuelven en el cliente. El período parte en el activo de su universidad.
export function CursosDirector({
  cursos,
  recargar,
}: {
  cursos: CursoListado[] | null | undefined
  recargar: () => void
}) {
  const { user } = useSession()
  const activo = user.periodoActivo
    ? `${user.periodoActivo.anio}-${user.periodoActivo.semestre}`
    : ''
  const [filtros, setFiltros] = useState<Filtros>({
    ...SIN_FILTROS,
    periodo: activo,
  })
  const cambiar = (cambios: Partial<Filtros>) =>
    setFiltros((actuales) => ({ ...actuales, ...cambios }))

  const todos = useMemo(() => cursos ?? [], [cursos])
  const universidades = unicos(todos.map((c) => c.universidadNombre ?? ''))
  // Las carreras se acotan a la universidad elegida.
  const carreras = unicos(
    todos
      .filter(
        (c) =>
          !filtros.universidad || c.universidadNombre === filtros.universidad,
      )
      .map((c) => c.carreraNombre),
  )
  const periodos = unicos([...todos.map(nombrePeriodo), activo]).reverse()

  const filtrados = useMemo(() => {
    const texto = normalizar(filtros.busqueda.trim())
    return todos.filter(
      (c) =>
        (!texto || normalizar(`${c.codigo} ${c.nombre}`).includes(texto)) &&
        (!filtros.universidad || c.universidadNombre === filtros.universidad) &&
        (!filtros.carrera || c.carreraNombre === filtros.carrera) &&
        (!filtros.periodo || nombrePeriodo(c) === filtros.periodo),
    )
  }, [todos, filtros])

  const activos = [
    filtros.busqueda.trim() && {
      clave: 'busqueda' as const,
      texto: `Búsqueda: ${filtros.busqueda.trim()}`,
    },
    filtros.universidad && {
      clave: 'universidad' as const,
      texto: `Universidad: ${filtros.universidad}`,
    },
    filtros.carrera && {
      clave: 'carrera' as const,
      texto: `Carrera: ${filtros.carrera}`,
    },
    filtros.periodo && {
      clave: 'periodo' as const,
      texto: `Período: ${filtros.periodo}`,
    },
  ].filter((f) => !!f)
  const limpiar = () => setFiltros(SIN_FILTROS)

  const subtitulo = [
    user.facultadNombre ?? user.universidadNombre,
    filtros.periodo ? `Período ${filtros.periodo}` : 'Todos los períodos',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="grid min-w-0 gap-4" aria-label="Gestión de cursos">
      <div className="grid gap-1">
        <h2 className="m-0 text-xl font-semibold">Gestión de cursos</h2>
        <p className="m-0 text-sm text-muted-foreground">{subtitulo}</p>
      </div>

      {cursos === null ? (
        <ErrorState
          mensaje="No se pudieron cargar los cursos."
          onReintentar={recargar}
        />
      ) : cursos?.length === 0 ? (
        <Card className="py-0">
          <EmptyState mensaje="Aún no hay cursos en el Directorio." />
        </Card>
      ) : (
        <>
          <div
            role="search"
            aria-label="Filtros de cursos"
            className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.5fr)_repeat(3,minmax(0,1fr))]"
          >
            <FormField etiqueta="Buscar" className="min-w-0">
              {(control) => (
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    {...control}
                    type="search"
                    placeholder="Nombre o código"
                    className="w-full pr-9 pl-8 [&::-webkit-search-cancel-button]:hidden"
                    value={filtros.busqueda}
                    onChange={(e) => cambiar({ busqueda: e.target.value })}
                  />
                  {filtros.busqueda && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Limpiar búsqueda"
                      className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
                      onClick={() => cambiar({ busqueda: '' })}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </div>
              )}
            </FormField>
            <Filtro
              etiqueta="Universidad"
              valor={filtros.universidad}
              opciones={universidades}
              todas="Todas"
              // Otra universidad puede no tener la carrera elegida.
              onCambiar={(universidad) => cambiar({ universidad, carrera: '' })}
            />
            <Filtro
              etiqueta="Carrera"
              valor={filtros.carrera}
              opciones={carreras}
              todas="Todas"
              onCambiar={(carrera) => cambiar({ carrera })}
            />
            <Filtro
              etiqueta="Período"
              valor={filtros.periodo}
              opciones={periodos}
              todas="Todos"
              onCambiar={(periodo) => cambiar({ periodo })}
            />
          </div>

          <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm">
            <p
              className="m-0 text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {cursos === undefined
                ? 'Cargando cursos…'
                : `${filtrados.length} de ${todos.length} ${todos.length === 1 ? 'curso' : 'cursos'}`}
            </p>
            {activos.length > 0 && (
              <ul
                aria-label="Filtros activos"
                className="m-0 flex list-none flex-wrap gap-1.5 p-0"
              >
                {activos.map((f) => (
                  <li key={f.clave}>
                    <button
                      type="button"
                      aria-label={`Quitar ${f.texto}`}
                      onClick={() => cambiar({ [f.clave]: '' })}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-secondary px-2.5 text-xs font-medium text-secondary-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {f.texto}
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {activos.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={limpiar}
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          <DataTable
            etiqueta="Cursos"
            columnas={COLUMNAS}
            filas={filtrados}
            claveFila={(c) => c.id}
            cargando={cursos === undefined}
            porPagina={POR_PAGINA}
            cabeceraFija
            vacio={
              <EmptyState
                titulo="Sin resultados"
                mensaje="No hay cursos con estos filtros."
                accion={
                  <Button type="button" variant="outline" onClick={limpiar}>
                    Limpiar filtros
                  </Button>
                }
              />
            }
          />
        </>
      )}
    </section>
  )
}

function Filtro({
  etiqueta,
  valor,
  opciones,
  todas,
  onCambiar,
}: {
  etiqueta: string
  valor: string
  opciones: string[]
  todas: string
  onCambiar: (valor: string) => void
}) {
  return (
    <FormField
      etiqueta={etiqueta}
      className="min-w-0 [&_[data-slot=native-select-wrapper]]:w-full"
    >
      {(control) => (
        <NativeSelect
          {...control}
          className="w-full"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
        >
          <option value="">{todas}</option>
          {opciones.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  )
}
