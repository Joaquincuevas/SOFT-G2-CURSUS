import type { MigrationInterface, QueryRunner } from 'typeorm'

// MET-01: la regla de la nota final de NOT-14 (calcularNotaFinal, en
// backend/src/notas/nota-final.ts) también en SQL, para los indicadores que
// se calculan en la base (MET-01 a MET-08). Misma aritmética: décimas con
// enteros, promedio ponderado sobre el porcentaje evaluado y redondeo a la
// décima más cercana con la mitad hacia arriba. FINAL solo si todas las
// evaluaciones tienen nota y las ponderaciones suman 100. Es una función
// pura: recibe las ponderaciones y las notas publicadas (null si falta) de
// las evaluaciones activas de una sección, en el mismo orden.
export class CalcularNotaFinal1792930000000 implements MigrationInterface {
  name = 'CalcularNotaFinal1792930000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION public.nota_final(ponderaciones integer[], notas numeric[])
      RETURNS TABLE (tipo text, nota numeric, porcentaje_evaluado integer)
      LANGUAGE sql IMMUTABLE AS $$
        WITH evaluacion AS (
          SELECT p, n FROM unnest(ponderaciones, notas) AS t(p, n)
        ), suma AS (
          SELECT count(*) AS cantidad,
                 coalesce(sum(p), 0)::bigint AS total,
                 coalesce(sum(p) FILTER (WHERE n IS NOT NULL), 0)::bigint AS evaluado,
                 coalesce(sum(round(n * 10)::bigint * p) FILTER (WHERE n IS NOT NULL), 0)::bigint AS decimas
            FROM evaluacion
        )
        SELECT CASE WHEN cantidad > 0 AND evaluado = total AND total = 100
                    THEN 'FINAL' ELSE 'PARCIAL' END,
               CASE WHEN evaluado = 0 THEN NULL
                    ELSE round(((2 * decimas + evaluado) / (2 * evaluado))::numeric / 10, 1) END,
               evaluado::integer
          FROM suma
      $$;
      REVOKE ALL ON FUNCTION public.nota_final(integer[], numeric[]) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.nota_final(integer[], numeric[]) TO cursus_app;
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP FUNCTION public.nota_final(integer[], numeric[])')
  }
}
