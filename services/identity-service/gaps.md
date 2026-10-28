# Gaps — Identity

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| identity-gap-01 | `POST /users` acepta `platform:*`: escalada a administrador | high | — | abierto |
| identity-gap-02 | Sin ciclo de vida de cuentas (listar, scopes, desactivar, contraseña, revocar); `user-updated` está muerto | medium | — | abierto |
| identity-gap-03 | Identity no está en el compose local: el stack no tiene emisor de tokens | high | nur-tricenter-local | abierto (X-12) |
| identity-gap-04 | Sin relación `sub` → `PatientId` | high | MS1 | abierto (X-08) |
| identity-gap-05 | Respuestas incompletas: `email` vacío en `/me` y en el 201; `Location` incorrecto | low | — | abierto |
| identity-gap-06 | `IdentityRoutes` del kernel no coincide con el servicio | low | kernels | abierto (X-05) |
| identity-gap-07 | Cola `identity.default` fuera de la topología y sin límite | low | nur-tricenter-local | abierto |
| identity-gap-08 | Validación débil de entrada y sin protección contra fuerza bruta | medium | — | abierto |
| identity-gap-09 | Clave simétrica compartida (HS256) | medium | todos | abierto |
| identity-gap-10 | Sin tests ni manejador global de errores | low | — | abierto |

## Detalle

### identity-gap-01 — Cualquier `identity.user:manage` puede crear un administrador
- **Qué pasa:** `UserCreationService` solo rechaza `identity:*`. Si el request trae `platform:*`, lo expande y guarda los 27 scopes de la plataforma (incluido `identity.user:manage`). El comentario de `CreateUserRequest` dice justo lo contrario ("granting the wildcard over HTTP … is deliberately not reachable").
- **Impacto:** quien tenga `identity.user:manage` (hoy solo el admin, pero es un scope delegable) crea con una llamada una cuenta con poder total sobre MS2, MS4 e identity.
- **Qué haría falta:** rechazar también `PlatformPermissions.All` y, mejor, aceptar solo scopes de `Permission.PermissionsList` y no más de los que tiene quien llama.

### identity-gap-02 — Las cuentas no se pueden administrar
- **Qué pasa:** solo existe "crear". No hay endpoints para listar (`GET /users` existe solo en el kernel), cambiar scopes, desactivar, cambiar contraseña ni revocar tokens. `GrantScope`/`RevokeScope`/`Deactivate`/`Activate` existen en el agregado pero nadie los llama, y además `GrantScope`/`RevokeScope` cambian una lista en memoria no persistida (la verdad está en `UserScopes`).
- **Impacto:** rotar la contraseña de una service account o quitarle un scope exige tocar la BD a mano. El exchange `user-updated` nunca recibe mensajes y sus 5 colas son decorativas. Un token filtrado vale hasta 1 h.
- **Qué haría falta:** endpoints de administración que modifiquen `UserScopes` a través del agregado (para que se publique `UserChanged`), y tokens más cortos o refresh tokens.

### identity-gap-03 — El stack local no levanta identity
- **Qué pasa:** el commit `acce166` de `nur-tricenter-local` (integración de MS1) reescribió `compose/docker-compose.yml` y quitó el `include` de `../../nur-tricenter-identity/identity.compose.yml`; además incluye un `ms1.compose.yml` que no existe. `start-stack.*` todavía compila identity y espera poder hacer login del admin.
- **Impacto:** sin identity no hay tokens: MS2 y MS4 responden 401 a todo, MS3/MS4 no obtienen sus service accounts y `start-stack` aborta.
- **Qué haría falta:** restaurar el `include` en `nur-tricenter-local` (gap transversal X-12).

### identity-gap-04 — El token no sabe qué paciente es
- **Qué pasa:** el JWT trae `sub` (id de la cuenta) y scopes. No hay relación con el `PatientId` de MS1 ni claims de tipo de usuario.
- **Impacto:** los servicios no pueden aplicar autorización por objeto (BOLA en MS4, X-08).
- **Qué haría falta:** definir con MS1 cómo se enlaza cuenta ↔ paciente (claim `patient_id` o consulta) y emitirlo en el token.

### identity-gap-05 — Respuestas incompletas
- `/me` devuelve `email: ""` siempre: el token no lleva claim `email`.
- `POST /users` responde 201 con `Location: /api/auth/me` (ruta que no existe; la real es `/api/v1/auth/me` y además no es el recurso creado) y con `email: ""` e `isAdministrator: false` aunque la cuenta tenga email.
- El 409 por **email** repetido dice "The user name '…' is already in use".

### identity-gap-06 — El kernel describe otra API
`Nur.Tricenter.Access.Identity.IdentityRoutes` (1.1.0) declara `Base = "/api/identity"` (la ruta real en el gateway es `/api/identity-service`), `POST /users` con `identity.user:create` (el servicio exige `identity.user:manage`), un `GET /users` que no existe, y un comentario que dice que la creación de usuarios es anónima. Hoy nadie consume `Routes` (el gateway rutea por Consul), pero es documentación engañosa. Va junto con X-05.

