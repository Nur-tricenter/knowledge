# Mensajería — MS1

## Eventos publicados
| Exchange | Contrato | EventType | Se dispara cuando | Outbox |
|---|---|---|---|---|
| `paciente-published` | `PacientePublished` (**local**, `GestionClinicaNutricional.Application.Contracts`) | sin campo en el mensaje; en el catálogo se registra como `Paciente.Published` | Se registra un paciente (`POST …/CreatePaciente`) | sí |

**Este exchange no está en la topología de la plataforma** (`nur-tricenter-local/topology/rabbitmq-definitions.json`) y nadie lo consume. Lo declara el propio MS1.

### Contrato
`PacientePublished : IntegrationMessage` (Joseco), definido **dentro de MS1**, no en el kernel `Nur.Tricenter.Integration`:

| Campo | Origen |
|---|---|
| `Id`, `CorrelationId`, `Source`, `CreatedAt` | Sobre de Joseco. `Source` = `gestion-clinica-nutricional`; `CorrelationId` = el del mensaje de outbox |
| `PacienteId` | `PacienteCreated.PacienteId` |
| `CI`, `Nombre`, `Apellido` | `PacienteCreated` |

El sobre de Joseco no tiene `EventType` (los contratos del kernel sí lo usan); el mensaje se serializa con Newtonsoft. Por eso `Paciente.Published` en [`contracts/events.yaml`](../../contracts/events.yaml) es una convención del catálogo, no un valor que viaje.

### Payload (corregido en MS1#1, 2026-10-31)
> Verificado en RabbitMQ con un paciente real: el mensaje lleva el `PacienteId` del paciente y `CI`/`Nombre`/`Apellido` en su campo, y llegó **un solo** mensaje (la posible doble publicación no se reprodujo). Lo de abajo es el defecto original, que ya no ocurre.

1. **Campos cruzados.** `Paciente.Crear` llama `new PacienteCreated(paciente.Id, nombre, apellido, ci)`, pero el constructor es `(pacienteId, ci, nombre, apellido)`. Resultado: `CI` lleva el nombre, `Nombre` lleva el apellido y `Apellido` lleva el CI.
2. **`PacienteId` vacío.** El evento se crea dentro de `Crear`, antes de que EF Core asigne el `Id` (al hacer `AddAsync`). Sale `00000000-0000-0000-0000-000000000000`.
3. **Probable doble publicación.** El worker registra `PublishIntegrationEventWhenPacienteCreated` dos veces: por el escaneo de MediatR (`AddApplication`) y otra vez a mano (`AddIntegrationMessaging`). MediatR invoca cada registro, así que cada mensaje de outbox se publicaría dos veces. No verificado en ejecución.

Ver ms1-gap-04.

## Eventos consumidos
**Ninguno.** No hay consumidores ni `IIntegrationMessageConsumer` en el código.

## Colas declaradas que no se consumen
La topología crea 7 colas para MS1 que nadie lee y acumulan mensajes (gap transversal X-06):
`ms1.food-published`, `ms1.food-nutritional-info-updated`, `ms1.recipe-published`, `ms1.recipe-updated`, `ms1.meal-plan-published`, `ms1.user-published`, `ms1.user-updated`.

`ms1.user-published` sería el candidato natural para guardar el id de usuario de identity junto al paciente (X-08).

## Garantías de entrega
- **Publicación:** outbox transaccional de Joseco. `UnitOfWork.CommitAsync` despacha `PacienteCreated` con MediatR, `SaveInOutboxWhenPacienteCreated` lo agrega a `OutboxMessages` y todo se guarda en un único `SaveChangesAsync`. El WorkerService (`AddOutboxBackgroundService<DomainEvent>`) lee la tabla y publica con `IExternalPublisher.PublishAsync(message, "paciente-published", declareDestination: true)`.
- **Topología propia:** `DefaultQueueRegistrar` (worker) declara el exchange `paciente-published` (fanout, no durable) y la cola sumidero **`gestion-clinica-nutricional.default`** (durable), y las enlaza. Reintenta cada 10 s si RabbitMQ no está. Nadie consume esa cola.
- **Configuración:** el worker lee `RabbitMqSettings` (host `localhost`, sin puerto, por lo que usa 5672). La sección `Joseco:Communication:External:RabbitMQ` de la WebApi no se usa.
- **Consumo:** no aplica.
- **Trazabilidad:** solo Serilog con `Enrich.WithSpan()` en el worker. La observabilidad del kernel (`Nur.Tricenter.Observability`) está comentada.

## Diagrama
```mermaid
flowchart LR
  API[WebApi<br/>CreatePacienteHandler] -- "PacienteCreated<br/>(MediatR)" --> OB[(OutboxMessages<br/>SQL Server)]
  OB --> W[WorkerService<br/>outbox background service]
  W -. "PacientePublished" .-> X{{paciente-published<br/>fuera de la topología}}
  X -.-> Q[(gestion-clinica-nutricional.default<br/>sin consumidor)]
  T[Topología de la plataforma] --> Q1[(ms1.* x7<br/>sin consumidor)]
```
