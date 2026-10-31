# API — MS5

- **Prefijo interno:** `/api/v1`
- **Prefijo en el gateway:** `/api/nurtricenter/v1` (el gateway quita `/api/nurtricenter` y agrega `/api`). `nurtricenter` es el nombre con el que se registra en Consul.
- **Autenticación:** **ninguna.** El host llama a `AddAuthorization()` y `UseAuthorization()`, pero no registra autenticación JWT (`AddSecurity()` del kernel) y ningún endpoint declara `RequireAuthorization` ni `[Authorize]`. Todo endpoint es anónimo, también a través del gateway (gap ms5-gap-01 / X-03). Por eso la columna "Scope" dice `—`.
- **Formato de error:** ProblemDetails (RFC 7807) para toda `DomainException` (`src/Nurtricenter.Api/DomainExceptionHandler.cs`). `title` = `Error.Code` (p. ej. `Route.NotFound`), `type` = `https://errors.nurtricenter.com/{tipo}`. Los errores de validación agregan `errors: [{ code, message }]`.
- **Enums en las respuestas:** **no son uniformes.** `POST /couriers` y `POST /routes` devuelven `status` como **número** (no hay `JsonStringEnumConverter`); los demás lo devuelven como texto (`"InProgress"`, `"Delivered"`), y `POST /packages/deliveries` en minúsculas (`"pending"`).
- **Ids:** todos los ids propios son `Guid`. `patientId` y `packageId` son texto libre.
- **Documentación interactiva:** Scalar en `/scalar/v1` y OpenAPI en `/openapi/v1.json`, **solo** con `ASPNETCORE_ENVIRONMENT=Development`.
- **Llamadores:** ningún servicio llama a MS5 por REST desde código; la columna "Llamado por" indica el llamador **esperado**. Los paquetes entran por el evento `package-validated` de MS3 (desde MS5#3); `POST /packages/deliveries` queda como carga manual.

## Resumen
| Método | Ruta | Llamado por (esperado) | Scope | Idempotente |
|---|---|---|---|---|
| POST | `/couriers` | Operaciones | — (anónimo) | no (cada llamada crea un repartidor) |
| POST | `/routes` | Operaciones | — (anónimo) | no (cada llamada crea una ruta) |
| POST | `/packages/deliveries` | Operaciones (única entrada de paquetes en `main`) | — (anónimo) | no (duplica entregas) |
| GET | `/couriers/{courierId}/route/today` | App del repartidor | — (anónimo) | sí |
| POST | `/routes/{routeId}/start` | App del repartidor | — (anónimo) | no (el 2.º intento da 422) |
| POST | `/routes/{routeId}/deliveries/{deliveryId}/deliver` | App del repartidor | — (anónimo) | no (el 2.º intento da 422) |
| POST | `/routes/{routeId}/deliveries/{deliveryId}/fail` | App del repartidor | — (anónimo) | no (el 2.º intento da 422) |
| GET | `/health` | Consul | anónimo | sí |

No existen endpoints de lectura de un repartidor, de una ruta por id ni de listados, aunque los `201 Created` devuelven un header `Location` que apunta a ellos (`/api/v1/couriers/{id}`, `/api/v1/routes/{id}`, `/api/v1/packages/deliveries/{routeId}`): esas URLs dan 404/405.

## Detalle por endpoint

### `POST /api/v1/couriers`
**Para qué:** dar de alta un repartidor. Queda `Available`.
**Llamado por:** operaciones (no hay rol ni scope que lo restrinja).
**Scope:** ninguno.

Request:
```json
{ "fullName": "Jane Doe" }
```
Response `201` (`Location: /api/v1/couriers/{id}`):
```json
{ "id": "…guid…", "fullName": "Jane Doe", "status": 0 }
```
| Código | Cuándo |
|---|---|
| 400 | `fullName` vacío o de más de 200 caracteres |

Efecto colateral: publica `courier-created` (vía outbox).

### `POST /api/v1/routes`
**Para qué:** crear la ruta de un repartidor para una fecha. Queda `Pending` y sin entregas.
**Llamado por:** operaciones.
**Scope:** ninguno.

Request:
```json
{ "courierId": "…guid…", "scheduledDate": "2026-10-24" }
```
Response `201` (`Location: /api/v1/routes/{id}`):
```json
{ "id": "…guid…", "courierId": "…guid…", "scheduledDate": "2026-10-24", "status": 0 }
```
| Código | Cuándo |
|---|---|
| 400 | `courierId` vacío, o `scheduledDate` anterior a hoy (fecha local del servidor) |
| 404 | `Courier.NotFound`: el repartidor no existe |

No impide crear dos rutas para el mismo repartidor y la misma fecha. Publica `route-created`.

### `POST /api/v1/packages/deliveries`
**Para qué:** entregarle a logística los paquetes que hay que repartir **hoy**. Cada ítem se convierte en una `Delivery` `Pending`.
**Llamado por:** operaciones, a mano. El flujo normal es el evento `package-validated` de MS3 (MS5#3). Para que MS4 pueda cerrar el día, `packageId` tiene que ser el `packId` de MS4 (de `active-tomorrow`); MS5 no lo valida (ms5-gap-02). Los paquetes que llegan por evento traen el `DeliveryDayId`.
**Scope:** ninguno.

Request (un **array**, no un objeto):
```json
[
  {
    "patientId": "P-001",
    "patientName": "Juana Pérez",
    "packageDetails": {
      "packageId": "PKG-001",
      "destination": {
        "address": "Av. Banzer 123, Santa Cruz",
        "addressCoordinates": { "lat": -17.78, "long": -63.18 }
      },
      "additionalDetails": "Dieta hiposódica, 3 comidas"
    }
  }
]
```
Response `201` (`Location: /api/v1/packages/deliveries/{routeId}`):
```json
{ "routeId": "…guid…", "deliveries": [ { "patientId": "P-001", "deliveryId": "…guid…", "status": "pending" } ] }
```
Cómo se resuelve:
1. Valida el lote: `patientId`, `patientName`, `packageId` y `address` son obligatorios. Ya no se consulta a MS1 (MS5#4).
2. Busca la ruta de **hoy** creada más recientemente, **sin importar de qué repartidor sea**, y le agrega todas las entregas.

| Código | Cuándo |
|---|---|
| 400 | Lista vacía; `patientId`, `patientName`, `packageId` o `address` vacíos; `additionalDetails` vacío (lo rechaza el VO `ValidatedPackage`) |
| 404 | `Route.NoRouteForToday` |
| 422 | `Route.CannotAddDelivery` (la ruta de hoy ya está `Completed`/`Cancelled`) |

Publica un `delivery-added-to-route` por ítem. Si se reenvía el mismo lote, se crean entregas **duplicadas** (no hay unicidad por `packageId`).

### `GET /api/v1/couriers/{courierId}/route/today`
**Para qué:** que el repartidor vea su ruta de hoy, en orden, con el nombre y el teléfono de cada paciente.
**Llamado por:** app del repartidor.
**Scope:** ninguno.

Response `200`:
```json
{
  "courierId": "…guid…",
  "routeId": "…guid…",
  "deliveries": [
    { "packageDeliveryId": "…guid…", "sequenceOrder": 1, "patientName": "Juana Pérez", "patientPhone": "+591 700 11111", "address": "Av. Banzer 123, Santa Cruz", "status": "InProgress" }
  ]
}
```
- `patientName` y `patientPhone` se guardan con la entrega: llegan en `package-validated` (MS5#4 y #8, kernel 1.5.0) y `patientName` también en `POST /packages/deliveries`. Si el nombre está vacío (entregas anteriores a MS5#4) se muestra el `patientId`; `patientPhone` es `null` si no se conoce (carga manual, entrega anterior a 1.5.0 o paciente sin teléfono). La consulta ya no depende de ningún servicio externo.
- `sequenceOrder` es el calculado al iniciar la ruta; las entregas sin secuencia reciben su posición en la lista.
- Las entregas salen en el orden en que están cargadas, **no ordenadas** por `sequenceOrder`.

| Código | Cuándo |
|---|---|
| 404 | `Courier.NotFound` o `Route.NoRouteForToday` |

### `POST /api/v1/routes/{routeId}/start`
**Para qué:** el repartidor sale de la sucursal. Calcula la secuencia de entrega y pasa la ruta y todas sus entregas a `InProgress`.
**Llamado por:** app del repartidor. **Scope:** ninguno. **Body:** vacío.

Response `200`:
```json
{ "routeId": "…guid…", "courierId": "…guid…", "deliveries": [ { "deliveryId": "…guid…", "sequenceOrder": 1, "address": "Av. Banzer 123, Santa Cruz" } ] }
```
| Código | Cuándo |
|---|---|
| 404 | `Route.NotFound` |
| 422 | `Route.CannotStart` (no está `Pending`; p. ej. un reintento) o `Route.NoDeliveries` |

Publica `route-started`. No cambia el estado del repartidor.

### `POST /api/v1/routes/{routeId}/deliveries/{deliveryId}/deliver`
**Para qué:** registrar una entrega exitosa con su evidencia.
**Llamado por:** app del repartidor. **Scope:** ninguno.

Request:
```json
{ "deliveredAt": "2026-10-24T15:30:00Z", "evidencePhotoUrl": "https://…/foto.jpg", "digitalSignature": "…" }
```
Response `200`:
```json
{ "deliveryId": "…guid…", "routeId": "…guid…", "status": "Delivered",
  "confirmation": { "deliveredAt": "2026-10-24T15:30:00Z", "evidencePhotoUrl": "https://…/foto.jpg", "digitalSignature": "…" } }
```
| Código | Cuándo |
|---|---|
| 400 | Falta la foto o la firma |
| 404 | `Route.NotFound` o `Route.DeliveryNotFound` (la entrega no es de esa ruta) |
| 422 | `Delivery.CannotComplete` (ya era terminal: un reintento), o `Route.CannotComplete` (era la última entrega abierta de una ruta que nunca se inició; se revierte todo) |

Publica `delivery-completed` (con la foto y la firma desde el kernel 1.5.0) y, si era la última entrega abierta, también `route-completed`. No llama a MS4: MS4 consume el evento (cola `ms4.delivery-completed`, MS4#3 y #10) y guarda la evidencia.

### `POST /api/v1/routes/{routeId}/deliveries/{deliveryId}/fail`
**Para qué:** registrar que no se pudo entregar y por qué.
**Llamado por:** app del repartidor. **Scope:** ninguno.

Request:
```json
{ "reason": "Nadie en el domicilio" }
```
Response `200`:
```json
{ "deliveryId": "…guid…", "routeId": "…guid…", "status": "Failed", "failureReason": "Nadie en el domicilio" }
```
| Código | Cuándo |
|---|---|
| 400 | `reason` vacío |
| 404 | `Route.NotFound` o `Route.DeliveryNotFound` |
| 422 | `Delivery.CannotFail` (ya era terminal) o `Route.CannotComplete` (mismo caso que en `/deliver`) |

Publica `delivery-failed` y, si corresponde, `route-completed`.

### `GET /health`
Health check anónimo que usa Consul. Responde JSON: `{ success, message, data: { status, totalDurationMilliseconds, entries: [...] } }`.
- Con el registro en Consul habilitado incluye el chequeo `postgres` (`SELECT 1`): si la BD no responde → **503**, Consul marca la instancia crítica y el gateway deja de rutearla.
- Sin registro en Consul no tiene chequeos y siempre responde 200.
- No hay `/alive`.

## Mapeo de errores
Configurado en `src/Nurtricenter.Api/DomainExceptionHandler.cs` (un `IExceptionHandler`).

| Excepción | HTTP |
|---|---|
| `DomainException` con `ErrorType.Validation` (VOs, y `ValidationError` del `ValidationBehavior` de MediatR) | 400 |
| `DomainException` con `ErrorType.NotFound` | 404 |
| `DomainException` con `ErrorType.Conflict` (definido, ningún caso de uso lo usa) | 409 |
| `DomainException` con `ErrorType.Problem` (guardas de estado) | 422 |
| `DomainException` con otro `ErrorType` (`Failure`) | 500 |
| Cualquier otra excepción | 500 (handler por defecto de ASP.NET Core) |