### identity-gap-07 — `identity.default`
El worker declara una cola **durable** `identity.default` ligada a `user-published` y `user-updated` y nunca la consume, a propósito, como "registro completo". No está en `rabbitmq-definitions.json` ni en `contracts/events.yaml`, no tiene TTL ni límite de largo: crece para siempre. Si el registro es útil, debería declararse en la topología con un límite; si no, eliminarse.

### identity-gap-08 — Validación de entrada y fuerza bruta
- Los scopes pedidos no se validan contra el kernel (un typo crea una cuenta que no puede nada, sin error). Un scope de más de 128 caracteres termina en 500.
- No se valida el formato del email ni la fortaleza de la contraseña.
- `UserName`/`Email` son sensibles a mayúsculas (`Admin` y `admin` son cuentas distintas).
- Login sin rate limiting ni bloqueo por intentos.

### identity-gap-09 — Clave simétrica compartida
HS256 con la misma `Jwt:SecretKey` en todos los servicios que validan: cualquiera de ellos (o quien lea su configuración) puede **emitir** tokens válidos con cualquier scope. La evolución natural es RS256 + JWKS publicado por identity.

### identity-gap-10 — Sin tests ni manejo global de errores
El repo no tiene proyecto de tests. No hay `IExceptionHandler`: cualquier excepción (p. ej. la carrera entre el chequeo de duplicados y el índice único) es un 500 sin ProblemDetails. Los formatos de error de los endpoints no son uniformes (ver [api.md](./api.md)).

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código** (`nur-tricenter-identity`, rama `main`, 2026-10-23).

| Dónde | La doc dice | El código hace |
|---|---|---|
| `README.md` del repo (tabla de stack) | Kernels `Nur.Tricenter.*` 1.0.9 | 1.1.0 (`Directory.Packages.props`, commit del 2026-10-23) |
| `README.md` del repo ("Gateway", "Resources") | El gateway rutea `/api/identity/**`; API en `http://localhost:15005/api/identity/v1/…` | El prefijo sale del nombre en Consul: `/api/identity-service/v1/…` |
| `README.md` del repo ("Authentication & tokens") | Los scopes van como claims `scope` (repetidos); `Expand` convierte `identity:*` en scopes concretos | **Un** claim `scope` separado por espacios. `Expand` solo expande `platform:*`; `identity:*` no se expande y no se puede pedir |
| `README.md` del repo | "The built-in administrator holds every scope through the expanded wildcard" (identity) | El admin tiene `platform:*`: recibe los 27 scopes de toda la plataforma |
| `README.md` del repo (intro y "Gateway") | Todos los demás servicios validan tokens y consumen sus eventos; la auth del gateway está "diferida" y los validadores son "catalog today" | MS2 y MS4 validan; MS3, MS5 y MS1 no validan (X-11, X-03). Solo MS2 consume (`ms2.user-published`); nadie consume `user-updated`. El gateway no valida tokens |
| `README.md` del repo ("Running locally" / "Resources") | Stack con `nur-tricenter-orchestrator`; API directa en `localhost:8080` | El repo es `nur-tricenter-local`; en plataforma la API no publica puerto (solo vía gateway) y en standalone está en el 7081 |
| `README.md` del repo ("Outbox & events") | `IdentityDbContext.SaveChanges()` dispara los eventos | Solo `UnitOfWork.CommitAsync` drena los eventos al outbox; `SaveChanges` directo los perdería |
| `CreateUserRequest.Scopes` (comentario) | El comodín no se puede otorgar por HTTP | `platform:*` sí se puede (identity-gap-01) |
| `IdentityPermissions` (comentario) | Una cuenta con solo `identity:*` queda limitada a los scopes de identity | `identity:*` no se expande: llegaría literal al token |
| `Program.cs` (Swagger) y `Identity.App.csproj` | `POST /api/auth/login`, `GET /api/auth/me` | `/api/v1/auth/login`, `/api/v1/auth/me` |
| `identity.compose.yml` | La API recibe `DefaultUser__*` para "sembrar al arrancar" | La API no siembra; solo el WorkerService |
| Kernel `IdentityRoutes` | Ver identity-gap-06 | Ver identity-gap-06 |
| KB `platform/security.md` | "Los permisos viajan como claims `scope` repetidos"; diagrama `scope: [...]`; lista `identity:*` como scope | Un claim `scope` separado por espacios; `identity:*` es un claim-bandera del admin (`"true"`), no un scope |
| KB `platform/architecture.md` | "La topología no la declara ningún servicio" | Identity declara `user-published`, `user-updated` y la cola `identity.default` |
| KB `platform/architecture.md` y X-07 | Identity usa los kernels 1.0.9 | 1.1.0 |
