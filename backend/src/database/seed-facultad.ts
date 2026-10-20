import type { BloqueHorario } from '@cursus/shared'
import type { EntityManager } from 'typeorm'

// GES-20 completa la facultad que usa el Administrativo de Ingeniería.
// Incluye los dos cursos originales; sus nombres y datos editados se conservan.
export const FACULTAD_DEMO = 'Facultad de Ingeniería'
export const DOMINIO_DEMO = 'norte.cursus.test'
export const CARRERAS_DEMO = [
  {
    nombre: 'Ingeniería Civil en Informática',
    cursos: [
      { codigo: 'ICC101', nombre: 'Introducción a la Programación' },
      { codigo: 'ICC201', nombre: 'Estructuras de Datos' },
      { codigo: 'ICC202', nombre: 'Bases de Datos' },
      { codigo: 'ICC203', nombre: 'Redes de Computadores' },
      { codigo: 'ICC204', nombre: 'Ingeniería de Software' },
    ],
  },
  {
    nombre: 'Ingeniería Civil Industrial',
    cursos: [
      { codigo: 'ICI101', nombre: 'Introducción a la Ingeniería Industrial' },
      { codigo: 'ICI201', nombre: 'Investigación de Operaciones' },
      { codigo: 'ICI202', nombre: 'Gestión de Operaciones' },
      { codigo: 'ICI203', nombre: 'Evaluación de Proyectos' },
      { codigo: 'ICI204', nombre: 'Gestión de la Calidad' },
    ],
  },
  {
    nombre: 'Ingeniería Civil Eléctrica',
    cursos: [
      { codigo: 'IEL101', nombre: 'Introducción a la Ingeniería Eléctrica' },
      { codigo: 'IEL201', nombre: 'Circuitos Eléctricos' },
      { codigo: 'IEL202', nombre: 'Electrónica' },
      { codigo: 'IEL203', nombre: 'Sistemas de Control' },
      { codigo: 'IEL204', nombre: 'Sistemas de Energía' },
    ],
  },
] as const

const HORAS = [
  ['08:30', '09:20'],
  ['09:30', '10:20'],
  ['10:30', '11:20'],
  ['11:30', '12:20'],
  ['14:00', '14:50'],
  ['15:00', '15:50'],
] as const
const DIAS = [1, 2, 3, 4, 5] as const

function bloquesDe(indiceCurso: number, numero: number): BloqueHorario[] {
  // Dos encuentros semanales. Cada curso ocupa dos intervalos propios de
  // lunes a viernes; sus secciones coinciden en hora, con salas distintas.
  return [indiceCurso, indiceCurso + 15].map((indice) => ({
    dia: DIAS[Math.floor(indice / HORAS.length)],
    inicio: HORAS[indice % HORAS.length][0],
    termino: HORAS[indice % HORAS.length][1],
    sala: `ING-10${numero}`,
  }))
}

export interface ResumenFacultad {
  carreras: number
  cursos: number
  secciones: number
}

