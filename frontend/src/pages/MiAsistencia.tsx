import type { AsistenciaPropia } from '@cursus/shared'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

export function MiAsistencia({ seccionId }: { seccionId: string }) {
  const [datos, recargar] = useDatos<AsistenciaPropia[]>(
    `/api/espacio/secciones/${seccionId}/mi-asistencia`,
  )
  if (datos === undefined) return <Cargando texto="Cargando mi asistencia…" />
  if (datos === null)
    return (
      <ErrorEstado
        mensaje="No pudimos cargar tu asistencia."
        onReintentar={recargar}
      />
    )
  return (
    <section aria-label="Mi asistencia">
      <h3>Mi asistencia</h3>
      {datos.length === 0 ? (
        <p>Aún no tienes marcas de asistencia registradas.</p>
      ) : (
        <table
          className="asistencia__tabla"
          aria-label="Mis marcas de asistencia"
        >
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Bloque</th>
              <th scope="col">Asistencia</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((a) => (
              <tr key={a.clase.id}>
                <td>{a.clase.fecha}</td>
                <td>
                  {a.clase.inicio}–{a.clase.termino}
                </td>
                <td>{a.presente ? 'Presente' : 'Ausente'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
