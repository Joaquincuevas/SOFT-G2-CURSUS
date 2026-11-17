import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { usePuede } from '../session/session'
import {
  CATEGORIA_MATERIAL_LABEL,
  CATEGORIAS_MATERIAL,
  LARGO_DESCRIPCION_MATERIAL,
  LARGO_TITULO_MATERIAL,
  TAMANO_MAXIMO_ARCHIVO,
  TIPOS_ARCHIVO,
  ZONA_HORARIA_UNIVERSIDAD,
  tipoDeArchivo,
  type ArchivoResumen,
  type CategoriaMaterial,
  type CrearMaterial,
  type DescargaArchivo,
  type Material,
  type SubidaArchivo,
  type VersionMaterial,
} from '@cursus/shared'
import {
  CircleAlert,
  Download,
  EllipsisVertical,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Presentation,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dropzone,
  EmptyState,
  ErrorState,
  FormField,
} from '@/components/shared'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatearFecha } from '@/lib/fechas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'
import { AdministrarSilabo } from './AdministrarSilabo'
import { subirAS3, tamanoLegible } from './subirArchivo'
import { useDatos } from './useDatos'
import type { PropsPestana } from './VistaSeccion'

const EXTENSIONES = Object.keys(TIPOS_ARCHIVO)
const ACEPTADAS = EXTENSIONES.map((extension) => `.${extension}`).join(',')
const fechaMaterial = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeZone: ZONA_HORARIA_UNIVERSIDAD,
})

const fechaSubida = (material: Material) =>
  material.archivo.subidoEn ?? material.creadoEn

function etiquetaTipo({ archivo }: Material) {
  return tipoDeArchivo(archivo.nombre)
    ? archivo.nombre.slice(archivo.nombre.lastIndexOf('.') + 1).toUpperCase()
    : archivo.tipo
}

// Pasos del flujo de subida (MAT-01 y MAT-04), para mostrarlos mientras
// corren.
type Etapa = 'pidiendo' | 'subiendo' | 'confirmando' | 'registrando'

// Fecha y hora en la zona de la universidad (por ejemplo, 14-11-2026, 23:59).
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    timeZone: ZONA_HORARIA_UNIVERSIDAD,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

// Falla un paso del flujo. El mensaje es para mostrar al profesor.
class ErrorDeFlujo extends Error {}

const VACIO = {
  categoria: '' as CategoriaMaterial | '',
  titulo: '',
  descripcion: '',
}

// Mensaje de un 400 del backend: texto, o la lista de validaciones.
async function motivoDe(res: Response): Promise<string | null> {
  const cuerpo = (await res.json().catch(() => null)) as {
    message?: unknown
  } | null
  const mensaje = cuerpo?.message
  if (typeof mensaje === 'string') return mensaje
  return Array.isArray(mensaje) ? mensaje.join('. ') : null
}

