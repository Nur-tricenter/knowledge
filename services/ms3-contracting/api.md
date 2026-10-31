# API — MS3

- **Prefijo interno:** `/api/v1`
- **Prefijo en el gateway:** `/api/contracting/v1` (el gateway quita `/api/contracting` y agrega `/api`).
- **Autenticación:** **ninguna.** Todos los endpoints son `AllowAnonymous()`: MS3 no valida JWT ni tiene scopes en el kernel (ver [gaps](./gaps.md), `ms3-gap-01`).
- **Formato de error:** FastEndpoints (`UseDefaultExceptionHandler`), no ProblemDetails: `{ statusCode, message, errors }` para validaciones y `{ status, code, reason, note }` para excepciones no controladas.
- **Ids:** todos GUID. Los enums de estado viajan como texto.
- **Documentación interactiva:** Swagger en `/swagger`, solo con `Swagger__Enabled=true` (standalone y perfil dev de la plataforma).

## Resumen
| Método | Ruta | Llamado por | Scope | Idempotente |
|---|---|---|---|---|
| POST | `/contracts` | frontend | — | no |
| GET | `/contracts/{id}` | frontend | — | sí |
| PUT | `/contracts/{id}/cancel` | frontend | — | no |
| POST | `/billing/charge-plan` | frontend | — | no |
| GET | `/billing/{invoiceNumber}` | frontend | — | sí |
| POST | `/billing/charge-control` | frontend | — | no |
| GET | `/production/daily-order` | ops | — | sí (crea la orden la primera vez) |
| POST | `/production/packages` | ops | — | no |
| POST | `/production/packages/assemble` | ops | — | no |
| POST | `/production/packages/label` | ops | — | no |
| POST | `/production/packages/validate` | ops | — | no |
| GET | `/production/orders/{id}/packages` | ops, demo console | — | sí |
| GET | `/sim/patients/{id}`, `/sim/catalog/plans/{id}`, `/sim/calendars/active-tomorrow`, `/sim/outgoing/{eventType}`, POST `/sim/catalog/plans/structure` | ops | — | sí |
| GET | `/health` | Consul | anónimo | sí |

## Detalle por endpoint

### `POST /api/v1/contracts`
**Para qué:** crear el contrato de un paciente con un plan. Verifica que ambos existan.
```json
// request
{ "patientId": "…guid…", "catalogPlanId": "…guid…" }
// 201 (Location: /api/v1/contracts/{id})
{ "id": "…", "patientId": "…", "catalogPlanId": "…", "status": "PendingPayment", "createdAt": "2026-10-24T05:33:04Z" }
```
| Código | Cuándo |
|---|---|
| 400 | GUID mal formado |
| 404 | `PATIENT_NOT_FOUND` (el paciente no está en la proyección `ClinicPatients`, i.e. MS1 never published it; standalone, one outside the 3 simulated) o `PLAN_NOT_FOUND` (el plan no está ni en la simulación ni en `CatalogPlans`) |

El plan se acepta si lo publicó MS2 y MS3 ya lo proyectó; por eso conviene esperar unos segundos tras sembrar el catálogo.

### `GET /api/v1/contracts/{id}`
Devuelve el mismo `ContractResponse`. `404` si no existe.

### `PUT /api/v1/contracts/{id}/cancel`
```json
{ "reason": "El paciente se mudó" }   // → 204
```
| Código | Cuándo |
|---|---|
| 404 | Contrato inexistente |
| 500 | Contrato no `Active`, o motivo vacío (excepción de dominio sin mapear) |

### `POST /api/v1/billing/charge-plan`
**Para qué:** cobrar el contrato. Crea la factura, activa el contrato y deja en el outbox la fila `CreateSchedule`, que el worker publica como evento `contract-activated`; MS4 lo consume y crea el calendario.
```json
// request
{ "contractId": "…", "amount": 550.00, "invoiceNumber": "inv-2026-0500" }
// 200
{ "invoiceId": "…", "status": "processed", "transactionDateTime": "2026-10-24T05:33:05Z" }
```
| Código | Cuándo |
|---|---|
| 404 | Contrato inexistente |
| 500 | El contrato no está `PendingPayment` (ya pagado o cancelado) |

No es idempotente: pagar dos veces el mismo contrato da 500 la segunda vez.

### `GET /api/v1/billing/{invoiceNumber}`
```json
{ "invoiceId": "…", "patientId": "…", "planName": "Plan Comidas Bolivianas 30 Dias", "totalAmount": 550.00, "issuedAt": "…", "isPaid": true }
```
`planName` sale de la simulación o de la copia local de MS2; `"Unknown Plan"` si no se conoce. `404` si la factura no existe.

### `POST /api/v1/billing/charge-control`
```json
{ "patientId": "…", "controlPolicyId": "…", "amount": 80.00, "invoiceNumber": "inv-ctrl-01" }
// 201 { "invoiceId": "…", "status": "paid", "amountCharged": 80.00 }
```
| Código | Cuándo |
|---|---|
| 409 | `ACTIVE_CONTRACT`: el paciente tiene un contrato activo, el control no aplica |
| 400 | Otro error de validación |

