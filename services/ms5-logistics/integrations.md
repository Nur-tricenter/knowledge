# Integraciones síncronas — MS5

## Resumen
| Destino | Método y ruta | Vía | Auth | Para qué |
|---|---|---|---|---|
| MS1 — ClinicService (hoy un mock de Postman) | `POST /api/v1/patients/contact-information` | **directo** (no pasa por el gateway) | ninguna | Validar que los pacientes existen y obtener nombre y teléfono |

Es la **única** llamada HTTP saliente. MS5 **no llama a MS4** (no existe cliente HTTP ni service account para `PATCH /delivery-result`: gap X-01) ni a identity.

## Detalle

### MS5 → ClinicService: contacto de pacientes
- **Puerto / adaptador en el código:** puerto `IClinicService` (`src/Nurtricenter.Core/Interfaces/Services/ClinicService/IClinicService.cs`), adaptador `src/Nurtricenter.Infrastructure/Services/ClinicService.cs`, registrado como typed `HttpClient` en `Nurtricenter.Infrastructure.DependencyInjection` con `BaseAddress = ClinicService:BaseUrl`.
- **Ruta exacta:** `POST {ClinicService:BaseUrl}/api/v1/patients/contact-information`. En la plataforma, `ClinicService__BaseUrl` (en `nurtricenter.compose.yml`) apunta a un **mock de Postman** (`https://<id>.mock.pstmn.io`). No es una URL del gateway ni un nombre de Consul, así que la llamada **sale directo** y no se beneficia del descubrimiento.
- **Contrato** (definido por MS5; no existe en ningún kernel ni en un repo de MS1):
  ```
  request : ["P-001", "P-002"]                       // array JSON de patientId distintos
  200     : [ { "patientId": "P-001", "phoneNumber": "…", "fullName": "Juana Pérez" } ]
  ```
  DTO: `PatientContactInfo(PatientId, PhoneNumber, FullName)` en Core. `PhoneNumber` se recibe pero **ningún caso de uso lo usa** hoy.
- **Autenticación:** ninguna. No se envía `Authorization`: no hay service account ni se reenvía el token del usuario (que tampoco existe, porque MS5 es anónimo).
- **Quién la usa:**
  | Caso de uso | Para qué | Si falta un paciente en la respuesta |
  |---|---|---|
  | `AddDeliveriesHandler` (`POST /packages/deliveries`) | Validar que **todos** los pacientes del lote existen | 404 `ClinicService.PatientsNotFound` y no se guarda nada |
  | `GetCourierTodayRouteHandler` (`GET …/route/today`) | Mostrar el nombre del paciente en cada parada | Se muestra el `patientId` en lugar del nombre |
- **Por qué es síncrono:** MS5 necesita la respuesta **en el momento** para aceptar o rechazar el lote, y no guarda datos de pacientes. La alternativa por eventos sería una proyección local de contactos alimentada por un evento de MS1 (`patient-registered` o similar), que no existe. Hay que pesar que hoy es la única dependencia síncrona que puede tumbar la consulta de ruta del repartidor.
- **Si falla:**
  | Respuesta de ClinicService | Resultado en MS5 |
  |---|---|
  | No-2xx (404, 500…) | `DomainException` `ClinicService.RequestFailed` (`ErrorType.Problem`) → **422** al cliente, con el cuerpo de la respuesta original en el detalle |
  | 200 con cuerpo `null` | 422 `ClinicService.EmptyResponse` |
  | 200 con JSON malformado | `JsonException` (no es `DomainException`) → **500** |
  | Timeout / red caída | Excepción del `HttpClient` (no es `DomainException`) → **500** del handler por defecto. Timeout por defecto de `HttpClient` (100 s) |
  | Lista de ids vacía | No se hace la llamada |

  **Sin reintentos, sin circuit breaker, sin timeout propio**: no hay resilience handler registrado. **Sin degradación:** si ClinicService está caído, el repartidor tampoco puede ver su ruta del día (el `GET` devuelve 422/500), aunque la ruta esté completa en la BD.
- **Modo sin dependencia (mock/fixture):** el propio destino ya es un mock de Postman. En los tests, `IntegrationTestWebAppFactory` reemplaza `IClinicService` por un `Mock<IClinicService>` (Moq), y `ClinicServiceTests` prueba el adaptador con `RichardSzalay.MockHttp` (ruta, cuerpo y manejo de 200/404/500/cuerpo nulo).

```mermaid
sequenceDiagram
  participant P as Cliente (hoy ninguno; MS3 por evento a futuro)
  participant GW as Gateway
  participant MS5
  participant CS as MS1 ClinicService (mock Postman)
  participant DB as BD MS5 (Neon)
  P->>GW: POST /api/nurtricenter/v1/packages/deliveries (sin token)
  GW->>MS5: POST /api/v1/packages/deliveries
  MS5->>CS: POST /api/v1/patients/contact-information ["P-001", …] (directo, sin token)
  alt todos los pacientes existen
    CS-->>MS5: 200 [ { patientId, phoneNumber, fullName } ]
    MS5->>DB: ruta de hoy más reciente + N entregas Pending + N filas outbox
    MS5-->>P: 201 { routeId, deliveries[] }
  else falta alguno
    CS-->>MS5: 200 (lista incompleta)
    MS5-->>P: 404 ClinicService.PatientsNotFound
  else ClinicService responde error
    CS-->>MS5: 5xx
    MS5-->>P: 422 ClinicService.RequestFailed
  end
```

## Integraciones que faltan
| Destino | Qué haría falta | Gap |
|---|---|---|
| MS4 Calendario | `PATCH /api/delivery-calendar/v1/calendars/days/{dayId}/delivery-result` con scope `deliveryCalendar.deliveryResult:edit`, usando una service account `ms5-service` (login en identity, como hace MS4 con MS2). Requiere además saber el `dayId` de MS4 de cada entrega | X-01 / ms5-gap-02 |
| MS1 Pacientes real | Reemplazar el mock por el servicio real, detrás del gateway (`/api/<consul-name-ms1>/v1/...`) y con un token | X-04 / ms5-gap-05 |
