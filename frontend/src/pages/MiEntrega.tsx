import {
  TAMANO_MAXIMO_ARCHIVO,
  TIPOS_ARCHIVO,
  tipoDeArchivo,
  ZONA_HORARIA_UNIVERSIDAD,
  type Actividad,
  type ArchivoResumen,
  type MiEntregaActividad,
  type SubidaArchivo,
} from '@cursus/shared'
import {
  CheckCircle2,
  CircleAlert,
  FileText,
  Loader2,
  Lock,
} from 'lucide-react'
import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { Dropzone, ErrorState } from '@/components/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { tiempoRestante } from '../lib/fechas'
import { useAuth } from '../auth/auth'
import { useDatos } from './useDatos'

// Fecha y hora en la zona de la universidad, de 0 a 23 (14-11-2026 23:59).
const fechaHora = (iso: string) =>
  new Date(iso)
    .toLocaleString('es-CL', {
      timeZone: ZONA_HORARIA_UNIVERSIDAD,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    .replace(',', '')
const ACEPTA = Object.keys(TIPOS_ARCHIVO)
  .map((extension) => `.${extension}`)
  .join(',')
// Lo que acepta el backend, sin inventar reglas: sus extensiones y 20 MB.
const DESCRIPCION = `${Object.keys(TIPOS_ARCHIVO)
  .map((extension) => extension.toUpperCase())
  .join(', ')} · hasta 20 MB`
const MENSAJE_ARCHIVO =
  'Elige un archivo de un tipo permitido, de hasta 20 MB y que no esté vacío.'
const validarArchivo = (archivo: File) =>
  tipoDeArchivo(archivo.name) &&
  archivo.size >= 1 &&
  archivo.size <= TAMANO_MAXIMO_ARCHIVO
    ? null
    : MENSAJE_ARCHIVO

class ErrorEntrega extends Error {}

// Pasos de la entrega, para mostrar el avance mientras se sube.
const PASOS = [
  'Preparando archivo…',
  'Subiendo archivo…',
  'Confirmando archivo…',
  'Registrando entrega…',
]

// Una actividad de entrega del alumno, como ficha: título, estado, plazo con
// su cuenta regresiva, instrucciones y su entrega (MiEntrega). Cada paso
// confirmado se conserva para reintentar sin volver a subir el archivo. Solo
// el PUT final acredita la entrega; subir a S3 no basta.
export function TarjetaActividad({
  ruta,
  actividad,
}: {
  ruta: string
  actividad: Actividad
}) {
  const { fetchConSesion } = useAuth()
  const [datos, recargar, , fijar] = useDatos<MiEntregaActividad>(
    `${ruta}/mi-entrega`,
  )
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subida, setSubida] = useState<SubidaArchivo | null>(null)
  const [subido, setSubido] = useState(false)
  const [confirmado, setConfirmado] = useState<ArchivoResumen | null>(null)
  const [paso, setPaso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cerradaPorServidor, setCerradaPorServidor] = useState(false)
  // El reloj avanza mientras la vista está abierta: la cuenta regresiva se
  // actualiza y, al llegar el plazo, la actividad pasa a cerrada sin recargar
  // la página (y se vuelve a pedir el estado al servidor).
  const [ahora, setAhora] = useState(() => Date.now())
  const revalidar = useEffectEvent(() => recargar())
  useEffect(() => {
    const plazo = new Date(actividad.plazo).getTime()
    const cadaMedioMinuto = setInterval(() => setAhora(Date.now()), 30_000)
    const falta = plazo - Date.now()
    // setTimeout no admite esperas de más de ~24 días: antes, el intervalo
    // de arriba basta para que llegue el momento.
    const alVencer =
      falta > 0 && falta < 2_147_483_647
        ? setTimeout(() => {
            setAhora(Math.max(Date.now(), plazo))
            revalidar()
          }, falta)
        : undefined
    return () => {
      clearInterval(cadaMedioMinuto)
      clearTimeout(alVencer)
    }
  }, [actividad.plazo])
  const vencida = ahora >= new Date(actividad.plazo).getTime()
  const cerrada =
    actividad.cerrada || datos?.cerrada || cerradaPorServidor || vencida
  const ocupado = paso !== null
  const rutaArchivos =
    ruta.slice(0, ruta.indexOf('/actividades/')) + '/archivos'
  const restante = tiempoRestante(actividad.plazo, ahora)
  const entregada = Boolean(datos?.entrega)

  async function pedir<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetchConSesion(url, init)
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as {
        message?: unknown
      } | null
      if (url.endsWith('/mi-entrega') && res.status === 409) {
        // 409 puede indicar un archivo inválido, no solo un plazo vencido.
        // Releer el estado evita bloquear una actividad que sigue abierta.
        recargar()
        if (
          typeof cuerpo?.message === 'string' &&
          cuerpo.message.startsWith('La actividad está cerrada.')
        )
          setCerradaPorServidor(true)
      }
      const mensaje = Array.isArray(cuerpo?.message)
        ? cuerpo.message[0]
        : cuerpo?.message
      throw new ErrorEntrega(
        typeof mensaje === 'string' &&
          [400, 403, 404, 409, 503].includes(res.status)
          ? mensaje
          : 'No pudimos completar la entrega. Inténtalo nuevamente.',
      )
    }
    return res.json() as Promise<T>
  }

  async function entregar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!archivo || ocupado || cerrada) return
    setError(null)
    setAviso(null)
    try {
      setPaso('Preparando archivo…')
      const preparada =
        subida ??
        (await pedir<SubidaArchivo>(rutaArchivos, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: archivo.name, tamano: archivo.size }),
        }))
      setSubida(preparada)
      if (!subido) {
        setPaso('Subiendo archivo…')
        const cuerpo = new FormData()
        for (const [nombre, valor] of Object.entries(preparada.subida.campos))
          cuerpo.append(nombre, valor)
        cuerpo.append('file', archivo)
        // La firma autentica S3. Nunca enviar el JWT de la sesión al bucket.
        const respuesta = await fetch(preparada.subida.url, {
          method: 'POST',
          body: cuerpo,
        })
        if (!respuesta.ok) {
          // La firma puede haber vencido: el próximo intento pide otra.
          setSubida(null)
          throw new ErrorEntrega(
            'No pudimos subir el archivo. Reintenta antes del plazo.',
          )
        }
        setSubido(true)
      }
      setPaso('Confirmando archivo…')
      const lista =
        confirmado ??
        (await pedir<ArchivoResumen>(
          `${rutaArchivos}/${preparada.archivo.id}/confirmar`,
          { method: 'POST' },
        ))
      setConfirmado(lista)
      setPaso('Registrando entrega…')
      const resultado = await pedir<MiEntregaActividad>(`${ruta}/mi-entrega`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivoId: lista.id }),
      })
      fijar(resultado)
      setAviso('Entrega confirmada.')
      setArchivo(null)
      setSubida(null)
      setSubido(false)
      setConfirmado(null)
    } catch (fallo) {
      setError(
        fallo instanceof ErrorEntrega
          ? fallo.message
          : 'No pudimos completar la entrega. Comprueba tu conexión e inténtalo nuevamente.',
      )
    } finally {
      setPaso(null)
    }
  }

  const estado = entregada ? 'Entregada' : cerrada ? 'Cerrada' : 'Abierta'
  const avance = paso ? PASOS.indexOf(paso) + 1 : 0

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-2 border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="m-0 min-w-0 text-base font-semibold break-words text-foreground">
            {actividad.titulo}
          </h4>
          <Badge
            variant={entregada ? 'default' : 'secondary'}
            className={cn(cerrada && !entregada && 'text-muted-foreground')}
          >
            {estado}
          </Badge>
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>
            Plazo:{' '}
            <time dateTime={actividad.plazo} className="tabular-nums">
              {fechaHora(actividad.plazo)}
            </time>
          </span>
          {restante && (
            <span
              className={cn(
                'font-medium',
                restante.urgente ? 'text-destructive' : 'text-foreground',
              )}
            >
              {restante.texto}
            </span>
          )}
        </p>
        {actividad.instrucciones && (
          <p className="m-0 text-sm break-words whitespace-pre-line text-foreground">
            {actividad.instrucciones}
          </p>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 px-5 py-4">
        {datos === undefined ? (
          <div role="status" className="grid gap-2">
            <span className="sr-only">Cargando mi entrega…</span>
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : datos === null ? (
          <ErrorState
            mensaje="No pudimos cargar tu entrega."
            onReintentar={recargar}
          />
        ) : (
          <section
            className="grid gap-4"
            aria-label={`Mi entrega de ${actividad.titulo}`}
          >
            {datos.entrega ? (
              <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <FileText
                  aria-hidden="true"
                  className="size-5 shrink-0 text-primary"
                />
                <div className="grid min-w-0 flex-1">
                  <span className="text-sm font-medium break-all text-foreground">
                    <strong>Informe entregado</strong>:{' '}
                    {datos.entrega.archivo.nombre}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Entregado el{' '}
                    <time dateTime={datos.entrega.entregadaEn}>
                      {fechaHora(datos.entrega.entregadaEn)}
                    </time>{' '}
                    (Chile continental)
                  </span>
                </div>
              </div>
            ) : cerrada ? (
              <Alert variant="danger">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>
                  No entregaste tu informe y la actividad está cerrada. No se
                  aceptan nuevas entregas ni reemplazos.
                </AlertDescription>
              </Alert>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                Aún no has entregado tu informe.
              </p>
            )}
            {cerrada && !ocupado ? (
              datos.entrega && (
                <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock aria-hidden="true" className="size-4" />
                  La actividad está cerrada. No se aceptan nuevas entregas ni
                  reemplazos.
                </p>
              )
            ) : (
              <form
                aria-label={`Entregar informe de ${actividad.titulo}`}
                className="grid gap-3"
                onSubmit={(event) => void entregar(event)}
              >
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {datos.entrega
                      ? 'Archivo de reemplazo'
                      : 'Archivo del informe'}
                  </span>
                  <Dropzone
                    aria-label={
                      datos.entrega
                        ? 'Archivo de reemplazo'
                        : 'Archivo del informe'
                    }
                    archivo={archivo}
                    onArchivoChange={(nuevo) => {
                      setArchivo(nuevo)
                      setSubida(null)
                      setSubido(false)
                      setConfirmado(null)
                      setError(null)
                      setAviso(null)
                    }}
                    accept={ACEPTA}
                    validar={validarArchivo}
                    descripcion={DESCRIPCION}
                    disabled={ocupado}
                  />
                  {datos.entrega && (
                    <p className="m-0 text-xs text-muted-foreground">
                      Reemplaza la versión anterior; vale la última que
                      entregues antes del plazo.
                    </p>
                  )}
                </div>
                <div>
                  <Button type="submit" disabled={!archivo || ocupado}>
                    {ocupado && (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin motion-reduce:animate-none"
                      />
                    )}
                    {paso ??
                      (datos.entrega
                        ? 'Reemplazar entrega'
                        : 'Entregar informe')}
                  </Button>
                </div>
                {ocupado && (
                  <div
                    role="status"
                    className="grid gap-1.5 text-xs text-muted-foreground"
                  >
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
                        style={{ width: `${(avance / PASOS.length) * 100}%` }}
                      />
                    </div>
                    <span>
                      Paso {avance} de {PASOS.length}: {paso}
                    </span>
                  </div>
                )}
              </form>
            )}
            {aviso && (
              <p
                role="status"
                className="m-0 flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="size-4 text-primary"
                />
                {aviso}
              </p>
            )}
            {error && (
              <p role="alert" className="m-0 text-sm text-destructive">
                {error}
              </p>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
