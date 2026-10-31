# Integraciones síncronas — MS2

## Resumen

**MS2 no realiza llamadas HTTP salientes a otros microservicios.** No tiene `HttpClient`, adaptadores de infraestructura remota ni service accounts propias. Toda su integración con el resto de la plataforma es **asíncrona** (eventos vía outbox). Since MS4#12 **no service calls MS2 over REST either**: the only REST callers left are the frontend and admin through the gateway.

| Destino | Método y ruta | Vía | Auth | Para qué |
|---|---|---|---|---|
| _(ninguno)_ | — | — | — | — |

Por eso `sync_calls: []` en [service.yaml](./service.yaml).

## Llamadas entrantes relevantes

### MS4 → MS2: composición del plan (removed, now an event)

Until MS4#12 this was the only synchronous integration that touched MS2: MS4's `resolve-daily-catalog` job called `GET /api/catalog/v1/meal-plans/{mealPlanId}` once per distinct plan, authenticated as the service account `ms4-service`. **That call no longer exists.** MS4 makes no outbound HTTP at all; `HttpCatalogPort` and its token handler were deleted.

- **What replaces it:** MS2 publishes `meal-plan-composition-changed` (a full snapshot of the plan, see [messaging.md](./messaging.md)) every time a meal time is added or a recipe is assigned or removed. MS4 projects it into `PlanDayMenus` and reads the menu of each day from there (`ProjectedCatalogPort`).
- **Why it changed:** the course rule is to avoid synchronous service-to-service REST. The old reasons for the call (need the plan's *current* composition at a precise moment; `meal-plan-published` carried no composition) are answered by the snapshot: the latest one per plan is always the current composition.
- **What stays:** `GET /api/v1/meal-plans/{mealPlanId}` is still exposed, with the same scope (`catalog.mealPlan:read`), for the frontend and ops. No service calls it.
- **Service account:** `ms4-service` is no longer used by MS4 against MS2 (the account still exists in identity).
- **Failure modes changed side:** an MS2 outage no longer affects `resolve-daily-catalog`; what can go wrong now is a plan MS4 has no menu for (created before the deploy, no backfill, ms2-gap-13): its days stay `Scheduled` and the job is re-run once the plan is republished.

### Frontend / admin

El frontend consume todos los endpoints de foods, recipes y meal-plans vía gateway con el token del usuario (scopes `catalog.*:read/create/edit`). No hay llamadas salientes de MS2.

### Consul y observabilidad

- MS2 se **auto-registra** en Consul al arrancar (en la plataforma como **`catalog`**, por `ServiceRegistration__ServiceName` en `catalog.compose.yml`; el default del código es `catalog-service`, ver ms2-gap-09) con un check HTTP anónimo a `/health`.
- No hay llamada de MS2 a Consul más allá del registro; el gateway descubre las instancias.

## Autenticación (entrante)

Only users (frontend/admin) reach MS2 over REST: the gateway forwards the `Authorization: Bearer` header and MS2 validates the JWT and the scope of each endpoint. There is no service-account flow towards MS2 any more (the `ms4-service` login against identity that MS4 did before reading a plan went away with MS4#12).

## Manejo de fallas (lado MS2)

Como MS2 no llama a nadie, su única responsabilidad ante fallas es **responder bien**:
- Validación de negocio → `400` con `ApiResponse.Fail`.
- Entidad no encontrada → `404`.
- Token inválido o sin scope → `401`/`403` (lo resuelve el kernel de seguridad).
- Excepción dentro de un handler → **no** llega como `500`: cada handler la captura y devuelve `Result.Fail(ex.Message)`, que el controller traduce a `400` (comandos y listados) o `404` (lecturas por id y `PUT /foods`). Solo una excepción fuera del handler da `500` plano (no hay middleware global). Ver ms2-gap-11.
- BD caída → por lo anterior, `GET /meal-plans/{id}` responde **`404`** y el cliente no puede distinguirlo de "plan inexistente" (MS4 had the same blind spot before MS4#12; it no longer calls this endpoint). RabbitMQ caído no afecta a la API (publica el worker); el outbox no se drena hasta que el worker recupere la conexión, y el registrar de `catalog.default` reintenta cada 10 s.

## Notas

- **`catalog.default`** es una cola pasiva (durable, nunca consumida) que acumula el historial completo de todo lo publicado. No es una integración; es un sink de auditoría.
- El gateway **no valida tokens**: MS2 valida el JWT y exige un scope por endpoint (`Nur.Tricenter.Security.AddSecurity` + `CatalogPermission`).