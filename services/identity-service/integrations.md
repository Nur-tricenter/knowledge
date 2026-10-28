# Integraciones síncronas — Identity

## Resumen
Este servicio **no hace llamadas síncronas salientes** a otros microservicios: no tiene `HttpClient` hacia MS1–MS5 ni hacia el gateway (`sync_calls: []` en [service.yaml](./service.yaml)). Es una hoja del grafo REST: solo recibe llamadas.

Lo único que sale por HTTP es infraestructura, no negocio:

| Destino | Qué | Código | Si falla |
|---|---|---|---|
| Consul (`ServiceRegistration:ServiceDiscoveryAddress`) | Auto-registro como `identity-service` (host y puerto fijos por configuración) con un check HTTP a `/health` | `src/Identity.Infrastructure/Consul/ServiceRegistration.cs` | 3 intentos con backoff (500 ms, 1 s). Si no logra registrarse, **solo deja un warning** y sigue sirviendo: el gateway no lo encuentra (404 en `/api/identity-service/**`), pero el servicio no se cae |

El WorkerService habla con RabbitMQ (ver [messaging.md](./messaging.md)) y con Postgres; no se registra en Consul.

## Quién depende de identity (llamadas entrantes)
Aunque identity no llama a nadie, **casi todos dependen de él de forma síncrona**:

| Servicio | Llamada | Código del cliente | Si identity no responde |
|---|---|---|---|
| MS4 | `POST /api/identity-service/v1/auth/login` como `ms4-service` | `ms4-delivery-schedule-management/src/Infrastructure/Catalog/ServiceAccountTokenHandler.cs` | El job de catálogo no puede llamar a MS2; los días quedan en `Scheduled` |
| MS3 | `POST /api/identity-service/v1/auth/login` como `ms3-service` | `ms3-contract-and-production/…/DeliveryCalendar/DeliveryCalendarOptions.cs` (`IdentityClientOptions.LoginPath`) | MS3 no puede crear calendarios ni leer la orden de producción en MS4 |
| `nur-tricenter-local/scripts/start-stack.*` | Login del `admin` y `POST /api/identity-service/v1/users` para crear `ms4-service` y `ms3-service` (409 = ya existe) | scripts | El script reintenta el login 24 veces (el gateway tarda ~30 s en ver a identity en Consul) y luego aborta |

La **validación** del token, en cambio, no necesita a identity: cada servicio la hace localmente con la clave compartida. Si identity se cae, los tokens ya emitidos siguen sirviendo hasta que vencen (3600 s).

```mermaid
sequenceDiagram
  participant MS4
  participant GW as Gateway
  participant ID as Identity
  participant MS2
  MS4->>GW: POST /api/identity-service/v1/auth/login (ms4-service)
  GW->>ID: POST /api/v1/auth/login
  ID-->>MS4: 200 { accessToken, expiresIn: 3600, scopes: [catalog.mealPlan:read] }
  MS4->>GW: GET /api/catalog/v1/meal-plans/{id} + Bearer
  GW->>MS2: GET /api/v1/meal-plans/{id}
  Note over MS2: valida firma, iss, aud y scope localmente — no consulta a identity
  MS2-->>MS4: 200
```
