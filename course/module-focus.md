# Enfoque del módulo: comunicación entre microservicios

Esta página conecta **cada concepto del módulo** con **dónde se ve en el proyecto real**. Sirve para estudiar, para preparar la presentación y como guion de la futura app visual.

> Cada owner agrega aquí las evidencias de su servicio cuando carga su ficha (columna "Evidencia").

## Concepto → evidencia en Nur-Tricenter

| # | Concepto | Qué es | Evidencia en el proyecto |
|---|---|---|---|
| 1 | API Gateway | Punto de entrada único que oculta la topología interna | `nur-tricenter-api-gateway`: YARP + Consul (relee cada 30 s, solo instancias *passing*), `/api/{servicio}/**` → `/api/**`, `X-Correlation-Id`; no valida JWT. MS5 entra como `/api/nurtricenter/v1/...`. Ficha: [gateway-api](../services/gateway-api/README.md) |
| 2 | Service discovery | Encontrar instancias sanas sin IPs fijas | Auto-registro en Consul + health check `/health` (MS2, MS3, MS4, identity, MS5; MS1 y el gateway no se registran). MS5: registro opt-in que nunca tumba el servicio (3 reintentos con backoff) y `/health` con chequeo de Postgres que saca la instancia del gateway si cae la BD |
| 3 | Comunicación síncrona (REST) | Petición/respuesta, acoplamiento temporal | MS3 → MS4 `POST /schedule` y `GET /active-tomorrow` (service account `ms3-service`, desde el outbox); MS4 → MS2 `GET /meal-plans/{id}`; MS5 → ClinicService `POST /api/v1/patients/contact-information` (directo, contra un mock: contraejemplo de acoplamiento temporal, si cae el repartidor no ve su ruta) |
| 4 | Comunicación asíncrona (eventos) | Publicar hechos sin conocer a los consumidores | MS2 publica 5 eventos (`food-published`, `food-nutritional-info-updated`, `recipe-published`, `recipe-updated`, `meal-plan-published`) y MS4 consume 2; MS3 consume 3 de MS2 y publica `package-validated`; MS5 publica 10 (`courier-*`, `route-*`, `delivery-*`) y MS4 consume los 3 de entrega; identity publica `user-published` (MS2 lo consume); MS1 publica `paciente-published` fuera de la topología |
| 5 | Pub/Sub con fanout | Cada consumidor recibe su copia | Colas `{msN}.{exchange}` en `rabbitmq-definitions.json`; sinks de historial nunca consumidos `catalog.default` (MS2), `nurtricenter.default` (MS5), `identity.default` (identity) y `gestion-clinica-nutricional.default` (MS1) |
| 6 | Contratos compartidos | Esquema común de mensajes | Kernel `Nur.Tricenter.Integration` (MS5: `Messages.Logistics`, 10 contratos; identity: `Messages.Identity`; `Messages.Contracting.PackageValidated` en 1.2.0). Contraejemplos: MS3 y MS1 usan copias o contratos locales (X-07) |
| 7 | Transactional outbox | No perder eventos entre la BD y el broker | `Joseco.Outbox.EFCore` en MS2, identity, MS5 y MS1; MS3 usa una tabla propia (`OutgoingIntegrationEvent`) que el worker drena hacia RabbitMQ **y hacia REST** (la llamada a MS4 también sale del outbox, para que un MS4 caído no tumbe el cobro); MS2 drena el outbox en `catalog-workerservice` y proyecta al read model; MS5: el `UnitOfWork` drena los eventos de dominio **antes** de `SaveChanges` para que agregado y fila de outbox entren en la misma transacción, y `Nurtricenter.WorkerService` publica |
| 8 | Inbox / consumidor idempotente | Tolerar la entrega at-least-once | `IdempotentConsumer` + tabla `InboxMessages` (MS4, MS2, MS3; MS5 solo en su rama `dev`) |
| 9 | Idempotencia en APIs | Reintentos sin efectos duplicados | MS4 `POST /schedule` por `contractId` (lo que permite a MS3 reintentar sin duplicar); `PATCH /delivery-result`. Contraejemplo: en MS5 repetir `deliver`/`fail`/`start` da 422 y las altas duplican |
| 10 | Consistencia eventual | Copias locales que convergen | MS4 `PlanCatalog`, MS2 `PlanAuthors`, MS3 `CatalogPlans` y `CatalogRecipes` |
| 11 | Database per service | Cada servicio dueño de sus datos | Una BD por servicio en el Postgres compartido; MS5 usa su propia BD en Neon y MS1 un SQL Server propio |
| 12 | Autenticación servicio a servicio | Identidad de máquina con mínimo privilegio | Service accounts `ms4-service` → MS2 y `ms3-service` → MS4, creadas por `start-stack` en identity. Riesgo: `POST /users` acepta `platform:*` (X-14) |
| 13 | Autorización por scopes | Permiso por endpoint | Kernel `Nur.Tricenter.Access` + `RequireAuthorization` en MS2, MS4 e identity. Contraejemplos: MS3, MS5 y MS1 sin autenticación, y el gateway no valida |
| 14 | Resiliencia | Reintentos, timeouts, degradación | MS4: si MS2 cae, el día queda en `Scheduled` y el job se re-ejecuta. MS5: el registro en Consul y la declaración de su cola sink reintentan sin tumbar el proceso; el outbox reintenta lo no publicado |
| 15 | Trazabilidad distribuida | Seguir una operación entre servicios | `CorrelationId` + `TracingConsumer` + OpenTelemetry; MS2 estampa el outbox con `OutboxTracingService` y re-adjunta el span en `TracingConsumer`; MS5 estampa el trace id en la fila del outbox y lo recupera en el worker con `OutboxCorrelation.Resolve` (sin exportador OTel) |
| 16 | Query vs evento (trade-off) | Elegir el estilo según la necesidad | `GET /active-tomorrow` reemplazó al evento `ProductionOrderRequired`; MS4 consulta `GET /meal-plans/{id}` a MS2 porque `meal-plan-published` no trae la composición |
| 17 | Contenedores y orquestación local | Levantar N servicios juntos | `nur-tricenter-local`: compose con `include:` por servicio, scripts `setup-project`/`start-stack` ([runbook](../platform/local-stack.md)). Hoy roto por X-12 |

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
