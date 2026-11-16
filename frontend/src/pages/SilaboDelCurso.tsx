import type { DescargaArchivo, SilaboVigente } from '@cursus/shared'
import { useId, useState } from 'react'
import { useAuth } from '../auth/auth'
import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

export function SilaboDelCurso({ seccionId }: { seccionId: string }) {
  const titulo = useId()
  const ruta = `/api/espacio/secciones/${seccionId}/silabo-vigente`
  const [datos, recargar] = useDatos<SilaboVigente>(ruta)
  const { fetchConSesion } = useAuth()
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState(false)

  async function descargar() {
    setDescargando(true)
    setError(false)
    try {
      const respuesta = await fetchConSesion(`${ruta}/descarga`)
      if (!respuesta.ok) throw new Error('No hay URL de descarga')
      const { url } = (await respuesta.json()) as DescargaArchivo
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.referrerPolicy = 'no-referrer'
      enlace.click()
    } catch {
      setError(true)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <section aria-labelledby={titulo}>
      <Card className="flex-row flex-wrap items-center gap-4 p-5">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"
        >
          <FileText className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
          <h3
            id={titulo}
            className="m-0 text-base font-semibold text-foreground"
          >
            Sílabo del curso
          </h3>
          {datos === undefined ? (
            <div role="status">
              <span className="sr-only">Cargando sílabo…</span>
              <Skeleton className="h-4 w-40" />
            </div>
          ) : datos === null ? null : datos.silabo ? (
            <p className="m-0 text-sm text-muted-foreground">
              Versión vigente {datos.silabo.version} · PDF
            </p>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              Aún no hay un sílabo publicado para este curso.
            </p>
          )}
        </div>
        {datos?.silabo && (
          <Button
            type="button"
            variant="outline"
            disabled={descargando}
            onClick={() => void descargar()}
          >
            <Download aria-hidden="true" />
            {descargando ? 'Preparando descarga…' : 'Descargar sílabo'}
          </Button>
        )}
        {datos === null && (
          <div className="basis-full">
            <ErrorEstado
              mensaje="No pudimos consultar el sílabo."
              onReintentar={recargar}
            />
          </div>
        )}
        {error && (
          <p className="m-0 basis-full text-sm text-destructive" role="alert">
            No pudimos descargar el sílabo. Inténtalo nuevamente.
          </p>
        )}
      </Card>
    </section>
  )
}
