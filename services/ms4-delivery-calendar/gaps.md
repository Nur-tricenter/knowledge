# Gaps — MS4

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms4-gap-01 | El resultado de la entrega solo cierra el día si `PackageId` es el `packId` de MS4 | high | MS3, MS5 | parcial (X-01, X-10) |
| ms4-gap-02 | Sin autorización por objeto (BOLA) | high | identity / MS1 | abierto (X-08) |
| ms4-gap-03 | Job diario de catálogo con disparo manual | medium | — | abierto |
| ms4-gap-04 | `InProduction` nunca se asigna | low | MS3 | abierto |
| ms4-gap-05 | Descripciones OpenAPI desactualizadas | low | — | abierto |

## Detalle

### ms4-gap-01 — El ciclo solo se cierra si `PackageId` es el `packId`
- **Qué pasa:** MS5 ya publica `delivery-added-to-route`, `delivery-completed` y `delivery-failed`, y MS4 los consume para pasar el día a `Delivered`/`Failed` (cambio en MS4#3, pendiente de merge; colas en nur-tricenter-local#6, también pendiente). `DeliveryCompleted` y `DeliveryFailed` solo traen `DeliveryId`, así que MS4 depende de `DeliveryAddedToRoute.PackageId` para saber de qué día se trata.
- **Impacto:** hoy MS3 manda su propio GUID como `PackageId` (ms3-gap-03), MS4 no lo reconoce y descarta el evento con un warning: los días siguen en `ReadyForProduction`. La evidencia (foto, firma) tampoco llega: el evento solo trae la hora de entrega.
- **Qué haría falta:** que MS3 envíe el `packId` de MS4 en `PackageValidated.PackageId` y que MS5 lo conserve como `PackageId` de la entrega (X-10); y, si se quiere evidencia, sumar foto y firma a `DeliveryCompleted` en el kernel. `PATCH /delivery-result` sigue disponible como vía manual.

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
