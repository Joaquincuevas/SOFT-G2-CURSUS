import { MAX_BYTES_ALUMNOS_CSV, MAX_FILAS_ALUMNOS_CSV } from '@cursus/shared'
import { leerCsvAlumnos } from './csv-alumnos.js'

describe('CSV de alumnos', () => {
  it('lee BOM, CRLF, comas y comillas escapadas', () => {
    expect(
      leerCsvAlumnos(
        '\uFEFFcorreo,nombre\r\na@u.cl,"Pérez, Ana ""María"""\r\n',
      ),
    ).toEqual([{ fila: 2, celdas: ['a@u.cl', 'Pérez, Ana "María"'] }])
  })
  it('admite saltos dentro de comillas, ignora líneas vacías y conserva números de línea', () => {
    expect(
      leerCsvAlumnos('correo,nombre\n\na@u.cl,"Ana\nMaría"\nb@u.cl,\n'),
    ).toEqual([
      { fila: 3, celdas: ['a@u.cl', 'Ana\nMaría'] },
      { fila: 5, celdas: ['b@u.cl', ''] },
    ])
  })
  it('acepta fin de archivo sin salto y CR como separador de línea', () => {
    expect(leerCsvAlumnos('correo,nombre\ra@u.cl,Ana')).toEqual([
      { fila: 2, celdas: ['a@u.cl', 'Ana'] },
    ])
  })
  it.each([
    '',
    'correo,nombre\n',
    'nombre,correo\nAna,a@u.cl',
    'correo;nombre\na@u.cl;Ana',
    'correo,nombre,extra\na@u.cl,Ana,x',
    'correo,nombre\na@u.cl,"Ana',
    'correo,nombre\na@u.cl,A"na',
    'correo,nombre\na@u.cl,"Ana"x',
  ])('rechaza estructura inválida antes de procesar: %j', (csv) => {
    expect(() => leerCsvAlumnos(csv)).toThrow()
  })
  it('deja una fila de columnas incorrectas al validador por fila', () => {
    expect(
      leerCsvAlumnos('correo,nombre\na@u.cl,Ana,extra')[0].celdas,
    ).toHaveLength(3)
  })
  it('limita filas y mide tamaño UTF-8 real', () => {
    const cabecera = 'correo,nombre\n'
    expect(
      leerCsvAlumnos(cabecera + 'a@u.cl,Ana\n'.repeat(MAX_FILAS_ALUMNOS_CSV)),
    ).toHaveLength(MAX_FILAS_ALUMNOS_CSV)
    expect(() =>
      leerCsvAlumnos(
        cabecera + 'a@u.cl,Ana\n'.repeat(MAX_FILAS_ALUMNOS_CSV + 1),
      ),
    ).toThrow('hasta')
    expect(() =>
      leerCsvAlumnos(cabecera + 'ñ'.repeat(MAX_BYTES_ALUMNOS_CSV / 2)),
    ).toThrow('48 KiB')
  })
})
