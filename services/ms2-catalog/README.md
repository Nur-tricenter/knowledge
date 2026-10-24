# MS2 — Catálogo de planes y recetas

> **Owner:** Robert Perez Lino (@RobertPls) · **Repo:** [Nur-tricenter/ms2-plans-and-recipes-catalog](https://github.com/Nur-tricenter/ms2-plans-and-recipes-catalog) · **Estado de la ficha:** complete

## Propósito

MS2 es la **fuente de verdad del contenido nutricional** de la plataforma: alimentos (ingredientes con sus facts nutricionales), recetas compuestas a partir de esos alimentos y planes de comida que organizan recetas en días y tiempos de comida. Sin MS2 nadie sabe qué se cocina ni con qué ingredientes, y los demás servicios (calendario, producción, catering) no tienen qué proyectar.

Es además el **primer consumidor** de la plataforma: proyecta los eventos `user-published` de identity en un read model local `PlanAuthors`, ejerciendo la mitad receptora del patrón de mensajería.

## Responsabilidades

- CRUD de alimentos con datos nutricionales por unidad de medida y categoría; búsqueda por categoría.
- CRUD de recetas con nombre, instrucciones e ingredientes (alimento + porción); cálculo de info nutricional total a partir de los ingredientes.
- Creación y composición de planes de comida: duración 15 o 30 días, generación automática de los `PlanDay`, tiempos de comida (desayuno, media mañana, almuerzo, merienda, cena) por día y asignación de recetas con raciones.
- Publicar los hechos del dominio (`food-published`, `food-nutritional-info-updated`, `recipe-published`, `recipe-updated`, `meal-plan-published`) mediante outbox transaccional.
- Proyectar el read model `PlanAuthors` a partir de `user-published` (inbox idempotente).
- Exponer la composición completa de un plan (plan → días → tiempos de comida → recetas → ingredientes), que MS4 consume para resolver el menú del día.

## Lo que NO hace

- No gestiona usuarios ni autenticación → **identity**. Solo valida JWT y lee el autor del plan del claim `sub`.
- No orquesta contratos ni pagos → **MS3** (que llama a MS4 cuando el contrato está pago).
- No gestiona calendarios ni entregas → **MS4** (que consulta la composición del plan a MS2).
- No arma rutas ni repartidores → **MS5**.
- No sabe quién es el paciente más allá de la referencia de autor de un plan → **MS1/identity**.
- **No llama a otros servicios por HTTP**: es un proveedor de datos y un productor de eventos. Toda integración saliente es asíncrona (eventos) o inexistente.
- No publica eventos para todos los cambios del dominio: solo 5 de los 13 eventos de dominio se traducen a contratos de integración (ver [gaps.md](./gaps.md)).

## Actores y vecinos

| Actor / servicio | Dirección | Mecanismo | Para qué |
|---|---|---|---|
| Frontend / admin | entrante | REST vía gateway | CRUD de foods, recipes y meal-plans |
| MS4 Calendario | entrante (lo consulta MS4) | REST vía gateway + service account `ms4-service` | Composición del plan (`GET /meal-plans/{id}`) para resolver el menú del día N |
| Identity | entrante | Evento RabbitMQ `user-published` | Proyectar `PlanAuthors` (read model) |
| MS1 / MS3 / MS4 / MS5 | saliente | Evento RabbitMQ (fanout) | Consumen `food-published`, `recipe-published`, `meal-plan-published`, etc. |
| Consul | saliente | Auto-registro + `/health` | Que el gateway lo encuentre |
| Operaciones | entrante | REST | Disparar migraciones (`--migrate`) y seed |

## Mapa de comunicación

```mermaid
flowchart LR
  FE[Frontend / admin] -- "CRUD foods/recipes/meal-plans" --> MS2((MS2<br/>Catálogo))
  MS4[MS4 Calendario] -- "GET /meal-plans/{id}<br/>service account" --> GW[Gateway]
  GW -- "GET /api/v1/meal-plans/{id}" --> MS2
  ID[Identity] -. "user-published" .-> MQ{{RabbitMQ}}
  MQ -. "ms2.user-published" .-> W[MS2 WorkerService]
  MS2 -- "outbox" --> MQ
  MQ -. "food/recipe/meal-plan-*<br/>fanout" .-> MSX[MS1/MS3/MS4/MS5]
```

Todas las llamadas REST entran por el gateway (`/api/catalog/**` para llegar a MS2).

## Stack y despliegue

- **.NET 8**, Clean Architecture + DDD, CQRS con MediatR, EF Core 9 + PostgreSQL (un solo DB, tres schemas: `write`, `read`, `outbox`).
- **RabbitMQ** vía `Joseco.Communication.External.RabbitMQ` 1.1.0, con **outbox transaccional** (`Joseco.Outbox.EFCore`) e **inbox idempotente**.
- **Consul** (nombre por defecto `catalog-service`, override de plataforma `catalog`), **API Gateway YARP**.
- **Procesos:** `catalog-api` (puerto 8080, se registra en Consul) y `catalog-workerservice` (outbox drain + consumidor de `user-published` + registrar de `catalog.default`; **no** se registra en Consul). Las migraciones corren con `dotnet Catalog.App.dll --migrate` (one-shot) o con `Migrations__ApplyOnStartup=true` en dev.
- **Modo standalone:** `docker-compose.yml` con Postgres propio; **plataforma:** `catalog.compose.yml` incluido por el orquestador.

## Índice de la ficha

- [domain.md](./domain.md): modelo de dominio, agregados e invariantes
- [api.md](./api.md): endpoints expuestos
- [integrations.md](./integrations.md): llamadas síncronas (ninguna saliente)
- [messaging.md](./messaging.md): eventos publicados y consumidos
- [flows.md](./flows.md): casos de uso de punta a punta
- [gaps.md](./gaps.md): deuda, inconsistencias doc ↔ código
- [service.yaml](./service.yaml): datos estructurados