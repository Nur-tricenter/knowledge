# Gaps transversales

Problemas que involucran **a más de un servicio**. Los gaps internos de cada MS van en `services/<ms>/gaps.md`.
Relevado el 2026-10-23 a partir del código de los repos de la org; X-01 a X-04, X-06, X-07, X-10 y X-11 revisados el 2026-10-24 con la ficha de MS5. **Revisión transversal del 2026-10-28** contra el código de todos los repos (`main` de cada uno; MS1 en su repo externo): actualiza X-02, X-04, X-06, X-07 y X-10 y agrega X-12 a X-14. Al resolver uno, márcalo como cerrado e indica el PR.

| Id | Gap | Severidad | Servicios | Estado |
|---|---|---|---|---|
| X-01 | El ciclo de entrega solo cierra si `PackageId` es el `packId` de MS4 | high | MS3, MS5, MS4 | parcial |
| X-02 | De los 10 exchanges de logística, solo los 3 de entrega tienen consumidor (MS4) | medium | MS5, consumidores | parcial |
| X-03 | MS5 no valida JWT ni tiene scopes en el kernel | high | MS5, kernels | abierto |
| X-04 | MS1 tiene repo, pero fuera de la org y sin integrar (MS3 usa pacientes simulados, MS5 un mock) | high | MS1, MS3, MS5 | abierto |
| X-05 | La ruta de identity en el gateway está documentada de dos formas | low | identity, kernels | abierto |
| X-06 | Hay colas declaradas sin consumidor | low | todos | abierto |
| X-07 | Versiones mezcladas de los kernels | medium | todos | abierto |
| X-08 | Sin autorización por objeto (no existe mapeo `sub` → `PatientId`) | high | identity, MS1, MS4 | abierto |
| X-09 | Tabla maestra de endpoints desactualizada o fuera de los repos | low | todos | abierto |
| X-10 | Paquetes MS3 → MS5: el consumidor de `package-validated` está solo en la rama `dev` de MS5, y falta el `packId` de MS4 en el evento | medium | MS3, MS4, MS5 | parcial |
| X-11 | MS3 no valida JWT ni tiene scopes en el kernel | high | MS3, kernels | abierto |
| X-12 | El stack local no levanta: identity fuera del compose e include/builds de MS1 inexistentes | high | local, identity, MS1, todos | abierto |
| X-13 | MS1 no es integrable: SQL Server propio, sin Consul, sin JWT, contrato de evento fuera del kernel | high | MS1, MS3, MS4, MS5 | abierto |
| X-14 | Escalada de privilegios: `POST /users` de identity acepta `platform:*` | high | identity, todos | abierto |

## Detalle

