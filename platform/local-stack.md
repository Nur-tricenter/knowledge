# Stack local — `nur-tricenter-local`

Runbook para levantar **toda** la plataforma en una máquina con Docker Compose y comprobar que funciona. Fuente: scripts y compose de `Nur-tricenter/nur-tricenter-local` (`main` posterior a nur-tricenter-local#7, revisado el 2026-10-29).

> ✅ **El stack se recorrió de punta a punta el 2026-10-28, con las ramas de los PR; esos PR ya están en `main`** (la corrida se repitió desde `main` el 2026-10-31, con MS1 incluido: ver abajo). Ya están en `main` [nur-tricenter-local#7](https://github.com/Nur-tricenter/nur-tricenter-local/pull/7) (arregla X-12: vuelve identity, MS1 queda fuera del compose), [MS5#3](https://github.com/Nur-tricenter/ms5-logistics-and-delivery/pull/3) (consumidor de `package-validated`), [MS3#3](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/3), [MS3#4](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/4) y los PR de `DeliveryDayId` (kernel#5, MS3#6, MS5#5, MS4#6 y #8). Ver la sección [Prueba de punta a punta](#prueba-de-punta-a-punta).
>
> **2026-10-31:** MS1 ya está incluido ([MS1#1](https://github.com/Nur-tricenter/ms1-gestion-clinica-nutricional/pull/1) y [nur-tricenter-local#8](https://github.com/Nur-tricenter/nur-tricenter-local/pull/8)). Desde `main`: `start-stack.ps1` deja 16 contenedores sanos más 3 jobs de migración que terminan en 0, `clinica-nutricional` aparece en Consul y `e2e-smoke.py` sale verde con entrega exitosa y fallida (ver su [ficha](../services/ms1-clinic/README.md)). Justo después de reiniciar el stack el smoke puede fallar una vez en "MS2 read model shows the day-1 recipes" (I-10); basta repetirlo. Tras actualizar MS5, aplica sus migraciones (`AddInboxMessages`, `AddPatientNameToDelivery`, `AddDeliveryDayIdToDelivery`): MS5 no migra al arrancar.

## 1. Requisitos
| Requisito | Para qué |
|---|---|
| Docker Desktop (Compose ≥ 2.29) | Infra y procesos de cada servicio |
| .NET SDK **8** y **10** | net8.0: MS2, identity, MS3. net10.0: gateway, MS4, MS5, MS1. Los scripts compilan en el host y los contenedores montan la salida |
| `NUGET_USERNAME` / `NUGET_TOKEN` (variables de **usuario**) | Feed de GitHub Packages de la org (`Nur.Tricenter.*`), PAT con `read:packages`. Lo usan MS2, MS4, MS5 e identity en su `NuGet.config` |
| `.env` de MS5 | `ConnectionStrings__DefaultConnection` de su BD. Por defecto **Neon** (copiar `.env.example`); sin credenciales de Neon, `setup-project` crea el `.env` desde `.env.local-postgres.example`, que apunta al Postgres compartido (`ms5_logistics`, la crea `start-stack`). El esquema lo aplica el job `nur-tricenter-nurtricenter-migrate` (`--migrate`, MS5#6): ya no se corre `dotnet ef` a mano. Sin `.env`, MS5 arranca pero falla en la primera consulta |
| Puertos libres 5433, 5672, 8500, 15005, 15672 (y 18080/18083 en modo dev) | Ver la sección 4 |

## 2. Carpetas
Todos los repos van **como hermanos** de `nur-tricenter-local`. `scripts/setup-project.ps1` / `.sh` clona lo que falte (idempotente) y avisa si faltan las variables de NuGet.

| Carpeta (nombre exacto) | Repo |
|---|---|
| `ms1-gestion-clinica-nutricional` | `Nur-tricenter/ms1-gestion-clinica-nutricional` |
| `ms2-plans-and-recipes-catalog` | `Nur-tricenter/ms2-plans-and-recipes-catalog` |
| `ms3-contract-and-production` | `Nur-tricenter/ms3-contract-and-production` |
| `ms4-delivery-schedule-management` | `Nur-tricenter/ms4-delivery-schedule-management` |
| `ms5-logistics-and-delivery` | `Nur-tricenter/ms5-logistics-and-delivery` (otro nombre → `NURTRICENTER_REPO_DIR`) |
| `nur-tricenter-identity` | `Nur-tricenter/nur-tricenter-identity` |
| `nur-tricenter-api-gateway` | `Nur-tricenter/nur-tricenter-api-gateway` |
| `nur-tricenter-shared-kernels` | `Nur-tricenter/nur-tricenter-shared-kernels` |

## 3. Cómo está armado
`compose/docker-compose.yml` (proyecto `nur-tricenter`) declara el **gateway** inline e **incluye** (`include:`, nunca copias) la infra y el fragmento de plataforma de cada servicio:

| Include | Servicio | Procesos |
|---|---|---|
| `docker-compose.infra.yml` | Plataforma | Postgres, RabbitMQ, Consul |
| `../../ms2-plans-and-recipes-catalog/catalog.compose.yml` | MS2 | `catalog-api`, `catalog-workerservice` |
| `../../nur-tricenter-identity/identity.compose.yml` (vuelve en #7, X-12) | Identity | `identity-migrate` (one-shot), `identity-api`, `identity-workerservice` |
| `../../ms1-gestion-clinica-nutricional/ms1.compose.yml` | MS1 | `clinica-nutricional-migrate` (one-shot), `clinica-nutricional-api`, `clinica-nutricional-workerservice` |
| `../../ms4-delivery-schedule-management/ms4.compose.yml` | MS4 | `delivery-calendar-migrate` (one-shot), `delivery-calendar-api`, `delivery-calendar-workerservice` |
| `../../${NURTRICENTER_REPO_DIR:-ms5-logistics-and-delivery}/nurtricenter.compose.yml` | MS5 | `nurtricenter-api`, `nurtricenter-workerservice` |
| `../../ms3-contract-and-production/contracting.compose.yml` | MS3 | `contracting-api`, `contracting-workerservice` |

- Red externa compartida `nur-tricenter-net` (los scripts la crean si no existe).
- Los contenedores usan la imagen `mcr.microsoft.com/dotnet/aspnet` y **montan la salida de `dotnet build`** del host: hay que compilar antes de levantar. MS4 compila a su carpeta `artifacts/`.
- Los `docker-compose.yml` propios de cada repo son standalone y **no** se incluyen.
- `compose/dev/docker-compose.dev.yml` (solo con `start-stack-dev.*`) activa Swagger y publica `catalog-api` en `18080` y `contracting-api` en `18083`.

## 4. Contenedores, puertos, Consul y bases de datos
| Contenedor | Puerto host | Consul → prefijo en el gateway | Base de datos |
|---|---|---|---|
| `nur-tricenter-gateway` | **15005** | no se registra | — |
| `nur-tricenter-consul` (`-dev -ui`) | **8500** (UI) | — | — |
| `nur-tricenter-rabbitmq` | **5672** (AMQP), **15672** (UI) | — | — |
| `nur-tricenter-postgres` (16-alpine) | **5433** | — | compartido |
| `nur-tricenter-catalog-api` / `-workerservice` | — (18080 en dev) | `catalog` → `/api/catalog` | `ms2-plans-and-recipes-catalog` |
| `nur-tricenter-identity-api` / `-workerservice` / `-migrate` | — | `identity-service` → `/api/identity-service` | `nur_tricenter_identity` |
| `nur-tricenter-contracting-api` / `-workerservice` | — (18083 en dev) | `contracting` → `/api/contracting` | `nur_tricenter_contracting` |
| `nur-tricenter-delivery-calendar-api` / `-workerservice` / `-migrate` | — | `delivery-calendar` → `/api/delivery-calendar` | `ms4_delivery_calendar` |
| `nur-tricenter-nurtricenter-api` / `-workerservice` | — | `nurtricenter` → `/api/nurtricenter` | la del `.env` de MS5 (Neon o `ms5_logistics` local); `nur-tricenter-nurtricenter-migrate` aplica el esquema |
| `nur-tricenter-clinica-nutricional-api` / `-workerservice` / `-migrate` | — | `clinica-nutricional` → `/api/clinica-nutricional` | `ms1_clinica_nutricional` |

- Las credenciales de desarrollo (Postgres, RabbitMQ `guest`, admin de identity) están en los compose y scripts del repo; no se repiten aquí.
- Las bases se crean con `POSTGRES_DB` + `topology/postgres-init/01-create-databases.sql`, **solo en un volumen nuevo**. No hay base para MS1.
- El gateway arma las rutas desde Consul cada **30 s** y solo con instancias *passing*: un servicio recién levantado puede responder **404** durante ese lapso.
- JWT (valores de desarrollo, iguales en todos los fragmentos): emisor `nur-tricenter-identity`, audiencia `nur-tricenter-clients`, vida 3600 s, clave `Jwt__SecretKey` compartida.

## 5. Arranque
```powershell
cd nur-tricenter-local
./scripts/setup-project.ps1      # clona hermanos faltantes y revisa NUGET_*
./scripts/start-stack.ps1        # o ./scripts/start-stack.sh
```
`start-stack` hace, en orden:
1. `docker rm -f` de los contenedores esperados (los volúmenes se conservan) y crea la red si falta.
2. `dotnet build -c Debug` de MS2 (App + Worker), identity (App + Worker), MS5 (Api + Worker), gateway, MS4 (Api + Worker; el `.ps1` corta si falla) y MS3 (Api + Worker).
3. `docker compose -f compose/docker-compose.yml -f compose/docker-compose.infra.yml -p nur-tricenter up -d`.
4. Migra el catálogo desde el host (`Catalog.App.dll --migrate` contra `localhost:5433`). Identity y MS4 migran con su contenedor one-shot `*-migrate`; MS3 migra al arrancar.
5. Hace login como el **admin** sembrado por el worker de identity (`DefaultUser__*`, con `platform:*`) por el gateway: `POST /api/identity-service/v1/auth/login`, hasta 24 reintentos de 5 s.
6. Crea las service accounts con `POST /api/identity-service/v1/users` (409 = ya existía):

| Cuenta | Scopes | La usa |
|---|---|---|
| `ms4-service` | `catalog.mealPlan:read` | nobody (kept for the demo console's security view) |
| `ms3-service` | `deliveryCalendar.calendar:create`, `deliveryCalendar.productionOrder:read` | nobody (kept for the demo console's security view) |

The services no longer log in with these accounts: MS3 and MS4 make no outbound HTTP (the former MS3 → MS4, MS3 → MS1 and MS4 → MS2 calls are events now). `start-stack` still creates them and their compose files no longer carry the `Identity__*`, `Clinic__*`, `DeliveryCalendar__*` or `Catalog__BaseUrl` settings.

Variantes: `start-stack-dev.*` (overlay dev; el `.ps1` compila solo catálogo, gateway y MS3 y no crea service accounts) y `start-infrastructure.*` (solo Postgres, RabbitMQ y Consul).

## 6. Verificación
1. `docker ps --filter name=nur-tricenter` → todo `healthy`; los `*-migrate` terminan en `Exited (0)`.
2. Consul UI http://localhost:8500 → `catalog`, `identity-service`, `contracting`, `delivery-calendar`, `nurtricenter` en verde.
3. RabbitMQ UI http://localhost:15672 → 22 exchanges and 38 queues (the new ones: `contract-activated`, `production-order-ready`, `meal-plan-composition-changed`, `paciente-published`).
4. Gateway (cada llamada debe responder el **servicio**, no un 404 vacío del gateway):
```bash
curl http://localhost:15005/health
TOKEN=$(curl -s -X POST http://localhost:15005/api/identity-service/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"userName":"<admin>","password":"<clave>"}' | jq -r .accessToken)
curl -H "Authorization: Bearer $TOKEN" http://localhost:15005/api/identity-service/v1/auth/me            # identity
curl -H "Authorization: Bearer $TOKEN" http://localhost:15005/api/catalog/v1/meal-plans                  # MS2
curl http://localhost:15005/api/contracting/v1/sim/patients/00000000-0000-0000-0000-000000000001          # MS3 (anónimo)
curl -H "Authorization: Bearer $TOKEN" http://localhost:15005/api/delivery-calendar/v1/calendars/active-tomorrow  # MS4 (read endpoint for the frontend/ops; no service calls it)
curl -i http://localhost:15005/api/nurtricenter/v1/couriers/00000000-0000-0000-0000-000000000000/route/today     # MS5 (anónimo)
```
Los flujos de punta a punta (contrato → calendario → menú → orden de producción → paquete → ruta → entrega) están en [communication.md](./communication.md) y en el `flows.md` de cada ficha.

## 7. Iterar, parar y reiniciar
- Cambiar un servicio: `dotnet build` de su proyecto y `docker compose -p nur-tricenter restart <servicio>`.
- Parar todo: `docker compose -f compose/docker-compose.yml -f compose/docker-compose.infra.yml -p nur-tricenter down`. No hay script para el stack completo: `stop-infrastructure.*` solo baja la infra.
- Empezar de cero (borra los datos y recrea las bases): el mismo `down` con `-v`, o `stop-infrastructure.* -v` (elimina el volumen `nur-tricenter-postgres-data`).

## 8. Topología de RabbitMQ
`topology/rabbitmq-definitions.json` se importa al arrancar el broker: **22 exchanges, 38 queues and 38 bindings**: `ms4.delivery-*` (nur-tricenter-local#6) and, for the removal of the inter-service REST calls, the exchanges `contract-activated`, `production-order-ready`, `meal-plan-composition-changed` and `paciente-published` with the queues `ms4.contract-activated`, `ms3.production-order-ready`, `ms4.meal-plan-composition-changed` and `ms3.paciente-published`. Además, algunos workers declaran en runtime un sink propio fuera de la topología (`identity.default`, `catalog.default`, `nurtricenter.default`, `gestion-clinica-nutricional.default`). Copia legible: [../contracts/events.yaml](../contracts/events.yaml).

## Prueba de punta a punta
`nur-tricenter-local/scripts/e2e-smoke.py` (en #7; Python 3 sin dependencias) recorre un paciente por todos los servicios **a través del gateway** y termina con código ≠ 0 en el primer salto roto:

```bash
python scripts/e2e-smoke.py                    # registra un paciente nuevo en MS1, entrega exitosa
python scripts/e2e-smoke.py --fail             # igual, pero la entrega falla
python scripts/e2e-smoke.py <id-paciente-ms1>  # reutiliza un paciente que ya existe en MS1
```

| Paso | Servicio | Cómo se comunica |
|---|---|---|
| Patient registered | MS1 | REST → `paciente-published` to MS3 (MS3 projects it into `ClinicPatients`) |
| Recipes and 15-day plan with the day 1 menu | MS2 | REST (admin) → `meal-plan-published` to MS3 and MS4, and `meal-plan-composition-changed` to MS4 (one per assignment; MS4 projects the menus into `PlanDayMenus`) |
| Contract and payment | MS3 | anonymous REST; the outbox relay publishes `contract-activated`, MS4 creates the calendar. The script retries the contract POST until MS3 has projected the patient |
| Day 1 address and `resolve-daily-catalog` | MS4 | REST; the menu comes from the `PlanDayMenus` projection (no call to MS2); the script retries until the composition is projected. Publishes `production-order-ready` through the MS4 outbox |
| `active-tomorrow` with `menu` | MS4 | REST (read endpoint; no service calls it) |
| Courier and today's route | MS5 | anonymous REST (the route has to exist before the package) |
| `daily-order`, package, `assemble`, `label`, `validate` | MS3 | REST; the next-day deliveries come from the `ScheduledDeliveries` projection of `production-order-ready` (the script retries until MS3 has it); outbox → `package-validated` |
| Entrega agregada a la ruta | MS5 | consume `ms5.package-validated` → publica `delivery-added-to-route` |
| Enlace entrega → día | MS4 | consume `ms4.delivery-added-to-route`; usa `DeliveryDayId` (kernel 1.4.0) y, si falta, el `PackageId` numérico o el paciente |
| `start` y `deliver` / `fail` | MS5 | REST → `delivery-completed` / `delivery-failed` |
| Día `Delivered` / `Failed` | MS4 | consume `ms4.delivery-*` |

Resultado del 2026-10-28: **verde** con entrega exitosa (2 pacientes) y fallida (1 paciente), sin errores en ningún worker. Algunas búsquedas del script leen las BD con `docker exec … psql`, porque ningún servicio las expone (X-17).

**Para la demo:**
- Usar pacientes reales de MS1: el smoke registra uno solo (con `POST /api/clinica-nutricional/v1/Patient/CreatePaciente`; el campo `telefono` es opcional y viaja hasta la ruta del repartidor). The 3 simulated patients of MS3 only exist standalone; on the platform MS3 is started with `Projections__Enabled=true` and only knows the patients MS1 published, so a contract for any other id answers 404 `PATIENT_NOT_FOUND`.
- Create a new plan in MS2 (and a new patient in MS1): there is no backfill, so plans and patients created before the projections existed are unknown to MS3 and MS4 (X-15). The smoke and the demo create fresh ones.
- Assign the recipes a few seconds before `resolve-daily-catalog`: MS4 needs the `meal-plan-composition-changed` snapshot to be projected, or the day is skipped (stays `Scheduled`) until the job is re-run.
- Para empezar de cero los datos de negocio: `DROP DATABASE … WITH (FORCE)` de `nur_tricenter_contracting`, `ms4_delivery_calendar` y `ms5_logistics`, y volver a correr `start-stack` (las recrea y el job de MS5 migra).

## Convenciones para que un servicio entre al stack
1. Publicar un fragmento `<servicio>.compose.yml` en su repo, con contenedores `nur-tricenter-<rol>`.
2. Declarar la red `nur-tricenter-net` como `external: true`, **sin** `name:`. Compose 2.29 rechaza declaraciones distintas de la misma red entre archivos incluidos.
3. Registrarse en Consul con un `/health` anónimo: el nombre en Consul define el prefijo del gateway.
4. Pedir su BD en `topology/postgres-init/01-create-databases.sql` y sus colas en `rabbitmq-definitions.json` (PR a `nur-tricenter-local`).
5. Si aplica, un job one-shot de migración antes de la API (como `delivery-calendar-migrate`).
6. Agregar su `dotnet build` a `start-stack.*` y su contenedor a la lista de limpieza del script.

## Problemas conocidos
- X-12 (identity fuera del compose, include y builds de MS1 rotos): resuelto en nur-tricenter-local#7, mergeado el 2026-10-28.
- Un volumen de Postgres anterior a un servicio no tiene su BD (los scripts de `postgres-init/` corren solo con un volumen nuevo). Desde #7, `start-stack` las crea siempre.
- `Joseco.Communication.External.RabbitMQ` 1.1.0 ignora `RabbitMqSettings:Port`: el broker tiene que estar en 5672.
- El README de `nur-tricenter-local` está desactualizado: lo llama `nur-tricenter-orchestrator`, su tabla no cubre todos los servicios ni los `*-migrate`, y los comentarios hablan de "20 colas".
- Jaeger no forma parte del stack local; los servicios con `Nur.Tricenter.Observability` lo tienen como exportador, pero hay que levantarlo aparte.
