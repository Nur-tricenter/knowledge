# MS5 — Logística y entregas

> **Owner:** Andres Sebastian Guerrero Camacho (@DruGuerrero) · **Repo:** [Nur-tricenter/ms5-logistics-and-delivery](https://github.com/Nur-tricenter/ms5-logistics-and-delivery) · **Estado de la ficha:** complete

## Propósito
Una vez que la comida está producida, alguien tiene que llevarla a la puerta del paciente. MS5 es dueño de esa **última milla**: registra a los repartidores, arma la **ruta del día** de cada uno, ordena las paradas desde la sucursal y deja constancia de cada entrega, con foto y firma si se entregó o con el motivo si falló. Sin MS5 nadie sabe qué repartidor lleva qué paquete, en qué orden, ni si el paciente lo recibió.

## Responsabilidades
- Registrar repartidores (`Courier`) y su estado (`Available`, `OnRoute`, `OnBreak`).
- Crear la ruta (`Route`) de un repartidor para una fecha.
- Recibir los paquetes a entregar y agregarlos como paradas (`Delivery`) a la ruta del día.
- Calcular la **secuencia de entrega** al iniciar la ruta: vecino más cercano desde las coordenadas de la sucursal (`branchCoordinates`).
- Registrar el resultado de cada parada: entregada (con `DeliveryConfirmation`: momento, foto y firma) o fallida (con motivo).
- Cerrar la ruta automáticamente cuando todas sus paradas terminaron.
- Publicar cada uno de esos hechos como evento de integración (10 exchanges), con outbox transaccional.

## Lo que NO hace
- No produce la comida ni decide qué se entrega cada día → **MS3** (producción) y **MS4** (orden de producción y calendario).
- No consulta pacientes: guarda con cada entrega el `PatientId`, el nombre y el teléfono que trae `package-validated` (el teléfono desde el kernel 1.5.0, MS5#8). MS1 ya no interviene (MS5#4).
- No llama a MS4 por REST (`PATCH /delivery-result` no se usa). MS4 cierra su día consumiendo `delivery-added-to-route`, `delivery-completed` y `delivery-failed` (colas `ms4.delivery-*`; MS4#3, #6, #8, #10). MS5 reenvía el `DeliveryDayId` que trae `package-validated`, así que el vínculo ya no depende de que `PackageId` sea el `packId` (X-01, resuelto).
- No autentica ni autoriza: **todos sus endpoints son anónimos** (gap X-03). No emite ni valida tokens.
- Consume `package-validated` de MS3 (cola `ms5.package-validated`, desde MS5#3): consumidor idempotente con inbox (`InboxMessages`) que agrega el paquete a la ruta de su fecha de entrega. Las otras 7 colas `ms5.*` que declara la topología no las lee nadie (X-06).

## Actores y vecinos
| Actor / servicio | Dirección | Mecanismo | Para qué |
|---|---|---|---|
| Operaciones / logística | entrante | REST vía gateway | Alta de repartidores y de rutas; carga de los paquetes del día (`POST /packages/deliveries`) |
| MS3 Producción | entrante | Evento RabbitMQ `package-validated` (cola `ms5.package-validated`) | Los paquetes aprobados por calidad se agregan a la ruta de su fecha de entrega (MS5#3, #4). Traen nombre y teléfono del paciente |
| App del repartidor (frontend) | entrante | REST vía gateway | Ver la ruta del día, iniciarla, marcar entregado / fallido |
| MS1 Clínica | ninguna | — | Desde MS5#4 no hay llamada a MS1: nombre y teléfono llegan en `package-validated` |
| RabbitMQ | saliente | Outbox → 10 exchanges fanout | Avisar altas de repartidores, rutas y resultados de entrega |
| MS4 Calendario | saliente | Eventos `delivery-added-to-route`, `delivery-completed`, `delivery-failed` (colas `ms4.delivery-*`) | MS4 cierra sus `DeliveryDay` con ellos (consumidores en MS4: MS4#3 y #10). No hay llamada REST |
| Consul | saliente | Auto-registro + `/health` | Que el gateway lo encuentre como `nurtricenter` |

## Mapa de comunicación
```mermaid
flowchart LR
  OPS[Operaciones] -- "POST /couriers<br/>POST /routes<br/>POST /packages/deliveries" --> MS5((MS5<br/>Logística))
  MS3[MS3 Producción] -. "package-validated<br/>(ms5.package-validated)" .-> MS5
  FE[App repartidor] -- "GET route/today<br/>POST start / deliver / fail" --> MS5
  MS3 -. "GET Patient/{id}<br/>(nombre y teléfono)" .-> MS1[MS1 Clínica]
  MS5 -. "outbox → 10 exchanges<br/>courier-*, route-*, delivery-*" .-> MQ{{RabbitMQ}}
  MQ -. "nurtricenter.default<br/>(sink, nadie consume)" .-> SINK[(historial)]
  MQ -. "delivery-added-to-route · delivery-completed · delivery-failed<br/>ms4.delivery-*" .-> MS4[MS4 Calendario]
```
Todas las llamadas entrantes pasan por el gateway con el prefijo `/api/nurtricenter/**`. Los paquetes entran por el evento `package-validated` y, a mano, por `POST /packages/deliveries`. MS4 cierra sus días a partir de los eventos `delivery-*` (no hay REST hacia MS4), siempre que el `PackageId` sea su `packId`.

## Stack y despliegue
- **.NET 10**, Clean Architecture + DDD táctico (`Joseco.DDD.Core`), controladores con `Ardalis.ApiEndpoints`, MediatR 14, FluentValidation, EF Core 10 + Npgsql, Serilog, Scalar (solo en Development).
- **BD propia:** Neon por defecto, o el Postgres de la plataforma con `.env.local-postgres.example`. Las migraciones las aplica el job `nurtricenter-migrate` (`dotnet Nurtricenter.Api.dll --migrate`, MS5#6); ya no hay que correr `dotnet ef` a mano.
- **Consul:** se registra como `nurtricenter` con `ServiceId` `nurtricenter-1` (no un nombre de dominio) → prefijo en el gateway `/api/nurtricenter`. Esos valores los fija la configuración (`nurtricenter.compose.yml`, `docker-compose.yml`); si no se setean, el código usa `nurtricenter-service` como nombre e id (`ServiceRegistrationOptions.DefaultServiceId`). El registro es opcional: solo se activa si `ServiceRegistration:ServiceDiscoveryAddress` tiene valor.
- **Kernels:** solo `Nur.Tricenter.Integration` **1.5.0** (publica `Messages.Logistics` y consume `Messages.Contracting`). No usa `Access`, `Security` ni `Observability`.

| | Standalone (`docker-compose.yml`) | Plataforma (`nurtricenter.compose.yml`) |
|---|---|---|
| Imagen | `aguerreroc/nurtricenter-ms5:0.2.0` (API + worker) | `mcr.microsoft.com/dotnet/aspnet:10.0` con `bin/Debug` montado |
| BD | la que se ponga en `ConnectionStrings__DefaultConnection` | Neon o Postgres local, según el `.env` (gitignored) |
| Consul | apagado (`ServiceDiscoveryAddress` vacío) | `http://nur-tricenter-consul:8500`, nombre `nurtricenter` |
| MS1 | — | — (sin llamada saliente) |
| RabbitMQ | `host.docker.internal:5672` | `nur-tricenter-rabbitmq:5672` |

- **Procesos en plataforma:** `nurtricenter-api` (puerto 8080, se registra en Consul) y `nurtricenter-workerservice` (solo productor: outbox → RabbitMQ y declaración de `nurtricenter.default`; no registra consumidores ni se registra en Consul). Los dos leen `ConnectionStrings__DefaultConnection` del `.env` (gitignored); sin ese archivo arrancan y fallan en la primera consulta.

## Índice de la ficha
- [domain.md](./domain.md): modelo de dominio, estados e invariantes
- [api.md](./api.md): endpoints expuestos
- [integrations.md](./integrations.md): llamadas síncronas salientes
- [messaging.md](./messaging.md): eventos publicados (en `main` no consume ninguno)
- [flows.md](./flows.md): casos de uso de punta a punta
- [gaps.md](./gaps.md): deuda, inconsistencias y dependencias
- [service.yaml](./service.yaml): datos estructurados (los usa la app visual)