// Recibe el mismo manager de la transacción del seed base: una falla revierte
// también carreras, cursos y usuarios creados en esta ejecución.
export async function sembrarFacultadCompleta(
  m: EntityManager,
  correosDemo: string[],
): Promise<ResumenFacultad> {
  const [contexto] = await m.query<
    { universidad: string; facultad: string; periodo: string }[]
  >(
    `SELECT u.id AS universidad, f.id AS facultad, p.id AS periodo
       FROM universidad u JOIN facultad f ON f.universidad_id = u.id
       JOIN periodo p ON p.universidad_id = u.id AND p.activo
      WHERE u.dominio_correo = $1 AND f.nombre = $2
        AND u.archived_at IS NULL AND f.archived_at IS NULL
      FOR UPDATE OF f`,
    [DOMINIO_DEMO, FACULTAD_DEMO],
  )
  if (!contexto)
    throw new Error('La facultad demo no tiene un período activo vigente')
  const { universidad, facultad, periodo } = contexto
  const usuarios = await m.query<{ id: string; rol: string }[]>(
    `SELECT id, rol FROM usuario
      WHERE universidad_id = $1 AND facultad_id = $2
        AND correo = ANY($3::text[]) AND archived_at IS NULL
      ORDER BY correo`,
    [universidad, facultad, correosDemo],
  )
  const deRol = (rol: string) =>
    usuarios.filter((u) => u.rol === rol).map((u) => u.id)
  const profesores = deRol('PROFESOR')
  const ayudantes = deRol('AYUDANTE')
  const alumnos = deRol('ALUMNO')

  for (const [indiceCarrera, carrera] of CARRERAS_DEMO.entries()) {
    // La búsqueda normalizada sigue la unicidad de GES-01. Una carrera
    // archivada no se recrea ni se desarchiva.
    await m.query(
      `INSERT INTO carrera (universidad_id, facultad_id, nombre)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [universidad, facultad, carrera.nombre],
    )
    const [guardada] = await m.query<
      { id: string; archived_at: Date | null }[]
    >(
      `SELECT id, archived_at FROM carrera WHERE facultad_id = $1
        AND lower(btrim(regexp_replace(nombre, '[[:space:]]+', ' ', 'g'))) = lower($2)`,
      [facultad, carrera.nombre],
    )
    if (guardada.archived_at) continue

    for (const [indice, curso] of carrera.cursos.entries()) {
      await m.query(
        `INSERT INTO curso (universidad_id, carrera_id, periodo_id, codigo, nombre)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (codigo, periodo_id) DO NOTHING`,
        [universidad, guardada.id, periodo, curso.codigo, curso.nombre],
      )
      const [existente] = await m.query<
        { id: string; carrera_id: string; archived_at: Date | null }[]
      >(
        `SELECT id, carrera_id, archived_at FROM curso
          WHERE universidad_id = $1 AND periodo_id = $2 AND codigo = $3 FOR UPDATE`,
        [universidad, periodo, curso.codigo],
      )
      if (existente.carrera_id !== guardada.id) {
        throw new Error(
          `El código demo ${curso.codigo} ya pertenece a otra carrera en el período activo`,
        )
      }
      if (existente.archived_at) continue

      for (const numero of [1, 2]) {
        await m.query(
          `INSERT INTO seccion (universidad_id, curso_id, numero)
           VALUES ($1, $2, $3) ON CONFLICT (curso_id, numero) DO NOTHING`,
          [universidad, existente.id, numero],
        )
        // Solo inicializar secciones vacías, sin historial. horario_version
        // permite distinguir también un horario que el usuario quitó entero.
        const [seccion] = await m.query<{ id: string }[]>(
          `SELECT s.id FROM seccion s WHERE s.curso_id = $1 AND s.numero = $2
            AND s.archived_at IS NULL AND s.profesor_id IS NULL AND s.horario_version = 0
            AND NOT EXISTS (SELECT 1 FROM horario_seccion h WHERE h.seccion_id = s.id)
            AND NOT EXISTS (SELECT 1 FROM ayudante_seccion a WHERE a.seccion_id = s.id)
            AND NOT EXISTS (SELECT 1 FROM inscripcion i WHERE i.seccion_id = s.id)
            FOR UPDATE OF s`,
          [existente.id, numero],
        )
        if (!seccion) continue
        if (
          profesores.length < 2 ||
          ayudantes.length < 4 ||
          alumnos.length < 6
        ) {
          throw new Error(
            'Faltan usuarios demo vigentes para completar las secciones',
          )
        }
        const indiceCurso = indiceCarrera * 5 + indice
        const bloques = bloquesDe(indiceCurso, numero)
        for (const bloque of bloques) {
          const [ocupada] = await m.query<{ id: string }[]>(
            `SELECT h.id FROM horario_seccion h
              JOIN seccion s ON s.id = h.seccion_id
              JOIN curso c ON c.id = s.curso_id
             WHERE h.universidad_id = $1 AND c.periodo_id = $2
               AND h.archived_at IS NULL AND s.archived_at IS NULL AND c.archived_at IS NULL
               AND lower(btrim(h.sala)) = lower($3) AND h.dia = $4
               AND h.inicio < $6::time AND h.termino > $5::time LIMIT 1`,
            [
              universidad,
              periodo,
              bloque.sala,
              bloque.dia,
              bloque.inicio,
              bloque.termino,
            ],
          )
          if (ocupada) {
            throw new Error(
              `La sala ${bloque.sala} ya está ocupada en un bloque de la demo; no se modificaron los datos`,
            )
          }
          await m.query(
            `INSERT INTO horario_seccion (universidad_id, seccion_id, dia, inicio, termino, sala)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              universidad,
              seccion.id,
              bloque.dia,
              bloque.inicio,
              bloque.termino,
              bloque.sala,
            ],
          )
        }
        await m.query(
          `UPDATE seccion SET profesor_id = $2, horario_version = 1 WHERE id = $1`,
          [
            seccion.id,
            profesores[(indiceCurso + numero - 1) % profesores.length],
          ],
        )
        await m.query(
          `INSERT INTO ayudante_seccion (universidad_id, seccion_id, usuario_id)
           SELECT $1, $2, unnest($3::uuid[])`,
          [
            universidad,
            seccion.id,
            ayudantes.slice((numero - 1) * 2, numero * 2),
          ],
        )
        const deLaCarrera = alumnos.filter((_, i) => i % 3 === indiceCarrera)
        const inscritos = deLaCarrera.filter((_, i) => i % 2 === numero - 1)
        await m.query(
          `INSERT INTO inscripcion (universidad_id, seccion_id, usuario_id)
           SELECT $1, $2, unnest($3::uuid[])`,
          [universidad, seccion.id, inscritos],
        )
      }
    }
  }
  const [resumen] = await m.query<ResumenFacultad[]>(
    `SELECT count(DISTINCT ca.id)::int AS carreras, count(DISTINCT c.id)::int AS cursos,
            count(s.id)::int AS secciones
       FROM carrera ca
       LEFT JOIN curso c ON c.carrera_id = ca.id AND c.periodo_id = $2 AND c.archived_at IS NULL
       LEFT JOIN seccion s ON s.curso_id = c.id AND s.archived_at IS NULL
      WHERE ca.facultad_id = $1 AND ca.archived_at IS NULL`,
    [facultad, periodo],
  )
  return resumen
}