### X-01 — El ciclo de entrega no se cierra
> **Actualización 2026-10-28:** se eligió la opción (b). MS5 ya publica `delivery-added-to-route`, `delivery-completed` y `delivery-failed`, y MS4 los consume ([MS4#3](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/3) y las colas `ms4.delivery-*` en [nur-tricenter-local#6](https://github.com/Nur-tricenter/nur-tricenter-local/pull/6), ambos pendientes de merge). **Queda abierto** porque MS3 manda su propio GUID como `PackageId` (X-10, ms3-gap-03) y MS4 solo reconoce el `packId`; además `DeliveryCompleted` no lleva evidencia. El texto de abajo es el análisis original.

MS4 expone `PATCH /api/v1/calendars/days/{dayId}/delivery-result` (scope `deliveryCalendar.deliveryResult:edit`), que es el **único** camino para que un día pase a `Delivered`/`Failed`. MS5 registra entregas y fallos (`/deliver`, `/fail`) y publica `delivery-completed`/`delivery-failed`, pero no llama a MS4 ni nadie consume esos eventos. **Impacto:** todos los días quedan en `ReadyForProduction` para siempre.

**Confirmado por MS5 (2026-10-24):** MS5 no tiene cliente HTTP hacia MS4 ni service account, y **no conoce el `dayId`**. Su entrega solo guarda un `PackageId` de texto libre que trae quien llama a `POST /packages/deliveries` (y hoy nadie lo llama: X-10). Los eventos tampoco ayudan: `DeliveryCompleted` lleva `DeliveryId, RouteId, DeliveredAt` (sin `PackageId` ni evidencia) y `DeliveryFailed` lleva `DeliveryId, RouteId, Reason`. Cualquiera de las dos opciones necesita primero que `PackageId` sea el `packId` de MS4 (= `DeliveryDayId`).

**Opciones:**
- (a) MS5 llama al endpoint vía gateway con una service account `ms5-service`.
- (b) MS4 consume `delivery-completed`/`delivery-failed`. Requiere que el evento lleve el `dayId` de MS4 o el `PackageId` (hoy lleva `DeliveryId`/`RouteId` de MS5), sumar la evidencia (foto, firma) al contrato del kernel y crear las colas `ms4.delivery-*`.

Decidirlo con un ADR.

### X-02 — Eventos de logística sin destino
> **2026-10-28:** `delivery-added-to-route`, `delivery-completed` y `delivery-failed` ya tienen colas (`ms4.delivery-*`, nur-tricenter-local#6) y consumidor en MS4 (MS4#3, pendiente de merge). Los otros 7 exchanges siguen sin consumidor.

Texto original: `rabbitmq-definitions.json` declara los 10 exchanges de MS5 pero ninguna cola de consumidor. Lo publicado **no se descarta** mientras corra el worker de MS5: su `DefaultQueueRegistrar` declara la cola durable `nurtricenter.default`, enlazada a los 10 exchanges y nunca consumida (sink de historial). Pero **ningún servicio reacciona** a esos eventos. Tres de los diez (`courier-status-changed`, `courier-assigned-to-route`, `route-cancelled`) ni siquiera se publican: sus métodos de dominio no tienen endpoint (ms5-gap-07).

### X-03 — MS5 sin seguridad
MS5 solo llama a `AddAuthorization()`, sin `AddSecurity()` del kernel, y no existen scopes `logistics.*` en `Nur.Tricenter.Access`. Además se registra en Consul como `nurtricenter`, así que su prefijo en el gateway es `/api/nurtricenter`, no un nombre de dominio.

**Confirmado por MS5 (2026-10-24):** ningún endpoint tiene `RequireAuthorization` ni `[Authorize]`; a través del gateway cualquiera puede crear repartidores y rutas, cargar paquetes y cerrar entregas. MS5 tampoco tiene service account (su única llamada saliente va sin token).

### X-04 — MS1 sin integrar
> **2026-10-28:** MS1 **sí tiene código**, en un repo fuera de la org: `Juandcode/ClinicaNutricionalMicroservicio1` (lo clona `setup-project` como `ms1-clinica-nutricional`). No expone `POST /api/v1/patients/contact-information` ni guarda teléfono ni dirección, así que no cumple el contrato que espera MS5. Por qué no se puede enchufar todavía: X-13. Ficha: [ms1-clinic](../services/ms1-clinic/README.md) (`draft`).

Texto original: los demás lo referencian (hay colas `ms1.*`), pero el código no está en la org. MS3 ya tiene repo; mientras MS1 no exista, MS3 trabaja con 3 pacientes simulados. MS5 llama a un "ClinicService", que es MS1 (confirmado por el owner de MS5), contra un mock de Postman: `POST /api/v1/patients/contact-information` con un array de `patientId` (texto), respuesta `[{ patientId, phoneNumber, fullName }]`, **directo** (sin gateway) y sin token. Ese contrato lo definió MS5 y no está en ningún kernel; el MS1 real tendría que respetarlo o MS5 adaptarse.

### X-05 — Ruta de identity
El gateway arma el prefijo con el nombre en Consul (`identity-service`) → `/api/identity-service/**`, que es lo que usa MS4. El README de identity y el `Base` de `IdentityPermission` en el kernel dicen `/api/identity`. Además, la tabla `IdentityRoutes` del kernel pide `identity.user:create` para `POST /users` (el servicio exige `:manage`), lista un `GET /users` que no existe y comenta que crear usuarios es anónimo.

### X-06 — Colas sin consumidor
Por ejemplo `ms4.recipe-published`, `ms4.food-*`, `ms4.user-*`, `ms2.user-updated`, todas las `ms1.*` (MS1 no consume nada) y las `ms5.*` (en `main` MS5 no consume nada; en `dev` consume `ms5.package-validated`). Se acumulan mensajes sin que nadie los lea. O se consumen, o se quitan de la topología. Al revés también pasa: identity declara en runtime la cola durable `identity.default` (y MS1 `gestion-clinica-nutricional.default`), que no figuran en `rabbitmq-definitions.json`.

### X-07 — Kernels en versiones distintas
> **2026-10-28:** MS2 e identity ya están en 1.1.0, igual que MS4. Lo que queda:

| Servicio | Kernels |
|---|---|
| MS2, identity, MS4 | `Access`, `Security`, `Integration` 1.1.0 (MS2 e identity también `Observability`) |
| MS5 | solo `Integration` 1.1.0 en `main` (1.2.0 en `dev`) |
| MS3 | ninguno: copias locales de los contratos (`PackageValidated`, eventos del catálogo) |
| MS1 | ninguno: contrato local `PacientePublished` (Joseco `IntegrationMessage`) |
| Gateway | ninguno |

La 1.2.0 (agrega `PackageValidated`) está en el repo de kernels. Los contratos copiados pueden divergir del publisher sin que nada falle.

### X-08 — Autorización por objeto
Los scopes dicen *qué tipo* de cliente llama, no *de quién* es el recurso. Hace falta que el token (o una consulta a MS1) permita mapear `sub` → `PatientId`.

### X-09 — Tabla maestra de endpoints
Existe una tabla maestra de endpoints MS1–MS5 que no está en ningún repo. No incluye la llamada MS5 → MS4 ni `GET /calendars/{id}`. Esta base de conocimiento debería reemplazarla.

### X-10 — Los paquetes producidos no llegan a logística
MS5 expone `POST /api/v1/packages/deliveries` (array de `{ patientId, packageDetails: { packageId, destination: { address, addressCoordinates: { lat, long } }, additionalDetails } }`), que agrega cada paquete a la ruta de hoy. **Ningún servicio lo llama.** Su forma coincide casi campo por campo con las líneas de `GET /calendars/active-tomorrow` de MS4 (`packId`, `patientId`, `address`, `latitude`, `longitude`), pero no hay contrato acordado.

**Impacto:** en la plataforma ningún paquete llega solo a una ruta; el flujo de punta a punta se corta entre la producción y el reparto.

**Decisión (owner de MS5, 2026-10-24):** MS3 publica un **evento** con los paquetes producidos y MS5 lo consume; `POST /packages/deliveries` queda como entrada manual. **Hecho por MS3 (2026-10-24):** el contrato `PackageValidated` (kernel `main`, versión 1.2.0; MS3 todavía usa una copia local equivalente), el exchange `package-validated` y la cola `ms5.package-validated` (rama `feat/ms3-contracting` de `nur-tricenter-local`) y el publisher vía outbox. Ya figura en `contracts/events.yaml`. **Hecho por MS5 (2026-10-27), solo en la rama `dev`:** consumidor idempotente de `ms5.package-validated` (`PackageValidatedConsumer`, inbox `InboxMessages`, kernel 1.2.0). Agrega cada paquete a la ruta de hoy, y si llega sin coordenadas usa las de la sucursal. **Al 2026-10-28 no está en `main`** (MS5 `main` es productor puro), que es lo que levanta el stack local. **Pendiente:** que `PackageId` sea el `packId` de MS4 (ver `ms3-gap-03`: hoy es el id del paquete de MS3).

El `packageId` del evento tendría que ser el `packId` de MS4: eso destraba también X-01. Hay que alinear tipos: MS5 usa `string` para `patientId`, MS4 usa `Guid`.

### X-11 — MS3 sin autenticación
Ningún endpoint de MS3 usa `RequireAuthorization` y no tiene permisos en `Nur.Tricenter.Access`. Cualquiera puede, a través del gateway, contratar, cobrar, cancelar y validar paquetes. Es el mismo problema de MS5 (X-03), con más riesgo porque MS3 mueve dinero. Detalle y qué haría falta: `ms3-gap-01`.

### X-12 — El stack local no levanta
`nur-tricenter-local` (`main` 4a1d700):
- `compose/docker-compose.yml` perdió el include de `../../nur-tricenter-identity/identity.compose.yml` (el commit `acce166`, que integró MS1, reemplazó esa línea). El encabezado del archivo todavía lo lista. Sin identity no hay login: `start-stack` falla al crear las service accounts, y MS3 y MS4 no obtienen token.
- Incluye `../../ms1-clinica-nutricional/ms1.compose.yml`, que no existe en el repo de MS1, y `start-stack.*` compila `src/ClinicaNutricional.Api` y `src/ClinicaNutricional.WorkerService`, que tampoco existen (los proyectos reales están en la raíz del repo).
- `docker compose up` falla por el include faltante. `start-stack.sh` (`set -e`) corta en el primer build de MS1; `start-stack.ps1` no revisa esos builds y falla recién en el compose.

**Impacto:** nadie puede levantar la plataforma completa desde `main`.
**Qué haría falta:** volver a incluir `identity.compose.yml` y quitar MS1 del compose y de los scripts hasta que tenga un fragmento de plataforma (X-13). Mientras tanto: [arreglo temporal en local-stack.md](../platform/local-stack.md#arreglo-temporal-mientras-x-12-siga-abierto).

### X-13 — MS1 no es integrable todavía
Para entrar al stack, MS1 necesita lo que ya tienen los demás y hoy no tiene:
- **Persistencia:** usa SQL Server con la cadena hardcodeada (`localhost\SQLEXPRESS`, la de `appsettings` se ignora). No puede usar el Postgres compartido ni tiene base en `01-create-databases.sql`.
- **Descubrimiento:** no se registra en Consul, así que el gateway no lo rutea.
- **Seguridad:** no valida JWT; todos sus endpoints son anónimos. No hay scopes de MS1 en el kernel.
- **Contratos:** publica `PacientePublished` en `paciente-published` con un contrato local (no usa `Nur.Tricenter.Integration`). Ese exchange no está en la topología, y el evento tiene los campos cruzados y el `PacienteId` vacío (detalle en la [ficha](../services/ms1-clinic/gaps.md)).
- **Lo que esperan los demás:** MS5 llama a `POST /api/v1/patients/contact-information` (hoy contra un mock) y MS4 necesita mapear `sub` → `PatientId` (X-08). MS1 no expone ni guarda ninguna de las dos cosas.
- **Compose:** solo tiene un `docker-compose.yml` standalone con una imagen publicada; no hay `ms1.compose.yml` (X-12).

### X-14 — Escalada de privilegios en identity
`POST /api/v1/users` exige `identity.user:manage` y rechaza `identity:*`, pero acepta cualquier otro scope sin validarlo, incluido `platform:*`. Al hacer login, `platform:*` se expande a todos los scopes de la plataforma. Quien tenga `identity.user:manage` puede crear un administrador completo. Además no hay endpoints para listar usuarios, revocar scopes ni desactivar cuentas, así que una cuenta creada no se puede deshabilitar sin tocar la base.

**Qué haría falta:** rechazar `platform:*` (o permitirlo solo a administradores) y validar los scopes contra `Permission.PermissionsList` del kernel. Detalle en la [ficha de identity](../services/identity-service/gaps.md).