// Pide la subida, sube a S3 y confirma (MAT-01). Devuelve el id del archivo
// confirmado. Lo usan el material nuevo (MAT-04) y la versión nueva (MAT-07).
async function subirConfirmado(
  fetchConSesion: ReturnType<typeof useAuth>['fetchConSesion'],
  ruta: string,
  elegido: File,
  setEtapa: (etapa: Etapa) => void,
  setProgreso: (progreso: number) => void,
): Promise<string> {
  setEtapa('pidiendo')
  setProgreso(0)
  const pedida = await fetchConSesion(`${ruta}/archivos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: elegido.name, tamano: elegido.size }),
  })
  if (!pedida.ok) {
    throw new ErrorDeFlujo(
      pedida.status === 503
        ? 'El almacenamiento de archivos no está disponible por ahora. Inténtalo más tarde.'
        : pedida.status === 403
          ? 'Ya no eres profesor de esta sección.'
          : ((pedida.status === 400 ? await motivoDe(pedida) : null) ??
            'No pudimos preparar la subida del archivo. Inténtalo nuevamente.'),
    )
  }
  const { archivo: registrado, subida } = (await pedida.json()) as SubidaArchivo

  setEtapa('subiendo')
  try {
    await subirAS3(subida, elegido, setProgreso)
  } catch {
    throw new ErrorDeFlujo(
      'No pudimos subir el archivo. Comprueba tu conexión e inténtalo nuevamente.',
    )
  }

  setEtapa('confirmando')
  const confirmada = await fetchConSesion(
    `${ruta}/archivos/${registrado.id}/confirmar`,
    { method: 'POST' },
  )
  if (!confirmada.ok) {
    throw new ErrorDeFlujo(
      'No pudimos confirmar el archivo subido. Inténtalo nuevamente.',
    )
  }
  return ((await confirmada.json()) as ArchivoResumen).id
}

// MAT-04 y MAT-06: materiales del curso de la sección. Solo el profesor sube
// materiales; el profesor, el ayudante y el alumno los ven y los descargan. El
// material es del curso: aquí se ven también los que subió el profesor de otra
// sección.
export function PestanaMaterial({
  seccionId,
  rol,
  alPublicarSilabo,
}: PropsPestana) {
  const { fetchConSesion } = useAuth()
  const puedePublicar = usePuede('create', 'Material')
  const puedeVersionar = usePuede('create', 'MaterialVersion')
  const ruta = `/api/espacio/secciones/${seccionId}`
  const [materiales, recargar] = useDatos<Material[]>(`${ruta}/materiales`)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const ordenados = materiales?.toSorted(
    (a, b) => Date.parse(fechaSubida(b)) - Date.parse(fechaSubida(a)),
  )

  // MAT-06: la API revisa que sea integrante y firma una URL de S3 que vence a
  // los 5 minutos. Se abre de inmediato y no se guarda: S3 entrega el archivo
  // con su nombre original.
  async function descargar(material: Material) {
    setDescargando(material.id)
    setErrorDescarga(null)
    try {
      const res = await fetchConSesion(
        `${ruta}/materiales/${material.id}/descarga`,
      )
      if (!res.ok) throw new Error()
      const { url } = (await res.json()) as DescargaArchivo
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.click()
    } catch {
      setErrorDescarga(
        `No pudimos descargar «${material.titulo}». Inténtalo nuevamente.`,
      )
    } finally {
      // Siempre se desbloquea, también si la descarga falló.
      setDescargando(null)
    }
  }

  if (rol === 'ALUMNO') {
    return (
      <div className="grid min-w-0 gap-6">
        <MaterialAlumno
          materiales={materiales === null ? null : ordenados}
          recargar={recargar}
          descargando={descargando}
          errorDescarga={errorDescarga}
          descargar={(material) => void descargar(material)}
        />
        <AdministrarSilabo ruta={ruta} puedePublicar={false} vistaAlumno />
      </div>
    )
  }

  const botonSubir = puedePublicar && (
    <Button type="button" onClick={() => setSubiendo(true)}>
      <Upload aria-hidden="true" />
      Subir material
    </Button>
  )

  return (
    <div className="grid min-w-0 gap-8">
      {/* El sílabo vigente va primero: es lo que más se busca del curso. */}
      <AdministrarSilabo
        ruta={ruta}
        puedePublicar={puedePublicar}
        alPublicar={alPublicarSilabo}
      />
      <section className="grid min-w-0 gap-4" aria-label="Materiales del curso">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="m-0 text-lg font-semibold text-foreground">
            Materiales del curso
          </h3>
          {/* Sin materiales, la acción va en el estado vacío. */}
          {materiales?.length !== 0 && botonSubir}
        </div>
        {rol === 'AYUDANTE' && (
          <Alert role="note" variant="info">
            <AlertTitle>Material en solo lectura</AlertTitle>
            <AlertDescription>
              Puedes descargar los archivos publicados. Solo el profesor puede
              subir materiales o nuevas versiones.
            </AlertDescription>
          </Alert>
        )}
        {puedePublicar && (
          <Dialog open={subiendo} onOpenChange={setSubiendo}>
            <DialogContent className="bg-card text-left sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Subir material</DialogTitle>
                <DialogDescription>
                  Lo verán el equipo docente y los alumnos de todas las
                  secciones del curso.
                </DialogDescription>
              </DialogHeader>
              <FormularioMaterial
                ruta={ruta}
                alSubir={() => {
                  setSubiendo(false)
                  toast.success('Material subido')
                  recargar()
                }}
                alCancelar={() => setSubiendo(false)}
              />
            </DialogContent>
          </Dialog>
        )}
        {errorDescarga && (
          <Alert variant="danger">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{errorDescarga}</AlertDescription>
          </Alert>
        )}
        {materiales === undefined ? (
          <div role="status" className="grid gap-2">
            <span className="sr-only">Cargando materiales…</span>
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : materiales === null ? (
          <ErrorState
            mensaje="No pudimos cargar los materiales."
            onReintentar={recargar}
          />
        ) : materiales.length === 0 ? (
          <Card className="py-0">
            <EmptyState
              icono={FolderOpen}
              titulo="Aún no hay materiales del curso"
              mensaje={
                puedePublicar
                  ? 'Sube guías, presentaciones o lecturas para tus alumnos.'
                  : 'Aquí aparecerán los archivos que publique el profesor.'
              }
              accion={botonSubir}
            />
          </Card>
        ) : (
          <div className="grid min-w-0 gap-6">
            {CATEGORIAS_MATERIAL.map((categoria) => {
              const grupo =
                ordenados?.filter(
                  (material) => material.categoria === categoria,
                ) ?? []
              if (grupo.length === 0) return null
              const etiqueta = CATEGORIA_MATERIAL_LABEL[categoria]
              return (
                <section key={categoria} className="grid min-w-0 gap-2">
                  <h4 className="m-0 text-sm font-semibold text-foreground">
                    {etiqueta}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({grupo.length})
                    </span>
                  </h4>
                  <Card className="min-w-0 gap-0 py-0">
                    <Table aria-label={etiqueta} className="table-fixed">
                      <TableHeader className="bg-muted/60">
                        <TableRow>
                          <TableHead className="w-auto">Título</TableHead>
                          <TableHead className="hidden w-36 md:table-cell">
                            Categoría
                          </TableHead>
                          <TableHead className="hidden w-24 sm:table-cell">
                            Tamaño
                          </TableHead>
                          <TableHead className="hidden w-28 sm:table-cell">
                            Fecha
                          </TableHead>
                          <TableHead className="w-44 text-right">
                            <span className="sr-only">Acciones</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.map((material) => (
                          <FilaMaterial
                            key={material.id}
                            ruta={ruta}
                            material={material}
                            puedeVersionar={puedeVersionar}
                            descargando={descargando === material.id}
                            descargar={() => void descargar(material)}
                            alSubirVersion={recargar}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </section>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// Ícono según el tipo de archivo.
function IconoArchivo({ nombre }: { nombre: string }) {
  const extension = nombre.slice(nombre.lastIndexOf('.') + 1).toLowerCase()
  const Icono =
    extension === 'png' || extension === 'jpg' || extension === 'jpeg'
      ? FileImage
      : extension === 'xlsx'
        ? FileSpreadsheet
        : extension === 'zip'
          ? FileArchive
          : extension === 'ipynb'
            ? FileCode
            : extension === 'pptx'
              ? Presentation
              : FileText
  return <Icono aria-hidden="true" className="size-5 shrink-0 text-primary" />
}

function FilaMaterial({
  ruta,
  material,
  puedeVersionar,
  descargando,
  descargar,
  alSubirVersion,
}: {
  ruta: string
  material: Material
  puedeVersionar: boolean
  descargando: boolean
  descargar: () => void
  alSubirVersion: () => void
}) {
  const [dialogo, setDialogo] = useState<'version' | 'historial' | null>(null)
  return (
    <TableRow aria-label={material.titulo}>
      <TableCell className="whitespace-normal">
        <div className="flex min-w-0 items-start gap-3">
          <IconoArchivo nombre={material.archivo.nombre} />
          <div className="grid min-w-0 gap-0.5">
            <span className="font-medium break-words text-foreground">
              {material.titulo}
            </span>
            {material.descripcion && (
              <span className="line-clamp-2 text-xs break-words whitespace-pre-wrap text-muted-foreground">
                {material.descripcion}
              </span>
            )}
            <span className="text-xs break-words text-muted-foreground">
              {material.archivo.nombre} · {etiquetaTipo(material)}
              <br />
              {/* MAT-07: la fecha de la vigente y la del material. */}
              Versión {material.version}, del {fechaHora(material.versionEn)} ·
              Publicado el {fechaHora(material.creadoEn)}
              <span className="sm:hidden">
                {' · '}
                {tamanoLegible(material.archivo.tamano)}
              </span>
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Badge variant="outline">
          {CATEGORIA_MATERIAL_LABEL[material.categoria]}
        </Badge>
      </TableCell>
      <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
        {tamanoLegible(material.archivo.tamano)}
      </TableCell>
      <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
        <time dateTime={fechaSubida(material)}>
          {formatearFecha(fechaSubida(material))}
        </time>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Descargar ${material.titulo}`}
            disabled={descargando}
            onClick={descargar}
          >
            <Download aria-hidden="true" />
            {descargando ? 'Descargando…' : 'Descargar'}
          </Button>
          {puedeVersionar && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Más acciones de ${material.titulo}`}
                  >
                    <EllipsisVertical aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialogo('version')}>
                    <Upload aria-hidden="true" />
                    Subir nueva versión
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialogo('historial')}>
                    <History aria-hidden="true" />
                    Historial de versiones
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <VersionesMaterial
                ruta={ruta}
                material={material}
                dialogo={dialogo}
                cerrar={() => setDialogo(null)}
                alSubir={alSubirVersion}
              />
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function MaterialAlumno({
  materiales,
  recargar,
  descargando,
  errorDescarga,
  descargar,
}: {
  materiales: Material[] | null | undefined
  recargar: () => void
  descargando: string | null
  errorDescarga: string | null
  descargar: (material: Material) => void
}) {
  return (
    <section aria-label="Materiales del curso" className="grid min-w-0 gap-4">
      <h3 className="m-0 text-lg font-semibold text-foreground">
        Materiales del curso
      </h3>
      {errorDescarga && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {errorDescarga}
        </p>
      )}
      {materiales === undefined ? (
        <div role="status" className="grid gap-2">
          <span className="sr-only">Cargando materiales…</span>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : materiales === null ? (
        <ErrorState
          mensaje="No pudimos cargar los materiales."
          onReintentar={recargar}
        />
      ) : materiales.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icono={FolderOpen}
            titulo="Aún no hay materiales del curso"
            mensaje="Los archivos publicados por el equipo docente aparecerán aquí."
          />
        </Card>
      ) : (
        CATEGORIAS_MATERIAL.map((categoria) => {
          const grupo = materiales.filter(
            (material) => material.categoria === categoria,
          )
          if (grupo.length === 0) return null
          const etiqueta = CATEGORIA_MATERIAL_LABEL[categoria]
          return (
            <section key={categoria} className="grid gap-2">
              <h4 className="m-0 text-sm font-semibold text-foreground">
                {etiqueta}
              </h4>
              <ul
                aria-label={etiqueta}
                className="m-0 grid list-none gap-2 p-0"
              >
                {grupo.map((material) => (
                  <li key={material.id}>
                    <article aria-label={material.titulo}>
                      <Card className="py-4">
                        <CardContent className="flex flex-wrap items-center gap-3 px-4">
                          <FileText
                            aria-hidden="true"
                            className="size-5 shrink-0 text-primary"
                          />
                          <div className="min-w-0 flex-1 basis-44 space-y-1 break-words">
                            <h5 className="m-0 text-sm font-semibold">
                              {material.titulo}
                            </h5>
                            {material.descripcion && (
                              <p className="m-0 text-sm whitespace-pre-wrap text-muted-foreground">
                                {material.descripcion}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline">
                                {etiquetaTipo(material)}
                              </Badge>
                              <span>
                                {material.archivo.nombre} ·{' '}
                                {tamanoLegible(material.archivo.tamano)}
                              </span>
                              <time dateTime={fechaSubida(material)}>
                                {fechaMaterial.format(
                                  new Date(fechaSubida(material)),
                                )}
                              </time>
                            </div>
                            <p className="m-0 text-xs text-muted-foreground">
                              Versión {material.version}, del{' '}
                              {fechaHora(material.versionEn)} · Publicado el{' '}
                              {fechaHora(material.creadoEn)}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            aria-label={`Descargar ${material.titulo}`}
                            disabled={descargando === material.id}
                            onClick={() => descargar(material)}
                          >
                            <Download aria-hidden="true" />
                            {descargando === material.id
                              ? 'Descargando…'
                              : 'Descargar'}
                          </Button>
                        </CardContent>
                      </Card>
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </section>
  )
}

function FormularioMaterial({
  ruta,
  alSubir,
  alCancelar,
}: {
  ruta: string
  alSubir: () => void
  alCancelar: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [campos, setCampos] = useState(VACIO)
  // El título se completa con el nombre del archivo mientras el profesor no
  // lo haya escrito él.
  const [tituloAutomatico, setTituloAutomatico] = useState(true)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Sin archivo al enviar: el aviso va junto al campo, no abajo.
  const [faltaArchivo, setFaltaArchivo] = useState(false)
  // Archivo que ya quedó subido y confirmado, pero cuyo registro falló: al
  // reintentar con el mismo archivo se registra ese, sin subirlo otra vez.
  const confirmado = useRef<{ archivo: File; id: string } | null>(null)
  // Un segundo clic antes de que React deshabilite el botón no envía otra vez.
  const enCurso = useRef(false)

  const ocupado = etapa !== null

  // Valida lo que el backend también valida, para avisar antes de subir.
  function validar(): string | null {
    if (!archivo) return null
    const motivo = motivoArchivo(archivo)
    if (motivo) return motivo
    if (!campos.categoria) return 'Elige una categoría'
    if (campos.titulo.trim() === '') return 'Ingresa el título del material'
    return null
  }

  const subirArchivo = (elegido: File) =>
    subirConfirmado(fetchConSesion, ruta, elegido, setEtapa, setProgreso)

  // Si el listado de la sección ya tiene un material con ese archivo; null
  // si el listado no respondió y no se sabe.
  async function yaRegistrado(archivoId: string): Promise<boolean | null> {
    try {
      const res = await fetchConSesion(`${ruta}/materiales`)
      if (!res.ok) return null
      return ((await res.json()) as Material[]).some(
        (m) => m.archivo.id === archivoId,
      )
    } catch {
      return null
    }
  }

  async function registrar(archivoId: string, categoria: CategoriaMaterial) {
    setEtapa('registrando')
    const datos: CrearMaterial = {
      archivoId,
      categoria,
      titulo: campos.titulo,
      ...(campos.descripcion.trim() !== '' && {
        descripcion: campos.descripcion,
      }),
    }
    const res = await fetchConSesion(`${ruta}/materiales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
    if (res.ok) return
    if (res.status === 409) {
      // El archivo ya es un material. Si es el de este reintento (el registro
      // anterior se guardó pero su respuesta se perdió), ya quedó subido:
      // se trata como éxito y el listado lo muestra.
      const registrado = await yaRegistrado(archivoId)
      if (registrado) return
      // Sin listado no se sabe: se conserva el archivo para volver a
      // verificar sin subirlo otra vez.
      if (registrado === null) {
        throw new ErrorDeFlujo(
          'No pudimos comprobar si el material quedó registrado. Inténtalo nuevamente.',
        )
      }
      // Otro registro ganó: ese archivo ya no sirve para reintentar.
      confirmado.current = null
    }
    throw new ErrorDeFlujo(
      res.status === 409
        ? 'Ese archivo ya está registrado como material.'
        : res.status === 403
          ? 'Ya no eres profesor de esta sección.'
          : ((res.status === 400 ? await motivoDe(res) : null) ??
            'No pudimos registrar el material. Inténtalo nuevamente.'),
    )
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enCurso.current) return
    setFaltaArchivo(!archivo)
    const motivo = validar()
    if (motivo || !archivo || !campos.categoria) {
      setError(archivo ? motivo : null)
      return
    }
    setError(null)
    enCurso.current = true
    try {
      const previo = confirmado.current
      const archivoId =
        previo?.archivo === archivo ? previo.id : await subirArchivo(archivo)
      confirmado.current = { archivo, id: archivoId }
      await registrar(archivoId, campos.categoria)
      confirmado.current = null
      alSubir()
    } catch (falla) {
      setError(
        falla instanceof ErrorDeFlujo
          ? falla.message
          : 'No pudimos subir el material. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      // Siempre se desbloquea, también si falló a mitad del flujo.
      enCurso.current = false
      setEtapa(null)
    }
  }

  function elegirArchivo(elegido: File | null) {
    setError(null)
    setFaltaArchivo(false)
    setArchivo(elegido)
    if (elegido && tituloAutomatico) {
      setCampos((actuales) => ({
        ...actuales,
        titulo: tituloDesdeNombre(elegido.name).slice(0, LARGO_TITULO_MATERIAL),
      }))
    }
  }

  const cambiar =
    (campo: keyof typeof VACIO) => (event: { target: { value: string } }) => {
      if (campo === 'titulo') setTituloAutomatico(event.target.value === '')
      setCampos((actuales) => ({ ...actuales, [campo]: event.target.value }))
    }

  const TEXTO_ETAPA: Record<Etapa, string> = {
    pidiendo: 'Preparando la subida…',
    subiendo: `Subiendo archivo… ${progreso} %`,
    confirmando: 'Confirmando el archivo…',
    registrando: 'Registrando el material…',
  }

  return (
    <form
      className="grid min-w-0 gap-4"
      aria-label="Subir material"
      noValidate
      onSubmit={(event) => void enviar(event)}
    >
      <FormField etiqueta="Archivo">
        {(control) => (
          <Dropzone
            {...control}
            archivo={archivo}
            onArchivoChange={elegirArchivo}
            error={faltaArchivo ? 'Elige un archivo' : null}
            accept={ACEPTADAS}
            validar={motivoArchivo}
            descripcion={`Hasta ${tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}: ${EXTENSIONES.join(', ')}`}
            disabled={ocupado}
          />
        )}
      </FormField>
      <FormField etiqueta="Título">
        {(control) => (
          <Input
            {...control}
            value={campos.titulo}
            onChange={cambiar('titulo')}
            maxLength={LARGO_TITULO_MATERIAL}
            disabled={ocupado}
          />
        )}
      </FormField>
      <FormField etiqueta="Categoría">
        {(control) => (
          <NativeSelect
            {...control}
            className="w-full"
            value={campos.categoria}
            onChange={cambiar('categoria')}
            disabled={ocupado}
          >
            <option value="">Elige una categoría</option>
            {CATEGORIAS_MATERIAL.map((categoria) => (
              <option key={categoria} value={categoria}>
                {CATEGORIA_MATERIAL_LABEL[categoria]}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField etiqueta="Descripción (opcional)">
        {(control) => (
          <Textarea
            {...control}
            value={campos.descripcion}
            onChange={cambiar('descripcion')}
            maxLength={LARGO_DESCRIPCION_MATERIAL}
            rows={3}
            disabled={ocupado}
          />
        )}
      </FormField>
      {etapa && (
        <div
          className="grid gap-1.5 text-sm text-muted-foreground"
          role="status"
        >
          <span>{TEXTO_ETAPA[etapa]}</span>
          {etapa === 'subiendo' && (
            <progress
              className="h-2 w-full accent-(--color-primary)"
              value={progreso}
              max={100}
              aria-label="Progreso de la subida"
            />
          )}
        </div>
      )}
      {error && (
        <Alert variant="danger">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={ocupado}
          onClick={alCancelar}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={ocupado}>
          {ocupado && <Loader2 aria-hidden="true" className="animate-spin" />}
          Subir material
        </Button>
      </DialogFooter>
    </form>
  )
}

// El título sugerido: el nombre del archivo sin la extensión y con espacios.
function tituloDesdeNombre(nombre: string) {
  const punto = nombre.lastIndexOf('.')
  return (punto > 0 ? nombre.slice(0, punto) : nombre)
    .replace(/[_-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

// Lo que el backend también revisa del archivo: tipo y tamaño.
function motivoArchivo(archivo: File): string | null {
  if (!tipoDeArchivo(archivo.name)) {
    return `El archivo debe ser de uno de estos tipos: ${EXTENSIONES.join(', ')}`
  }
  if (archivo.size === 0) return 'El archivo está vacío'
  if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
    return `El archivo pesa más de ${tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}`
  }
  return null
}

// MAT-07: solo el profesor. Sube una versión nueva del material (pedir la
// subida, subir a S3, confirmar y registrar) y ve el historial con fecha,
// responsable y descarga, cada uno en su diálogo.
function VersionesMaterial({
  ruta,
  material,
  dialogo,
  cerrar,
  alSubir,
}: {
  ruta: string
  material: Material
  dialogo: 'version' | 'historial' | null
  cerrar: () => void
  alSubir: () => void
}) {
  const { fetchConSesion } = useAuth()
  const rutaVersiones = `${ruta}/materiales/${material.id}/versiones`
  const [historial, recargarHistorial] = useDatos<VersionMaterial[]>(
    dialogo === 'historial' ? rutaVersiones : null,
  )
  const [archivo, setArchivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [descargando, setDescargando] = useState<number | null>(null)
  // Archivo ya confirmado cuyo registro falló: al reintentar no se sube otra
  // vez (el POST es idempotente con el mismo archivo).
  const confirmado = useRef<{ archivo: File; id: string } | null>(null)
  const enCurso = useRef(false)

  async function subirVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enCurso.current) return
    if (!archivo) {
      setError('Elige un archivo')
      return
    }
    const motivo = motivoArchivo(archivo)
    if (motivo) {
      setError(motivo)
      return
    }
    setError(null)
    enCurso.current = true
    try {
      const previo = confirmado.current
      const archivoId =
        previo?.archivo === archivo
          ? previo.id
          : await subirConfirmado(
              fetchConSesion,
              ruta,
              archivo,
              setEtapa,
              setProgreso,
            )
      confirmado.current = { archivo, id: archivoId }
      setEtapa('registrando')
      const res = await fetchConSesion(rutaVersiones, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoId }),
      })
      if (!res.ok) {
        if (res.status === 409) confirmado.current = null
        throw new ErrorDeFlujo(
          res.status === 409
            ? 'Ese archivo ya está registrado como material.'
            : res.status === 403
              ? 'Ya no eres profesor de este curso.'
              : ((res.status === 400 ? await motivoDe(res) : null) ??
                'No pudimos registrar la versión. Inténtalo nuevamente.'),
        )
      }
      const { version } = (await res.json()) as VersionMaterial
      confirmado.current = null
      setArchivo(null)
      toast.success(`Versión ${version} subida`)
      cerrar()
      alSubir()
    } catch (falla) {
      setError(
        falla instanceof ErrorDeFlujo
          ? falla.message
          : 'No pudimos subir la versión. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      // Siempre se desbloquea, también si falló a mitad del flujo.
      enCurso.current = false
      setEtapa(null)
    }
  }

  async function descargar(version: number) {
    setDescargando(version)
    setError(null)
    try {
      const res = await fetchConSesion(`${rutaVersiones}/${version}/descarga`)
      if (!res.ok) throw new Error()
      const { url } = (await res.json()) as DescargaArchivo
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.click()
    } catch {
      setError(`No pudimos descargar la versión ${version}.`)
    } finally {
      setDescargando(null)
    }
  }

  const TEXTO_ETAPA: Record<Etapa, string> = {
    pidiendo: 'Preparando la subida…',
    subiendo: `Subiendo archivo… ${progreso} %`,
    confirmando: 'Confirmando el archivo…',
    registrando: 'Registrando la versión…',
  }
  const ocupado = etapa !== null
  const alCambiarAbierto = (abierto: boolean) => {
    if (abierto || ocupado) return
    setError(null)
    setArchivo(null)
    cerrar()
  }

  return (
    <>
      <Dialog open={dialogo === 'version'} onOpenChange={alCambiarAbierto}>
        <DialogContent className="bg-card text-left sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Subir nueva versión</DialogTitle>
            <DialogDescription>
              Reemplaza el archivo de «{material.titulo}». La versión anterior
              queda en el historial.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            aria-label={`Subir nueva versión de ${material.titulo}`}
            noValidate
            onSubmit={(event) => void subirVersion(event)}
          >
            <FormField etiqueta="Nueva versión">
              {(control) => (
                <Dropzone
                  {...control}
                  archivo={archivo}
                  onArchivoChange={(elegido) => {
                    setError(null)
                    setArchivo(elegido)
                  }}
                  accept={ACEPTADAS}
                  validar={motivoArchivo}
                  descripcion={`Hasta ${tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}: ${EXTENSIONES.join(', ')}`}
                  disabled={ocupado}
                />
              )}
            </FormField>
            {etapa && (
              <p className="m-0 text-sm text-muted-foreground" role="status">
                {TEXTO_ETAPA[etapa]}
              </p>
            )}
            {error && (
              <Alert variant="danger">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={ocupado}
                onClick={() => alCambiarAbierto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={ocupado}>
                {ocupado && (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                )}
                Subir nueva versión
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={dialogo === 'historial'} onOpenChange={alCambiarAbierto}>
        <DialogContent className="bg-card text-left sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Historial de versiones</DialogTitle>
            <DialogDescription>{material.titulo}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="danger">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {historial === undefined ? (
            <div role="status">
              <span className="sr-only">Cargando versiones…</span>
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : historial === null ? (
            <ErrorState
              mensaje="No pudimos cargar las versiones."
              onReintentar={recargarHistorial}
            />
          ) : (
            <ol
              className="m-0 grid list-none divide-y divide-border p-0"
              aria-label="Versiones"
            >
              {historial.map((v) => (
                <li
                  key={v.version}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="grid min-w-0">
                    <span className="font-medium text-foreground">
                      Versión {v.version}
                    </span>
                    <span className="text-xs break-all text-muted-foreground">
                      {fechaHora(v.subidoEn)} · {v.responsable} ·{' '}
                      {v.archivo.nombre}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Descargar versión ${v.version}`}
                    disabled={descargando === v.version}
                    onClick={() => void descargar(v.version)}
                  >
                    {descargando === v.version ? 'Descargando…' : 'Descargar'}
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
