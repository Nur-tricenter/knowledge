# Gaps — MS4

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms4-gap-01 | MS5 no informa el resultado de la entrega | high | MS5 | abierto (X-01) |
| ms4-gap-02 | Sin autorización por objeto (BOLA) | high | identity / MS1 | abierto (X-08) |
| ms4-gap-03 | Job diario de catálogo con disparo manual | medium | — | abierto |
| ms4-gap-04 | `InProduction` nunca se asigna | low | MS3 | abierto |
| ms4-gap-05 | Descripciones OpenAPI desactualizadas | low | — | abierto |

## Detalle

### ms4-gap-01 — El ciclo no se cierra
- **Qué pasa:** el único camino a `Delivered`/`Failed` es `PATCH /delivery-result`, y MS5 no lo llama.
- **Impacto:** ningún día llega a un estado final de entrega, el calendario nunca se completa y la evidencia nunca llega a MS4.
- **Qué haría falta:** decidirlo con un ADR (ver X-01 en [gaps transversales](../../gaps/cross-service-gaps.md)): MS5 llama al endpoint con una service account, o MS4 consume `delivery-completed`/`delivery-failed`. Esto último requiere que el evento lleve el `dayId` de MS4.

### ms4-gap-02 — Cualquier paciente puede editar cualquier calendario
- **Qué pasa:** los scopes controlan el *tipo* de cliente, no la *propiedad*. Un token con `deliveryCalendar.calendar:edit` modifica cualquier calendario.
- **Qué haría falta:** mapear el `sub` del token al `PatientId` (dato de MS1) y validarlo en los endpoints del frontend.

### ms4-gap-03 — Sin cron para el job
- **Qué pasa:** `resolve-daily-catalog` se dispara a mano (decisión deliberada para la demo).
- **Impacto:** si nadie lo corre, `active-tomorrow` devuelve `[]` y MS3 no produce.
- **Qué haría falta:** un `BackgroundService` o un cron externo que lo llame cada noche, más una alerta si la orden queda vacía.

### ms4-gap-04 — Estado reservado
`InProduction` existe en el enum y la máquina de estados lo acepta como origen de `delivery-result`, pero ningún caso de uso lo asigna. Le correspondería a MS3 avisar "empecé a producir", y no hay contrato para eso.

### ms4-gap-05 — Doc del código desactualizada
Ver la tabla siguiente. Afecta a quien lea la documentación de Scalar/OpenAPI.

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código**.

| Dónde | La doc dice | El código hace |
|---|---|---|
| `Calendars.cs` (descripción OpenAPI de `POST /schedule`) | Una segunda llamada con el mismo `contractId` devuelve 409 | Devuelve **200 con el calendario existente** (`CreateScheduleCommandHandler`) |
| `Calendars.cs` (descripción de `cancel-day`) | No se puede cancelar un día en `ReadyForProduction` o posterior (422) | **Sí se puede** cancelar `ReadyForProduction` fuera de las 48h. Solo bloquea Delivered/Failed/Cancelled/InProduction |
| `README.md` del repo | Las validaciones de value objects dan 400 | Dan **422** (`ArgumentException` → 422). 400 es solo para FluentValidation y la validación de duración contra el plan |
| `FLOWS.md` | Mapeo de errores en `src/Web/...` | El proyecto ahora es `src/Api/...` |
| `CLAUDE.md` §5 (gap 2) | MS2 en `GET /api/v1/meal-plans/{id}` | Desde MS4 se llama `GET /api/catalog/v1/meal-plans/{id}` (con el prefijo del gateway) |
