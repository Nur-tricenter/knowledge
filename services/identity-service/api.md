# API — Identity

- **Prefijo interno:** `/api/v1`
- **Prefijo en el gateway:** `/api/identity-service/v1` (el gateway quita `/api/identity-service` y agrega `/api`). El nombre sale del registro en Consul (`identity-service`).
- **Estilo:** ASP.NET Core Controllers con `[ApiController]` (`AuthController`, `UserController`).
- **Autenticación:** JWT emitido por este mismo servicio, validado con `Nur.Tricenter.Security.AddSecurity` y `MapInboundClaims = false`. Solo hay policies para los scopes de identity (`IdentityPermission.PermissionsList`).
- **Formato de error:** **no es uniforme**. No hay manejador global de excepciones:
  - `401` de `login` y de `me` (los devuelve el controller con `Unauthorized()`): ProblemDetails genérico de `[ApiController]` (`{ type, title: "Unauthorized", status: 401, traceId }`).
  - `401`/`403` del middleware JWT (sin token, token inválido, sin scope): cuerpo vacío.
  - `400`/`409` de `POST /users`: objeto propio `{ "detail": "…" }`, **no** ProblemDetails.
  - `400` por JSON mal formado: ProblemDetails de validación de `[ApiController]`.
  - Excepción no controlada (p. ej. carrera contra el índice único): 500.
- **Documentación interactiva:** Swagger en `/swagger`, solo con `ASPNETCORE_ENVIRONMENT=Development`.

## Resumen
| Método | Ruta | Llamado por | Scope | Idempotente |
|---|---|---|---|---|
| POST | `/auth/login` | MS3, MS4 (service accounts), operaciones | anónimo | sí en el resultado (cada llamada emite un token nuevo y actualiza `LastLoginOn`) |
| GET | `/auth/me` | operaciones (Swagger/Postman); ningún servicio lo llama | cualquier JWT válido (sin scope) | sí |
| POST | `/users` | operaciones (`start-stack.*` con el token del admin) | `identity.user:manage` | no; el 2.º intento da 409 |
| GET | `/health` | Consul | anónimo | sí |

No existe `/alive`, ni endpoints para listar, editar, desactivar o borrar cuentas.

## Detalle por endpoint

### `POST /api/v1/auth/login`
**Para qué:** cambiar usuario + contraseña por un JWT. Es la puerta de entrada de toda la plataforma.

```json
// request — userName acepta el nombre de usuario o el email
{ "userName": "ms4-service", "password": "…" }
// 200
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "userName": "ms4-service",
  "isAdministrator": false,
  "scopes": ["catalog.mealPlan:read"]
}
```
| Código | Cuándo |
|---|---|
| 200 | Credencial válida y cuenta activa |
| 401 | Campos vacíos, usuario inexistente, contraseña incorrecta o cuenta inactiva. **Siempre el mismo cuerpo**, y en el caso "usuario inexistente" igual se verifica un hash ficticio para que el tiempo de respuesta no lo delate |

- No hay límite de intentos, bloqueo de cuenta ni rate limiting.
- Para el admin, `scopes` trae la lista **expandida** (27 scopes), nunca `platform:*`.

### `GET /api/v1/auth/me`
**Para qué:** devolver el principal autenticado **leído del token**, sin ir a la BD.

```json
// 200
{ "id": "…guid (sub)…", "userName": "admin", "email": "", "isAdministrator": true, "scopes": ["identity.user:login", "…"] }
```
| Código | Cuándo |
|---|---|
| 401 | Sin token o token inválido (middleware); o `sub` que no es un GUID (controller) |

- `email` viene **siempre vacío**: el token no lleva claim `email` (identity-gap-05).
- `isAdministrator` se calcula con el claim `identity:*` = `"true"`.

### `POST /api/v1/users`
**Para qué:** crear una cuenta, en la práctica las service accounts. Publica `UserPublished` por outbox.

```json
// request
{ "userName": "ms4-service", "email": "ms4-service@nur.local", "password": "…", "scopes": ["catalog.mealPlan:read"] }
// 201  (Location: /api/auth/me)
{ "id": "…guid…", "userName": "ms4-service", "email": "", "isAdministrator": false, "scopes": ["catalog.mealPlan:read"] }
```
| Código | Cuándo |
|---|---|
| 201 | Cuenta creada. ⚠ El header `Location` apunta a `/api/auth/me` (ruta inexistente) y el cuerpo trae `email` vacío e `isAdministrator` siempre `false` |
| 400 `{ detail }` | Falta `userName`, `password` o `email`; o se pidió `identity:*` |
| 401 | Sin token o token inválido |
| 403 | El token no tiene `identity.user:manage` |
| 409 `{ detail }` | El `userName` **o el `email`** ya existen (el mensaje siempre habla del nombre de usuario) |

- ⚠ **Pedir `platform:*` está permitido**: la cuenta nueva recibe los 27 scopes de la plataforma, incluido `identity.user:manage`. Ver identity-gap-01.
- Los scopes no se validan contra el kernel: un texto cualquiera se guarda tal cual.

### `GET /health`
Anónimo. Responde `{ success, message, data: { status, totalDurationMilliseconds, entries[] } }`. El chequeo de Postgres **solo se registra si Consul está configurado** (`ServiceRegistration:ServiceDiscoveryAddress`); sin Consul responde `Healthy` sin chequear nada. Consul lo consulta cada 10 s (timeout 5 s, desregistro tras 30 s en estado crítico).

## El token (contrato de facto con todos los servicios)
| Claim | Valor |
|---|---|
| `iss` / `aud` | `nur-tricenter-identity` / `nur-tricenter-clients` |
| `nbf` / `exp` | ahora / ahora + `Jwt:Lifetime` (3600 s en los compose) |
| `sub` | Id (GUID) de la cuenta |
| `jti` | GUID aleatorio |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier` | Id de la cuenta (otra vez) |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `UserName`. Se escribe con el nombre URI largo de `ClaimTypes.Name`, no como `name` |
| `scope` | **Un solo claim** con los scopes separados por espacios. Se omite si la cuenta no tiene scopes |
| `identity:*` | `"true"`, solo para el administrador del seed |

- Firma **HS256** con la clave simétrica compartida `Jwt:SecretKey` (la misma en identity, MS2, MS3, MS4).
- No lleva `email`, roles ni relación con el `PatientId`.
- Los servicios validan con `AddSecurity`, que parte el claim `scope` por espacios (así que también aceptaría claims repetidos, pero identity emite uno solo).

## Mapeo de errores
No hay `IExceptionHandler` ni middleware de excepciones. Los errores de negocio no son excepciones: `LoginService` y `UserCreationService` devuelven un resultado (`LoginOutcome`, `UserCreationOutcome`) y el controller elige el código (`Unauthorized()`, `BadRequest(new { detail })`, `Conflict(new { detail })`). Cualquier excepción (BD caída, violación de índice único por carrera, scope de más de 128 caracteres) termina en **500**.
