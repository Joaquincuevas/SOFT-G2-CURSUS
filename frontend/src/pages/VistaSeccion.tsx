import type { AlumnosEspacio, SeccionResumen } from '@cursus/shared'
import {
  CalendarCheck,
  FolderOpen,
  House,
  Inbox,
  ClipboardList,
  Lock,
  Megaphone,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useState, type ComponentType } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useEtiquetaDeMiga } from '../layout/migas-contexto'
import { ROL_LABEL } from '../session/roles'
import './Dashboard.css'
import './VistaSeccion.css'
import { nombresProfesores, textoBloque } from './misSecciones'
import { PestanaAsistencia } from './PestanaAsistencia'
import { PestanaNotas } from './PestanaNotas'
import { PestanaAnuncios } from './PestanaAnuncios'
import { PestanaEntregas } from './PestanaEntregas'
import { SilaboDelCurso } from './SilaboDelCurso'
import { PestanaMaterial } from './PestanaMaterial'
import { useDatos } from './useDatos'

// Secciones del espacio de la sección. Home es el resumen; las demás llevan al
// contenido que ya existía como pestaña (ESP-04 a MAT-08), que se monta tal cual.
type VistaId =
  | 'home'
  | 'anuncios'
  | 'material'
  | 'entregas'
  | 'notas'
  | 'asistencia'
  | 'integrantes'

interface Vista {
  id: VistaId
  etiqueta: string
  icono: LucideIcon
  // Qué hay ahí, para los accesos del Home.
  detalle?: string
}

const VISTAS: readonly Vista[] = [
  { id: 'home', etiqueta: 'Home', icono: House },
  {
    id: 'anuncios',
    etiqueta: 'Anuncios',
    icono: Megaphone,
    detalle: 'Avisos de la sección',
  },
  {
    id: 'material',
    etiqueta: 'Material',
    icono: FolderOpen,
    detalle: 'Archivos y documentos',
  },
  {
    id: 'entregas',
    etiqueta: 'Entregas',
    icono: Inbox,
    detalle: 'Trabajos e informes',
  },
  {
    id: 'notas',
    etiqueta: 'Notas',
    icono: ClipboardList,
    detalle: 'Evaluaciones y calificaciones',
  },
  {
    id: 'asistencia',
    etiqueta: 'Asistencia',
    icono: CalendarCheck,
    detalle: 'Clases y asistencia',
  },
  { id: 'integrantes', etiqueta: 'Integrantes', icono: Users },
]

const esVista = (valor: string | null): valor is VistaId =>
  VISTAS.some((vista) => vista.id === valor)

export interface PropsPestana {
  seccionId: string
  numeroSeccion?: number
  rol: SeccionResumen['rol']
  cursoCerrado?: boolean
  alPublicarSilabo?: () => void
}

// Contenido de cada sección ya implementada. Home e Integrantes se arman aquí
// con los datos del resumen de la sección.
const CONTENIDO: Partial<Record<VistaId, ComponentType<PropsPestana>>> = {
  asistencia: PestanaAsistencia,
  notas: PestanaNotas,
  anuncios: PestanaAnuncios,
  entregas: PestanaEntregas,
  material: PestanaMaterial,
}

