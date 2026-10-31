# Gaps — MS4

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms4-gap-01 | El resultado de la entrega solo cierra el día si `PackageId` es el `packId` de MS4 | high | MS3, MS5 | resuelto (X-01, X-10; MS4#8 y #10, incluida la evidencia en `DeliveryCompleted`) |
| ms4-gap-02 | Sin autorización por objeto (BOLA) | high | identity / MS1 | abierto (X-08) |
| ms4-gap-03 | Job diario de catálogo con disparo manual | medium | — | abierto |
| ms4-gap-04 | `InProduction` nunca se asigna | low | MS3 | abierto |
| ms4-gap-05 | Descripciones OpenAPI desactualizadas | low | — | abierto |
| ms4-gap-06 | A new production order is saved before its outbox row, so a crash between the two loses the event | low | — | abierto (re-running `resolve-daily-catalog` recovers it) |
| ms4-gap-07 | `PlanDayMenus` has no backfill and MS2 emits one snapshot per composition change | low | MS2 | abierto (X-15) |

## Detalle

### ms4-gap-01 — El ciclo solo se cierra si `PackageId` es el `packId`
> **Actualización 2026-10-29:** resuelto. MS4#3 y las colas (nur-tricenter-local#6) ya están mergeados. El `packId` viaja en `DeliveryAddedToRoute.DeliveryDayId` (kernel 1.4.0; MS3#6, MS5#5). `DeliveryAddedToRouteConsumer` busca el día por `DeliveryDayId`, luego por `PackageId` numérico y por último por paciente (el día más temprano en `ReadyForProduction`/`InProduction` sin entrega). MS4#6 y MS4#5 se reúnen en MS4#8 (mergeado). Sigue pendiente la evidencia (foto, firma) en `DeliveryCompleted`. El texto de abajo es el análisis original.

- **Qué pasa:** MS5 ya publica `delivery-added-to-route`, `delivery-completed` y `delivery-failed`, y MS4 los consume para pasar el día a `Delivered`/`Failed` (cambio en MS4#3, pendiente de merge; colas en nur-tricenter-local#6, también pendiente). `DeliveryCompleted` y `DeliveryFailed` solo traen `DeliveryId`, así que MS4 depende de `DeliveryAddedToRoute.PackageId` para saber de qué día se trata.
- **Impacto:** hoy MS3 manda su propio GUID como `PackageId` (ms3-gap-03), MS4 no lo reconoce y descarta el evento con un warning: los días siguen en `ReadyForProduction`. La evidencia (foto, firma) tampoco llega: el evento solo trae la hora de entrega.
- **Qué haría falta:** que MS3 envíe el `packId` de MS4 en `PackageValidated.PackageId` y que MS5 lo conserve como `PackageId` de la entrega (X-10); y, si se quiere evidencia, sumar foto y firma a `DeliveryCompleted` en el kernel. `PATCH /delivery-result` sigue disponible como vía manual.

### ms4-gap-02 — Cualquier paciente puede editar cualquier calendario
- **Qué pasa:** los scopes controlan el *tipo* de cliente, no la *propiedad*. Un token con `deliveryCalendar.calendar:edit` modifica cualquier calendario.
- **Qué haría falta:** mapear el `sub` del token al `PatientId` (dato de MS1) y validarlo en los endpoints del frontend.

### ms4-gap-03 — Sin cron para el job
- **Qué pasa:** `resolve-daily-catalog` se dispara a mano (decisión deliberada para la demo).
- **Impacto:** si nadie lo corre, MS4 no publica `production-order-ready` (y `active-tomorrow` devuelve `[]`): MS3 no tiene entregas y no produce.
- **Qué haría falta:** un `BackgroundService` o un cron externo que lo llame cada noche, más una alerta si la orden queda vacía.

### ms4-gap-04 — Estado reservado
`InProduction` existe en el enum y la máquina de estados lo acepta como origen de `delivery-result`, pero ningún caso de uso lo asigna. Le correspondería a MS3 avisar "empecé a producir", y no hay contrato para eso.

### ms4-gap-05 — Doc del código desactualizada
Ver la tabla siguiente. Afecta a quien lea la documentación de Scalar/OpenAPI.

### ms4-gap-06 — El evento de una orden nueva no es atómico con la orden
- **Qué pasa:** `ResolveDailyCatalogCommandHandler` stages `ProductionOrderReady` in the outbox, and the event carries the order id, which the database generates. For an **existing** order the row commits with the updated lines in one `SaveChanges`; for a **new** one the order is saved first and the row right after.
- **Impacto:** a crash between the two saves leaves an order whose event never goes out, so MS3 never learns of it. Hasta que alguien lo note.
- **Qué haría falta:** nothing in the normal flow: re-running `resolve-daily-catalog` finds the order and stages the event in a single save (every run stages a new snapshot). A fix would be a client-generated order id, or one transaction around both saves.

### ms4-gap-07 — Menús proyectados sin backfill
- **Qué pasa:** `PlanDayMenus` is filled only by `meal-plan-composition-changed`. A plan created (or composed) before MS2#6 / MS4#12 was deployed has no rows. MS2 also emits one snapshot per change, so many messages fly while a plan is being composed; MS4 keeps the latest per day.
- **Impacto:** the days of a contract on such a plan stay `Scheduled` (skipped and logged) until MS2 publishes a composition for the plan. Demo and `e2e-smoke.py` create fresh plans, so they are unaffected.
- **Qué haría falta:** a republish endpoint in MS2 (X-15), or touching the plan (any composition change republishes it).

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código**.

| Dónde | La doc dice | El código hace |
|---|---|---|
| `Calendars.cs` (descripción OpenAPI de `POST /schedule`) | Una segunda llamada con el mismo `contractId` devuelve 409 | Devuelve **200 con el calendario existente** (`CreateScheduleCommandHandler`) |
| `Calendars.cs` (descripción de `cancel-day`) | No se puede cancelar un día en `ReadyForProduction` o posterior (422) | **Sí se puede** cancelar `ReadyForProduction` fuera de las 48h. Solo bloquea Delivered/Failed/Cancelled/InProduction |
| `README.md` del repo | Las validaciones de value objects dan 400 | Dan **422** (`ArgumentException` → 422). 400 es solo para FluentValidation y la validación de duración contra el plan |
| `FLOWS.md` | Mapeo de errores en `src/Web/...` | El proyecto ahora es `src/Api/...` |
| `CLAUDE.md` §5 (gap 2, before MS4#12) | MS2 en `GET /api/v1/meal-plans/{id}` | MS4 called `GET /api/catalog/v1/meal-plans/{id}` through the gateway; since MS4#12 it makes no HTTP call at all (menus come from `PlanDayMenus`) |
| Esta ficha antes del 2026-10-31 (`integrations.md`, `messaging.md`, F1, F3, F4) | MS3 llama a `POST /schedule` y a `GET active-tomorrow`; MS4 llama a MS2 y a identity | Removed in MS3#11 / MS4#12: events and projections; MS4 publishes `production-order-ready` through its own outbox |
