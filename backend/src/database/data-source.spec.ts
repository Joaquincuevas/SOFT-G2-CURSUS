import { expect, test } from 'vitest'
import { CrearSilabo1792760000000 } from './migrations/1792760000000-CrearSilabo.js'
import { opcionesDataSource } from './data-source.js'

test('registra la migración del sílabo en el data source', () => {
  expect(opcionesDataSource().migrations).toContain(CrearSilabo1792760000000)
})
