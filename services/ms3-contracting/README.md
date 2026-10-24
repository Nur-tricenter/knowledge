# MS3 — Contratación y producción

> **Owner:** Luis Jesus Ferrufino (@JesusFerru) · **Repo:** [Nur-tricenter/ms3-contract-and-production](https://github.com/Nur-tricenter/ms3-contract-and-production) · **Estado de la ficha:** complete

## Propósito
MS3 es donde un paciente **compra** un plan nutricional y donde la cocina **produce** lo que hay que entregar cada día. Registra el contrato y su cobro, y cuando el pago se confirma pide a MS4 el calendario de entregas. Cada noche toma la orden de producción de MS4, la convierte en recetas y raciones a cocinar y lleva cada paquete por armado, etiquetado y control de calidad hasta liberarlo a logística.

## Responsabilidades
- Crear el **contrato** de un paciente con un plan, cobrarlo (factura) y cancelarlo.
- Cobrar los **controles de seguimiento** de pacientes sin contrato activo.
- Pedir a MS4 el **calendario de entregas** en cuanto el contrato queda pagado, sin que el cobro dependa de que MS4 esté arriba (outbox).
- Armar la **orden de producción diaria**: recetas y raciones totales de un día, a partir del menú que entrega MS4.
- Llevar cada **paquete** por su flujo: crear, armar, etiquetar, validar (control de calidad).
- Avisar a logística que un paquete está listo (**evento `package-validated`**).
- Mantener una **copia local** de los planes y recetas de MS2.

## Lo que NO hace
- No define planes ni recetas → **MS2**. MS3 guarda una copia (`CatalogPlans`, `CatalogRecipes`).
- No genera ni modifica el calendario de entregas → **MS4**. MS3 solo lo crea y lee la orden de producción.
- No arma rutas ni asigna repartidores → **MS5**.
- No gestiona pacientes → **MS1**. Hoy son 3 pacientes simulados (X-04).
- No emite ni valida tokens: **no valida JWT** (sus endpoints son anónimos, ver [gaps](./gaps.md)). Solo usa uno propio, el de `ms3-service`, para llamar a MS4.

## Actores y vecinos
| Actor / servicio | Dirección | Mecanismo | Para qué |
|---|---|---|---|
| Frontend (paciente) | entrante | REST vía gateway | Contratar un plan, pagar, ver la factura, cancelar |
| Operaciones / cocina | entrante | REST vía gateway | Orden diaria, crear/armar/etiquetar/validar paquetes |
| MS4 Calendario | saliente | REST vía gateway + service account `ms3-service` | `POST /schedule` al pagar; `GET /calendars/active-tomorrow` para producir |
| Identity | saliente | REST vía gateway | Login de la service account `ms3-service` |
| MS2 Catálogo | entrante | Evento RabbitMQ | `meal-plan-published`, `recipe-published`, `recipe-updated` |
| MS5 Logística | saliente | Evento RabbitMQ | `package-validated` |
| Consul | saliente | Auto-registro + `/health` | Que el gateway lo encuentre como `contracting` |

## Mapa de comunicación
```mermaid
flowchart LR
  FE[Frontend / Operaciones] -- "contracts, billing, production" --> MS3((MS3<br/>Contratación))
  MS3 -- "POST /schedule<br/>GET /active-tomorrow<br/>service account ms3-service" --> MS4[MS4 Calendario]
  MS3 -- "login ms3-service" --> ID[Identity]
  MS2[MS2 Catálogo] -. "meal-plan-published<br/>recipe-published<br/>recipe-updated" .-> MQ{{RabbitMQ}}
  MQ -. "ms3.* colas" .-> W[MS3 WorkerService]
  W -. "package-validated" .-> MQ
  MQ -. "ms5.package-validated" .-> MS5[MS5 Logística]
```
Todas las llamadas REST pasan por el gateway (`/api/contracting/**` para entrar a MS3).

## Stack y despliegue
- **.NET 8**, FastEndpoints, MediatR, EF Core + PostgreSQL. Capas Core / Application / Infrastructure / Api, con DDD y CQRS.
- **Dos modos con el mismo código** (cambia solo la configuración):

| | Standalone | Plataforma (`nur-tricenter-local`) |
|---|---|---|
| Arranque | `docker compose up --build` en la raíz del repo | `contracting.compose.yml` incluido en el stack |
| BD | Postgres propio (`nur_tricenter_contracting`) | misma BD en el Postgres compartido |
| RabbitMQ | el suyo, con `topology/` | el de la plataforma |
| Consul | apagado | se registra como `contracting` |
| MS4 e identity | no se usan: calendarios simulados; `CreateSchedule` queda `Unroutable` | REST vía gateway con `ms3-service` |
| MS1 | simulado | simulado |

- **Procesos en plataforma:** `contracting-api` (puerto 8080, se registra en Consul) y `contracting-workerservice` (relay del outbox + consumidores; no se registra en Consul).
- **Pruebas:** unitarias, de integración (SQLite en memoria, sin broker) y de contrato (Pact). El detalle y los casos de uso están en `docs/` del repo.

## Índice de la ficha
- [domain.md](./domain.md): modelo de dominio, estados e invariantes
- [api.md](./api.md): endpoints expuestos
- [integrations.md](./integrations.md): llamadas síncronas salientes
- [messaging.md](./messaging.md): eventos publicados y consumidos
- [flows.md](./flows.md): casos de uso de punta a punta
- [gaps.md](./gaps.md): deuda, inconsistencias y dependencias
- [service.yaml](./service.yaml): datos estructurados
