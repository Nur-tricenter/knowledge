# API — MS4

- **Prefijo interno:** `/api/v1`
- **Prefijo en el gateway:** `/api/delivery-calendar/v1` (el gateway quita `/api/delivery-calendar` y agrega `/api`).
- **Autenticación:** JWT de nur-tricenter-identity con el scope del endpoint. Sin token → 401; con otro scope → 403.
- **Formato de error:** ProblemDetails (RFC 7807). Los enums viajan como **string** (`"Pending"`, `"Delivered"`).
- **Ids:** `calendarId` y `dayId` son enteros. `contractId`, `patientId` y `planId` son GUID.
- **Documentación interactiva:** Scalar/OpenAPI en modo standalone.

## Resumen
| Método | Ruta | Llamado por | Scope | Idempotente |
|---|---|---|---|---|
| POST | `/schedule` | MS3 | `deliveryCalendar.calendar:create` | sí (por `contractId`) |
| GET | `/calendars/active-tomorrow?date=` | MS3 | `deliveryCalendar.productionOrder:read` | sí |
| GET | `/calendars/{id}` | Frontend | `deliveryCalendar.calendar:read` | sí |
| PUT | `/calendars/{id}/dates` | Frontend | `deliveryCalendar.calendar:edit` | sí |
| POST | `/calendars/{id}/addresses` | Frontend | `deliveryCalendar.calendar:edit` | sí |
| POST | `/calendars/{id}/cancel-day` | Frontend | `deliveryCalendar.calendar:edit` | no (el 2.º intento da 422) |
| PATCH | `/calendars/days/{dayId}/delivery-result` | MS5 | `deliveryCalendar.deliveryResult:edit` | sí (mismo resultado) |
| POST | `/calendars/resolve-daily-catalog?date=` | Operaciones | `deliveryCalendar.catalogResolution:manage` | sí |
| GET | `/health`, `/alive` | Consul | anónimo | sí |

## Detalle por endpoint

### `POST /api/v1/schedule`
**Para qué:** crear el calendario cuando MS3 confirma el pago del contrato. Es el punto de entrada de todo el ciclo.

```json
// request
{ "contractId": "…guid…", "patientId": "…guid…", "planId": "…guid…", "duration": 15, "startDate": "2026-11-01" }
// 200
{ "calendarId": 7, "days": [ { "id": 101, "dayNumber": 1, "date": "2026-11-01", "status": "Pending", … } ] }
```
| Código | Cuándo |
|---|---|
| 200 | Creado, **o ya existía** para ese `contractId` (devuelve el mismo calendario, sin regenerar) |
| 400 | La duración no coincide con la del plan según la proyección de MS2, o falla la validación de entrada |
| 422 | Value object inválido (duración ≠ 15/30, GUID vacío, fecha por defecto) |

### `GET /api/v1/calendars/active-tomorrow?date=YYYY-MM-DD`
**Para qué:** MS3 obtiene la orden de producción del día siguiente. Reemplaza al evento `ProductionOrderRequired` de la fase de arquitectura. **Nunca resuelve bajo demanda**: lee lo que el job ya consolidó.

```json
// 200
[ { "packId": 101, "patientId": "…", "planId": "…", "hour": null, "address": "Av. Banzer 123, Santa Cruz", "latitude": -17.78, "longitude": -63.18 } ]
```
- Si el job no corrió o no hay días listos, devuelve `[]` (no es un error).
- Solo incluye días que estaban en `ReadyForProduction` al consolidar.

### `GET /api/v1/calendars/{id}`
Calendario completo con todos los días, sin filtrar por estado. `404` si no existe.

### `PUT /api/v1/calendars/{id}/dates`
```json
{ "dayId": 101, "newDate": "2026-11-05" }   // → 200 { "dayId": 101, "status": "Scheduled" }
```
| Código | Cuándo |
|---|---|
| 404 | Calendario inexistente, o día que no pertenece al calendario |
| 409 | Faltan menos de 48h para la fecha **actual** del día |
| 422 | El día no está en Pending/Scheduled |

### `POST /api/v1/calendars/{id}/addresses`
```json
{ "dayId": 101, "street": "Av. Banzer 123", "city": "Santa Cruz", "latitude": -17.78, "longitude": -63.18, "references": "portón verde", "notes": null }
// 200 { "dayId": 101, "address": { "street": "…", "city": "…", "latitude": -17.78, "longitude": -63.18, … } }
```
Pasa el día de `Pending` a `Scheduled`. Se puede repetir para corregir la dirección mientras siga en Pending/Scheduled. `422` si el día ya avanzó o las coordenadas están fuera de rango. **No aplica la regla de 48h.**

### `POST /api/v1/calendars/{id}/cancel-day`
```json
{ "dayId": 101 }   // → 200 { "dayId": 101, "status": "Cancelled" }
```
`409` dentro de las 48h. `422` si ya está Delivered/Failed/Cancelled/InProduction. Permite cancelar un día `ReadyForProduction` fuera de la ventana.

### `PATCH /api/v1/calendars/days/{dayId}/delivery-result`
```json
{ "result": "Delivered", "photoUrl": "https://…", "signatureUrl": null }   // → 200 { "dayId": 101, "status": "Delivered" }
```
- Solo desde `ReadyForProduction` o `InProduction`.
- Repetir el **mismo** resultado no hace nada y devuelve el estado actual (tolera los reintentos de MS5).
- Un resultado **distinto** sobre un día ya cerrado → `422`.
- Busca solo por `dayId` (el contrato no incluye `calendarId`).
- Es la vía manual: el camino normal son los eventos `delivery-completed` y `delivery-failed` de MS5, que aplican la misma regla (ver [messaging.md](./messaging.md)).

### `POST /api/v1/calendars/resolve-daily-catalog?date=YYYY-MM-DD`
Herramienta de operaciones (no es parte del contrato público). Ver el flujo F3 en [flows.md](./flows.md). Responde `204`.

## Mapeo de errores
Configurado en `src/Api/Infrastructure/ProblemDetailsExceptionHandler.cs`.

| Excepción | HTTP |
|---|---|
| `ValidationException` (FluentValidation / aplicación) | 400 |
| `UnauthorizedAccessException` | 401 |
| `ForbiddenAccessException` | 403 |
| `NotFoundException` | 404 |
| `DeliveryWindowLockedException` (regla de 48h) | 409 |
| `InvalidDeliveryDayTransitionException` | 422 |
| `ArgumentException` / `ArgumentOutOfRangeException` (value objects) | 422 |
