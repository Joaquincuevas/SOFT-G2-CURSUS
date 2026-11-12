import type { DescargaArchivo, SilaboVigente } from '@cursus/shared'
import { useId, useState } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
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
    <section className="vista-seccion__silabo" aria-labelledby={titulo}>
      <h3 id={titulo} className="vista-seccion__subtitulo">
        Sílabo del curso
      </h3>
      {datos === undefined ? (
        <Cargando texto="Cargando sílabo…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje="No pudimos consultar el sílabo."
          onReintentar={recargar}
        />
      ) : datos.silabo ? (
        <>
          <p className="dashboard__texto">
            Versión vigente {datos.silabo.version} · PDF
          </p>
          <button
            className="vista-seccion__silabo-descarga"
            type="button"
            disabled={descargando}
            onClick={() => void descargar()}
          >
            {descargando ? 'Preparando descarga…' : 'Descargar sílabo'}
          </button>
          {error && (
            <p className="vista-seccion__silabo-error" role="alert">
              No pudimos descargar el sílabo. Inténtalo nuevamente.
            </p>
          )}
        </>
      ) : (
        <p className="dashboard__texto">
          Aún no hay un sílabo publicado para este curso.
        </p>
      )}
    </section>
  )
}
