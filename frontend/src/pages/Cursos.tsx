import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  type Columna,
} from '@/components/shared'
import { NativeSelect } from '@/components/ui/native-select'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  CrearCurso,
  CursoCreado,
  Carrera,
  CursoListado,
  OpcionPeriodo,
} from '@cursus/shared'
import { useState, type FormEvent } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'
import { useAuth } from '../auth/auth'
import { usePuede, useSession } from '../session/session'
import { EditarCurso } from './EditarCurso'
import { CursoDetalle } from './CursoDetalle'
import { CursosArchivados } from './CursosArchivados'
import { useDatos } from './useDatos'

// Gestión de cursos del Figma: listado (nodo 97:102, GES-03), creación (nodo
// 97:202, GES-05) y detalle con sus secciones (GES-08).
export function Cursos() {
  const opciones = useOpciones()
  return (
    <Routes>
      <Route index element={<InicioCursos opciones={opciones} />} />
      <Route path="nuevo" element={<NuevoCurso opciones={opciones} />} />
      <Route path="archivados" element={<CursosArchivados />} />
      <Route path="archivados/:id" element={<CursosArchivados />} />
      <Route path=":id/editar" element={<EditarCurso />} />
      <Route path=":id" element={<CursoDetalle />} />
      <Route path="*" element={<Navigate to="/cursos" replace />} />
    </Routes>
  )
}

interface EstadoCursos {
  creado?: string
  archivado?: string
}

// Carreras y períodos para los filtros del listado (GES-04) y el formulario
// de creación (GES-05). Se cargan una vez en Cursos y los usan las dos rutas,
// sin pedirlos de nuevo al pasar del listado al formulario. Solo los pide quien
// gestiona los cursos de su facultad.
interface Opciones {
  carreras: Carrera[] | null | undefined
  periodos: OpcionPeriodo[] | null | undefined
  recargar: () => void
}

function useOpciones(): Opciones {
  const gestiona = usePuede('create', 'Curso')
  const [carreras, recargarCarreras] = useDatos<Carrera[]>(
    gestiona ? '/api/carreras' : null,
  )
  const [periodos, recargarPeriodos] = useDatos<OpcionPeriodo[]>(
    gestiona ? '/api/periodos' : null,
  )
  return {
    carreras,
    periodos,
    recargar: () => {
      recargarCarreras()
      recargarPeriodos()
    },
  }
}

// Query de GET /api/cursos: solo los filtros elegidos ('' = todos).
function rutaCursos(carreraId: string, periodoId: string) {
  const query = new URLSearchParams()
  if (carreraId) query.set('carreraId', carreraId)
  if (periodoId) query.set('periodoId', periodoId)
  const texto = query.toString()
  return texto ? `/api/cursos?${texto}` : '/api/cursos'
}