### `GET /api/v1/production/daily-order?productionDate=`
**Para qué:** obtener (y crear la primera vez) la orden de producción del día. Sin fecha usa mañana (UTC).
```json
// 200
{ "productionOrderId": "…", "productionDate": "2026-10-25T00:00:00Z", "totalPackagesToAssemble": 6,
  "recipesSummary": [ { "recipeId": "…", "recipeName": "Api con Pastel", "totalPortionsRequired": 2 } ] }
```
| Código | Cuándo |
|---|---|
| 404 | `NO_CALENDARS`: no hay entregas proyectadas para esa fecha (MS4 no publicó `production-order-ready`: el job `resolve-daily-catalog` no corrió, nadie tiene dirección, o el evento aún no llegó) |
| 422 | `NO_RECIPES`: hay entregas, pero ni el `menu` del evento ni la estructura simulada del plan traen recetas. No se crea la orden |

MS3 does not call MS4: there is no 500 for "MS4 down" any more. If an order already exists for that date, it is returned as is.

### `POST /api/v1/production/packages`
```json
{ "productionOrderId": "…", "patientId": "…", "catalogPlanId": "…" }   // → 201 { "packageId": "…", "status": "Pending", "lastUpdated": "…" }
```

### `POST /api/v1/production/packages/assemble`
```json
{ "packageId": "…", "staffId": "staff-01" }   // → 204
```
`404` si el paquete no existe; `500` si no está `Pending`.

### `POST /api/v1/production/packages/label`
```json
{ "packageId": "…", "patientId": "…" }   // → 204
```
Toma el nombre del paciente (de la proyección `ClinicPatients` de MS1; simulado standalone) y la dirección de la entrega de ese paciente en `ScheduledDeliveries` (proyección de `production-order-ready` de MS4); si no hay calendario, la etiqueta dice `"Address not found"`. `404` paquete o `PATIENT_NOT_FOUND`; `500` si no está `Assembled`.

### `POST /api/v1/production/packages/validate`
**Para qué:** control de calidad de **todos** los paquetes de una orden. Por cada uno aprobado deja en el outbox la fila `TransferToLogistics`, que luego se publica como `package-validated`.
```json
// request
{ "productionOrderId": "…", "supervisorId": "sup-01", "batchValidated": true, "totalValidatedCount": 1 }
// 200
{ "productionOrderId": "…", "totalPackages": 1, "validatedCount": 1, "failedCount": 0,
  "results": [ { "packageId": "…", "success": true, "error": null } ], "releasedAt": "…" }
```
| Código | Cuándo |
|---|---|
| 400 | `batchValidated` es falso, o `totalValidatedCount` (si > 0) no coincide con los paquetes de la orden |
| 404 | La orden no tiene paquetes |
| 500 | Algún paquete no está `Labeled`: los anteriores del lote **ya quedaron validados** (ver `ms3-gap-04`) |

### `GET /api/v1/production/orders/{id}/packages` ([MS3#10](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/10))
**Para qué:** ver los paquetes de una orden y en qué paso están (gap X-17).
```json
{ "productionOrderId": "…", "productionDate": null, "orderStatus": null, "totalPackages": 1,
  "packages": [ { "packageId": "…", "patientId": "…", "catalogPlanId": "…", "status": "Validated",
                  "trackingNumber": "NTR-D6127B59-20261031", "deliveryAddress": "Av. Banzer 123, Santa Cruz", "validatedAt": "…" } ] }
```
Busca los paquetes por `ProductionOrderId` aunque la orden no exista en la base (ver ms3-gap-17): en ese caso `productionDate` y `orderStatus` vienen `null`. `404` solo si no hay ni orden ni paquetes.

### `/sim/*` — simulaciones
Endpoints auxiliares para ver lo que MS3 cree de los demás servicios. No son parte del contrato público.
- `GET /sim/patients/{id}`, `GET /sim/catalog/plans/{id}`, `POST /sim/catalog/plans/structure`: patients from the `ClinicPatients` projection of MS1's events (with `Projections__Enabled=true`; the 3 simulated patients standalone) and simulated plans of MS2.
- `GET /sim/calendars/active-tomorrow`: next-day deliveries from the `ScheduledDeliveries` projection of MS4's `production-order-ready` (with `Projections__Enabled=true`; simulated calendars standalone). Not a call to MS4.
- `GET /sim/outgoing/{eventType}` (`CreateSchedule`, `TransferToLogistics`): outbox rows with their state. `CreateSchedule` rows are published as `contract-activated`; `Published` only means the broker accepted it, not that MS4 created the calendar.

## Mapeo de errores
Configurado con `UseDefaultExceptionHandler()` en `Nurtricenter.Api/Program.cs` y `ThrowError`/`SendNotFoundAsync` en cada endpoint. **No hay un mapeo central de excepciones de dominio.**

| Origen | HTTP |
|---|---|
| `Result` fallido con `ErrorType.NotFound` | 404 |
| `ACTIVE_CONTRACT` (conflicto) | 409 |
| `NO_RECIPES` | 422 |
| Validación de FastEndpoints (JSON, GUID) | 400 |
| `InvalidOperationException` / `ArgumentException` del dominio | **500** |
