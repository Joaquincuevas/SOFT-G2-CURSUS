import type { PendienteRevision } from '@cursus/shared'
import { Fragment, useState } from 'react'
import { Cargando } from '../components/Cargando'
import { ErrorEstado } from '../components/ErrorEstado'
import { NotasDeEvaluacion } from './NotasDeEvaluacion'
import './Dashboard.css'
import './PestanaNotas.css'
import { RUTA_PENDIENTES_REVISION, textoSinNota } from './misSecciones'
import { useDatos } from './useDatos'

// NOT-10: evaluaciones enviadas a revisión en las secciones del profesor, de
// la más antigua a la más nueva. Al abrir una se ven todas las notas
// propuestas en solo lectura y aprobarlas y publicarlas (NOT-11) o
// devolverlas al ayudante con un comentario (NOT-12).
export function PendientesRevision() {
  const [pendientes, recargar, status] = useDatos<PendienteRevision[]>(
    RUTA_PENDIENTES_REVISION,
  )
  const [abierta, setAbierta] = useState<PendienteRevision | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <section className="notas" aria-label="Pendientes de revisión">
      <h2 className="dashboard__titulo">Evaluaciones pendientes de revisión</h2>
      {/* Fuera de la lista: sigue visible cuando la recarga la saca. */}
      {aviso && (
        <p className="notas__aviso" role="status">
          {aviso}
        </p>
      )}
      {pendientes === undefined ? (
        <Cargando texto="Cargando pendientes…" />
      ) : pendientes === null && status === 403 ? (
        // La ruta está bajo Mis Cursos, que ven todos los roles: reintentar
        // no cambiaría el 403.
        <p className="dashboard__texto">
          Solo el profesor ve las evaluaciones pendientes de revisión.
        </p>
      ) : pendientes === null ? (
        <ErrorEstado
          mensaje="No pudimos cargar las evaluaciones pendientes."
          onReintentar={recargar}
        />
      ) : pendientes.length === 0 ? (
        <p className="dashboard__texto">
          No tienes evaluaciones pendientes de revisión.
        </p>
      ) : (
        <table className="notas__tabla">
          <thead>
            <tr>
              <th scope="col">Curso</th>
              <th scope="col">Sección</th>
              <th scope="col">Evaluación</th>
              <th scope="col">Ayudante</th>
              <th scope="col">Enviada</th>
              <th scope="col">Notas</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((p) => {
              const esAbierta = abierta?.evaluacion.id === p.evaluacion.id
              return (
                <Fragment key={p.evaluacion.id}>
                  <tr>
                    <td>
                      {p.curso.codigo} {p.curso.nombre}
                    </td>
                    <td>{p.seccion.numero}</td>
                    <td>
                      {p.evaluacion.nombre}
                      {/* NOT-08: alumnos inscritos después del envío. */}
                      {p.sinNota > 0 && (
                        <small> ({textoSinNota(p.sinNota)})</small>
                      )}
                    </td>
                    <td>{p.ayudante?.nombre ?? '—'}</td>
                    <td>
                      {p.enviadaEl
                        ? new Date(p.enviadaEl).toLocaleString('es-CL', {
                            dateStyle: 'long',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="notas__enlace"
                        aria-pressed={esAbierta}
                        aria-label={`Notas de ${p.evaluacion.nombre} (${p.curso.codigo}, sección ${p.seccion.numero})`}
                        onClick={() => {
                          setAviso(null)
                          setAbierta(esAbierta ? null : p)
                        }}
                      >
                        {esAbierta ? 'Ocultar' : 'Ver notas'}
                      </button>
                    </td>
                  </tr>
                  {/* Las notas se abren bajo su fila, no al final de la lista. */}
                  {esAbierta && (
                    <tr>
                      <td colSpan={6}>
                        <NotasDeEvaluacion
                          seccionId={p.seccion.id}
                          evaluacionId={p.evaluacion.id}
                          // Aprobada o devuelta (o ya no pendiente): se
                          // cierra y la recarga la saca de la lista.
                          alRevisar={(texto) => {
                            setAviso(`${p.evaluacion.nombre}: ${texto}`)
                            setAbierta(null)
                            recargar()
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
