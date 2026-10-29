# Seguridad entre servicios

## Modelo
```mermaid
sequenceDiagram
  actor U as Usuario / servicio
  participant ID as Identity
  participant GW as Gateway
  participant S as Servicio destino
  U->>ID: POST /api/v1/auth/login (usuario, clave)
  ID-->>U: JWT { sub, scope: "a b c" }
  U->>GW: request + Authorization: Bearer JWT
  GW->>S: reenvía tal cual (el gateway NO valida)
  S->>S: valida firma, issuer, audience y el scope del endpoint
  S-->>U: 200 / 401 sin token / 403 sin scope
```

## JWT
- Clave **simétrica** compartida (`Jwt:SecretKey`) entre identity y cada servicio que valida. Es obligatoria al arrancar: el kernel lanza una excepción si falta.
- `issuer`: `nur-tricenter-identity` · `audience`: `nur-tricenter-clients`.
- Los permisos viajan en **un solo claim `scope`, separados por espacios** (`TokenIssuer` de identity); la policy del kernel parte el valor por espacios y también aceptaría claims repetidos. Los hosts configuran `MapInboundClaims = false`: si no, .NET renombra los claims y las policies no los encuentran.
- Algoritmo HS256, vida 3600 s en el stack local. El token no lleva `email`. El admin recibe además el claim `identity:*`.
- `Nur.Tricenter.Security.AddSecurity()` registra la validación y **una policy de autorización por scope**. El endpoint declara `RequireAuthorization("<scope>")`.

## Scopes por servicio (kernel `Nur.Tricenter.Access`)
Formato: `{servicio}.{recurso}:{acción}`.

| Servicio | Scopes |
|---|---|
| MS2 Catálogo | `catalog.food:{read,create,edit,manage}`, `catalog.recipe:{…}`, `catalog.mealPlan:{…}` |
| MS4 Calendario | `deliveryCalendar.calendar:{read,create,edit}`, `deliveryCalendar.productionOrder:read`, `deliveryCalendar.deliveryResult:edit`, `deliveryCalendar.catalogResolution:manage` |
| Identity | `identity.user:{login,read,create,edit,manage}`, `identity.role:{…}`. `identity:*` no es un scope: es un claim bandera (`"true"`) que solo lleva el token del admin sembrado, y nunca se expande |
| MS5 Logística | _no tiene scopes en el kernel_ (no existe `LogisticsPermission`) y no valida JWT: llama a `AddAuthorization()`/`UseAuthorization()` sin `AddSecurity()`, y sus 7 endpoints de negocio son anónimos |
| MS1 Clínica | _sin definir_: no valida JWT y todos sus endpoints son anónimos (repo externo, no integrado) |
| MS3 Contratación | _sin definir_: sus endpoints son anónimos (X-11) |

- `platform:*` (que tiene el `admin` sembrado) se **expande al hacer login** en todos los scopes concretos que conoce el kernel (`PlatformPermissions.Expand`): identity, catálogo y calendario. No hay scopes de MS3 ni de MS5 porque no existen en el kernel.
- `identity:*` **no** se expande y `POST /users` lo rechaza; pero `platform:*` sí se acepta (ver riesgos).
- Las tablas ruta→scope del kernel son documentales: ningún servicio ni el gateway las leen en runtime.

## Service accounts
Usuarios técnicos para las llamadas servicio → servicio, con **mínimo privilegio**.

| Cuenta | Usada por | Scopes | Para |
|---|---|---|---|
| `ms4-service` | MS4 | `catalog.mealPlan:read` | Leer la composición del plan en MS2 |
| `ms3-service` | MS3 | `deliveryCalendar.calendar:create`, `deliveryCalendar.productionOrder:read` | Crear el calendario de un contrato y leer la orden de producción en MS4 |

MS5 **no tiene service account**: ya no hace llamadas salientes (dejó de llamar al ClinicService en MS5#4), y no llama a MS4 (el cierre del ciclo va por eventos que MS4 consume). Si se prefiriera cerrar X-01 por REST, haría falta `ms5-service` con el scope `deliveryCalendar.deliveryResult:edit`.

Las crea `nur-tricenter-local/scripts/start-stack.*` después de levantar el stack: login como admin y `POST /api/identity-service/v1/users` (409 = ya existe). Sin identity en el compose (X-12), este paso falla.

Cuando agregues una service account, documéntala aquí, en `start-stack.*` y en el `service.yaml` (`sync_calls[].auth: service-account:<cuenta>`).

## Endpoints anónimos
`/health` de cada servicio (Consul lo usa como health check; MS4 expone además `/alive`). `POST /auth/login` de identity. **Todos** los endpoints de MS3 (X-11) y de MS1. **Todos** los endpoints de MS5 (`/api/v1/couriers`, `/routes`, `/packages/deliveries`, `…/route/today`, `…/start`, `…/deliver`, `…/fail`), también a través del gateway.

## Riesgos conocidos
- **Autorización por objeto (BOLA):** los scopes dicen *qué tipo* de cliente llama, no *de quién* es el recurso. En MS4, un token con `deliveryCalendar.calendar:edit` puede editar el calendario de cualquier paciente. Cerrarlo requiere mapear el `sub` del token al `PatientId`, que vive en MS1.
- **Escalada de privilegios en identity:** `POST /api/v1/users` (scope `identity.user:manage`) solo rechaza `identity:*`; acepta `platform:*`, así que quien tenga `identity.user:manage` puede crear un administrador completo. Ver la [ficha de identity](../services/identity-service/gaps.md).
- **El gateway no valida tokens:** la protección depende de cada servicio. MS3, MS5 y MS1 quedan abiertos a través del gateway.
- **Clave simétrica compartida:** quien tenga la clave puede emitir tokens. Una evolución natural es pasar a firma asimétrica (RS256 + JWKS).
- **MS5 sin autenticación:** cualquiera que llegue al gateway puede crear repartidores y rutas, cargar paquetes y marcar entregas como entregadas o fallidas. Ver [../services/ms5-logistics/gaps.md](../services/ms5-logistics/gaps.md) (ms5-gap-01) y X-03.
