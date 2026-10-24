# Enfoque del módulo: comunicación entre microservicios

Esta página conecta **cada concepto del módulo** con **dónde se ve en el proyecto real**. Sirve para estudiar, para preparar la presentación y como guion de la futura app visual.

> Cada owner agrega aquí las evidencias de su servicio cuando carga su ficha (columna "Evidencia").

## Concepto → evidencia en Nur-Tricenter

| # | Concepto | Qué es | Evidencia en el proyecto |
|---|---|---|---|
| 1 | API Gateway | Punto de entrada único que oculta la topología interna | `nur-tricenter-api-gateway`: YARP + Consul, `/api/{servicio}/**` |
| 2 | Service discovery | Encontrar instancias sanas sin IPs fijas | Auto-registro en Consul + health check `/health` (MS2, MS4, identity) |
| 3 | Comunicación síncrona (REST) | Petición/respuesta, acoplamiento temporal | MS3 → MS4 `POST /schedule`; MS4 → MS2 `GET /meal-plans/{id}` |
| 4 | Comunicación asíncrona (eventos) | Publicar hechos sin conocer a los consumidores | MS2 → `meal-plan-published` → MS4 |
| 5 | Pub/Sub con fanout | Cada consumidor recibe su copia | Colas `{msN}.{exchange}` en `rabbitmq-definitions.json` |
| 6 | Contratos compartidos | Esquema común de mensajes | Kernel `Nur.Tricenter.Integration` |
| 7 | Transactional outbox | No perder eventos entre la BD y el broker | `Joseco.Outbox.EFCore` en MS2, identity y MS5 |
| 8 | Inbox / consumidor idempotente | Tolerar la entrega at-least-once | `IdempotentConsumer` + tabla `InboxMessages` (MS4, MS2) |
| 9 | Idempotencia en APIs | Reintentos sin efectos duplicados | MS4 `POST /schedule` por `contractId`; `PATCH /delivery-result` |
| 10 | Consistencia eventual | Copias locales que convergen | MS4 `PlanCatalog`, MS2 `PlanAuthors` |
| 11 | Database per service | Cada servicio dueño de sus datos | Una BD por servicio en el Postgres compartido |
| 12 | Autenticación servicio a servicio | Identidad de máquina con mínimo privilegio | Service account `ms4-service` → MS2 |
| 13 | Autorización por scopes | Permiso por endpoint | Kernel `Nur.Tricenter.Access` + `RequireAuthorization` |
| 14 | Resiliencia | Reintentos, timeouts, degradación | MS4: si MS2 cae, el día queda en `Scheduled` y el job se re-ejecuta |
| 15 | Trazabilidad distribuida | Seguir una operación entre servicios | `CorrelationId` + `TracingConsumer` + OpenTelemetry |
| 16 | Query vs evento (trade-off) | Elegir el estilo según la necesidad | `GET /active-tomorrow` reemplazó al evento `ProductionOrderRequired` |
| 17 | Contenedores y orquestación local | Levantar N servicios juntos | `nur-tricenter-local`: compose con `include:` por servicio |

## Preguntas para defender en la presentación
- ¿Por qué el gateway no valida el token y cada servicio sí?
- ¿Qué pasa si RabbitMQ recibe el mismo evento dos veces? ¿Y si el servicio muere entre guardar y publicar?
- ¿Por qué MS4 resuelve el menú de mañana **antes** de que MS3 lo pida?
- ¿Qué gana MS4 guardando su copia de los planes de MS2 en vez de llamarlo cada vez? ¿Qué pierde?
- ¿Qué se rompe hoy si MS5 nunca avisa el resultado de la entrega? (ver gaps)

## Guion para la app visual (borrador)
1. **El negocio:** el ciclo del paciente (de [../platform/overview.md](../platform/overview.md)).
2. **El mapa:** grafo de servicios generado desde `services/*/service.yaml` + `platform/platform.yaml`.
3. **Síncrono:** animar una petición MS3 → gateway → MS4 → MS2.
4. **Asíncrono:** animar un evento MS2 → exchange → colas → consumidores.
5. **Garantías:** outbox, inbox e idempotencia, con ejemplos reales.
6. **Lo que falta:** gaps transversales como hoja de ruta.
