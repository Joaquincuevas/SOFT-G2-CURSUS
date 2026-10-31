# NOT-06: se rechazan las notas fuera de la escala 1,0 a 7,0

Tarjeta: [F4 · NOT-06](https://trello.com/c/EHOZMFF3). Depende de NOT-05 (ingreso de notas del ayudante), ya integrada en `develop`.

**Como** ayudante, **quiero** que se rechacen las notas fuera de la escala 1,0 a 7,0, **para** evitar errores de digitación.

## Regla

Una nota válida es un **número de 1,0 a 7,0 con a lo más un decimal**. La regla vive en `@cursus/shared` (`motivoNotaInvalida`, `esNotaValida` y `MENSAJES_NOTA_INVALIDA`) y la usan la interfaz, el DTO del PUT, el servicio y la auditoría (NOT-04).

| Valor                            | Resultado                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `1`, `4.5`, `7`                  | Válida                                                                               |
| `0.9`, `7.1`, `8`                | **Fuera de rango:** "Fuera de rango: la nota va de 1,0 a 7,0"                        |
| `5.55`, `"x"`, `""`              | **Formato inválido:** "Formato inválido: escribe un número con un decimal, como 5,5" |
| `null`, ausente, `"5.5"` (texto) | Formato inválido (la API exige un número)                                            |

Primero se revisa el formato y después el rango: `9.99` es un formato inválido.

## Interfaz

En la tabla de notas del ayudante (NOT-05), cada campo se valida **al escribir**:

- Acepta **coma o punto** como separador decimal: "5,5" y "5.5" son la misma nota. Un separador al final ("5,") se lee como el entero, para no marcar un error a mitad de escribir "5,5". El campo es de texto (`inputMode="decimal"`): un campo `number` descarta la coma en algunos navegadores.
- Un valor inválido se marca **en rojo** (`aria-invalid` y borde de error) con su motivo debajo, ligado al campo con `aria-describedby`. El contenedor del motivo está siempre montado con `aria-live="polite"`, así que un lector de pantalla lo anuncia mientras se escribe, y tiene un ancho máximo para que la columna no salte.
- **Guardar notas se deshabilita mientras haya una nota inválida**, aunque otras sean válidas: no se guarda ninguna.
- Un campo vacío no es un error: no se envía y no borra la nota guardada (NOT-05).
- Si el backend responde 400 con `invalidas`, marca esos campos con el motivo que trae, además del mensaje "Nota inválida.". La marca de un campo se quita al editarlo.

## API

`PUT /api/espacio/secciones/:id/evaluaciones/:evaluacionId/notas` (NOT-05) valida cada nota **en el DTO** (`GuardarNotasDto`, con el validador `@EsNota()`). Si alguna no es válida responde:

```json
{
  "statusCode": 400,
  "message": "Nota inválida",
  "invalidas": [
    { "alumnoId": "…", "motivo": "Fuera de rango: la nota va de 1,0 a 7,0" }
  ]
}
```

- `invalidas` trae **solo las notas inválidas, en el orden de la lista**, con el `alumnoId` tal como vino. Tipo: `ErrorNotasInvalidas` en `@cursus/shared`.
- **Una lista con alguna nota inválida no guarda ninguna nota ni deja eventos en `nota_cambio`**: el pipe responde antes de llegar al servicio.
- Si el cuerpo tiene además otro error (un `alumnoId` que no es UUID, un campo extra, `notas` que no es una lista, una fila que no es un objeto o una lista de listas, más de 500 notas), responde el 400 de validación de siempre, con `message` como lista y sin `invalidas`.

## Decisiones

- **Un `ValidationPipe` propio para el cuerpo del PUT** (`validarGuardarNotas` en `guardar-notas.dto.ts`), con las mismas opciones que el global (`OPCIONES_VALIDACION`, exportadas desde `configurar-app.ts` para que no se desalineen) y un `exceptionFactory` que arma `invalidas`. El controlador tipa el cuerpo con la interfaz `GuardarNotas`: el pipe global no valida una interfaz (su metatipo es `Object`), así que no responde antes con su formato genérico. El formato de error de los demás endpoints no cambia.
- **El servicio vuelve a revisar con `esNotaValida`** antes de escribir y responde el 400 "Nota inválida" de NOT-05. No es redundante: es la última barrera antes de la base si un cuerpo llega sin pasar por el pipe. Por la misma razón el DTO exige que cada fila sea un objeto (`@IsObject({ each: true })`).
- **Sin cambios en la migración ni en la RLS.** `ck_nota_valor` exige el rango, pero `numeric(2,1)` redondea antes del `CHECK` (5,55 quedaría como 5,6). Por eso el decimal lo exigen el DTO y el servicio, y la auditoría (NOT-04) rechaza un valor con más de un decimal antes de escribir.

## Verificación

Desde la raíz, con Node 24.15+, dependencias instaladas y PostgreSQL disponible:

```bash
npm run lint
npm run build
npm test
npm run test:e2e --workspace=backend
npm run test:db --workspace=backend
```

- `backend/test/notas/notas.db-spec.ts`:
  - 0,9, 7,1, 8, 0, 5,55, `"x"`, vacía, `"5.5"` como texto, nula y ausente responden 400 con `invalidas: [{ alumnoId, motivo }]` y el motivo esperado, sin filas ni eventos;
  - 1,0, 7,0 y 4,5 se guardan;
  - una lista mixta no guarda nada y trae solo las inválidas, en orden;
  - una nota inválida junto a un `alumnoId` mal formado, una lista de listas, una fila nula junto a una nota inválida y más de 500 notas inválidas responden el 400 de validación, sin `invalidas`.
- `frontend/src/pages/NotasDeEvaluacion.test.tsx`:
  - 8, 0,9, 7.1, 5,55 y `x` marcan el campo en rojo con su motivo y deshabilitan Guardar aunque otra nota sea válida; al corregir se quita la marca;
  - "5,5" y "6.5" se envían como 5,5 y 6,5; "5," no se marca mientras se escribe; "5,5" sobre un 5,5 no es un cambio;
  - el motivo se anuncia con `aria-live`;
  - un 400 con `invalidas` marca esos campos y deshabilita Guardar hasta corregirlos; un 400 sin `invalidas` (por ejemplo, `sobrantes`) muestra su mensaje sin marcar campos.

## Revisión en local

1. Levantar backend y frontend con las migraciones y el seed de facultad completa.
2. Como ayudante de una sección con una evaluación, abrir **Notas** e **Ingresar notas**.
3. Escribir 8, 0,9 y 5,55: cada campo se marca en rojo con su motivo y Guardar queda deshabilitado.
4. Corregirlos a 6, 4,5 (con coma) y 7: la marca desaparece y se guardan.
