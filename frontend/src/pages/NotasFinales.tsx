import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { NotasFinalesSeccion } from '@cursus/shared'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useAuth } from '../auth/auth'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { textoNotaFinal } from './nota-final'
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
    <section className="grid min-w-0 gap-4" aria-label="Notas finales">
      <h3 className="m-0 text-base font-semibold">Notas finales</h3>
      <div>
        <Button
          type="button"
          disabled={descargando}
          onClick={() => void exportar()}
        >
          {descargando ? 'Exportando…' : 'Exportar notas a CSV'}
        </Button>
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
        <p className="m-0 text-sm text-muted-foreground">
          Aún no hay alumnos inscritos
        </p>
      ) : (
        <div className="min-w-0 rounded-xl border bg-card">
          <Table
            className="[&_td]:whitespace-normal [&_th]:whitespace-normal"
            aria-label="Nota final de cada alumno"
          >
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Alumno</TableHead>
                <TableHead scope="col">Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datos.alumnos.map((alumno) => (
                <TableRow key={alumno.id}>
                  <TableCell>{alumno.nombre}</TableCell>
                  <TableCell data-tipo={alumno.notaFinal.tipo}>
                    {textoNotaFinal(alumno.notaFinal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
