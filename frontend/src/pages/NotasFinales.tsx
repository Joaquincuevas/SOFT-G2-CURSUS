import type { NotasFinalesSeccion } from '@cursus/shared'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { textoNotaFinal } from './nota-final'
import './PestanaNotas.css'
import { useDatos } from './useDatos'
import { descargar } from './csvErrores'

// NOT-14 (RE-02): el profesor ve la nota final o parcial de cada alumno de la
// sección, la misma que cada alumno ve en Mis notas. Solo lectura. Cada
// cambio de `version` la vuelve a pedir sin borrar la tabla mientras llega.
export function NotasFinales({
  seccionId,
  version = 0,
}: {
  seccionId: string
  version?: number
}) {
  const ruta = `/api/espacio/secciones/${seccionId}/notas-finales`
  const [datos, recargar] = useDatos<NotasFinalesSeccion>(ruta)
  const { fetchConSesion } = useAuth()
  const [descargando, setDescargando] = useState(false)
  const [errorCsv, setErrorCsv] = useState(false)
  async function exportar() {
    setDescargando(true)
    setErrorCsv(false)
    try {
      const respuesta = await fetchConSesion(`${ruta}/csv`)
      if (!respuesta.ok) throw new Error()
      // Response.text() retira el BOM, así que lo reponemos en el archivo.
      descargar('notas.csv', '\uFEFF' + (await respuesta.text()))
    } catch {
      setErrorCsv(true)
    } finally {
      setDescargando(false)
    }
  }
  const actualizar = useEffectEvent(recargar)
  const versionLeida = useRef(version)
  useEffect(() => {
    if (versionLeida.current === version) return
    versionLeida.current = version
    actualizar()
  }, [version])

  return (
    <section className="notas" aria-label="Notas finales">
      <h3 className="vista-seccion__subtitulo">Notas finales</h3>
      <div>
        <button
          className="notas__boton"
          type="button"
          disabled={descargando}
          onClick={() => void exportar()}
        >
          {descargando ? 'Exportando…' : 'Exportar notas a CSV'}
        </button>
      </div>
      {errorCsv && (
        <p role="alert">No pudimos exportar las notas. Intenta nuevamente.</p>
      )}
      {datos === undefined ? (
        <Cargando texto="Cargando notas finales…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar las notas finales."
          onReintentar={recargar}
        />
      ) : datos.alumnos.length === 0 ? (
        <p className="dashboard__texto">Aún no hay alumnos inscritos</p>
      ) : (
        <div className="notas__listado">
          <table
            className="notas__tabla"
            aria-label="Nota final de cada alumno"
          >
            <thead>
              <tr>
                <th scope="col">Alumno</th>
                <th scope="col">Nota</th>
              </tr>
            </thead>
            <tbody>
              {datos.alumnos.map((alumno) => (
                <tr key={alumno.id}>
                  <td>{alumno.nombre}</td>
                  <td data-tipo={alumno.notaFinal.tipo}>
                    {textoNotaFinal(alumno.notaFinal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
