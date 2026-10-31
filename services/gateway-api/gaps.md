# Gaps — Gateway

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| gateway-gap-01 | Sin validación de JWT en el borde: MS3 y MS5 quedan abiertos a través del gateway | high | MS3, MS5 | abierto (X-03, X-11) |
| gateway-gap-02 | Sin CORS, rate limiting, timeouts ni reintentos propios | medium | — | parcial: CORS configurable en revisión ([gateway#1](https://github.com/Nur-tricenter/nur-tricenter-api-gateway/pull/1)) |
| gateway-gap-03 | Hasta 30 s de rutas obsoletas: 502 hacia instancias caídas, 404 para servicios recién levantados | medium | — | abierto |
| gateway-gap-04 | `/health` no tiene checks y `/health-ui` solo se monitorea a sí mismo | low | — | abierto |
| gateway-gap-05 | No se registra en Consul y no tiene observabilidad (sin OpenTelemetry; el correlation id no se loguea) | low | — | abierto |
| gateway-gap-06 | `DangerousAcceptAnyServerCertificate` no tiene efecto: el esquema upstream es siempre `http` | low | — | abierto |
| gateway-gap-07 | README, comentarios y `launchSettings.json` desactualizados respecto del código | low | — | abierto |
| gateway-gap-08 | El nombre en Consul es la URL pública: no hay convención y uno de los prefijos no es un nombre de dominio | low | — | abierto |

## Detalle

### gateway-gap-01 — Nadie valida el token en la entrada
- **Qué pasa:** el gateway no tiene `AddAuthentication`/`UseAuthorization` (decisión explícita, "Phase 5b" en `Program.cs`). Cada servicio decide. MS2, MS4 e identity validan el JWT; **MS3 y MS5 no** (X-11, X-03), así que cualquiera que llegue al puerto 15005 puede usarlos. MS1 hoy no tiene ruta (no se registra en Consul); si se registrara sin validar JWT, quedaría igual de expuesto.
- **Impacto:** el gateway es el único punto público y no filtra nada: la seguridad de toda la plataforma es la del servicio más débil.
- **Qué haría falta:** como mínimo, validar firma, emisor, audiencia y vencimiento en el gateway con `Nur.Tricenter.Security` (excluyendo `/api/identity-service/v1/auth/login` y los `/health`), sin reemplazar la validación de scopes de cada servicio.

### gateway-gap-02 — Sin políticas de borde
- **Qué pasa:** no hay `AddCors`, `AddRateLimiter`, ni `HttpRequest`/`SessionAffinity`/`HealthCheck` en los `ClusterConfig`. Rigen los valores por defecto de YARP.
- **Impacto:** un frontend en otro origen depende de que cada servicio configure CORS; un cliente abusivo llega sin freno a los servicios; una instancia lenta retiene la request hasta el timeout por defecto de YARP.
- **Qué haría falta:** CORS con los orígenes del frontend, un rate limiter por IP o por `sub`, y un `ActivityTimeout` explícito por cluster.
- **2026-10-31:** CORS en [gateway#1](https://github.com/Nur-tricenter/nur-tricenter-api-gateway/pull/1) (`Cors:AllowedOrigins`, apagado en producción). Siguen pendientes el rate limiting y los timeouts.

### gateway-gap-03 — La tabla va hasta 30 s atrasada
- **Qué pasa:** polling cada 30 s, sin blocking queries de Consul ni health checks activos/pasivos de YARP.
- **Impacto:** una instancia caída sigue recibiendo tráfico (502) hasta el siguiente refresco; un servicio recién levantado da 404 hasta el siguiente refresco (por eso `start-stack.*` reintenta el login). Además, un 404 del gateway no se distingue de un 404 del servicio.
- **Qué haría falta:** health checks pasivos en YARP (sacar la destination tras fallos) y/o blocking queries de Consul; opcionalmente un cuerpo o header que identifique el 404 "sin ruta".

### gateway-gap-04 — Health que no informa
- **Qué pasa:** `AddHealthChecks()` sin checks → `/health` siempre `Healthy`. El tablero `/health-ui` tiene una sola entrada fija (`ApiGateway` → `HealthChecksUI:SelfHealthEndpoint`); los servicios de Consul no aparecen. La sonda del contenedor en compose es TCP y tampoco usa `/health`.
- **Impacto:** `/health-ui` muestra verde aunque Consul esté caído o no haya ninguna ruta publicada.
- **Qué haría falta:** un check que reporte si el último refresco de Consul funcionó y cuántas rutas hay, y alimentar el tablero con los servicios del catálogo leídos **sin** `BuildServiceProvider()` (el README explica por qué se quitó esa versión).

### gateway-gap-05 — Invisible para Consul y para las trazas
- **Qué pasa:** no se registra en Consul; no usa `Nur.Tricenter.Observability` ni OpenTelemetry; el `X-Correlation-Id` se genera y reenvía pero no se agrega a los logs del gateway.
- **Impacto:** no hay span del gateway en las trazas distribuidas y no se puede buscar en sus logs por correlation id.
- **Qué haría falta:** OpenTelemetry (o el kernel de observabilidad) y un scope de logging con el correlation id.

### gateway-gap-06 — Escape de certificados sin efecto
- **Qué pasa:** el cluster de Development acepta cualquier certificado, pero la destination se arma siempre como `http://{Address}:{Port}`; nunca hay TLS hacia upstream.
- **Impacto:** ninguno hoy; confunde al leer el código (el comentario habla de servicios registrados con el certificado HTTPS de desarrollo) y no hay forma de usar HTTPS upstream sin cambiar el código.
- **Qué haría falta:** decidir el esquema por metadatos/tags de Consul o por configuración, o quitar el escape.

### gateway-gap-07 — Doc del repo desactualizada
Ver la tabla siguiente.

### gateway-gap-08 — El nombre en Consul es contrato público
- **Qué pasa:** el prefijo es literalmente el `ServiceName` que elige cada servicio. No hay convención: `catalog`, `contracting`, `delivery-calendar` (dominio), `identity-service` (con sufijo) y `nurtricenter` (MS5, nombre de la plataforma).
- **Impacto:** renombrar un registro en Consul rompe a todos sus llamadores; `/api/nurtricenter` no dice qué servicio es. El kernel y el README de identity dicen `/api/identity` (X-05).
- **Qué haría falta:** una convención en un ADR, o un mapeo nombre → prefijo explícito en el gateway.

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código** (`main`, commit `555796f`).

| Dónde | La doc dice | El código hace |
|---|---|---|
| `README.md` del repo (tabla de endpoints, layout) | `/swagger` con Swagger UI (Development) y un dropdown alimentado por Consul; `ApplicationBuilderExtensions.cs` "Swagger UI" | **No hay Swagger ni OpenAPI**: `Program.cs` y `ApplicationBuilderExtensions.cs` explican que se quitó a propósito |
| `README.md` del repo (decisiones 2 y "No JwtOptions") | Usa `Swashbuckle.AspNetCore` 7.2.0 y conserva la definición Bearer en `DependencyInjection.AddGatewayDocumentation` | Swashbuckle no está en el `.csproj` y `AddGatewayDocumentation` no existe |
| `README.md` del repo (layout) | `ApiGateway.sln` | La solución es `nur-tricenter-api-gateway.sln` |
| `README.md` del repo ("What a new microservice needs") | Registrarse como `ServiceName = {name}-service` | El prefijo es el nombre tal cual; solo identity usa `-service` (`catalog`, `contracting`, `delivery-calendar`, `nurtricenter`) |
| `README.md` del repo (Docker) | Construir y correr con el `Dockerfile` | La plataforma no usa el `Dockerfile`: monta `bin/Debug/net10.0` en `aspnet:10.0` |
| `ConsulYarpConfigProvider.cs` (comentario de la ruta) | `/api/catalog/api/v1/foods -> /api/v1/foods` | Con `PathRemovePrefix` + `PathPrefix /api`, la ruta pública es `/api/catalog/v1/foods -> /api/v1/foods` (el comentario es de antes del commit `555796f`) |
| `ConsulYarpConfigProvider.cs` (comentario de destinations) | Los servicios locales se registran con el certificado HTTPS de desarrollo | El esquema es siempre `http` (gateway-gap-06) |
| `Properties/launchSettings.json` | `launchUrl: swagger` en los perfiles `http` y `https` | `/swagger` no existe: el navegador abre en 404 |
| `appsettings.Development.json` | `HealthChecksUI:EvaluationTimeOnSeconds` = 10 | Lo fija el código (`SetEvaluationTimeInSeconds(10)`); la clave de configuración es redundante |
