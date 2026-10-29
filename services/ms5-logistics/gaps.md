# Gaps — MS5

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms5-gap-01 | Sin autenticación ni scopes: todos los endpoints son anónimos | high | kernels (`Nur.Tricenter.Access`) | abierto (X-03) |
| ms5-gap-02 | El cierre del día en MS4 depende de que el `PackageId` sea el `packId` de MS4 y de un consumidor de MS4 sin merge | high | MS4 | resuelto (X-01: `DeliveryDayId` en MS5#5; consumidor de MS4 mergeado en MS4#3 y #8) |
| ms5-gap-03 | En `main` no consume `package-validated`: los paquetes se cargan a mano | medium | MS5 (merge de `dev`) | resuelto (MS5#3, `dev` → `main`) |
| ms5-gap-04 | 7 de los 10 eventos publicados no tienen consumidores | low | consumidores | parcial (X-02) |
| ms5-gap-05 | ClinicService es un mock de Postman, se llama directo, sin token y sin resiliencia | medium | MS1 | abierto (X-04) |
| ms5-gap-06 | Los paquetes van a la última ruta de hoy de cualquier repartidor, y se duplican al reenviar | medium | — | abierto |
| ms5-gap-07 | Casos de uso del dominio sin endpoint: 3 eventos inalcanzables y el repartidor nunca cambia de estado | medium | — | abierto |
| ms5-gap-08 | Cerrar la última entrega de una ruta no iniciada devuelve 422 y revierte todo | medium | — | abierto |
| ms5-gap-09 | La API de comandos no es idempotente (reintentos dan 422 o duplican) | medium | — | abierto |
| ms5-gap-10 | "Hoy" se calcula con la hora local del servidor | low | — | abierto |
| ms5-gap-11 | Faltan endpoints de lectura; los `Location` de los 201 apuntan a rutas inexistentes | low | — | abierto |
| ms5-gap-12 | Ocho colas `ms5.*` declaradas sin consumidor en `main` | low | nur-tricenter-local | abierto (X-06) |
| ms5-gap-13 | Sin OpenTelemetry ni kernel de observabilidad | low | kernels | abierto |
| ms5-gap-14 | Respuestas inconsistentes y un test de integración incompleto | low | — | abierto |
| ms5-gap-15 | No migra al arrancar y depende de Neon para correr en la plataforma | low | nur-tricenter-local | abierto (opción offline en nur-tricenter-local#7) |

## Detalle

### ms5-gap-01 — Cualquiera puede operar la logística
- **Qué pasa:** el host llama a `AddAuthorization()`/`UseAuthorization()` pero no registra autenticación (`AddSecurity()` del kernel `Nur.Tricenter.Security`) y ningún endpoint pide `RequireAuthorization`. El kernel `Nur.Tricenter.Access` no tiene `LogisticsPermission` (sí tiene `Catalog`, `Identity` y `DeliveryCalendar`).
- **Impacto:** a través del gateway, cualquiera puede crear repartidores y rutas, cargar paquetes y marcar entregas como entregadas o fallidas. Es el único servicio de negocio sin JWT.
- **Qué haría falta:** agregar los scopes `logistics.*` al kernel (p. ej. `logistics.courier:create`, `logistics.route:{create,start,read}`, `logistics.delivery:{create,edit}`), llamar a `AddSecurity()` y exigir un scope por endpoint. Después, autorización por objeto: que un repartidor solo vea y opere **su** ruta (`sub` → `CourierId`).

### ms5-gap-02 — El cierre del día en MS4 depende de un id que MS5 no controla
- **Qué pasa:** MS5 no llama a `PATCH /delivery-result` de MS4. La decisión tomada es por eventos: MS4 consume `delivery-added-to-route` (para vincular el `DeliveryId` de MS5 con su día), `delivery-completed` y `delivery-failed` por las colas `ms4.delivery-added-to-route`, `ms4.delivery-completed` y `ms4.delivery-failed` (topología mergeada en nur-tricenter-local#6; el código de MS4 está en el PR Nur-tricenter/ms4-delivery-schedule-management#3, **pendiente de merge**). MS4 interpreta `DeliveryAddedToRoute.PackageId` como su `packId` (`DeliveryDay.Id`, un entero); si no lo es, no vincula la entrega.
- **Impacto:** en `main` el `PackageId` es texto libre que trae `POST /packages/deliveries`: el día de MS4 solo se cierra si quien carga el lote usa el `packId` de `active-tomorrow`. MS5 no lo valida. Además `DeliveryCompleted` no lleva evidencia (foto, firma): queda solo en MS5. Mientras el PR de MS4 no se mergee, los `DeliveryDay` siguen en `ReadyForProduction`.
- **Qué haría falta:** que el `packId` de MS4 viaje de punta a punta (en el contrato de `package-validated` o validado en `POST /packages/deliveries`) y, si MS4 la necesita, la evidencia en `DeliveryCompleted`.

### ms5-gap-03 — En `main` los paquetes no llegan por evento
- **Qué pasa:** en `main` el worker es solo productor ("PURE PRODUCER" en `RabbitMqExtensions.cs`), no hay inbox y el kernel es `Nur.Tricenter.Integration` 1.1.0. Los paquetes entran **solo** por `POST /packages/deliveries`.
- **Resuelto en `dev`, pendiente de merge:** la rama `dev` (4 commits por delante de `main`; el cambio entró a `dev` con el PR #2 del repo, `feat/consume-package-validated`) agrega `PackageValidatedConsumer` en la cola `ms5.package-validated` (pipeline `TracingConsumer → IdempotentConsumer → PackageValidatedConsumer`, tabla `InboxMessages`, comando `AddValidatedPackageCommand`, kernel 1.2.0). Ahí cada paquete se agrega a la ruta de hoy más reciente sin consultar a MS1; sin coordenadas usa las de la sucursal; sin ruta de hoy el mensaje termina en la cola de error tras los reintentos.
- **Lo que quedará después del merge:** `PackageValidated.PackageId` es el id del paquete de MS3, no el `packId` de MS4 (`ms3-gap-03`), así que el consumidor de MS4 no podrá vincular esas entregas (ms5-gap-02).
- **Qué haría falta:** mergear `dev` en `main` y agregar el `packId` de MS4 al contrato.

### ms5-gap-04 — Eventos sin destino
- **Qué pasa:** los 10 exchanges existen en la topología. Desde nur-tricenter-local#6, `delivery-added-to-route`, `delivery-completed` y `delivery-failed` tienen las colas `ms4.delivery-*`. Los otros 7 (`courier-*`, `route-*`) solo los recibe el sink `nurtricenter.default`, que nadie lee.
- **Impacto:** no se pierden mientras el worker de MS5 haya declarado el sink, pero ningún servicio reacciona a los eventos de repartidores y rutas.
- **Qué haría falta:** que los consumidores interesados (p. ej. MS3 con `route-completed`) pidan sus colas en `nur-tricenter-local`.

### ms5-gap-05 — Dependencia síncrona frágil con ClinicService
- **Qué pasa:** `ClinicService__BaseUrl` apunta a un mock de Postman; la llamada sale directo (no por el gateway), sin token, sin reintentos ni timeout propio. Los errores del destino se devuelven como **422** (y un timeout como 500). `PhoneNumber` se recibe y no se usa.
- **Impacto:** si el destino cae, no se pueden cargar paquetes **y el repartidor no puede ver su ruta del día**, aunque esté completa en la BD.
- **Qué haría falta:** el MS1 real detrás del gateway con una service account; un resilience handler (reintentos + timeout); devolver 502/503 ante fallos del destino; y en `route/today` degradar al `patientId` en vez de fallar (o guardar el nombre del paciente al crear la entrega).

### ms5-gap-06 — Asignación de paquetes a rutas
- **Qué pasa:** `AddDeliveriesHandler` usa `GetLatestRouteForTodayAsync`: la ruta con fecha de hoy creada más recientemente, sin filtrar por repartidor, zona ni estado. No hay unicidad por `PackageId`, ni de ruta por `(CourierId, ScheduledDate)`; `GetByCourierAndDateAsync` toma una cualquiera si hay varias.
- **Impacto:** con más de un repartidor por día, todos los paquetes caen en la misma ruta. Reenviar un lote duplica entregas.
- **Qué haría falta:** que el request indique la ruta (o el repartidor), o un criterio de asignación explícito; índices únicos en `PackageId` y en `(CourierId, ScheduledDate)`.

### ms5-gap-07 — Dominio más rico que la API
- **Qué pasa:** `Route.AssignCourier`, `Route.CancelRoute` y `Courier.SetStatus` existen, están testeados y tienen evento y publisher, pero **ningún endpoint ni caso de uso los llama**.
- **Impacto:** `courier-assigned-to-route`, `route-cancelled` y `courier-status-changed` nunca se publican. Un repartidor nunca pasa a `OnRoute` (iniciar la ruta no lo cambia). Una ruta no se puede cancelar.
- **Qué haría falta:** endpoints para reasignar y cancelar, y cambiar el estado del repartidor al iniciar y completar la ruta.

### ms5-gap-08 — Rollback al cerrar una ruta no iniciada
- **Qué pasa:** `/deliver` y `/fail` aceptan entregas `Pending` (ruta sin iniciar). Si es la última abierta, `CompleteRouteWhenAllDeliveriesCompletedHandler` llama a `CompleteRoute`, que exige `InProgress` y lanza `Route.CannotComplete` dentro del commit.
- **Impacto:** la petición devuelve 422 y **no se guarda ni la entrega**. Las anteriores de esa ruta sí quedaron guardadas, así que la ruta queda trabada: tampoco se puede iniciar, porque `StartRoute` intenta pasar a `InProgress` entregas que ya son terminales y falla con `Delivery.AlreadyStarted`.
- **Qué haría falta:** exigir ruta `InProgress` para registrar resultados, o que el handler de cierre ignore rutas no iniciadas.

### ms5-gap-09 — Reintentos inseguros
- **Qué pasa:** `start`, `deliver` y `fail` responden 422 si se repiten; `POST /couriers`, `/routes` y `/packages/deliveries` crean duplicados.
- **Impacto:** un timeout en la app del repartidor (red móvil) se ve como error aunque la operación se haya guardado.
- **Qué haría falta:** que repetir el mismo resultado devuelva 200 sin cambios (como hace MS4 en `delivery-result`) y claves de idempotencia en los `POST` de alta.

### ms5-gap-10 — Zona horaria de "hoy"
`DateTime.Today` (hora local del proceso) decide qué ruta es "de hoy" (`AddDeliveries`, `route/today`) y qué fecha es "pasada" (`CreateRouteValidator`). En contenedor la hora es UTC: en Bolivia (UTC−4), a partir de las 20:00 "hoy" ya es mañana.

### ms5-gap-11 — Lecturas y `Location`
No hay `GET` de repartidor, de ruta por id ni listados. Los `201 Created` devuelven `Location` hacia `/api/v1/couriers/{id}`, `/api/v1/routes/{id}` y `/api/v1/packages/deliveries/{routeId}`, que no existen.

### ms5-gap-12 — Colas sin consumidor
`ms5.food-published`, `ms5.food-nutritional-info-updated`, `ms5.recipe-published`, `ms5.recipe-updated`, `ms5.meal-plan-published`, `ms5.user-published` y `ms5.user-updated` están en la topología y acumulan mensajes. MS5 no las necesita (lo que va a consumir son eventos de MS3): conviene quitarlas de la topología. La octava, `ms5.package-validated`, también acumula mensajes en `main`; la lee el consumidor de la rama `dev` (ms5-gap-03).

### ms5-gap-13 — Observabilidad
No usa `Nur.Tricenter.Observability` ni exporta trazas. El `CorrelationId` de los eventos es el trace id del `Activity` de la petición, pero solo se ve en los logs de Serilog.

### ms5-gap-14 — Detalles de calidad
- `status` sale como número en `POST /couriers` y `POST /routes`, como texto en los demás y en minúsculas en `POST /packages/deliveries`.
- `GET …/route/today` no ordena por `sequenceOrder`, y el respaldo `index + 1` para entregas sin secuencia puede repetir números.
- `RouteLifecycleIntegrationTests.CompleteDeliveryLifecycle_CreatesRoute_AddsDeliveries_Starts_AndCompletes` solo crea el repartidor y la ruta: no prueba lo que dice su nombre.
- No hay validación de rango de coordenadas.

### ms5-gap-15 — Migraciones y BD en la plataforma
MS5 no aplica migraciones al arrancar (las de Neon se aplican a mano) y en la plataforma necesita el `.env` con la cadena de Neon. Sin credenciales, la única forma de correrlo en local es apuntar el `.env` a la BD `ms5_logistics` del Postgres compartido (la crea `start-stack` desde nur-tricenter-local#7) y correr `dotnet ef database update`. Al mergear `dev` hay que aplicar `AddInboxMessages` en Neon. Opción: un job `--migrate` one-shot como el de MS4.

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código**.

| Dónde | La doc dice | El código hace |
|---|---|---|
| `knowledge/platform/communication.md` (matriz, antes de este PR) | MS5 → ClinicService `GET /patients/contact-information` | `POST /api/v1/patients/contact-information`, directo, con un array de ids en el cuerpo (`ClinicService.cs`). Corregido en este PR |
| `knowledge/gaps/cross-service-gaps.md` X-02 (antes de este PR) | Lo que se publica en los exchanges de MS5 "se descarta" | El worker declara `nurtricenter.default` enlazada a los 10 exchanges: los mensajes se acumulan ahí. Corregido en este PR |
| `knowledge/gaps/cross-service-gaps.md` X-07 y `platform/architecture.md` (antes de este PR) | MS5 usa los kernels en 1.0.10+ | Solo usa `Nur.Tricenter.Integration` **1.1.0** (`contracts/Nurtricenter.Contracts.csproj`); no usa `Access`, `Security` ni `Observability`. Corregido en los dos en este PR |
| `knowledge/platform/local-stack.md` (antes de este PR) | La carpeta por defecto de MS5 es `nurtricenter-logistics-and-delivery` y hay que setear `NURTRICENTER_REPO_DIR` | `nur-tricenter-local` ya usa `ms5-logistics-and-delivery` por defecto. Corregido en este PR |
| `README.md` del repo | "Las colas por consumidor (p. ej. `ms4.route-completed`) las declara cada microservicio consumidor en `rabbitmq-definitions.json`" | No existe ninguna cola de consumidor para los exchanges de MS5; `ms4.route-completed` no está en la topología |
| `docs/connectivity-and-messaging.md` §4.1 | `Nur.Tricenter.Integration` 1.1.0 es "la versión que fija cada servicio de la plataforma" | Según X-07, MS2 e identity siguen en 1.0.9 |
| `docs/domain-model.md` (tabla de eventos) | `CourierCreatedEvent` lleva `Id` | Lleva `CourierId` |
| `CLAUDE.md` del repo (sección CQRS) | Los comandos devuelven `Result`/`Result<T>` y las queries usan `AppDbContext` directamente | Los handlers devuelven DTOs y lanzan `DomainException`; `GetCourierTodayRouteHandler` usa los repositorios |
| `CLAUDE.md` del repo | `Joseco.DDD.Core` 1.0.2 | `Nurtricenter.Core.csproj` referencia 1.0.3 |
| Esta ficha (antes del 2026-10-28; revisión transversal: la ficha describía `dev`) | MS5 consume `package-validated` (`PackageValidatedConsumer`, `events_consumed` con `ms5.package-validated`) y ms5-gap-03 estaba "Resuelto" | En `main` no hay consumidor: `RabbitMqExtensions.cs` dice "PURE PRODUCER" y `Program.cs` del worker no registra ninguno. El consumidor existe solo en `dev`. Corregido: `events_consumed: []`, ms5-gap-03 "resuelto en `dev`, pendiente de merge" |
| Esta ficha (antes del 2026-10-28; revisión transversal: la ficha describía `dev`) | Kernel `Nur.Tricenter.Integration` 1.2.0, consume `Messages.Contracting` | `main` referencia 1.1.0 en `contracts/Nurtricenter.Contracts.csproj`; 1.2.0 solo en `dev`. Corregido |
| Esta ficha (antes del 2026-10-28; revisión transversal: la ficha describía `dev`) | Inbox atómico (`InboxMessages`, `IdempotentConsumer`, `AddValidatedPackageCommand`) y registro en `RabbitMqExtensions.AddNurtricenterConsumers` | Nada de eso existe en `main` (ni la tabla ni la migración `AddInboxMessages`). Corregido en messaging.md, domain.md y flows.md |
| Esta ficha (antes del 2026-10-28; revisión transversal: la ficha describía `dev`) | `POST /packages/deliveries` es un "respaldo manual" del evento de MS3 | En `main` es la **única** entrada de paquetes. Corregido en api.md, integrations.md y service.yaml |
| Esta ficha (antes del 2026-10-28; revisión transversal: la ficha describía `dev`) | Los 10 exchanges de MS5 no tienen colas de consumidor; "ningún servicio reacciona" | `ms4.delivery-added-to-route`, `ms4.delivery-completed` y `ms4.delivery-failed` existen en la topología (nur-tricenter-local#6) y MS4 las consume en su PR #3 (sin merge). Corregido en messaging.md, flows.md y ms5-gap-04 |
| Esta ficha (antes del 2026-10-28; revisión transversal: la ficha describía `dev`) | Consul: solo el nombre `nurtricenter` | Además `ServiceId` `nurtricenter-1` por configuración; el default del código es `nurtricenter-service` para nombre e id (`ServiceRegistrationOptions`). Agregado en README |
