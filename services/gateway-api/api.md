# API — Gateway

- **Base:** `http://localhost:15005` desde el host; `http://gateway:8080` desde otro contenedor de `nur-tricenter-net`.
- **Prefijo interno / en el gateway:** no aplica. El gateway no tiene un `/api/v1` propio; sus únicas rutas propias son `/health` y `/health-ui`. Todo lo demás bajo `/api/{servicio}/**` es **proxy**.
- **Autenticación:** **ninguna**. No hay `AddAuthentication`, `UseAuthentication` ni `UseAuthorization`. El header `Authorization` llega intacto al servicio, que es quien decide.
- **Formato de error:** el gateway no escribe ProblemDetails. Un 404 por ruta inexistente sale vacío; los errores del servicio se devuelven tal cual.
- **Documentación interactiva:** ninguna (sin Swagger/OpenAPI, a propósito).

## Resumen
| Método | Ruta | Llamado por | Scope | Idempotente |
|---|---|---|---|---|
| GET | `/health` | Operaciones; el propio `/health-ui` | anónimo | sí |
| GET | `/health-ui` | Operaciones (navegador) | anónimo | sí |
| cualquiera | `/api/{servicio}/{**catch-all}` | Frontend, MS3, MS4, scripts de `nur-tricenter-local` | ninguno en el gateway (lo exige cada servicio) | lo que sea el endpoint de destino |

## Pipeline de una request
Orden en `Program.cs`:
1. `UseRouting()`
2. `UseHealthChecks()` → mapea `/health` y `/health-ui` (`Extensions/ApplicationBuilderExtensions.cs`).
3. `UseCorrelationId()` → middleware de `X-Correlation-Id`.
4. `MapReverseProxy()` → YARP con las rutas de `ConsulYarpConfigProvider`.

No hay `UseHttpsRedirection`, CORS, rate limiting ni manejador global de excepciones.

## Detalle por endpoint

### `GET /health`
**Para qué:** estado del propio gateway, en formato JSON de HealthChecks UI (`UIResponseWriter.WriteHealthCheckUIResponse`).
**Llamado por:** operaciones y el tablero `/health-ui`, que lo sondea cada 10 s. La sonda del contenedor en compose **no** lo usa (es TCP).

```json
// 200
{ "status": "Healthy", "totalDuration": "00:00:00.0000123", "entries": {} }
```
- `AddHealthChecks()` no registra **ningún** check: responde `Healthy` siempre que el proceso esté arriba. No mira Consul ni los servicios.

### `GET /health-ui`
**Para qué:** tablero de AspNetCore.HealthChecks.UI (storage en memoria, evaluación cada 10 s).
- Monitorea **un solo** endpoint: `ApiGateway` → `HealthChecksUI:SelfHealthEndpoint` (por defecto `http://localhost:8080/health`). No muestra el estado de los microservicios.
- El paquete también mapea sus rutas auxiliares (API y recursos del tablero) con las rutas por defecto de la librería.

### `/api/{servicio}/{**catch-all}` (proxy)
**Para qué:** llegar a cualquier servicio registrado en Consul sin conocer su dirección.
**Llamado por:** frontend y servicios (ver `sync_calls` con `via: gateway` en las otras fichas).

| Paso | Ejemplo |
|---|---|
| Request pública | `GET /api/delivery-calendar/v1/calendars/7` |
| Match | ruta `delivery-calendar-route`, patrón `/api/delivery-calendar/{**catch-all}` |
| `PathRemovePrefix` `/api/delivery-calendar` | `/v1/calendars/7` |
| `PathPrefix` `/api` | `/api/v1/calendars/7` |
| Destino | `http://{Address}:{Port}/api/v1/calendars/7` de una instancia passing de `delivery-calendar-cluster` |

- **Métodos:** la ruta no restringe métodos; se reenvía cualquiera.
- **Query string, body y headers** (incluido `Authorization`) pasan sin cambios, más los transforms por defecto de YARP.
- **Varias instancias:** YARP elige una con su política de balanceo por defecto (el gateway no configura ninguna).
- **Tabla de rutas vigente:** ver [README.md → Tabla de rutas actual](./README.md#tabla-de-rutas-actual).

| Código | Cuándo |
|---|---|
| 404 | No hay ruta: el nombre no está en Consul, no tiene instancias passing, o todavía no pasó el refresco (≤ 30 s). También si el servicio mismo responde 404 |
| 502 | La instancia está en la tabla pero no responde (cayó entre dos refrescos) |
| 504 | El servicio tarda más que el timeout por defecto de YARP (no se configura uno propio) |
| cualquier otro | Lo devuelve el servicio de destino tal cual (401/403 si el servicio valida JWT) |

## Headers
| Header | Comportamiento |
|---|---|
| `X-Correlation-Id` | Si la request no lo trae (o viene vacío), el gateway genera un GUID y lo agrega **a la request** antes del proxy, así que el servicio lo recibe. Siempre se devuelve en la respuesta (se escribe en `Response.OnStarting`). También se agrega en `/health` y `/health-ui` |
| `Authorization` | Se reenvía sin leerlo |

## Mapeo de errores
No hay mapeo propio: el gateway no lanza excepciones de negocio. Un error al refrescar desde Consul se loguea y no afecta a la request (ver [integrations.md](./integrations.md)).
