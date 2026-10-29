# Stack local — `nur-tricenter-local`

Runbook para levantar **toda** la plataforma en una máquina con Docker Compose y comprobar que funciona. Fuente: scripts y compose de `Nur-tricenter/nur-tricenter-local` (`main` 4a1d700, revisado el 2026-10-28).

> ✅ **2026-10-29: el stack levanta desde `main` de cada repo y se recorre de punta a punta.** Ya están mergeados [nur-tricenter-local#7](https://github.com/Nur-tricenter/nur-tricenter-local/pull/7) (arregla X-12: vuelve identity, MS1 queda fuera del compose), [MS5#3](https://github.com/Nur-tricenter/ms5-logistics-and-delivery/pull/3) (consumidor de `package-validated`), [MS3#3](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/3), [MS3#4](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/4) y los PR de `DeliveryDayId` (kernel#5, MS3#6, MS5#5, MS4#6 y #8). Ver la sección [Prueba de punta a punta](#prueba-de-punta-a-punta).
>
> Si MS1 sigue sin fragmento de plataforma, queda comentado en `compose/docker-compose.yml` (ver su [ficha](../services/ms1-clinic/README.md) y X-13). Tras actualizar MS5, aplica sus migraciones (`AddInboxMessages`, `PatientName`, `DeliveryDayId`): MS5 no migra al arrancar.

## 1. Requisitos
| Requisito | Para qué |
|---|---|
| Docker Desktop (Compose ≥ 2.29) | Infra y procesos de cada servicio |
| .NET SDK **8** y **10** | net8.0: MS2, identity, MS3. net10.0: gateway, MS4, MS5, MS1. Los scripts compilan en el host y los contenedores montan la salida |
| `NUGET_USERNAME` / `NUGET_TOKEN` (variables de **usuario**) | Feed de GitHub Packages de la org (`Nur.Tricenter.*`), PAT con `read:packages`. Lo usan MS2, MS4, MS5 e identity en su `NuGet.config` |
| `.env` de MS5 (copiar `ms5-logistics-and-delivery/.env.example`) | `ConnectionStrings__DefaultConnection` de su BD en **Neon** (MS5 no usa el Postgres compartido). Sin él, MS5 arranca pero falla en la primera consulta. **Sin credenciales de Neon:** apuntarlo a `Host=nur-tricenter-postgres;Port=5432;Database=ms5_logistics;Username=dev-only;Password=dev-only-password` y migrar una vez con `dotnet ef database update` contra `localhost:5433` (README de nur-tricenter-local, "Offline option"; la BD la crea `start-stack` desde #7) |
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

## Prueba de punta a punta
`nur-tricenter-local/scripts/e2e-smoke.py` (en #7; Python 3 sin dependencias) recorre un paciente por todos los servicios **a través del gateway** y termina con código ≠ 0 en el primer salto roto:

```bash
python scripts/e2e-smoke.py                                              # paciente 2, entrega exitosa
python scripts/e2e-smoke.py 00000000-0000-0000-0000-000000000003 --fail  # entrega fallida
```

| Paso | Servicio | Cómo se comunica |
|---|---|---|
| Recetas y plan de 15 días con menú del día 1 | MS2 | REST (admin) → `meal-plan-published` a MS3 y MS4 |
| Contrato y pago | MS3 | REST anónimo; el worker llama `POST /schedule` de MS4 como `ms3-service` |
| Dirección del día 1 y `resolve-daily-catalog` | MS4 | REST; MS4 → MS2 `GET /meal-plans/{id}` como `ms4-service` |
| `active-tomorrow` con `menu` | MS4 | REST |
| Repartidor y ruta de hoy | MS5 | REST anónimo (la ruta tiene que existir antes que el paquete) |
| `daily-order`, paquete, `assemble`, `label`, `validate` | MS3 | REST; MS3 → MS4 `active-tomorrow`; outbox → `package-validated` |
| Entrega agregada a la ruta | MS5 | consume `ms5.package-validated` → publica `delivery-added-to-route` |
| Enlace entrega → día | MS4 | consume `ms4.delivery-added-to-route`; usa `DeliveryDayId` (kernel 1.4.0) y, si falta, el `PackageId` numérico o el paciente |
| `start` y `deliver` / `fail` | MS5 | REST → `delivery-completed` / `delivery-failed` |
| Día `Delivered` / `Failed` | MS4 | consume `ms4.delivery-*` |

Resultado del 2026-10-28: **verde** con entrega exitosa (2 pacientes) y fallida (1 paciente), sin errores en ningún worker. Algunas búsquedas del script leen las BD con `docker exec … psql`, porque ningún servicio las expone (X-17).

**Para la demo:**
- Usar los pacientes simulados de MS3 (`00000000-0000-0000-0000-00000000000{1,2,3}`).
- Crear un plan nuevo en MS2: los sembrados antes de que existieran las colas de MS3 no los conoce MS3 (X-15).
- Asignar las recetas unos segundos antes de `resolve-daily-catalog`: el read model de MS2 es eventual.
- Para empezar de cero los datos de negocio: `DROP DATABASE … WITH (FORCE)` de `nur_tricenter_contracting`, `ms4_delivery_calendar` y `ms5_logistics`, volver a correr `start-stack` (las recrea) y migrar MS5.

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
- El README de `nur-tricenter-local` está desactualizado: lo llama `nur-tricenter-orchestrator`, su tabla omite MS3, MS4, MS1 y los `*-migrate`, y los comentarios hablan de "20 colas".
- Jaeger no forma parte del stack local; los servicios con `Nur.Tricenter.Observability` lo tienen como exportador, pero hay que levantarlo aparte.
