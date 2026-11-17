import { readFileSync } from 'node:fs'
import { MAX_FILAS_ALUMNOS_CSV } from '@cursus/shared'
import { leerCsvAlumnos } from '../gestion/csv-alumnos.js'
import { CARRERAS_DEMO } from './seed-facultad.js'
import {
  FACULTADES_DEMO,
  fechasEvaluaciones,
  hoyEnChile,
  PERIODOS_CERRADOS,
  TRAYECTORIA,
  usuariosExtraDeDemo,
} from './seed-demo.js'
import { verificarReinicio } from './seed-reinicio.js'
import { UNIVERSIDADES, usuariosDeDemo } from './seed.js'

// Todos los correos del seed (usuarios fijos, GES-22 y la capa de demo).
const CORREOS_SEED = new Set(
  UNIVERSIDADES.flatMap((u, i) =>
    [
      ...u.usuarios,
      ...usuariosDeDemo(i),
      ...usuariosExtraDeDemo(u.dominio),
    ].map((usuario) => `${usuario.usuario}@${u.dominio}`),
  ),
)

describe('usuariosExtraDeDemo', () => {
  describe.each(UNIVERSIDADES.map((u) => [u.dominio] as const))(
    '%s',
    (dominio) => {
      const extra = usuariosExtraDeDemo(dominio)

      it('agrega la cantidad indicada de cada rol en cada facultad', () => {
        for (const f of FACULTADES_DEMO.filter((f) => f.dominio === dominio)) {
          for (const [rol, cantidad] of Object.entries(f.extra)) {
            expect(
              extra.filter((u) => u.facultad === f.facultad && u.rol === rol),
            ).toHaveLength(cantidad)
          }
        }
      })

      it('usa nombre y dos apellidos distintos, con un correo sin tildes', () => {
        for (const u of extra) {
          const [, primero, segundo] = u.nombre.split(' ')
          expect(u.nombre).toMatch(/^\S+ \S+ \S+$/)
          expect(primero).not.toBe(segundo)
          expect(u.usuario).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/)
        }
      })

      it('genera siempre las mismas personas', () => {
        expect(usuariosExtraDeDemo(dominio)).toEqual(extra)
      })
    },
  )

  it('no repite correos con los demás usuarios del seed', () => {
    const total = UNIVERSIDADES.reduce(
      (n, u, i) =>
        n +
        u.usuarios.length +
        usuariosDeDemo(i).length +
        usuariosExtraDeDemo(u.dominio).length,
      0,
    )
    expect(CORREOS_SEED.size).toBe(total)
  })
})

describe('calendario de la demo', () => {
  it('cada período cerrado es anterior al siguiente y al activo (2026-2)', () => {
    const fechas = PERIODOS_CERRADOS.flatMap((p) => [p.inicio, p.termino])
    expect([...fechas].sort()).toEqual(fechas)
    expect(fechas.at(-1)! < '2026-08-03').toBe(true)
  })

  it('las evaluaciones van en orden y dentro del período, fuera del receso', () => {
    for (const p of PERIODOS_CERRADOS) {
      const fechas = fechasEvaluaciones(p)
      expect([...fechas].sort()).toEqual(fechas)
      expect(fechas[0] > p.inicio && fechas.at(-1)! < p.termino).toBe(true)
      // El receso dura de lunes a viernes.
      const finReceso = new Date(Date.parse(p.receso) + 4 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10)
      for (const f of fechas) {
        expect(f < p.receso || f > finReceso).toBe(true)
      }
    }
  })

  it('la trayectoria de los usuarios fijos usa cursos de Ingeniería', () => {
    const codigos = new Set(
      CARRERAS_DEMO.flatMap((c) => c.cursos.map((curso) => curso.codigo)),
    )
    for (const t of Object.values(TRAYECTORIA)) {
      for (const codigo of [
        ...t.alumno,
        ...t.profesor,
        ...t.coprofesor,
        ...t.ayudante,
      ]) {
        expect(codigos.has(codigo)).toBe(true)
      }
    }
  })

  it('calcula la fecha de hoy en hora de Chile', () => {
    // 02:00 UTC del 17 de noviembre todavía es el 16 en Chile (UTC-3).
    expect(hoyEnChile(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16')
  })
})

describe('verificarReinicio', () => {
  it('exige SEED_RESET=true', () => {
    expect(() => verificarReinicio({})).toThrow(/SEED_RESET=true/)
    expect(() => verificarReinicio({ SEED_RESET: '1' })).toThrow(
      /SEED_RESET=true/,
    )
  })

  it('nunca corre sobre la base de producción', () => {
    expect(() =>
      verificarReinicio({
        SEED_RESET: 'true',
        POSTGRES_DB: 'cursus_production',
      }),
    ).toThrow(/producción/)
  })

  it('acepta una base de pruebas con autorización explícita', () => {
    expect(() =>
      verificarReinicio({ SEED_RESET: 'true', POSTGRES_DB: 'cursus_staging' }),
    ).not.toThrow()
  })
})

describe('CSV de alumnos de la demo', () => {
  const texto = readFileSync(
    new URL('../../../docs/demo/alumnos-seccion-nueva.csv', import.meta.url),
    'utf8',
  )
  const filas = leerCsvAlumnos(texto)

  it('cumple el formato de GES-16', () => {
    expect(filas.length).toBeGreaterThan(30)
    expect(filas.length).toBeLessThanOrEqual(MAX_FILAS_ALUMNOS_CSV)
    for (const { celdas } of filas) {
      expect(celdas).toHaveLength(2)
      expect(celdas[0]).toMatch(/^[a-z]+\.[a-z]+@norte\.cursus\.test$/)
      expect(celdas[1]).toMatch(/^\S+ \S+ \S+$/)
    }
  })

  it('solo trae cuentas nuevas, sin repetir correos', () => {
    const correos = filas.map((f) => f.celdas[0])
    expect(new Set(correos).size).toBe(correos.length)
    for (const correo of correos) {
      expect(CORREOS_SEED.has(correo)).toBe(false)
    }
  })
})
