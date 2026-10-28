# Gaps transversales

Problemas que involucran **a más de un servicio**. Los gaps internos de cada MS van en `services/<ms>/gaps.md`.
Relevado el 2026-10-23 a partir del código de los repos de la org; X-01 a X-04, X-06, X-07, X-10 y X-11 revisados el 2026-10-24 con la ficha de MS5. Al resolver uno, márcalo como cerrado e indica el PR.

| Id | Gap | Severidad | Servicios | Estado |
|---|---|---|---|---|
| X-01 | MS5 no llama a `PATCH /delivery-result` de MS4 | high | MS5, MS4 | abierto |
| X-02 | Los 10 exchanges de logística no tienen colas enlazadas | medium | MS5, consumidores | abierto |
| X-03 | MS5 no valida JWT ni tiene scopes en el kernel | high | MS5, kernels | abierto |
| X-04 | No hay repo de MS1 en la org (y MS3 usa pacientes simulados) | high | MS1, MS3 | abierto |
| X-05 | La ruta de identity en el gateway está documentada de dos formas | low | identity, kernels | abierto |
| X-06 | Hay colas declaradas sin consumidor | low | todos | abierto |
| X-07 | Versiones mezcladas de los kernels | medium | todos | abierto |
| X-08 | Sin autorización por objeto (no existe mapeo `sub` → `PatientId`) | high | identity, MS1, MS4 | abierto |
| X-09 | Tabla maestra de endpoints desactualizada o fuera de los repos | low | todos | abierto |
| X-10 | Paquetes MS3 → MS5: MS5 ya consume `package-validated`, falta el `packId` de MS4 en el evento | medium | MS3, MS4, MS5 | parcial |
| X-11 | MS3 no valida JWT ni tiene scopes en el kernel | high | MS3, kernels | abierto |

## Detalle

### X-01 — El ciclo de entrega no se cierra
MS4 expone `PATCH /api/v1/calendars/days/{dayId}/delivery-result` (scope `deliveryCalendar.deliveryResult:edit`), que es el **único** camino para que un día pase a `Delivered`/`Failed`. MS5 registra entregas y fallos (`/deliver`, `/fail`) y publica `delivery-completed`/`delivery-failed`, pero no llama a MS4 ni nadie consume esos eventos. **Impacto:** todos los días quedan en `ReadyForProduction` para siempre.

**Confirmado por MS5 (2026-10-24):** MS5 no tiene cliente HTTP hacia MS4 ni service account, y **no conoce el `dayId`**. Su entrega solo guarda un `PackageId` de texto libre que trae quien llama a `POST /packages/deliveries` (y hoy nadie lo llama: X-10). Los eventos tampoco ayudan: `DeliveryCompleted` lleva `DeliveryId, RouteId, DeliveredAt` (sin `PackageId` ni evidencia) y `DeliveryFailed` lleva `DeliveryId, RouteId, Reason`. Cualquiera de las dos opciones necesita primero que `PackageId` sea el `packId` de MS4 (= `DeliveryDayId`).

**Opciones:**
- (a) MS5 llama al endpoint vía gateway con una service account `ms5-service`.
- (b) MS4 consume `delivery-completed`/`delivery-failed`. Requiere que el evento lleve el `dayId` de MS4 o el `PackageId` (hoy lleva `DeliveryId`/`RouteId` de MS5), sumar la evidencia (foto, firma) al contrato del kernel y crear las colas `ms4.delivery-*`.

Decidirlo con un ADR.

### X-02 — Eventos de logística sin destino
`rabbitmq-definitions.json` declara los 10 exchanges de MS5 pero ninguna cola de consumidor. Lo publicado **no se descarta** mientras corra el worker de MS5: su `DefaultQueueRegistrar` declara la cola durable `nurtricenter.default`, enlazada a los 10 exchanges y nunca consumida (sink de historial). Pero **ningún servicio reacciona** a esos eventos. Tres de los diez (`courier-status-changed`, `courier-assigned-to-route`, `route-cancelled`) ni siquiera se publican: sus métodos de dominio no tienen endpoint (ms5-gap-07).

### X-03 — MS5 sin seguridad
MS5 solo llama a `AddAuthorization()`, sin `AddSecurity()` del kernel, y no existen scopes `logistics.*` en `Nur.Tricenter.Access`. Además se registra en Consul como `nurtricenter`, así que su prefijo en el gateway es `/api/nurtricenter`, no un nombre de dominio.

**Confirmado por MS5 (2026-10-24):** ningún endpoint tiene `RequireAuthorization` ni `[Authorize]`; a través del gateway cualquiera puede crear repartidores y rutas, cargar paquetes y cerrar entregas. MS5 tampoco tiene service account (su única llamada saliente va sin token).

