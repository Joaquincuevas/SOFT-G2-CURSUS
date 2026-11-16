import { ZONA_HORARIA_UNIVERSIDAD } from '@cursus/shared'
import { formatearFecha } from '@/lib/fechas'

// MAT-08: la misma regla que aplica el backend al crear una actividad
// (actividades.service.ts), para avisar antes de enviar:
//   1. la fecha límite está dentro del período del curso
//      (fecha_inicio ≤ fecha ≤ fecha_termino), y
//   2. la fecha y hora límite, leídas en America/Santiago, son posteriores a
//      la hora actual.
// Ventana válida de días = [max(hoy, inicio del período), fin del período].
// Las fechas van como texto AAAA-MM-DD, en la zona de la universidad.

export interface PeriodoDeFechas {
  fechaInicio: string
  fechaTermino: string
}

export interface Ventana {
  desde: string
  hasta: string
}

// «2026-11-15» y «14:05» de un instante, en la zona de la universidad.
export function enZona(instante: Date): { fecha: string; hora: string } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_HORARIA_UNIVERSIDAD,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instante)
      .map((parte) => [parte.type, parte.value]),
  )
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  }
}

const diaSiguiente = (fecha: string) => {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const siguiente = new Date(Date.UTC(anio, mes - 1, dia + 1))
  return siguiente.toISOString().slice(0, 10)
}

// Días en que se puede fijar el plazo, o null si no queda ninguno (el período
// terminó). Si hoy ya pasó el último minuto (23:59), la ventana empieza mañana.
export function ventanaActividad(
  periodo: PeriodoDeFechas,
  ahora: Date,
): Ventana | null {
  const hoy = enZona(ahora)
  const primerDiaUtil =
    hoy.hora >= '23:59' ? diaSiguiente(hoy.fecha) : hoy.fecha
  const desde =
    primerDiaUtil > periodo.fechaInicio ? primerDiaUtil : periodo.fechaInicio
  const hasta = periodo.fechaTermino
  return desde <= hasta ? { desde, hasta } : null
}

// Primer minuto válido de un día: sin restricción (00:00) salvo hoy, en que
// debe ser posterior a la hora actual (el minuto siguiente).
export function horaMinima(fecha: string, ahora: Date): string {
  const hoy = enZona(ahora)
  if (fecha !== hoy.fecha) return '00:00'
  const [hora, minuto] = hoy.hora.split(':').map(Number)
  const total = hora * 60 + minuto + 1
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export interface ErroresPlazo {
  fecha?: string
  hora?: string
}

// Un error por campo; nunca dos que se contradigan. Si la fecha no sirve, no
// se opina sobre la hora.
export function validarPlazo(
  fecha: string,
  hora: string,
  ventana: Ventana | null,
  ahora: Date,
): ErroresPlazo {
  if (!fecha) return { fecha: 'Elige la fecha límite.' }
  if (ventana && (fecha < ventana.desde || fecha > ventana.hasta)) {
    return {
      fecha: `La fecha límite debe estar entre el ${formatearFecha(ventana.desde)} y el ${formatearFecha(ventana.hasta)}.`,
    }
  }
  if (!hora) return { hora: 'Elige la hora límite.' }
  const minima = horaMinima(fecha, ahora)
  if (hora < minima) {
    return {
      hora: `Para hoy, la hora límite debe ser desde las ${minima}.`,
    }
  }
  return {}
}

// Aviso del período terminado, con la fecha en dd-mm-aaaa.
export const textoPeriodoTerminado = (
  periodo: PeriodoDeFechas & { anio: number; semestre: number },
) =>
  `El período ${periodo.anio}-${periodo.semestre} terminó el ${formatearFecha(periodo.fechaTermino)}. No se pueden crear actividades nuevas en este curso.`

// Los mensajes del backend traen las fechas en ISO («del 2026-08-03 al
// 2026-12-18»): se muestran en dd-mm-aaaa.
export const fechasLegibles = (mensaje: string) =>
  mensaje.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => formatearFecha(iso))
