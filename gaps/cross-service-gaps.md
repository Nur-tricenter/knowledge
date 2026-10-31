# Gaps transversales

Problemas que involucran **a más de un servicio**. Los gaps internos de cada MS van en `services/<ms>/gaps.md`.
Relevado el 2026-10-23 a partir del código de los repos de la org; X-01 a X-04, X-06, X-07, X-10 y X-11 revisados el 2026-10-24 con la ficha de MS5. **Revisión transversal del 2026-10-28** contra el código de todos los repos (`main` de cada uno; MS1 en su repo externo): actualiza X-02, X-04, X-06, X-07 y X-10 y agrega X-12 a X-14. **Actualización del 2026-10-29** con los PR mergeados el 28 y 29: cierra X-01, X-10, X-12 y X-16; actualiza X-04, X-06 y X-07. Al resolver uno, márcalo como cerrado e indica el PR.

| Id | Gap | Severidad | Servicios | Estado |
|---|---|---|---|---|
| X-01 | El ciclo de entrega solo cierra si `PackageId` es el `packId` de MS4 | high | MS3, MS5, MS4 | resuelto (kernel#5, MS3#6, MS5#5, MS4#6 y #8); falta la evidencia en `DeliveryCompleted` |
| X-02 | De los 10 exchanges de logística, solo los 3 de entrega tienen consumidor (MS4) | medium | MS5, consumidores | parcial |
| X-03 | MS5 no valida JWT ni tiene scopes en el kernel | high | MS5, kernels | abierto |
| X-04 | MS1 integrado a la plataforma desde 2026-10-31; MS3 sigue con pacientes simulados y MS5 no llama a MS1 (MS5#4) | medium | MS1, MS3, MS5 | abierto (parcial) |
| X-05 | La ruta de identity en el gateway está documentada de dos formas | low | identity, kernels | abierto |
| X-06 | Hay colas declaradas sin consumidor | low | todos | abierto |
| X-07 | Versiones mezcladas de los kernels | medium | todos | abierto |
| X-08 | Sin autorización por objeto (no existe mapeo `sub` → `PatientId`) | high | identity, MS1, MS4 | abierto |
| X-09 | Tabla maestra de endpoints desactualizada o fuera de los repos | low | todos | abierto |
| X-10 | Paquetes MS3 → MS5: el consumidor de `package-validated` está solo en la rama `dev` de MS5, y falta el `packId` de MS4 en el evento | medium | MS3, MS4, MS5 | resuelto (consumidor en `main` de MS5; `DeliveryDayId` en kernel 1.4.0: kernel#5, MS3#6, MS5#5; MS4#5 queda como respaldo por paciente; MS4#8 los reúne) |
| X-11 | MS3 no valida JWT ni tiene scopes en el kernel | high | MS3, kernels | abierto |
| X-12 | El stack local no levanta: identity fuera del compose e include/builds de MS1 inexistentes | high | local, identity, MS1, todos | resuelto (nur-tricenter-local#7) |
| X-13 | MS1 no era integrable: SQL Server propio, sin Consul, sin JWT, evento defectuoso | high | MS1, MS3, MS4, MS5 | resuelto parcialmente (MS1#1, local#8); faltan scopes y consumidores |
| X-14 | Escalada de privilegios: `POST /users` de identity acepta `platform:*` | high | identity, todos | abierto |
| X-15 | Sin backfill: los consumidores no conocen lo publicado antes de que existiera su cola | medium | MS2, MS3, MS4 | abierto |
| X-16 | MS5 agrega el paquete a la ruta de **hoy**, pero MS3 produce para la entrega de **mañana** | medium | MS3, MS5 | resuelto (kernel#4, MS3#5, MS5#4) |
| X-17 | Faltan endpoints de consulta para seguir un caso de punta a punta | low | MS3, MS4, MS5 | abierto |

## Detalle

### X-01 — El ciclo de entrega no se cierra
> **Actualización 2026-10-28:** se eligió la opción (b). MS5 ya publica `delivery-added-to-route`, `delivery-completed` y `delivery-failed`, y MS4 los consume ([MS4#3](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/3) y las colas `ms4.delivery-*` en [nur-tricenter-local#6](https://github.com/Nur-tricenter/nur-tricenter-local/pull/6), ya mergeados). MS3 manda su propio GUID como `PackageId` (ms3-gap-03).
>
> **Actualización 2026-10-29 — resuelto.** El `packId` de MS4 ahora viaja en `PackageValidated.DeliveryDayId` (kernel 1.4.0, [kernel#5](https://github.com/Nur-tricenter/nur-tricenter-shared-kernels/pull/5)): MS3 lo envía ([MS3#6](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/6)), MS5 lo guarda y lo reenvía en `DeliveryAddedToRoute` ([MS5#5](https://github.com/Nur-tricenter/ms5-logistics-and-delivery/pull/5)) y MS4 lo usa primero, luego un `PackageId` numérico y por último el paciente ([MS4#6](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/6) y [MS4#5](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/5), reunidos en [MS4#8](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/8), mergeado el 2026-10-29). **Sigue pendiente** que `DeliveryCompleted` lleve evidencia (foto, firma). El texto de abajo es el análisis original.

MS4 expone `PATCH /api/v1/calendars/days/{dayId}/delivery-result` (scope `deliveryCalendar.deliveryResult:edit`), que es el **único** camino para que un día pase a `Delivered`/`Failed`. MS5 registra entregas y fallos (`/deliver`, `/fail`) y publica `delivery-completed`/`delivery-failed`, pero no llama a MS4 ni nadie consume esos eventos. **Impacto:** todos los días quedan en `ReadyForProduction` para siempre.

**Confirmado por MS5 (2026-10-24):** MS5 no tiene cliente HTTP hacia MS4 ni service account, y **no conoce el `dayId`**. Su entrega solo guarda un `PackageId` de texto libre que trae quien llama a `POST /packages/deliveries` (y hoy nadie lo llama: X-10). Los eventos tampoco ayudan: `DeliveryCompleted` lleva `DeliveryId, RouteId, DeliveredAt` (sin `PackageId` ni evidencia) y `DeliveryFailed` lleva `DeliveryId, RouteId, Reason`. Cualquiera de las dos opciones necesita primero que `PackageId` sea el `packId` de MS4 (= `DeliveryDayId`).

**Opciones:**
- (a) MS5 llama al endpoint vía gateway con una service account `ms5-service`.
- (b) MS4 consume `delivery-completed`/`delivery-failed`. Requiere que el evento lleve el `dayId` de MS4 o el `PackageId` (hoy lleva `DeliveryId`/`RouteId` de MS5), sumar la evidencia (foto, firma) al contrato del kernel y crear las colas `ms4.delivery-*`.

Decidirlo con un ADR.

### X-02 — Eventos de logística sin destino
> **2026-10-28:** `delivery-added-to-route`, `delivery-completed` y `delivery-failed` ya tienen colas (`ms4.delivery-*`, nur-tricenter-local#6) y consumidor en MS4 (MS4#3, mergeado). Los otros 7 exchanges siguen sin consumidor.

Texto original: `rabbitmq-definitions.json` declara los 10 exchanges de MS5 pero ninguna cola de consumidor. Lo publicado **no se descarta** mientras corra el worker de MS5: su `DefaultQueueRegistrar` declara la cola durable `nurtricenter.default`, enlazada a los 10 exchanges y nunca consumida (sink de historial). Pero **ningún servicio reacciona** a esos eventos. Tres de los diez (`courier-status-changed`, `courier-assigned-to-route`, `route-cancelled`) ni siquiera se publican: sus métodos de dominio no tienen endpoint (ms5-gap-07).

### X-03 — MS5 sin seguridad
MS5 solo llama a `AddAuthorization()`, sin `AddSecurity()` del kernel, y no existen scopes `logistics.*` en `Nur.Tricenter.Access`. Además se registra en Consul como `nurtricenter`, así que su prefijo en el gateway es `/api/nurtricenter`, no un nombre de dominio.

**Confirmado por MS5 (2026-10-24):** ningún endpoint tiene `RequireAuthorization` ni `[Authorize]`; a través del gateway cualquiera puede crear repartidores y rutas, cargar paquetes y cerrar entregas. MS5 tampoco tiene service account (su única llamada saliente va sin token).

### X-04 — MS1 sin integrar
> **2026-10-31:** MS1 ya está en la org (`ms1-gestion-clinica-nutricional`) e integrado al stack local (X-13). Expone `POST /api/v1/patients/contact-information`; quedan pendientes que MS3 deje los pacientes simulados y el vínculo `sub` → paciente (X-08).

> **2026-10-28:** MS1 **sí tiene código**, en un repo fuera de la org: `Juandcode/ClinicaNutricionalMicroservicio1` (lo clona `setup-project` como `ms1-clinica-nutricional`). No expone `POST /api/v1/patients/contact-information` ni guarda teléfono ni dirección, así que no cumple el contrato que espera MS5. Por qué no se puede enchufar todavía: X-13. Ficha: [ms1-clinic](../services/ms1-clinic/README.md) (`draft`).

> **2026-10-29:** MS5 ya no llama al ClinicService ([MS5#4](https://github.com/Nur-tricenter/ms5-logistics-and-delivery/pull/4)): quitó `IClinicService` y la URL del mock. El nombre del paciente viaja en `PackageValidated.PatientName` (kernel 1.3.0) y MS5 lo guarda en el paquete; `POST /packages/deliveries` lo recibe como `patientName`. Queda pendiente el teléfono y que MS3 deje de usar pacientes simulados.

Texto original: los demás lo referencian (hay colas `ms1.*`), pero el código no está en la org. MS3 ya tiene repo; mientras MS1 no exista, MS3 trabaja con 3 pacientes simulados. MS5 llama a un "ClinicService", que es MS1 (confirmado por el owner de MS5), contra un mock de Postman: `POST /api/v1/patients/contact-information` con un array de `patientId` (texto), respuesta `[{ patientId, phoneNumber, fullName }]`, **directo** (sin gateway) y sin token. Ese contrato lo definió MS5 y no está en ningún kernel; el MS1 real tendría que respetarlo o MS5 adaptarse.

### X-05 — Ruta de identity
El gateway arma el prefijo con el nombre en Consul (`identity-service`) → `/api/identity-service/**`, que es lo que usa MS4. El README de identity y el `Base` de `IdentityPermission` en el kernel dicen `/api/identity`. Además, la tabla `IdentityRoutes` del kernel pide `identity.user:create` para `POST /users` (el servicio exige `:manage`), lista un `GET /users` que no existe y comenta que crear usuarios es anónimo.

### X-06 — Colas sin consumidor
Por ejemplo `ms4.recipe-published`, `ms4.food-*`, `ms4.user-*`, `ms2.user-updated`, todas las `ms1.*` (MS1 no consume nada) y las `ms5.*` salvo `ms5.package-validated`, que MS5 consume en `main` desde el 2026-10-29 (MS5#3). Se acumulan mensajes sin que nadie los lea. O se consumen, o se quitan de la topología. Al revés también pasa: identity declara en runtime la cola durable `identity.default` (y MS1 `gestion-clinica-nutricional.default`), que no figuran en `rabbitmq-definitions.json`.

### X-07 — Kernels en versiones distintas
> **2026-10-29:** el kernel avanzó a 1.4.0 y cada servicio quedó en una versión distinta:

| Servicio | Kernels |
|---|---|
| MS4 | `Access`, `Security`, `Integration` 1.4.0 (MS4#6, restaurado en MS4#8) |
| MS5 | solo `Integration` 1.4.0 en `main` (MS5#5) |
| MS2, identity | `Access`, `Security`, `Integration`, `Observability` 1.2.0 (MS2#3, identity#2); `Joseco.Outbox.EFCore` y `Joseco.Communication.External.RabbitMQ` volvieron a 1.1.0 porque la 1.2.0 no está disponible (MS2#4, identity#3) |
| MS3 | ninguno: copias locales de los contratos (`PackageValidated`, eventos del catálogo), con el formato de la 1.4.0 (MS3#5, #6) |
| MS1 | ninguno: contrato local `PacientePublished` (Joseco `IntegrationMessage`) |
| Gateway | ninguno |

Historial de `Integration`: 1.2.0 agregó `PackageValidated`; 1.3.0, `DeliveryDate` y `PatientName` (kernel#4); 1.4.0, `DeliveryDayId` en `PackageValidated` y `DeliveryAddedToRoute` (kernel#5). Los cambios son aditivos. Los contratos copiados pueden divergir del publisher sin que nada falle.

### X-08 — Autorización por objeto
Los scopes dicen *qué tipo* de cliente llama, no *de quién* es el recurso. Hace falta que el token (o una consulta a MS1) permita mapear `sub` → `PatientId`.

### X-09 — Tabla maestra de endpoints
Existe una tabla maestra de endpoints MS1–MS5 que no está en ningún repo. No incluye la llamada MS5 → MS4 ni `GET /calendars/{id}`. Esta base de conocimiento debería reemplazarla.

### X-10 — Los paquetes producidos no llegan a logística
MS5 expone `POST /api/v1/packages/deliveries` (array de `{ patientId, packageDetails: { packageId, destination: { address, addressCoordinates: { lat, long } }, additionalDetails } }`), que agrega cada paquete a la ruta de hoy. **Ningún servicio lo llama.** Su forma coincide casi campo por campo con las líneas de `GET /calendars/active-tomorrow` de MS4 (`packId`, `patientId`, `address`, `latitude`, `longitude`), pero no hay contrato acordado.

**Impacto:** en la plataforma ningún paquete llega solo a una ruta; el flujo de punta a punta se corta entre la producción y el reparto.

**Decisión (owner de MS5, 2026-10-24):** MS3 publica un **evento** con los paquetes producidos y MS5 lo consume; `POST /packages/deliveries` queda como entrada manual. **Hecho por MS3 (2026-10-24):** el contrato `PackageValidated` (kernel `main`, versión 1.2.0; MS3 todavía usa una copia local equivalente), el exchange `package-validated` y la cola `ms5.package-validated` (rama `feat/ms3-contracting` de `nur-tricenter-local`) y el publisher vía outbox. Ya figura en `contracts/events.yaml`. **Hecho por MS5 (2026-10-27), solo en la rama `dev`:** consumidor idempotente de `ms5.package-validated` (`PackageValidatedConsumer`, inbox `InboxMessages`, kernel 1.2.0). Agrega cada paquete a la ruta de hoy, y si llega sin coordenadas usa las de la sucursal. Pasó a `main`, que es lo que levanta el stack local, en [MS5#3](https://github.com/Nur-tricenter/ms5-logistics-and-delivery/pull/3) (`dev` → `main`, mergeado el 2026-10-29). Al aplicarlo hay que correr la migración `AddInboxMessages` en la base de MS5 (MS5 no migra al arrancar); lo mismo vale para `PatientName` (MS5#4) y `DeliveryDayId` (MS5#5). *(Texto original; lo que quedaba pendiente, que el `packId` de MS4 llegara a MS5, se resolvió con `DeliveryDayId`, ver abajo.)*

> **2026-10-28 — validado de punta a punta en el stack local.** Con MS5 `dev`, MS4 cierra el día gracias a un rodeo: [MS4#5](https://github.com/Nur-tricenter/ms4-delivery-schedule-management/pull/5) enlaza la entrega con el día **por paciente** cuando `PackageId` no es un `packId`. 

> **2026-10-29 — resuelto de fondo.** En vez de reutilizar `PackageId`, el kernel 1.4.0 agregó `DeliveryDayId` (`int?`) a `PackageValidated` y a `DeliveryAddedToRoute`: MS3 lo toma de `active-tomorrow` (MS3#6), MS5 lo guarda por entrega y lo reenvía (MS5#5) y MS4 lo usa primero (MS4#6, reunido con el respaldo por paciente en MS4#8, mergeado). Para que MS4 no enlace la entrega con el día de otro contrato, MS3 elige el calendario del plan del paquete ([MS3#7](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/7)). El consumidor de `package-validated` ya está en `main` de MS5. Es `null` cuando MS3 no encuentra calendario; en ese caso MS4 recurre al `PackageId` numérico o al paciente. Sigue pendiente alinear tipos: MS5 usa `string` para `patientId`, MS4 usa `Guid`.

### X-11 — MS3 sin autenticación
Ningún endpoint de MS3 usa `RequireAuthorization` y no tiene permisos en `Nur.Tricenter.Access`. Cualquiera puede, a través del gateway, contratar, cobrar, cancelar y validar paquetes. Es el mismo problema de MS5 (X-03), con más riesgo porque MS3 mueve dinero. Detalle y qué haría falta: `ms3-gap-01`.

### X-12 — El stack local no levanta
Estado original en `nur-tricenter-local` (`main` 4a1d700, antes de #7):
- `compose/docker-compose.yml` perdió el include de `../../nur-tricenter-identity/identity.compose.yml` (el commit `acce166`, que integró MS1, reemplazó esa línea). El encabezado del archivo todavía lo lista. Sin identity no hay login: `start-stack` falla al crear las service accounts, y MS3 y MS4 no obtienen token.
- Incluye `../../ms1-clinica-nutricional/ms1.compose.yml`, que no existe en el repo de MS1, y `start-stack.*` compila `src/ClinicaNutricional.Api` y `src/ClinicaNutricional.WorkerService`, que tampoco existen (los proyectos reales están en la raíz del repo).
- `docker compose up` falla por el include faltante. `start-stack.sh` (`set -e`) corta en el primer build de MS1; `start-stack.ps1` no revisa esos builds y falla recién en el compose.

**Impacto:** nadie puede levantar la plataforma completa desde `main`.
**Qué haría falta:** volver a incluir `identity.compose.yml` y quitar MS1 del compose y de los scripts hasta que tenga un fragmento de plataforma (X-13). **Resuelto en [nur-tricenter-local#7](https://github.com/Nur-tricenter/nur-tricenter-local/pull/7)** (mergeado el 2026-10-28): vuelve el include de identity, MS1 queda comentado en el compose, y el PR además crea las BD que falten en un volumen viejo, revisa todos los builds y agrega `scripts/e2e-smoke.py`.

### X-13 — MS1 no es integrable todavía
> **2026-10-31:** resuelto en su mayor parte con [MS1#1](https://github.com/Nur-tricenter/ms1-gestion-clinica-nutricional/pull/1) y [nur-tricenter-local#8](https://github.com/Nur-tricenter/nur-tricenter-local/pull/8) (mergeados): Postgres, `--migrate`, JWT (solo "autenticado", sin scopes), Consul/gateway, `ms1.compose.yml` y evento corregido. Verificado con el stack completo y `e2e-smoke.py`. **Sigue abierto:** scopes de MS1 en `Nur.Tricenter.Access`, que alguien consuma `paciente-published` y el contrato de ese evento (sigue local, fuera del kernel y de la topología). Lo de abajo describe el estado previo.

Para entrar al stack, MS1 necesitaba lo que ya tienen los demás y no tenía:
- **Repo:** desde 2026-10-31 está en la org (`ms1-gestion-clinica-nutricional`, un solo commit). `setup-project` de `nur-tricenter-local` todavía clona el repo viejo de `Juandcode`.
- **Persistencia:** usa SQL Server. La cadena ya sale de `ConnectionStrings:DefaultConnection` (antes estaba hardcodeada), pero el valor por defecto sigue siendo `localhost\SQLEXPRESS` con `Trusted_Connection`. No puede usar el Postgres compartido ni tiene base en `01-create-databases.sql`.
- **Descubrimiento:** no se registra en Consul, así que el gateway no lo rutea.
- **Seguridad:** no valida JWT; todos sus endpoints son anónimos. No hay scopes de MS1 en el kernel.
- **Contratos:** publica `PacientePublished` en `paciente-published` con un contrato local (no usa `Nur.Tricenter.Integration`). Ese exchange no está en la topología, y el evento tiene los campos cruzados y un `PacienteId` que no es el del paciente (detalle en la [ficha](../services/ms1-clinic/gaps.md), ms1-gap-04).
- **Lo que esperan los demás:** MS5 llamaba a `POST /api/v1/patients/contact-information` (contra un mock; dejó de llamarlo en MS5#4, ver X-04) y MS4 necesita mapear `sub` → `PatientId` (X-08). MS1 no expone ni guarda ninguna de las dos cosas.
- **Compose:** solo tiene un `docker-compose.yml` standalone con una imagen publicada; no hay `ms1.compose.yml` (X-12). El `dockerfile` sigue copiando `/GestionClinicaNutricionalService`, carpeta que no existe, y solo construye la WebApi (el worker no tiene imagen).

### X-14 — Escalada de privilegios en identity
`POST /api/v1/users` exige `identity.user:manage` y rechaza `identity:*`, pero acepta cualquier otro scope sin validarlo, incluido `platform:*`. Al hacer login, `platform:*` se expande a todos los scopes de la plataforma. Quien tenga `identity.user:manage` puede crear un administrador completo. Además no hay endpoints para listar usuarios, revocar scopes ni desactivar cuentas, así que una cuenta creada no se puede deshabilitar sin tocar la base.

**Qué haría falta:** rechazar `platform:*` (o permitirlo solo a administradores) y validar los scopes contra `Permission.PermissionsList` del kernel. Detalle en la [ficha de identity](../services/identity-service/gaps.md).

### X-15 — Sin backfill de eventos
MS3 (`CatalogPlans`) y MS4 (`PlanCatalog`) proyectan los planes de MS2 desde `meal-plan-published`. Un plan publicado antes de que existiera la cola del consumidor, o perdido al recrear su BD, **no existe para ese consumidor**: `POST /contracts` de MS3 responde 404 `PLAN_NOT_FOUND` con planes que MS2 sí lista. En la prueba del 2026-10-28, los 3 planes sembrados de MS2 no servían y hubo que crear uno nuevo.

**Qué haría falta:** un endpoint de operaciones en MS2 que republique sus agregados (backfill), o que MS3 consulte a MS2 por HTTP cuando no tiene el plan proyectado.

### X-16 — Fecha de la ruta de MS5
> **2026-10-29 — resuelto.** `PackageValidated` lleva `DeliveryDate` (kernel 1.3.0, [kernel#4](https://github.com/Nur-tricenter/nur-tricenter-shared-kernels/pull/4)): MS3 la manda con la fecha de producción de la orden ([MS3#5](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/5)) y MS5 agrega el paquete a la última ruta **de esa fecha** ([MS5#4](https://github.com/Nur-tricenter/ms5-logistics-and-delivery/pull/4)); sin fecha usa `ReleasedAt + 1 día`. Si no hay ruta para esa fecha responde `Route.NoRouteForDate`. El texto de abajo es el análisis original.

MS3 produce el día D-1 para la entrega del día D (`active-tomorrow`). El consumidor de `package-validated` de MS5 agrega el paquete a la ruta **de hoy** (D-1), y si no existe, el mensaje termina en la cola de error. En la demo funciona porque todo ocurre el mismo día.

**Qué haría falta:** que `PackageValidated` lleve la fecha de entrega (o el `packId`, de donde sale la fecha) y que MS5 busque la ruta de esa fecha.

### X-17 — Seguir un caso de punta a punta exige leer las bases
Para encadenar un contrato con su calendario, sus paquetes y su entrega no hay endpoints: MS4 no busca calendarios por `contractId` ni por paciente, MS3 no lista los paquetes de una orden y MS5 no busca entregas por `packageId`. `e2e-smoke.py` lo resuelve leyendo las BD. La interfaz visual que muestre dónde se consume cada cosa va a necesitar esas consultas.
