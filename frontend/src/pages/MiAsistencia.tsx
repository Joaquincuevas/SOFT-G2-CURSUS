import type { ResumenAsistenciaPropia } from '@cursus/shared'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { useDatos } from './useDatos'

export function MiAsistencia({ seccionId }: { seccionId: string }) {
  const [datos, recargar] = useDatos<ResumenAsistenciaPropia>(
    `/api/espacio/secciones/${seccionId}/mi-asistencia/resumen`,
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
      <p>
        Porcentaje de asistencia:{' '}
        <strong>
          {datos.porcentaje === null
            ? 'Sin registros'
            : `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(datos.porcentaje)} %`}
        </strong>
      </p>
      <p>
        {datos.asistidas} de {datos.registradas} clases con marca propia
        registrada.
      </p>
      <p className="dashboard__texto asistencia__nota">
        Las clases sin una marca registrada para ti no se cuentan como
        ausencias. Si detectas un error, comunícaselo a tu profesor.
      </p>
      <button className="asistencia__boton" type="button" onClick={recargar}>
        Actualizar asistencia
      </button>
      {datos.clases.length === 0 ? (
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
            {datos.clases.map((a) => (
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
