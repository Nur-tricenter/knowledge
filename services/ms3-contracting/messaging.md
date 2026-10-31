# Mensajería — MS3

## Eventos publicados
| Exchange | Contrato (kernel) | EventType | Se dispara cuando | Outbox |
|---|---|---|---|---|
| `package-validated` | `PackageValidated` | `Package.Validated` | El control de calidad aprueba un paquete (`POST /production/packages/validate`); un evento por paquete | sí |

Contrato: `Nur.Tricenter.Integration.Messages.Contracting` (kernel 1.5.0; trae `DeliveryDate`, `PatientName`, `DeliveryDayId` y `PatientPhone`). MS3 **no** referencia el kernel: publica una copia local equivalente, `Nurtricenter.MS3.Infrastructure.Messaging.Contracts.Production.PackageValidated` (mismos campos y `EventType`, otro namespace y base `IntegrationMessage` de Joseco). En el cable el JSON es el mismo (`ms3-gap-05`).

Cuerpo publicado:
```json
{
  "EventType": "Package.Validated",
  "PackageId": "guid", "PatientId": "guid", "ProductionOrderId": "guid", "CatalogPlanId": "guid",
  "ReleasedAt": "2026-10-24T05:51:51Z",
  "DeliveryAddress": "Av. Banzer 123, Santa Cruz", "TrackingNumber": "NTR-A79C734C-20261024",
  "Latitude": -17.78, "Longitude": -63.18,
  "Id": "guid", "CreatedAt": "…", "CorrelationId": "guid", "Source": "contracting"
}
```
- `DeliveryAddress` y `TrackingNumber` salen de la etiqueta del paquete.
- `Latitude` y `Longitude` salen del calendario de MS4 del mismo paciente cuya dirección coincide con la de la etiqueta; van en `null` si ninguno coincide.
- `PackageId` es el id del paquete de MS3, **no** el `packId` (día de entrega) de MS4 (ver `ms3-gap-03`). MS5 lo copia a sus eventos de entrega, y MS4 (PR #3 de MS4, abierto) espera ahí un `packId` entero: con un GUID no puede cerrar el día.

**No publica `contract-activated` ni ningún evento de contrato.** La creación del calendario va por REST a MS4 (ver [integrations.md](./integrations.md)); la fila `CreateSchedule` del outbox es solo el mecanismo para no perder esa llamada.

## Eventos consumidos
| Cola | Exchange | Contrato | Handler | Efecto |
|---|---|---|---|---|
| `ms3.meal-plan-published` | `meal-plan-published` | `MealPlanPublished` | `MealPlanPublishedConsumer` | Upsert del plan en `CatalogPlans`. Desde ese momento `POST /contracts` acepta ese `PlanId` y la factura muestra su nombre |
| `ms3.recipe-published` | `recipe-published` | `RecipePublished` | `RecipePublishedConsumer` | Upsert de la receta en `CatalogRecipes` |
| `ms3.recipe-updated` | `recipe-updated` | `RecipeUpdated` | `RecipeUpdatedConsumer` | Actualiza nombre e instrucciones en `CatalogRecipes` |

Contratos: `Nur.Tricenter.Integration.Messages.Catalog`. MS3 usa copias locales equivalentes en `Nurtricenter.MS3.Infrastructure.Messaging.Contracts.Catalog` (mismos campos y `EventType`, otro namespace), porque no referencia ningún paquete `Nur.Tricenter.*`. Código: `Infrastructure/Messaging/` (handlers en `Consumers/`, registro en `MessagingExtensions.cs` y `Nurtricenter.MS3.WorkerService/RabbitMqExtensions.cs`).

## Colas declaradas que no se consumen
La topología crea para MS3 también `ms3.food-published`, `ms3.food-nutritional-info-updated`, `ms3.user-published` y `ms3.user-updated`. **No se consumen:** MS3 no necesita alimentos, y los usuarios no hacen falta mientras sus endpoints sean anónimos. Acumulan mensajes (X-06).

## Garantías de entrega
- **Publicación:** outbox, **no atómico**. `ApproveQualityCommandHandler` guarda primero el paquete `Validated` (`CommitAsync`) y después, en un segundo `CommitAsync` sin transacción explícita, la fila `TransferToLogistics`. Si el proceso cae entre ambos, el paquete queda validado y el evento no sale nunca (`ms3-gap-11`; lo mismo pasa con la fila `CreateSchedule` del pago). `OutboxRelay`, que corre en `Nurtricenter.MS3.WorkerService` cada 5 s, la publica y la marca `Published`. Si RabbitMQ falla, la fila queda pendiente y se reintenta.
- **Id del mensaje:** es el `Id` de la fila del outbox. Si el worker cae entre publicar y marcar, la republicación lleva el mismo `Id` y el consumidor debe descartarla.
- **Consumo:** inbox atómico. `IdempotentConsumer` guarda el `MessageId` en `InboxMessages` en la misma transacción que el upsert; un mensaje repetido se ignora.
- **Reintentos:** los de la librería Joseco (`MaxRetryAttempts`, 3, con espera creciente) y luego la cola de error de esa cola.
- **Persistencia:** la librería publica mensajes **no persistentes** en exchanges **no durables**: si RabbitMQ se reinicia, se pierden los que estaban en cola y se borran los bindings. Por eso la plataforma reimporta la topología en **cada** arranque (`definitions.skip_if_unchanged = false`).
- **Trazabilidad:** `CorrelationId` = `Id` de la fila del outbox. MS3 no tiene OpenTelemetry todavía.

## Diagrama
```mermaid
flowchart LR
  MS2[MS2] -- publica --> X1{{meal-plan-published<br/>recipe-published<br/>recipe-updated}}
  X1 --> Q1[(ms3.meal-plan-published<br/>ms3.recipe-published<br/>ms3.recipe-updated)]
  Q1 --> H[IdempotentConsumer] --> DB[(CatalogPlans / CatalogRecipes)]
  O[(Outbox)] --> R[OutboxRelay] -- publica --> X2{{package-validated}}
  X2 --> Q2[(ms5.package-validated)]
  Q2 -. "PackageValidatedConsumer, rama dev de MS5" .-> MS5[MS5]
```
