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
import { Download, FileText, FolderOpen } from 'lucide-react'
import { EmptyState, ErrorState, FileInput } from '@/components/shared'
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

  return (
    <section className="grid min-w-0 gap-4" aria-label="Materiales del curso">
      <h3 className="m-0 text-base font-semibold">Materiales del curso</h3>
      {rol === 'AYUDANTE' && (
        <Alert role="note" variant="info">
          <AlertTitle>Material en solo lectura</AlertTitle>
          <AlertDescription>
            Puedes descargar los archivos publicados. Solo el profesor puede
            subir materiales o nuevas versiones.
          </AlertDescription>
        </Alert>
      )}
      {puedePublicar && <FormularioMaterial ruta={ruta} alSubir={recargar} />}
      {errorDescarga && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {errorDescarga}
        </p>
      )}
      {materiales === undefined ? (
        <div role="status">
          <span className="sr-only">Cargando materiales…</span>
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : materiales === null ? (
        <ErrorState
          mensaje="No pudimos cargar los materiales."
          onReintentar={recargar}
        />
      ) : materiales.length === 0 ? (
        <EmptyState
          icono={FolderOpen}
          titulo="Aún no hay materiales del curso"
          mensaje={
            puedePublicar
              ? 'Usa el formulario para subir el primer archivo.'
              : 'Aquí aparecerán los archivos que publique el profesor.'
          }
          className="rounded-xl border border-border bg-card"
        />
      ) : (
        <div className="grid min-w-0 gap-4">
          {CATEGORIAS_MATERIAL.map((categoria) => {
            const grupo =
              ordenados?.filter(
                (material) => material.categoria === categoria,
              ) ?? []
            if (grupo.length === 0) return null
            const etiqueta = CATEGORIA_MATERIAL_LABEL[categoria]
            return (
              <section key={categoria} className="grid min-w-0 gap-2">
                <h4 className="m-0 text-base font-semibold">{etiqueta}</h4>
                <ul
                  className="m-0 grid list-none gap-2 p-0"
                  aria-label={etiqueta}
                >
                  {grupo.map((material) => (
                    <li
                      key={material.id}
                      className="min-w-0 rounded-xl border border-border bg-card p-4 [&_summary]:cursor-pointer"
                    >
                      <article aria-label={material.titulo}>
                        <h5 className="m-0 mb-2 text-sm font-semibold break-words">
                          {material.titulo}
                        </h5>
                        {material.descripcion && (
                          <p className="m-0 mb-2 text-sm break-words whitespace-pre-wrap text-muted-foreground">
                            {material.descripcion}
                          </p>
                        )}
                        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                          <p className="m-0 text-xs leading-relaxed break-words text-muted-foreground">
                            {material.archivo.nombre} ·{' '}
                            {tamanoLegible(material.archivo.tamano)}
                            {' · '}
                            {etiquetaTipo(material)}
                            {' · '}
                            <time dateTime={fechaSubida(material)}>
                              {fechaMaterial.format(
                                new Date(fechaSubida(material)),
                              )}
                            </time>
                            <br />
                            {/* MAT-07: la fecha de la vigente y la del material. */}
                            Versión {material.version}, del{' '}
                            {fechaHora(material.versionEn)} · Publicado el{' '}
                            {fechaHora(material.creadoEn)}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={`Descargar ${material.titulo}`}
                            disabled={descargando === material.id}
                            onClick={() => void descargar(material)}
                          >
                            {descargando === material.id
                              ? 'Descargando…'
                              : 'Descargar'}
                          </Button>
                        </div>
                        {puedeVersionar && (
                          <VersionesMaterial
                            ruta={ruta}
                            material={material}
                            alSubir={recargar}
                          />
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      <AdministrarSilabo
        ruta={ruta}
        puedePublicar={puedePublicar}
        alPublicar={alPublicarSilabo}
      />
    </section>
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
}: {
  ruta: string
  alSubir: () => void
}) {
  const { fetchConSesion } = useAuth()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [campos, setCampos] = useState(VACIO)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Para reiniciar el input de archivo, que no se controla.
  const [versionInput, setVersionInput] = useState(0)
  // Archivo que ya quedó subido y confirmado, pero cuyo registro falló: al
  // reintentar con el mismo archivo se registra ese, sin subirlo otra vez.
  const confirmado = useRef<{ archivo: File; id: string } | null>(null)
  // Un segundo clic antes de que React deshabilite el botón no envía otra vez.
  const enCurso = useRef(false)

  const ocupado = etapa !== null

  // Valida lo que el backend también valida, para avisar antes de subir.
  function validar(): string | null {
    if (!archivo) return 'Elige un archivo'
    if (!tipoDeArchivo(archivo.name)) {
      return `El archivo debe ser de uno de estos tipos: ${EXTENSIONES.join(', ')}`
    }
    if (archivo.size === 0) return 'El archivo está vacío'
    if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
      return `El archivo pesa más de ${tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}`
    }
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
    setAviso(null)
    const motivo = validar()
    if (motivo || !archivo || !campos.categoria) {
      setError(motivo)
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
      setArchivo(null)
      setCampos(VACIO)
      setVersionInput((n) => n + 1)
      setAviso('Material subido')
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

  function elegirArchivo([elegido]: File[]) {
    setAviso(null)
    setError(null)
    setArchivo(elegido ?? null)
  }

  const cambiar =
    (campo: keyof typeof VACIO) => (event: { target: { value: string } }) => {
      setAviso(null)
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
      className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4"
      aria-label="Subir material"
      noValidate
      onSubmit={(event) => void enviar(event)}
    >
      <div className="grid min-w-0 gap-2 text-sm font-medium">
        <span>Archivo</span>
        <FileInput
          aria-label="Archivo"
          key={versionInput}
          accept={ACEPTADAS}
          onChange={elegirArchivo}
          disabled={ocupado}
        />
      </div>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Categoría
        <NativeSelect
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
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Título
        <Input
          value={campos.titulo}
          onChange={cambiar('titulo')}
          maxLength={LARGO_TITULO_MATERIAL}
          disabled={ocupado}
        />
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Descripción (opcional)
        <Textarea
          value={campos.descripcion}
          onChange={cambiar('descripcion')}
          maxLength={LARGO_DESCRIPCION_MATERIAL}
          rows={3}
          disabled={ocupado}
        />
      </label>
      <Button className="justify-self-start" type="submit" disabled={ocupado}>
        Subir material
      </Button>
      <p className="m-0 text-xs text-muted-foreground">
        Hasta {tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}. Tipos:{' '}
        {EXTENSIONES.join(', ')}.
      </p>
      {etapa && (
        <div className="m-0 text-sm text-muted-foreground" role="status">
          <span>{TEXTO_ETAPA[etapa]}</span>
          {etapa === 'subiendo' && (
            <progress
              value={progreso}
              max={100}
              aria-label="Progreso de la subida"
            />
          )}
        </div>
      )}
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="m-0 text-sm text-(color:--color-success)" role="status">
          {aviso}
        </p>
      )}
    </form>
  )
}

// MAT-07: solo el profesor. Sube una versión nueva del material (pedir la
// subida, subir a S3, confirmar y registrar) y ve el historial con fecha,
// responsable y descarga. El resto ve solo la vigente en el listado.
function VersionesMaterial({
  ruta,
  material,
  alSubir,
}: {
  ruta: string
  material: Material
  alSubir: () => void
}) {
  const { fetchConSesion } = useAuth()
  const rutaVersiones = `${ruta}/materiales/${material.id}/versiones`
  const [abierto, setAbierto] = useState(false)
  const [historial, recargarHistorial] = useDatos<VersionMaterial[]>(
    abierto ? rutaVersiones : null,
  )
  const [archivo, setArchivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [versionInput, setVersionInput] = useState(0)
  const [descargando, setDescargando] = useState<number | null>(null)
  // Archivo ya confirmado cuyo registro falló: al reintentar no se sube otra
  // vez (el POST es idempotente con el mismo archivo).
  const confirmado = useRef<{ archivo: File; id: string } | null>(null)
  const enCurso = useRef(false)

  async function subirVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (enCurso.current) return
    setAviso(null)
    if (!archivo) {
      setError('Elige un archivo')
      return
    }
    if (!tipoDeArchivo(archivo.name)) {
      setError(
        `El archivo debe ser de uno de estos tipos: ${EXTENSIONES.join(', ')}`,
      )
      return
    }
    if (archivo.size === 0 || archivo.size > TAMANO_MAXIMO_ARCHIVO) {
      setError(
        archivo.size === 0
          ? 'El archivo está vacío'
          : `El archivo pesa más de ${tamanoLegible(TAMANO_MAXIMO_ARCHIVO)}`,
      )
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
      setVersionInput((n) => n + 1)
      setAviso(`Versión ${version} subida`)
      alSubir()
      if (abierto) recargarHistorial()
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

  return (
    <div className="mt-4 grid gap-3 border-t pt-3 text-sm">
      <form
        className="grid gap-3 rounded-lg bg-muted/50 p-3 sm:flex sm:flex-wrap sm:items-end"
        aria-label={`Subir nueva versión de ${material.titulo}`}
        noValidate
        onSubmit={(event) => void subirVersion(event)}
      >
        <div className="grid min-w-0 gap-2 text-sm font-medium">
          <span>Nueva versión</span>
          <FileInput
            aria-label="Nueva versión"
            key={versionInput}
            accept={ACEPTADAS}
            disabled={etapa !== null}
            onChange={([elegido]) => {
              setAviso(null)
              setError(null)
              setArchivo(elegido ?? null)
            }}
          />
        </div>
        <Button
          className="justify-self-start"
          type="submit"
          disabled={etapa !== null}
        >
          Subir nueva versión
        </Button>
        {etapa && (
          <p className="m-0 text-sm text-muted-foreground" role="status">
            {TEXTO_ETAPA[etapa]}
          </p>
        )}
        {error && (
          <p className="m-0 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {aviso && (
          <p className="m-0 text-sm text-(color:--color-success)" role="status">
            {aviso}
          </p>
        )}
      </form>
      <details onToggle={(event) => setAbierto(event.currentTarget.open)}>
        <summary>Historial de versiones</summary>
        {!abierto ? null : historial === undefined ? (
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
            className="m-0 grid list-none gap-2 p-0 pt-2"
            aria-label="Versiones"
          >
            {historial.map((v) => (
              <li key={v.version}>
                <span>
                  Versión {v.version} · {fechaHora(v.subidoEn)} ·{' '}
                  {v.responsable} · {v.archivo.nombre}
                </span>
                <Button
                  type="button"
                  variant="outline"
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
      </details>
    </div>
  )
}
