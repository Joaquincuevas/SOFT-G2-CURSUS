import type { MigrationInterface, QueryRunner } from 'typeorm'

// NOT-04 (RN-12): auditoría de las notas. Cada propuesta, envío, aprobación,
// devolución y recorrección queda como un evento que no se modifica ni se
// borra (solo adición), igual que curso_cambio y asignacion_cambio.
//
// Columnas con la convención de las otras auditorías: responsable_id (quién
// hizo la acción) y fecha (cuándo).
//
// PROPUESTA y RECORRECCION son de la nota de un alumno; ENVIO, APROBACION y
// DEVOLUCION, de toda la evaluación (alumno_id nulo). El historial de una
// nota (NOT-16) une los eventos del alumno con los de su evaluación.
export class CrearNotaCambio1792570000000 implements MigrationInterface {
  name = 'CrearNotaCambio1792570000000'

  async up(q: QueryRunner): Promise<void> {
    // Las FKs compuestas (con las claves de CrearInscripcion y CrearEvaluacion)
    // aseguran que la evaluación, el alumno y el usuario sean de la misma
    // universidad que el evento.
    await q.query(`
      ALTER TABLE evaluacion
        ADD CONSTRAINT uq_evaluacion_id_universidad UNIQUE (id, universidad_id)
    `)
    await q.query(`
      CREATE TABLE nota_cambio (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        universidad_id uuid NOT NULL,
        evaluacion_id uuid NOT NULL,
        alumno_id uuid,
        tipo text NOT NULL,
        nota_anterior numeric(2,1),
        nota_nueva numeric(2,1),
        motivo text,
        responsable_id uuid NOT NULL,
        fecha timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT pk_nota_cambio PRIMARY KEY (id),
        CONSTRAINT fk_nota_cambio_evaluacion FOREIGN KEY (evaluacion_id, universidad_id)
          REFERENCES evaluacion (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_nota_cambio_alumno FOREIGN KEY (alumno_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT fk_nota_cambio_responsable FOREIGN KEY (responsable_id, universidad_id)
          REFERENCES usuario (id, universidad_id) ON DELETE RESTRICT,
        CONSTRAINT ck_nota_cambio_tipo CHECK (
          tipo IN ('PROPUESTA', 'ENVIO', 'APROBACION', 'DEVOLUCION', 'RECORRECCION')
        ),
        CONSTRAINT ck_nota_cambio_notas_rango CHECK (
          (nota_anterior IS NULL OR nota_anterior BETWEEN 1.0 AND 7.0)
          AND (nota_nueva IS NULL OR nota_nueva BETWEEN 1.0 AND 7.0)
        ),
        -- Alumno y notas según el tipo: los eventos de una nota llevan el
        -- alumno y la nota nueva (la recorrección, también la anterior); los
        -- de la evaluación no llevan ninguno.
        CONSTRAINT ck_nota_cambio_alcance CHECK (
          CASE tipo
            WHEN 'PROPUESTA' THEN alumno_id IS NOT NULL AND nota_nueva IS NOT NULL
              AND nota_anterior IS DISTINCT FROM nota_nueva
            WHEN 'RECORRECCION' THEN alumno_id IS NOT NULL
              AND nota_anterior IS NOT NULL AND nota_nueva IS NOT NULL
            ELSE alumno_id IS NULL AND nota_anterior IS NULL AND nota_nueva IS NULL
          END
        ),
        -- La devolución y la recorrección exigen motivo (NOT-12 y NOT-15).
        CONSTRAINT ck_nota_cambio_motivo CHECK (
          (motivo IS NULL OR length(btrim(motivo)) BETWEEN 1 AND 500)
          AND (tipo NOT IN ('DEVOLUCION', 'RECORRECCION') OR motivo IS NOT NULL)
        )
      )
    `)
    // Historial de una nota (NOT-16): sus eventos y los de su evaluación,
    // en orden cronológico (el id desempata eventos de la misma fecha).
    await q.query(`
      CREATE INDEX ix_nota_cambio_evaluacion_alumno_fecha
        ON nota_cambio (evaluacion_id, alumno_id, fecha, id)
    `)
    await q.query(`
      CREATE INDEX ix_nota_cambio_alumno ON nota_cambio (alumno_id, universidad_id)
    `)
    await q.query(`
      CREATE INDEX ix_nota_cambio_responsable
        ON nota_cambio (responsable_id, universidad_id)
    `)

    // Defensa adicional al GRANT: ni siquiera el dueño de la tabla modifica
    // ni borra un evento. (TRUNCATE no dispara triggers de fila; cursus_app no
    // tiene ese privilegio, y los tests usan TRUNCATE ... CASCADE para limpiar.)
    await q.query(`
      CREATE FUNCTION nota_cambio_inmutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'nota_cambio es de solo adición: no se puede %', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END;
      $$
    `)
    await q.query(`
      CREATE TRIGGER tg_nota_cambio_inmutable
        BEFORE UPDATE OR DELETE ON nota_cambio
        FOR EACH ROW EXECUTE FUNCTION nota_cambio_inmutable()
    `)

    // Solo adición: sin UPDATE ni DELETE para la API. Leen los eventos solo el
    // profesor y el ayudante de la universidad, y el Director los de todas
    // (solo lectura, ADR 0001): guardan propuestas de notas aún no publicadas,
    // que un alumno no debe ver ni a nivel de base. Igual que curso_cambio y
    // asignacion_cambio, la lectura se restringe por rol. El profesor y el
    // ayudante deben poder leer: registrar() hace INSERT ... RETURNING, y la
    // fila debe pasar también la política de SELECT. Insertan los mismos; qué
    // rol registra cada tipo lo valida cada tarjeta (NOT-05, 08, 11, 12 y 15).
    await q.query(`GRANT SELECT, INSERT ON nota_cambio TO cursus_app`)
    await q.query(`ALTER TABLE nota_cambio ENABLE ROW LEVEL SECURITY`)
    await q.query(`
      CREATE POLICY pol_nota_cambio_lectura ON nota_cambio
        FOR SELECT TO cursus_app
        USING ((universidad_id = universidad_actual()
                AND rol_actual() IN ('PROFESOR', 'AYUDANTE'))
               OR rol_actual() = 'DIRECTOR')
    `)
    await q.query(`
      CREATE POLICY pol_nota_cambio_insercion ON nota_cambio
        FOR INSERT TO cursus_app
        WITH CHECK (universidad_id = universidad_actual()
                    AND rol_actual() IN ('PROFESOR', 'AYUDANTE'))
    `)
  }

  async down(q: QueryRunner): Promise<void> {
    // Al borrar la tabla se borran sus índices, trigger y políticas.
    await q.query('DROP TABLE nota_cambio')
    await q.query('DROP FUNCTION nota_cambio_inmutable()')
    await q.query(
      'ALTER TABLE evaluacion DROP CONSTRAINT uq_evaluacion_id_universidad',
    )
  }
}