### X-04 — MS1 sin repo
Los demás lo referencian (hay colas `ms1.*`), pero el código no está en la org. MS3 ya tiene repo; mientras MS1 no exista, MS3 trabaja con 3 pacientes simulados. MS5 llama a un "ClinicService", que es MS1 (confirmado por el owner de MS5), contra un mock de Postman: `POST /api/v1/patients/contact-information` con un array de `patientId` (texto), respuesta `[{ patientId, phoneNumber, fullName }]`, **directo** (sin gateway) y sin token. Ese contrato lo definió MS5 y no está en ningún kernel; el MS1 real tendría que respetarlo o MS5 adaptarse.

### X-05 — Ruta de identity
El gateway arma el prefijo con el nombre en Consul (`identity-service`) → `/api/identity-service/**`, que es lo que usa MS4. El README de identity y el `Base` de `IdentityPermission` en el kernel dicen `/api/identity`.

### X-06 — Colas sin consumidor
Por ejemplo `ms4.recipe-published`, `ms4.food-*`, `ms4.user-*`, `ms2.user-updated` y todas las `ms5.*` (7 colas: `food-*`, `recipe-*`, `meal-plan-published`, `user-*`; MS5 no consume nada hoy). Se acumulan mensajes sin que nadie los lea. O se consumen, o se quitan de la topología.

### X-07 — Kernels en versiones distintas
MS2 e identity en 1.0.9, MS4 en 1.1.0 (que agrega `DeliveryCalendarPermission`). MS5 usa **solo** `Nur.Tricenter.Integration` 1.1.0 (no `Access`, `Security` ni `Observability`); su doc decía que 1.1.0 era "la versión de toda la plataforma", lo que no se cumple para MS2 e identity. Los contratos de eventos pueden divergir entre publisher y consumidor.

### X-08 — Autorización por objeto
Los scopes dicen *qué tipo* de cliente llama, no *de quién* es el recurso. Hace falta que el token (o una consulta a MS1) permita mapear `sub` → `PatientId`.

### X-09 — Tabla maestra de endpoints
Existe una tabla maestra de endpoints MS1–MS5 que no está en ningún repo. No incluye la llamada MS5 → MS4 ni `GET /calendars/{id}`. Esta base de conocimiento debería reemplazarla.

### X-10 — Los paquetes producidos no llegan a logística
MS5 expone `POST /api/v1/packages/deliveries` (array de `{ patientId, packageDetails: { packageId, destination: { address, addressCoordinates: { lat, long } }, additionalDetails } }`), que agrega cada paquete a la ruta de hoy. **Ningún servicio lo llama.** Su forma coincide casi campo por campo con las líneas de `GET /calendars/active-tomorrow` de MS4 (`packId`, `patientId`, `address`, `latitude`, `longitude`), pero no hay contrato acordado.

**Impacto:** en la plataforma ningún paquete llega solo a una ruta; el flujo de punta a punta se corta entre la producción y el reparto.

**Decisión (owner de MS5, 2026-10-24):** MS3 publica un **evento** con los paquetes producidos y MS5 lo consume; `POST /packages/deliveries` queda como entrada manual. **Hecho por MS3 (2026-10-24):** el contrato `PackageValidated` (kernel, rama `feat/contracting-messages`, 1.2.0 sin publicar), el exchange `package-validated` y la cola `ms5.package-validated` (rama `feat/ms3-contracting` de `nur-tricenter-local`) y el publisher vía outbox. Ya figura en `contracts/events.yaml`. **Hecho por MS5 (2026-10-27):** consumidor idempotente de `ms5.package-validated` (`PackageValidatedConsumer`, inbox `InboxMessages`, kernel 1.2.0). Agrega cada paquete a la ruta de hoy, y si llega sin coordenadas usa las de la sucursal. **Pendiente:** que `PackageId` sea el `packId` de MS4 (ver `ms3-gap-03`: hoy es el id del paquete de MS3).

El `packageId` del evento tendría que ser el `packId` de MS4: eso destraba también X-01. Hay que alinear tipos: MS5 usa `string` para `patientId`, MS4 usa `Guid`.

### X-11 — MS3 sin autenticación
Ningún endpoint de MS3 usa `RequireAuthorization` y no tiene permisos en `Nur.Tricenter.Access`. Cualquiera puede, a través del gateway, contratar, cobrar, cancelar y validar paquetes. Es el mismo problema de MS5 (X-03), con más riesgo porque MS3 mueve dinero. Detalle y qué haría falta: `ms3-gap-01`.
