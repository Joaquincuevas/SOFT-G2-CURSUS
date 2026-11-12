import type { MisNotasSeccion } from '@cursus/shared'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import './PestanaNotas.css'
import { FORMATO_NOTA, textoNotaFinal } from './nota-final'
import { useDatos } from './useDatos'

// NOT-13 (RE-02): el alumno ve, en la pestaña Notas de la sección, cada
// evaluación con su fecha, ponderación y su nota si ya está publicada. Las
// notas propuestas (en borrador, en revisión o devueltas) no se muestran.
// NOT-14: arriba, su nota final o parcial, calculada en el backend.
// Si el frontend se despliega antes que el backend, mis-notas aún no trae
// notaFinal: se omite el resumen y la tabla sigue disponible.
type RespuestaMisNotas = Omit<MisNotasSeccion, 'notaFinal'> &
  Partial<Pick<MisNotasSeccion, 'notaFinal'>>

export function MisNotas({ seccionId }: { seccionId: string }) {
  const [datos, recargar] = useDatos<RespuestaMisNotas>(
    `/api/espacio/secciones/${seccionId}/mis-notas`,
  )

  return (
    <section className="notas" aria-label="Mis notas">
      <h3 className="vista-seccion__subtitulo">Mis notas</h3>
      {datos === undefined ? (
        <Cargando texto="Cargando mis notas…" />
      ) : datos === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar tus notas."
          onReintentar={recargar}
        />
      ) : datos.evaluaciones.length === 0 ? (
        <p className="dashboard__texto">Aún no hay evaluaciones</p>
      ) : (
        <RegistroMisNotas datos={datos} />
      )}
    </section>
  )
}

export function RegistroMisNotas({ datos }: { datos: RespuestaMisNotas }) {
  return (
    <>
      {datos.notaFinal && (
        <p
          className="notas__final"
          aria-label="Nota del curso"
          data-tipo={datos.notaFinal.tipo}
        >
          {textoNotaFinal(datos.notaFinal)}
        </p>
      )}
      <table className="notas__tabla" aria-label="Mis notas por evaluación">
        <thead>
          <tr>
            <th scope="col">Evaluación</th>
            <th scope="col">Fecha</th>
            <th scope="col">Ponderación</th>
            <th scope="col">Nota</th>
          </tr>
        </thead>
        <tbody>
          {datos.evaluaciones.map((evaluacion) => (
            <tr key={evaluacion.evaluacionId}>
              <td>{evaluacion.nombre}</td>
              <td>{evaluacion.fecha}</td>
              <td>{evaluacion.ponderacion} %</td>
              <td>
                {evaluacion.nota === null
                  ? 'Sin publicar'
                  : FORMATO_NOTA.format(evaluacion.nota)}
                {evaluacion.nota !== null && evaluacion.recorregida && (
                  <span className="notas__recorregida">Recorregida</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
