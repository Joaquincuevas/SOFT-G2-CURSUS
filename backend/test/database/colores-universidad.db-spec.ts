import { colorConContraste } from '@cursus/shared'
import { DataSource } from 'typeorm'
import { opcionesDataSource } from '../../src/database/data-source.js'
import { InicializarColoresUniversidad1792750000000 } from '../../src/database/migrations/1792750000000-InicializarColoresUniversidad.js'

const BD_TEST = `${process.env.POSTGRES_TEST_DB ?? 'cursus_test'}_colores`
let admin: DataSource
let bd: DataSource

beforeAll(async () => {
  admin = await new DataSource(opcionesDataSource()).initialize()
  await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
  await admin.query(`CREATE DATABASE "${BD_TEST}"`)
  bd = await new DataSource(opcionesDataSource(BD_TEST)).initialize()
  await bd.runMigrations()
})

afterAll(async () => {
  await bd?.destroy()
  if (admin?.isInitialized) {
    await admin.query(`DROP DATABASE IF EXISTS "${BD_TEST}" WITH (FORCE)`)
    await admin.destroy()
  }
})

it('inicializa colores distintos y accesibles, sin pisar los personalizados', async () => {
  await bd.query(`INSERT INTO universidad (nombre, dominio_correo, color)
    SELECT 'Universidad ' || i, 'universidad' || i || '.test',
           CASE WHEN i = 0 THEN '#6b2d84' ELSE '#1b4f72' END
      FROM generate_series(0, 9) i`)
  const q = bd.createQueryRunner()
  await q.startTransaction()
  try {
    const migracion = new InicializarColoresUniversidad1792750000000()
    await migracion.up(q)
    const colores = async () =>
      (await q.query(
        'SELECT dominio_correo AS dominio, color FROM universidad ORDER BY dominio_correo',
      )) as { dominio: string; color: string }[]
    const despues = await colores()
    expect(new Set(despues.map((u) => u.color)).size).toBe(10)
    expect(despues.every((u) => colorConContraste(u.color))).toBe(true)
    expect(despues.find((u) => u.dominio === 'universidad0.test')?.color).toBe(
      '#6b2d84',
    )
    // No vuelve a cambiar los tonos ya inicializados.
    await migracion.up(q)
    expect(await colores()).toEqual(despues)
    await migracion.down()
    expect(await colores()).toEqual(despues)
  } finally {
    await q.rollbackTransaction()
    await q.release()
  }
})
