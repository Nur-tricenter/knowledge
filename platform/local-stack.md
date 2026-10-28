# Stack local — `nur-tricenter-local`

Runbook para levantar **toda** la plataforma en una máquina con Docker Compose y comprobar que funciona. Fuente: scripts y compose de `Nur-tricenter/nur-tricenter-local` (`main` 4a1d700, revisado el 2026-10-28).

> ⚠ **Hoy el stack no levanta tal como está en `main`** (gap transversal [X-12](../gaps/cross-service-gaps.md)):
> 1. `compose/docker-compose.yml` ya no incluye `../../nur-tricenter-identity/identity.compose.yml` (lo reemplazó el include de MS1 en el commit `acce166`). Sin identity, el login y la creación de service accounts fallan, y MS3/MS4 no obtienen token.
> 2. Incluye `../../ms1-clinica-nutricional/ms1.compose.yml`, que **no existe** en el repo de MS1, y los scripts compilan `src/ClinicaNutricional.Api` y `src/ClinicaNutricional.WorkerService`, que tampoco existen (los proyectos reales están en la raíz: `GestionClinicaNutricionalService.WebApi/`, `GestionClinicaNutricional.WorkerService/`). `docker compose up` falla por el include faltante.
>
> Mientras no se corrija en `nur-tricenter-local`, ver [Arreglo temporal](#arreglo-temporal-mientras-x-12-siga-abierto).

## 1. Requisitos
| Requisito | Para qué |
|---|---|
| Docker Desktop (Compose ≥ 2.29) | Infra y procesos de cada servicio |
| .NET SDK **8** y **10** | net8.0: MS2, identity, MS3. net10.0: gateway, MS4, MS5, MS1. Los scripts compilan en el host y los contenedores montan la salida |
| `NUGET_USERNAME` / `NUGET_TOKEN` (variables de **usuario**) | Feed de GitHub Packages de la org (`Nur.Tricenter.*`), PAT con `read:packages`. Lo usan MS2, MS4, MS5 e identity en su `NuGet.config` |
| `.env` de MS5 (copiar `ms5-logistics-and-delivery/.env.example`) | `ConnectionStrings__DefaultConnection` de su BD en **Neon** (MS5 no usa el Postgres compartido). Sin él, MS5 arranca pero falla en la primera consulta |
| Puertos libres 5433, 5672, 8500, 15005, 15672 (y 18080/18083 en modo dev) | Ver la sección 4 |

## 2. Carpetas
Todos los repos van **como hermanos** de `nur-tricenter-local`. `scripts/setup-project.ps1` / `.sh` clona lo que falte (idempotente) y avisa si faltan las variables de NuGet.

| Carpeta (nombre exacto) | Repo |
|---|---|
| `ms1-clinica-nutricional` | `Juandcode/ClinicaNutricionalMicroservicio1` (fuera de la org) |
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
| `../../nur-tricenter-identity/identity.compose.yml` — **falta** (X-12) | Identity | `identity-migrate` (one-shot), `identity-api`, `identity-workerservice` |
| `../../ms1-clinica-nutricional/ms1.compose.yml` — **no existe** (X-12) | MS1 | — |
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
| `nur-tricenter-nurtricenter-api` / `-workerservice` | — | `nurtricenter` → `/api/nurtricenter` | Neon (fuera del stack) |
| MS1 | — | no se registra | SQL Server propio (no integrable hoy) |

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
2. `dotnet build -c Debug` de MS1 (rutas inválidas, X-12), MS2 (App + Worker), identity (App + Worker), MS5 (Api + Worker), gateway, MS4 (Api + Worker; el `.ps1` corta si falla) y MS3 (Api + Worker).
3. `docker compose -f compose/docker-compose.yml -f compose/docker-compose.infra.yml -p nur-tricenter up -d`.
4. Migra el catálogo desde el host (`Catalog.App.dll --migrate` contra `localhost:5433`). Identity y MS4 migran con su contenedor one-shot `*-migrate`; MS3 migra al arrancar.
5. Hace login como el **admin** sembrado por el worker de identity (`DefaultUser__*`, con `platform:*`) por el gateway: `POST /api/identity-service/v1/auth/login`, hasta 24 reintentos de 5 s.
6. Crea las service accounts con `POST /api/identity-service/v1/users` (409 = ya existía):

| Cuenta | Scopes | La usa |
|---|---|---|
| `ms4-service` | `catalog.mealPlan:read` | MS4 → MS2 |
| `ms3-service` | `deliveryCalendar.calendar:create`, `deliveryCalendar.productionOrder:read` | MS3 → MS4 |

Variantes: `start-stack-dev.*` (overlay dev; el `.ps1` compila solo catálogo, gateway y MS3 y no crea service accounts) y `start-infrastructure.*` (solo Postgres, RabbitMQ y Consul).

## 6. Verificación
1. `docker ps --filter name=nur-tricenter` → todo `healthy`; los `*-migrate` terminan en `Exited (0)`.
2. Consul UI http://localhost:8500 → `catalog`, `identity-service`, `contracting`, `delivery-calendar`, `nurtricenter` en verde.
3. RabbitMQ UI http://localhost:15672 → 18 exchanges y 34 colas.
4. Gateway (cada llamada debe responder el **servicio**, no un 404 vacío del gateway):
```bash
curl http://localhost:15005/health
TOKEN=$(curl -s -X POST http://localhost:15005/api/identity-service/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"userName":"<admin>","password":"<clave>"}' | jq -r .accessToken)
curl -H "Authorization: Bearer $TOKEN" http://localhost:15005/api/identity-service/v1/auth/me            # identity
curl -H "Authorization: Bearer $TOKEN" http://localhost:15005/api/catalog/v1/meal-plans                  # MS2
curl http://localhost:15005/api/contracting/v1/sim/patients/00000000-0000-0000-0000-000000000001          # MS3 (anónimo)
curl -H "Authorization: Bearer $TOKEN" http://localhost:15005/api/delivery-calendar/v1/calendars/active-tomorrow  # MS4
curl -i http://localhost:15005/api/nurtricenter/v1/couriers/00000000-0000-0000-0000-000000000000/route/today     # MS5 (anónimo)
```
Los flujos de punta a punta (contrato → calendario → menú → orden de producción → paquete → ruta → entrega) están en [communication.md](./communication.md) y en el `flows.md` de cada ficha.

## 7. Iterar, parar y reiniciar
- Cambiar un servicio: `dotnet build` de su proyecto y `docker compose -p nur-tricenter restart <servicio>`.
- Parar todo: `docker compose -f compose/docker-compose.yml -f compose/docker-compose.infra.yml -p nur-tricenter down`. No hay script para el stack completo: `stop-infrastructure.*` solo baja la infra.
- Empezar de cero (borra los datos y recrea las bases): el mismo `down` con `-v`, o `stop-infrastructure.* -v` (elimina el volumen `nur-tricenter-postgres-data`).

## 8. Topología de RabbitMQ
`topology/rabbitmq-definitions.json` se importa al arrancar el broker: **18 exchanges, 34 colas y 34 bindings** (incluidas `ms4.delivery-*` desde nur-tricenter-local#6). Además, algunos workers declaran en runtime un sink propio fuera de la topología (`identity.default`, `catalog.default`, `nurtricenter.default`, `gestion-clinica-nutricional.default`). Copia legible: [../contracts/events.yaml](../contracts/events.yaml).

## Arreglo temporal mientras X-12 siga abierto
En tu copia local de `nur-tricenter-local`, sin commitear:
1. `compose/docker-compose.yml`: agregar `- path: ../../nur-tricenter-identity/identity.compose.yml` y comentar la línea de `ms1.compose.yml`.
2. `scripts/start-stack.ps1` / `.sh`: comentar los dos `dotnet build` de MS1.
3. Correr `start-stack` normalmente. MS1 queda fuera del stack (ver su [ficha](../services/ms1-clinic/README.md)).

## Convenciones para que un servicio entre al stack
1. Publicar un fragmento `<servicio>.compose.yml` en su repo, con contenedores `nur-tricenter-<rol>`.
2. Declarar la red `nur-tricenter-net` como `external: true`, **sin** `name:`. Compose 2.29 rechaza declaraciones distintas de la misma red entre archivos incluidos.
3. Registrarse en Consul con un `/health` anónimo: el nombre en Consul define el prefijo del gateway.
4. Pedir su BD en `topology/postgres-init/01-create-databases.sql` y sus colas en `rabbitmq-definitions.json` (PR a `nur-tricenter-local`).
5. Si aplica, un job one-shot de migración antes de la API (como `delivery-calendar-migrate`).
6. Agregar su `dotnet build` a `start-stack.*` y su contenedor a la lista de limpieza del script.

## Problemas conocidos
- X-12: identity fuera del compose e include/builds de MS1 rotos (arriba).
- `Joseco.Communication.External.RabbitMQ` 1.1.0 ignora `RabbitMqSettings:Port`: el broker tiene que estar en 5672.
- `start-stack.ps1` no revisa el código de salida de la mayoría de los `dotnet build` (solo MS4): un build fallido aparece recién como un contenedor que no arranca.
- El README de `nur-tricenter-local` está desactualizado: lo llama `nur-tricenter-orchestrator`, su tabla omite MS3, MS4, MS1 y los `*-migrate`, y los comentarios hablan de "20 colas".
- Jaeger no forma parte del stack local; los servicios con `Nur.Tricenter.Observability` lo tienen como exportador, pero hay que levantarlo aparte.
