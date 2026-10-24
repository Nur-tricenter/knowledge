# Stack local — `nur-tricenter-local`

Levanta toda la plataforma en una máquina con Docker Compose.

## Cómo está armado
- `compose/docker-compose.yml` define el gateway e **incluye** (`include:`, nunca copias) la infraestructura y el fragmento de compose de cada servicio:
  - `docker-compose.infra.yml` (Postgres, RabbitMQ, Consul)
  - `catalog.compose.yml` (MS2)
  - `identity.compose.yml`
  - `ms4.compose.yml` (vive en el repo de MS4; espera la carpeta `ms4-delivery-schedule-management` al lado)
  - `${NURTRICENTER_REPO_DIR:-nurtricenter-logistics-and-delivery}/nurtricenter.compose.yml` (MS5)
- Red externa compartida: `nur-tricenter-net`.
- Scripts: `scripts/setup-project` (clona y prepara) y `scripts/start-stack.ps1` / `.sh`.

## Infraestructura y puertos (host)
| Componente | Contenedor | Puerto host |
|---|---|---|
| API Gateway | `nur-tricenter-gateway` (servicio `gateway`) | 15005 |
| Consul | `nur-tricenter-consul` | 8500 |
| RabbitMQ | `nur-tricenter-rabbitmq` | 5672 (AMQP), 15672 (UI) |
| PostgreSQL | `nur-tricenter-postgres` | 5433 |

Jaeger no forma parte del stack local hoy. Los servicios con `Nur.Tricenter.Observability` lo tienen configurado como exportador, pero hay que levantarlo aparte.

Cada fragmento incluido se escribe para quedar como **variante de plataforma** del servicio. Los `docker-compose.yml` propios de cada repo son standalone y **no** se incluyen.

## Topología de RabbitMQ
`topology/rabbitmq-definitions.json` se importa al arrancar el broker: 17 exchanges, 30 colas y sus bindings. Copia legible: [../contracts/events.yaml](../contracts/events.yaml).

## Convenciones para que un servicio entre al stack
1. Publicar un fragmento `<servicio>.compose.yml` en su repo.
2. Declarar la red `nur-tricenter-net` como `external: true`, **sin** `name:`. Compose 2.29 rechaza declaraciones distintas de la misma red entre archivos incluidos.
3. Registrar la API en Consul con un `/health` anónimo.
4. Pedir su BD en el Postgres compartido y sus colas en `rabbitmq-definitions.json` (PR a `nur-tricenter-local`).
5. Si aplica: un job one-shot de migración antes de la API (como `delivery-calendar-migrate` en MS4).

## Problemas conocidos
- `Joseco.Communication.External.RabbitMQ` 1.1.0 ignora `RabbitMqSettings:Port`: el broker tiene que estar en 5672.
- La carpeta por defecto de MS5 (`nurtricenter-logistics-and-delivery`) no coincide con el nombre del repo en la org (`ms5-logistics-and-delivery`): hay que setear `NURTRICENTER_REPO_DIR`.