function Encabezado({ titulo }: { titulo: string }) {
  const { user } = useSession()
  const periodo = user.periodoActivo
  const subtitulo = [
    user.facultadNombre ?? user.universidadNombre,
    periodo && `Período ${periodo.anio}-${periodo.semestre}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="grid gap-1">
      <h2 className="m-0 text-xl font-semibold">{titulo}</h2>
      <p className="m-0 text-sm text-muted-foreground">{subtitulo}</p>
    </div>
  )
}

function BotonCrear() {
  return (
    <Link className={cn(buttonVariants(), 'no-underline')} to="/cursos/nuevo">
      Crear curso
    </Link>
  )
}

function InicioCursos({ opciones }: { opciones: Opciones }) {
  const puedeCrear = usePuede('create', 'Curso')
  const estado = useLocation().state as EstadoCursos | null
  const { carreras, periodos } = opciones
  const [carreraId, setCarreraId] = useState('')
  // Hasta que el usuario elige uno, el período es el activo (o todos si no
  // hay activo).
  const [periodoElegido, setPeriodoElegido] = useState<string>()
  const periodoId =
    periodoElegido ?? periodos?.find((periodo) => periodo.activo)?.id ?? ''

  // Quien filtra espera las opciones para pedir el listado ya con el período
  // activo; quien no filtra (el Director) lo pide sin filtros.
  const ruta = !puedeCrear
    ? '/api/cursos'
    : carreras && periodos
      ? rutaCursos(carreraId, periodoId)
      : null
  const [cursos, recargar] = useDatos<CursoListado[]>(ruta)
  // La API solo manda la universidad al Director, que ve todas.
  const conUniversidad = !!cursos?.some((curso) => curso.universidadNombre)
  const conFiltros = carreraId !== '' || periodoId !== ''

  let contenido
  if (puedeCrear && (carreras === null || periodos === null)) {
    contenido = (
      <ErrorState
        mensaje="No se pudieron cargar las carreras y los períodos."
        onReintentar={opciones.recargar}
      />
    )
  } else if (cursos === undefined) {
    contenido = (
      <div role="status">
        <span className="sr-only">Cargando cursos…</span>
        <Skeleton className="h-36 rounded-xl" />
      </div>
    )
  } else if (cursos === null) {
    contenido = (
      <ErrorState
        mensaje="No se pudieron cargar los cursos."
        onReintentar={recargar}
      />
    )
  } else if (cursos.length === 0) {
    contenido = (
      <Card className="py-0">
        <EmptyState
          mensaje={
            conFiltros
              ? 'No hay cursos con estos filtros.'
              : 'Aún no hay cursos en tu facultad.'
          }
          accion={!conFiltros && puedeCrear ? <BotonCrear /> : undefined}
        />
      </Card>
    )
  } else {
    const columnas: Columna<CursoListado>[] = [
      ...(conUniversidad
        ? [
            {
              clave: 'universidad',
              encabezado: 'Universidad',
              celda: (curso: CursoListado) => curso.universidadNombre,
            },
          ]
        : []),
      {
        clave: 'codigo',
        encabezado: 'Código',
        valor: (curso) => curso.codigo,
        celda: (curso) => (
          <Link
            className="font-semibold text-primary underline-offset-4 hover:underline"
            to={`/cursos/${curso.id}`}
          >
            {curso.codigo}
          </Link>
        ),
      },
      {
        clave: 'curso',
        encabezado: 'Curso',
        valor: (curso) => curso.nombre,
        celda: (curso) => (
          <div className="grid gap-0.5">
            <span>{curso.nombre}</span>
            <span className="text-xs text-muted-foreground sm:hidden">
              {curso.carreraNombre} · {curso.periodo.anio}-
              {curso.periodo.semestre}
            </span>
          </div>
        ),
        className: 'whitespace-normal sm:min-w-40',
      },
      {
        clave: 'carrera',
        encabezado: 'Carrera',
        valor: (curso) => curso.carreraNombre,
        celda: (curso) => curso.carreraNombre,
        className: 'hidden min-w-36 whitespace-normal sm:table-cell',
      },
      {
        clave: 'periodo',
        encabezado: 'Período',
        className: 'hidden sm:table-cell',
        celda: (curso) => `${curso.periodo.anio}-${curso.periodo.semestre}`,
      },
      {
        clave: 'secciones',
        encabezado: 'Secciones',
        valor: (curso) => curso.secciones,
        celda: (curso) => curso.secciones,
      },
    ]
    contenido = (
      <DataTable
        etiqueta="Cursos"
        columnas={columnas}
        filas={cursos}
        claveFila={(curso) => curso.id}
      />
    )
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="Gestión de cursos">
      <Encabezado titulo="Gestión de cursos" />
      {puedeCrear && (
        <div className="flex flex-wrap gap-2">
          <Link
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'border-border text-foreground no-underline',
            )}
            to="/cursos/archivados"
          >
            Archivados
          </Link>
          {(!!cursos?.length || conFiltros) && <BotonCrear />}
        </div>
      )}
      {estado?.creado && (
        <p
          className="m-0 rounded-lg border border-alert-success-border bg-alert-success p-3 text-sm text-alert-success-foreground"
          role="status"
        >
          Curso {estado.creado} creado.
        </p>
      )}
      {estado?.archivado && (
        <p
          className="m-0 rounded-lg border border-alert-success-border bg-alert-success p-3 text-sm text-alert-success-foreground"
          role="status"
        >
          Curso {estado.archivado} archivado.
        </p>
      )}
      {puedeCrear && carreras && periodos && (
        <div
          className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
          role="search"
          aria-label="Filtros"
        >
          <FormField
            className="min-w-0 [&_[data-slot=native-select-wrapper]]:w-full"
            etiqueta="Carrera"
          >
            {(control) => (
              <NativeSelect
                {...control}
                className="w-full"
                value={carreraId}
                onChange={(event) => setCarreraId(event.target.value)}
              >
                <option value="">Todas</option>
                {carreras.map((carrera) => (
                  <option key={carrera.id} value={carrera.id}>
                    {carrera.nombre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            className="min-w-0 [&_[data-slot=native-select-wrapper]]:w-full"
            etiqueta="Período"
          >
            {(control) => (
              <NativeSelect
                {...control}
                className="w-full"
                value={periodoId}
                onChange={(event) => setPeriodoElegido(event.target.value)}
              >
                <option value="">Todos</option>
                {periodos.map((periodo) => (
                  <option key={periodo.id} value={periodo.id}>
                    {periodo.anio}-{periodo.semestre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
      )}
      {contenido}
    </section>
  )
}

function NuevoCurso({ opciones }: { opciones: Opciones }) {
  const puedeCrear = usePuede('create', 'Curso')
  const { fetchConSesion } = useAuth()
  const navigate = useNavigate()
  const { carreras, periodos } = opciones
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!puedeCrear) {
    return <Navigate to="/cursos" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enviando) return
    const datos = new FormData(event.currentTarget)
    const curso: CrearCurso = {
      codigo: String(datos.get('codigo')),
      nombre: String(datos.get('nombre')),
      carreraId: String(datos.get('carreraId')),
      periodoId: String(datos.get('periodoId')),
    }
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetchConSesion('/api/cursos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(curso),
      })
      const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<
        CursoCreado & { message: string }
      >
      if (respuesta.ok) {
        navigate('/cursos', {
          state: { creado: cuerpo.codigo } satisfies EstadoCursos,
        })
        return
      }
      // El 409 (código repetido) y el 404 traen un mensaje para el usuario.
      setError(
        typeof cuerpo.message === 'string'
          ? cuerpo.message
          : 'No se pudo crear el curso.',
      )
    } catch {
      setError('No se pudo crear el curso.')
    }
    setEnviando(false)
  }

  let contenido
  if (carreras === undefined || periodos === undefined) {
    contenido = (
      <div role="status">
        <span className="sr-only">Cargando carreras y períodos…</span>
        <Skeleton className="h-36 rounded-xl" />
      </div>
    )
  } else if (carreras === null || periodos === null) {
    contenido = (
      <ErrorState
        mensaje="No se pudieron cargar las carreras y los períodos."
        onReintentar={opciones.recargar}
      />
    )
  } else {
    // La API devuelve el período activo primero.
    const activo = periodos.find((periodo) => periodo.activo)
    contenido = (
      <form
        className="grid max-w-3xl gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta="Código" requerido>
            {(control) => (
              <Input
                {...control}
                className="w-full"
                name="codigo"
                maxLength={20}
                placeholder="ICC4103"
              />
            )}
          </FormField>
          <FormField etiqueta="Nombre del curso" requerido>
            {(control) => (
              <Input
                {...control}
                className="w-full"
                name="nombre"
                maxLength={200}
                placeholder="Tecnologías Web"
              />
            )}
          </FormField>
          <FormField
            className="min-w-0 [&_[data-slot=native-select-wrapper]]:w-full"
            etiqueta="Carrera"
            requerido
          >
            {(control) => (
              <NativeSelect
                {...control}
                className="w-full"
                name="carreraId"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecciona una carrera
                </option>
                {carreras.map((carrera) => (
                  <option key={carrera.id} value={carrera.id}>
                    {carrera.nombre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            className="min-w-0 [&_[data-slot=native-select-wrapper]]:w-full"
            etiqueta="Período académico"
            requerido
          >
            {(control) => (
              <NativeSelect
                {...control}
                className="w-full"
                name="periodoId"
                defaultValue={activo?.id ?? ''}
              >
                <option value="" disabled>
                  Selecciona un período
                </option>
                {periodos.map((periodo) => (
                  <option key={periodo.id} value={periodo.id}>
                    {periodo.anio}-{periodo.semestre}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
        {error && (
          <p className="m-0 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button className="w-fit" type="submit" disabled={enviando}>
            Crear curso
          </Button>
          <Link
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'border-border text-foreground no-underline',
            )}
            to="/cursos"
          >
            Cancelar
          </Link>
        </div>
      </form>
    )
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="Crear curso">
      <div className="grid gap-1">
        <h2 className="m-0 text-xl font-semibold">Información del curso</h2>
      </div>
      {contenido}
    </section>
  )
}
