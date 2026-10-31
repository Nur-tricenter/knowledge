# Mensajería — MS4

## Eventos publicados
**Ninguno.** MS4 no publica eventos y por eso no tiene outbox. Lo que otros necesitan de MS4 se lo piden por REST (MS3 consulta `active-tomorrow`).

Candidatos naturales si en el futuro hiciera falta: `delivery-day-cancelled` (para que MS3/MS5 se enteren de una cancelación) y `production-order-generated`.

## Eventos consumidos
| Cola | Exchange | Contrato | Handler | Efecto |
|---|---|---|---|---|
| `ms4.meal-plan-published` | `meal-plan-published` | `MealPlanPublished` | `MealPlanPublishedConsumer` | Upsert del plan (id, nombre, días totales, comidas por día) en la tabla `PlanCatalog` |
| `ms4.recipe-updated` | `recipe-updated` | `RecipeUpdated` | `RecipeUpdatedConsumer` | Renombra la receta en el menú de los días aún no cerrados (`DeliveryDay.RenameRecipe`) |
| `ms4.delivery-added-to-route` | `delivery-added-to-route` | `DeliveryAddedToRoute` | `DeliveryAddedToRouteConsumer` | Guarda en `DeliveryRouteLinks` la relación `DeliveryId` (MS5) → `DeliveryDay.Id`: el `DeliveryDayId` del evento (kernel 1.4.0); si falta, el `PackageId` si es un `packId` numérico; si no, el día más temprano del paciente en `ReadyForProduction`/`InProduction` que aún no tenga entrega (MS4#5). Sin coincidencia se ignora |
| `ms4.delivery-completed` | `delivery-completed` | `DeliveryCompleted` | `DeliveryCompletedConsumer` | Busca el día en `DeliveryRouteLinks` y lo pasa a `Delivered`; la evidencia guarda `DeliveredAt` y, desde el kernel 1.5.0, la foto y la firma que trae el evento (MS4#10; un valor de más de 1000 caracteres se descarta con un warning para no bloquear el cierre del día) |
| `ms4.delivery-failed` | `delivery-failed` | `DeliveryFailed` | `DeliveryFailedConsumer` | Igual, pero el día pasa a `Failed` |

Contratos: `Nur.Tricenter.Integration.Messages.Catalog`. Código: `src/Infrastructure/Messaging/` (registro en `MessagingExtensions.cs`, handlers en `Consumers.cs`).

### Para qué sirve cada uno
- **`meal-plan-published` → validar sin llamar a MS2.** Cuando MS3 crea un calendario, MS4 compara la duración pedida con `TotalDays` del plan **usando su copia local**. Si no coinciden → 400. Si el plan todavía no llegó a la proyección, se acepta con un warning: ausencia significa "desconocido", no "inválido". Es consistencia eventual aplicada.
- **`recipe-updated` → menú coherente.** El menú de cada día es una **foto** tomada la noche anterior. Si MS2 renombra una receta, se actualiza la foto de los días abiertos. Los días entregados, fallidos o cancelados conservan el nombre con el que se produjeron (es un registro histórico).

### Cierre del ciclo de entrega (MS5 ⇢ MS4)
`DeliveryCompleted` y `DeliveryFailed` traen `DeliveryId` y `RouteId` (el primero, además, la hora y la evidencia) pero no el día de MS4. Por eso MS4 consume también `DeliveryAddedToRoute`: ahí se guarda la relación `DeliveryId` → día en la tabla `DeliveryRouteLinks`. El día se busca en este orden: (1) `DeliveryDayId`, el `packId` de MS4 que viaja desde `package-validated` (kernel 1.4.0, X-10); (2) `PackageId` si es el `packId` numérico (cargas manuales); (3) por paciente ([MS4#5](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/5), reunido con los demás en [MS4#8](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/8)): el día más temprano en `ReadyForProduction`/`InProduction` sin otra entrega enlazada. El paso 3 no es ambiguo mientras el paciente tenga un día por fecha (ver ms3-gap-15). Los paquetes de `package-validated` traen el GUID del paquete de MS3 en `PackageId` (ms3-gap-03), por eso el paso 1 es el camino normal. Validado de punta a punta en el stack local el 2026-10-28 (por paciente; entrega exitosa y fallida).

Estos tres consumidores **no fallan por motivos de negocio**: una entrega sin enlace, un día inexistente o una transición inválida (por ejemplo un día cancelado) se registran como warning y se confirman, porque reintentar no cambiaría el resultado. Usan la misma regla de dominio (`DeliveryDay.ApplyDeliveryResult`) y la misma idempotencia que `PATCH /delivery-result`, que queda como vía manual. Código en [MS4#3](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/3) y colas en [nur-tricenter-local#6](https://github.com/Nur-tricenter/nur-tricenter-local/pull/6), ambos mergeados.

## Colas declaradas que no se consumen
La topología crea para MS4 también `ms4.recipe-published`, `ms4.food-published`, `ms4.food-nutritional-info-updated`, `ms4.user-published` y `ms4.user-updated`. **No se consumen a propósito:** MS4 no necesita alimentos ni usuarios, y una receta nueva no afecta a días ya resueltos. Quedan acumulando mensajes (gap transversal X-06).

## Garantías de entrega
- **Pipeline de cada mensaje:** `TracingConsumer` → `IdempotentConsumer` → handler.
- **Idempotencia:** tabla `InboxMessages` con clave en el `Id` del mensaje. Un mensaje re-entregado no hace nada. Además los handlers son upserts o renombres (idempotentes por naturaleza).
- **Reintentos:** 3 reintentos con 500 ms de base (`RabbitMqSettings__MaxRetryAttempts`, `RetryBaseDelayMilliseconds` en `ms4.compose.yml`).
- **Trazabilidad:** `TracingConsumer` continúa la traza con el `CorrelationId` del evento (OpenTelemetry vía ServiceDefaults).
- **Proceso:** corre en `src/WorkerService` (`delivery-calendar-workerservice`), separado de la API. No se registra en Consul.
- **Topología:** MS4 **no declara** exchanges ni colas. Vienen de `nur-tricenter-local/topology/rabbitmq-definitions.json`.

## Detalles técnicos aprendidos
- Los decoradores reciben el **consumidor concreto** (`IdempotentConsumer<T, TInner>`), nunca `IIntegrationMessageConsumer<T>`: Joseco registra el pipeline bajo esa interfaz, así que inyectarla genera un ciclo de DI.
- Npgsql solo escribe `DateTimeOffset` en UTC: `InboxMessage` y `PlanCatalogEntry` normalizan con `ToUniversalTime()`.
- `Joseco.Communication.External.RabbitMQ` 1.1.0 ignora el puerto configurado: el broker tiene que estar en 5672.

## Diagrama
```mermaid
flowchart LR
  MS2[MS2 Catálogo] -- outbox --> X1{{meal-plan-published}}
  MS2 -- outbox --> X2{{recipe-updated}}
  MS5[MS5 Logística] -- outbox --> X3{{delivery-added-to-route}}
  MS5 -- outbox --> X4{{delivery-completed}}
  MS5 -- outbox --> X5{{delivery-failed}}
  X1 --> Q1[(ms4.meal-plan-published)]
  X2 --> Q2[(ms4.recipe-updated)]
  X3 --> Q3[(ms4.delivery-added-to-route)]
  X4 --> Q4[(ms4.delivery-completed)]
  X5 --> Q5[(ms4.delivery-failed)]
  subgraph W[MS4 WorkerService]
    T[TracingConsumer] --> I[IdempotentConsumer<br/>InboxMessages]
    I --> H1[MealPlanPublishedConsumer]
    I --> H2[RecipeUpdatedConsumer]
    I --> H3[DeliveryAddedToRouteConsumer]
    I --> H4[DeliveryCompletedConsumer]
    I --> H5[DeliveryFailedConsumer]
  end
  Q1 --> T
  Q2 --> T
  Q3 --> T
  Q4 --> T
  Q5 --> T
  H1 --> PC[(PlanCatalog)]
  H2 --> DD[(DeliveryDay.Menu)]
  H3 --> LK[(DeliveryRouteLinks)]
  H4 --> DS[(DeliveryDay.Status)]
  H5 --> DS
```