// ESP-04 (RE-04): vista de una sección, la misma para profesor, ayudante y
// alumno. Layout de curso: navegación de la sección a la izquierda (en pantallas
// angostas, una fila de pestañas arriba) y el contenido a la derecha. La
// sección elegida va en ?vista=, así que se puede compartir o recargar; sin
// ella se muestra el Home.
export function VistaSeccion() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, fijarParams] = useSearchParams()
  const [publicaciones, setPublicaciones] = useState(0)
  const [seccion, recargar, status] = useDatos<SeccionResumen>(
    `/api/espacio/secciones/${id}/resumen`,
  )
  const enEscritorio = useMediaQuery('(min-width: 1024px)')
  const vistaPedida = params.get('vista')
  // En pantallas angostas las pestañas se desplazan: la elegida queda a la
  // vista aunque se haya abierto con un enlace directo (?vista=).
  useEffect(() => {
    document
      .querySelector('[data-slot=tabs-trigger][data-state=active]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [vistaPedida, seccion])
  // El encabezado nombra la sección en su breadcrumb.
  useEtiquetaDeMiga(
    seccion ? `${seccion.curso.codigo} · Sección ${seccion.numero}` : null,
  )

  if (seccion === undefined) {
    return <Cargando />
  }
  if (seccion === null) {
    // 403: no es integrante; 404 (o 400, id inválido): no existe o está
    // archivada. Reintentar no cambia nada, así que se vuelve al dashboard.
    if (status === 403 || status === 404 || status === 400) {
      return (
        <ErrorEstado
          titulo={status === 403 ? 'Sin acceso' : 'Sección no encontrada'}
          mensaje={
            status === 403
              ? 'No eres integrante de esta sección.'
              : 'La sección no existe o ya no está disponible.'
          }
          textoBoton="Volver al Dashboard"
          onReintentar={() => void navigate('/')}
        />
      )
    }
    return (
      <ErrorEstado
        mensaje="No pudimos cargar la sección."
        onReintentar={recargar}
      />
    )
  }
  const { curso, numero, rol, periodo } = seccion
  const veSilabo = ['ALUMNO', 'AYUDANTE', 'PROFESOR'].includes(rol)
  const vista: VistaId = esVista(vistaPedida) ? vistaPedida : 'home'
  const elegir = (nueva: string) =>
    fijarParams((actual) => {
      const siguiente = new URLSearchParams(actual)
      if (nueva === 'home') siguiente.delete('vista')
      else siguiente.set('vista', nueva)
      return siguiente
    })

  return (
    <section
      aria-label="Vista del curso"
      className="mx-auto grid w-full max-w-6xl gap-6"
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{curso.codigo}</Badge>
          <Badge variant="outline">Sección {numero}</Badge>
          <Badge variant="outline">
            Período {periodo.anio}-{periodo.semestre}
          </Badge>
        </div>
        <h2 className="m-0 text-2xl leading-8 font-bold tracking-tight text-foreground">
          {curso.nombre}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          Entras como {ROL_LABEL[rol]}
        </p>
        {seccion.cursoCerrado && (
          <Alert variant="info">
            <Lock />
            <AlertTitle>Curso cerrado</AlertTitle>
            <AlertDescription>
              Las notas, evaluaciones y asistencia son de solo lectura.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Tabs
        value={vista}
        onValueChange={elegir}
        orientation={enEscritorio ? 'vertical' : 'horizontal'}
        className="grid gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:items-start"
      >
        <TabsList
          aria-label="Pestañas de la sección"
          className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 lg:sticky lg:top-24 lg:flex-col lg:items-stretch lg:overflow-visible"
        >
          {VISTAS.map(({ id: valor, etiqueta, icono: Icono }) => (
            <TabsTrigger
              key={valor}
              value={valor}
              // También al hacer clic (no solo al presionar): los lectores de
              // pantalla y los atajos activan el control con un clic.
              onClick={() => elegir(valor)}
              className={cn(
                'h-10 flex-none justify-start gap-2.5 px-3 text-muted-foreground lg:w-full',
                'data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-accent-foreground',
                'group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none',
                // Una pastilla de color en pantallas angostas; en el riel,
                // además, la barra del color de la universidad a la izquierda.
                'group-data-[orientation=horizontal]/tabs:after:hidden group-data-[orientation=vertical]/tabs:after:inset-y-2 group-data-[orientation=vertical]/tabs:after:right-auto group-data-[orientation=vertical]/tabs:after:left-0 group-data-[orientation=vertical]/tabs:after:w-[3px] group-data-[orientation=vertical]/tabs:after:rounded-full after:bg-primary data-[state=active]:after:opacity-100',
              )}
            >
              <Icono aria-hidden="true" />
              {etiqueta}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0">
          <TabsContent value="home">
            <HomeDeLaSeccion
              seccion={seccion}
              seccionId={id}
              claveSilabo={`silabo:${id}:${publicaciones}`}
            />
          </TabsContent>
          {VISTAS.map(({ id: valor }) => {
            const Contenido = CONTENIDO[valor]
            if (!Contenido) return null
            return (
              <TabsContent key={valor} value={valor} className="grid gap-6">
                {/* El sílabo vigente va también junto al material, donde se
                    publica y se descarga. */}
                {valor === 'material' && veSilabo && (
                  <SilaboDelCurso
                    key={`silabo:${id}:${publicaciones}`}
                    seccionId={id}
                  />
                )}
                <Contenido
                  key={id}
                  seccionId={id}
                  numeroSeccion={numero}
                  rol={rol}
                  cursoCerrado={seccion.cursoCerrado}
                  alPublicarSilabo={() => setPublicaciones((n) => n + 1)}
                />
              </TabsContent>
            )
          })}
          <TabsContent value="integrantes" className="grid gap-6">
            <EquipoDocente seccion={seccion} />
            {/* key: al cambiar de sección la lista vuelve a cargar, sin
                mostrar la de la sección anterior. */}
            {rol === 'PROFESOR' && (
              <AlumnosDeLaSeccion key={id} seccionId={id} />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}

// Resumen de la sección con lo que ya entrega el resumen: sílabo, horario y
// sala, equipo docente y accesos a lo demás.
function HomeDeLaSeccion({
  seccion,
  seccionId,
  claveSilabo,
}: {
  seccion: SeccionResumen
  seccionId: string
  claveSilabo: string
}) {
  const { horario, rol } = seccion
  return (
    <div className="grid gap-6">
      {['ALUMNO', 'AYUDANTE', 'PROFESOR'].includes(rol) && (
        <SilaboDelCurso key={claveSilabo} seccionId={seccionId} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3 py-5">
          <CardHeader className="px-5">
            <h3 className="m-0 text-sm font-semibold text-foreground">
              Horario y sala
            </h3>
          </CardHeader>
          <CardContent className="px-5">
            {horario.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">
                Sin horario asignado
              </p>
            ) : (
              <ul
                aria-label="Horario"
                className="m-0 grid list-none gap-1.5 p-0 text-sm text-muted-foreground"
              >
                {horario.map((bloque) => (
                  <li key={`${bloque.dia}-${bloque.inicio}`}>
                    {textoBloque(bloque)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="gap-3 py-5">
          <CardHeader className="px-5">
            <h3 className="m-0 text-sm font-semibold text-foreground">
              Equipo docente
            </h3>
          </CardHeader>
          <CardContent className="px-5">
            <EquipoDocente seccion={seccion} sinTitulo />
          </CardContent>
        </Card>
      </div>

      <section aria-label="Accesos" className="grid gap-3">
        <h3 className="m-0 text-sm font-semibold text-foreground">Accesos</h3>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {VISTAS.filter((vista) => vista.detalle).map(
            ({ id, etiqueta, icono: Icono, detalle }) => (
              <li key={id}>
                <Button
                  asChild
                  variant="outline"
                  className="h-auto w-full justify-start gap-3 px-4 py-3 text-left whitespace-normal"
                >
                  <Link to={{ search: `?vista=${id}` }}>
                    <Icono aria-hidden="true" className="text-primary" />
                    <span className="grid">
                      <span className="text-sm font-medium text-foreground">
                        {etiqueta}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {detalle}
                      </span>
                    </span>
                  </Link>
                </Button>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  )
}

// Profesores y ayudantes de la sección. En Integrantes lleva su propio título.
function EquipoDocente({
  seccion,
  sinTitulo = false,
}: {
  seccion: SeccionResumen
  sinTitulo?: boolean
}) {
  const { ayudantes } = seccion
  const profesores = nombresProfesores(seccion)
  return (
    <div className="grid gap-2">
      {!sinTitulo && (
        <h3 className="vista-seccion__subtitulo">Equipo docente</h3>
      )}
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {/* GES-25: todos los profesores vigentes. */}
        <dt className="col-start-1 text-foreground">
          {profesores.length > 1 ? 'Profesores' : 'Profesor'}
        </dt>
        <dd className="col-start-2 m-0">
          {profesores.length > 0
            ? profesores.join(', ')
            : 'Sin profesor asignado'}
        </dd>
        <dt className="col-start-1 text-foreground">Ayudantes</dt>
        {ayudantes.length === 0 ? (
          <dd className="col-start-2 m-0">Sin ayudantes asignados</dd>
        ) : (
          ayudantes.map((ayudante) => (
            <dd key={ayudante.id} className="col-start-2 m-0">
              {ayudante.nombre}
            </dd>
          ))
        )}
      </dl>
    </div>
  )
}

// ESP-05 (RN-06): alumnos inscritos, solo para el profesor de la sección y en
// solo lectura. Agregar o quitar alumnos es del Administrativo (GES-15 y
// GES-19). El backend los entrega ordenados por nombre.
function AlumnosDeLaSeccion({ seccionId }: { seccionId: string }) {
  const [datos, recargar] = useDatos<AlumnosEspacio>(
    `/api/espacio/secciones/${seccionId}/alumnos`,
  )
  const tituloId = useId()

  return (
    <section className="vista-seccion__alumnos" aria-labelledby={tituloId}>
      <h3 id={tituloId} className="vista-seccion__subtitulo">
        {datos ? `Alumnos (${datos.total})` : 'Alumnos'}
      </h3>
      {datos === undefined ? (
        <Cargando texto="Cargando alumnos…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar los alumnos."
          onReintentar={recargar}
        />
      ) : datos.alumnos.length === 0 ? (
        <p className="dashboard__texto">Aún no hay alumnos inscritos</p>
      ) : (
        <ul className="vista-seccion__lista" aria-label="Alumnos inscritos">
          {datos.alumnos.map((alumno) => (
            <li key={alumno.id}>
              <span className="vista-seccion__nombre">{alumno.nombre}</span>
              <span>{alumno.correo}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
