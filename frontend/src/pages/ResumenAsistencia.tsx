import type { ResumenAsistenciaSeccion } from '@cursus/shared'
import { useEffect, useState } from 'react'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { EVENTO_ASISTENCIA_GUARDADA } from './asistencia-eventos'
import { useDatos } from './useDatos'

const numero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })
const nombres = new Intl.Collator('es')

export function ResumenAsistencia({ seccionId }: { seccionId: string }) {
  const [datos, recargar] = useDatos<ResumenAsistenciaSeccion>(
    `/api/espacio/secciones/${seccionId}/asistencia/resumen`,
  )
  const [orden, setOrden] = useState('asc')
  useEffect(() => {
    const actualizar = (e: Event) => {
      if (e instanceof CustomEvent && e.detail === seccionId) recargar()
    }
    window.addEventListener(EVENTO_ASISTENCIA_GUARDADA, actualizar)
    return () =>
      window.removeEventListener(EVENTO_ASISTENCIA_GUARDADA, actualizar)
  }, [recargar, seccionId])

  if (datos === undefined)
    return <Cargando texto="Cargando porcentajes de asistencia…" />
  if (datos === null)
    return (
      <ErrorEstado
        mensaje="No pudimos cargar los porcentajes de asistencia."
        onReintentar={recargar}
      />
    )
  const alumnos = [...datos.alumnos].sort((a, b) => {
    if (a.porcentaje === null && b.porcentaje !== null) return 1
    if (b.porcentaje === null && a.porcentaje !== null) return -1
    const diferencia = (a.porcentaje ?? 0) - (b.porcentaje ?? 0)
    return (
      (orden === 'asc' ? diferencia : -diferencia) ||
      nombres.compare(a.nombre, b.nombre) ||
      a.id.localeCompare(b.id)
    )
  })
  return (
    <section className="asistencia" aria-label="Porcentajes de asistencia">
      <h3 className="vista-seccion__subtitulo">Asistencia por alumno</h3>
      <p className="dashboard__texto">
        Clases con asistencia registrada: {datos.clasesRegistradas}. Las clases
        sin lista guardada no se incluyen.
      </p>
      <p className="dashboard__texto">
        El porcentaje usa las clases registradas de la sección. Sin marca indica
        clases sin registro para ese alumno; no equivale a Ausente.
      </p>
      {alumnos.length === 0 ? (
        <p className="dashboard__texto">
          La sección no tiene alumnos inscritos.
        </p>
      ) : (
        <>
          <label className="asistencia__campo">
            Ordenar por porcentaje
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="asc">De menor a mayor</option>
              <option value="desc">De mayor a menor</option>
            </select>
          </label>
          <table
            className="asistencia__tabla"
            aria-label="Porcentaje por alumno"
          >
            <thead>
              <tr>
                <th scope="col">Alumno</th>
                <th scope="col">Asistidas / Registradas</th>
                <th scope="col">Sin marca</th>
                <th
                  scope="col"
                  aria-sort={orden === 'asc' ? 'ascending' : 'descending'}
                >
                  Porcentaje
                </th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.nombre}</th>
                  <td>
                    {a.asistidas} / {datos.clasesRegistradas}
                  </td>
                  <td>{a.sinMarca}</td>
                  <td>
                    {a.porcentaje === null
                      ? 'Sin registros'
                      : `${numero.format(a.porcentaje)} %`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
