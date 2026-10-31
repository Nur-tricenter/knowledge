# Enfoque del módulo: comunicación entre microservicios

Esta página conecta **cada concepto del módulo** con **dónde se ve en el proyecto real**. Sirve para estudiar, para preparar la presentación y como guion de la futura app visual.

> Cada owner agrega aquí las evidencias de su servicio cuando carga su ficha (columna "Evidencia").

## Concepto → evidencia en Nur-Tricenter

| # | Concepto | Qué es | Evidencia en el proyecto |
|---|---|---|---|
| 1 | API Gateway | Punto de entrada único que oculta la topología interna | `nur-tricenter-api-gateway`: YARP + Consul (relee cada 30 s, solo instancias *passing*), `/api/{servicio}/**` → `/api/**`, `X-Correlation-Id`; no valida JWT. MS5 entra como `/api/nurtricenter/v1/...`. Ficha: [gateway-api](../services/gateway-api/README.md) |
| 2 | Service discovery | Encontrar instancias sanas sin IPs fijas | Auto-registro en Consul + health check `/health` (MS2, MS3, MS4, identity, MS5; MS1 y el gateway no se registran). MS5: registro opt-in que nunca tumba el servicio (3 reintentos con backoff) y `/health` con chequeo de Postgres que saca la instancia del gateway si cae la BD |
| 3 | Comunicación síncrona (REST) | Petición/respuesta, acoplamiento temporal | **No REST between services any more** (MS3#11, MS4#12, MS2#6, MS1#3): MS3 → MS4 `POST /schedule` and `GET /active-tomorrow`, MS3 → MS1 `GET /Patient/{id}` and MS4 → MS2 `GET /meal-plans/{id}` became events and local projections (course rule: no synchronous REST unless it is a small query). REST is left for people and the frontend through the gateway. Historical counterexample: MS5 → ClinicService `POST /api/v1/patients/contact-information` (directo, contra un mock; era el contraejemplo de acoplamiento temporal y MS5 lo retiró en MS5#4: ahora el nombre llega en el evento `package-validated`) |
| 4 | Comunicación asíncrona (eventos) | Publicar hechos sin conocer a los consumidores | MS2 publica 6 eventos (`food-published`, `food-nutritional-info-updated`, `recipe-published`, `recipe-updated`, `meal-plan-published`, `meal-plan-composition-changed`) y MS4 consume 3; MS3 consume 3 de MS2 y publica `package-validated` y `contract-activated` (MS4 lo consume y crea el calendario); MS4 publica `production-order-ready` (MS3 lo proyecta); MS5 publica 10 (`courier-*`, `route-*`, `delivery-*`) y MS4 consume los 3 de entrega; identity publica `user-published` (MS2 lo consume); MS1 publica `paciente-published` (kernel `PatientPublished`; MS3 lo proyecta). Four new events replace the REST calls; consumers store full snapshots in local projections (`PlanDayMenus`, `ClinicPatients`, `ScheduledDeliveries`), ignoring older snapshots |
| 5 | Pub/Sub con fanout | Cada consumidor recibe su copia | Colas `{msN}.{exchange}` en `rabbitmq-definitions.json`; sinks de historial nunca consumidos `catalog.default` (MS2), `nurtricenter.default` (MS5), `identity.default` (identity) y `gestion-clinica-nutricional.default` (MS1) |
| 6 | Contratos compartidos | Esquema común de mensajes | Kernel `Nur.Tricenter.Integration` (MS5: `Messages.Logistics`, 10 contratos; identity: `Messages.Identity`; `Messages.Contracting.PackageValidated` en 1.2.0). Contraejemplos: MS3 y MS1 usan copias o contratos locales (X-07) |
| 7 | Transactional outbox | No perder eventos entre la BD y el broker | `Joseco.Outbox.EFCore` en MS2, identity, MS5 y MS1; MS3 usa una tabla propia (`OutgoingIntegrationEvent`) que el worker drena hacia RabbitMQ **y hacia REST** (la llamada a MS4 también sale del outbox, para que un MS4 caído no tumbe el cobro); MS2 drena el outbox en `catalog-workerservice` y proyecta al read model; MS5: el `UnitOfWork` drena los eventos de dominio **antes** de `SaveChanges` para que agregado y fila de outbox entren en la misma transacción, y `Nurtricenter.WorkerService` publica |
| 8 | Inbox / consumidor idempotente | Tolerar la entrega at-least-once | `IdempotentConsumer` + tabla `InboxMessages` (MS4, MS2, MS3 y MS5; en MS5 desde MS5#3) |
| 9 | Idempotencia en APIs | Reintentos sin efectos duplicados | MS4 `contract-activated` / `POST /schedule` por `contractId` (inbox por `Id` + clave de negocio: una redelivery no duplica el calendario); `PATCH /delivery-result`. Contraejemplo: en MS5 repetir `deliver`/`fail`/`start` da 422 y las altas duplican |
| 10 | Consistencia eventual | Copias locales que convergen | MS4 `PlanCatalog`, MS2 `PlanAuthors`, MS3 `CatalogPlans` y `CatalogRecipes` |
| 11 | Database per service | Cada servicio dueño de sus datos | Una BD por servicio en el Postgres compartido; MS5 usa su propia BD en Neon y MS1 un SQL Server propio |
| 12 | Autenticación servicio a servicio | Identidad de máquina con mínimo privilegio | Service accounts `ms4-service` and `ms3-service`, created by `start-stack` in identity; **no service uses them any more** (the calls they authenticated became events; the demo console's security view still shows them). Riesgo: `POST /users` acepta `platform:*` (X-14) |
| 13 | Autorización por scopes | Permiso por endpoint | Kernel `Nur.Tricenter.Access` + `RequireAuthorization` en MS2, MS4 e identity. Contraejemplos: MS3, MS5 y MS1 sin autenticación, y el gateway no valida |
| 14 | Resiliencia | Reintentos, timeouts, degradación | MS4: si MS2 cae, el día queda en `Scheduled` y el job se re-ejecuta. MS5: el registro en Consul y la declaración de su cola sink reintentan sin tumbar el proceso; el outbox reintenta lo no publicado |
| 15 | Trazabilidad distribuida | Seguir una operación entre servicios | `CorrelationId` + `TracingConsumer` + OpenTelemetry; MS2 estampa el outbox con `OutboxTracingService` y re-adjunta el span en `TracingConsumer`; MS5 estampa el trace id en la fila del outbox y lo recupera en el worker con `OutboxCorrelation.Resolve` (sin exportador OTel) |
| 16 | Query vs evento (trade-off) | Elegir el estilo según la necesidad | Decision reversed: `GET /active-tomorrow` had replaced the event `ProductionOrderRequired`, and MS4 called `GET /meal-plans/{id}` because `meal-plan-published` carries no composition. Now MS4 publishes `production-order-ready` (full snapshot) and MS2 publishes `meal-plan-composition-changed` (full snapshot), so the "whole picture at a moment" argument holds without a live call |
| 17 | Contenedores y orquestación local | Levantar N servicios juntos | `nur-tricenter-local`: compose con `include:` por servicio, scripts `setup-project`/`start-stack` ([runbook](../platform/local-stack.md)). Estaba roto por X-12, resuelto en nur-tricenter-local#7 |

## Preguntas para defender en la presentación
- ¿Por qué el gateway no valida el token y cada servicio sí?
- ¿Qué pasa si RabbitMQ recibe el mismo evento dos veces? ¿Y si el servicio muere entre guardar y publicar?
- ¿Por qué MS4 resuelve el menú de mañana **antes** de que MS3 lo pida?
- ¿Qué gana MS4 guardando su copia de los planes de MS2 en vez de llamarlo cada vez? ¿Qué pierde?
- ¿Qué se rompe hoy si el `PackageId` que llega a MS5 no es el `packId` de MS4? (ver X-01 y X-10)
- ¿Por qué el stack local dejó de levantar y cómo lo hubiera detectado una prueba automática? (X-12)

## Guion para la app visual (borrador)
1. **El negocio:** el ciclo del paciente (de [../platform/overview.md](../platform/overview.md)).
2. **El mapa:** grafo de servicios generado desde `services/*/service.yaml` + `platform/platform.yaml`.
3. **Síncrono:** animar una petición MS3 → gateway → MS4 → MS2.
4. **Asíncrono:** animar un evento MS2 → exchange → colas → consumidores.
5. **Garantías:** outbox, inbox e idempotencia, con ejemplos reales.
6. **Lo que falta:** gaps transversales como hoja de ruta.
