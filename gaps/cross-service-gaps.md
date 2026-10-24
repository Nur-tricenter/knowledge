# Gaps transversales

Problemas que involucran **a más de un servicio**. Los gaps internos de cada MS van en `services/<ms>/gaps.md`.
Relevado el 2026-10-23 a partir del código de los repos de la org. Al resolver uno, márcalo como cerrado e indica el PR.

| Id | Gap | Severidad | Servicios | Estado |
|---|---|---|---|---|
| X-01 | MS5 no llama a `PATCH /delivery-result` de MS4 | high | MS5, MS4 | abierto |
| X-02 | Los 10 exchanges de logística no tienen colas enlazadas | medium | MS5, consumidores | abierto |
| X-03 | MS5 no valida JWT ni tiene scopes en el kernel | high | MS5, kernels | abierto |
| X-04 | No hay repos de MS1 ni de MS3 en la org | high | MS1, MS3 | abierto |
| X-05 | La ruta de identity en el gateway está documentada de dos formas | low | identity, kernels | abierto |
| X-06 | Hay colas declaradas sin consumidor | low | todos | abierto |
| X-07 | Versiones mezcladas de los kernels | medium | todos | abierto |
| X-08 | Sin autorización por objeto (no existe mapeo `sub` → `PatientId`) | high | identity, MS1, MS4 | abierto |
| X-09 | Tabla maestra de endpoints desactualizada o fuera de los repos | low | todos | abierto |

## Detalle

### X-01 — El ciclo de entrega no se cierra
MS4 expone `PATCH /api/v1/calendars/days/{dayId}/delivery-result` (scope `deliveryCalendar.deliveryResult:edit`), que es el **único** camino para que un día pase a `Delivered`/`Failed`. MS5 registra entregas y fallos (`/deliver`, `/fail`) y publica `delivery-completed`/`delivery-failed`, pero no llama a MS4 ni nadie consume esos eventos. **Impacto:** todos los días quedan en `ReadyForProduction` para siempre.

**Opciones:**
- (a) MS5 llama al endpoint vía gateway con una service account `ms5-service`.
- (b) MS4 consume `delivery-completed`/`delivery-failed`. Requiere que el evento lleve el `dayId` de MS4 (hoy lleva `DeliveryId`/`RouteId` de MS5) y crear las colas `ms4.delivery-*`.

Decidirlo con un ADR.

### X-02 — Eventos de logística sin destino
`rabbitmq-definitions.json` declara los 10 exchanges de MS5 pero ninguna cola. Lo que se publica ahí se descarta.

### X-03 — MS5 sin seguridad
MS5 solo llama a `AddAuthorization()`, sin `AddSecurity()` del kernel, y no existen scopes `logistics.*` en `Nur.Tricenter.Access`. Además se registra en Consul como `nurtricenter`, así que su prefijo en el gateway es `/api/nurtricenter`, no un nombre de dominio.

### X-04 — MS1 y MS3 sin repo
Los demás los referencian (MS3 llama a MS4; hay colas `ms1.*` y `ms3.*`), pero el código no está en la org. MS5 llama a un "ClinicService" (¿MS1?) contra un mock de Postman.

### X-05 — Ruta de identity
El gateway arma el prefijo con el nombre en Consul (`identity-service`) → `/api/identity-service/**`, que es lo que usa MS4. El README de identity y el `Base` de `IdentityPermission` en el kernel dicen `/api/identity`.

### X-06 — Colas sin consumidor
Por ejemplo `ms4.recipe-published`, `ms4.food-*`, `ms4.user-*`, `ms2.user-updated` y todas las `ms5.*`. Se acumulan mensajes sin que nadie los lea. O se consumen, o se quitan de la topología.

### X-07 — Kernels en versiones distintas
MS2 e identity en 1.0.9, MS5 en 1.0.10+, MS4 en 1.1.0 (que agrega `DeliveryCalendarPermission`). Los contratos de eventos pueden divergir entre publisher y consumidor.

### X-08 — Autorización por objeto
Los scopes dicen *qué tipo* de cliente llama, no *de quién* es el recurso. Hace falta que el token (o una consulta a MS1) permita mapear `sub` → `PatientId`.

### X-09 — Tabla maestra de endpoints
Existe una tabla maestra de endpoints MS1–MS5 que no está en ningún repo. No incluye la llamada MS5 → MS4 ni `GET /calendars/{id}`. Esta base de conocimiento debería reemplazarla.
