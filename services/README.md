# Fichas de servicios

Una carpeta por microservicio, creada a partir de [`templates/service/`](../templates/service/). Cómo hacerlo: [CONTRIBUTING.md](../CONTRIBUTING.md).

| Id | Carpeta | Owner | Estado |
|---|---|---|---|
| MS1 | [`ms1-clinic`](./ms1-clinic/README.md) | Diego Cabrera Alvarez (@Juandcode) | 🟨 `status: draft` (integrado al stack local desde 2026-10-31) |
| MS2 | [`ms2-catalog`](./ms2-catalog/README.md) | Robert Perez Lino | ✅ `status: complete` |
| MS3 | [`ms3-contracting`](./ms3-contracting/README.md) | Luis Jesus Ferrufino | ✅ `status: complete` |
| MS4 | [`ms4-delivery-calendar`](./ms4-delivery-calendar/README.md) | Franklin Andre Romero Padilla | ✅ complete |
| MS5 | [`ms5-logistics`](./ms5-logistics/README.md) | Andres Sebastian Guerrero Camacho | ✅ complete |
| identity | [`identity-service`](./identity-service/README.md) | — | ✅ `status: complete` |
| gateway | [`gateway-api`](./gateway-api/README.md) | — | ✅ `status: complete` |

Leyenda: ⬜ sin empezar · 🟨 `status: draft` · ✅ `status: complete`.

**Nombre de carpeta:** `<id>-<nombre-corto-en-kebab>`, por ejemplo `ms2-catalog`, `ms5-logistics`, `identity-service`. Tiene que empezar con el `id` del `service.yaml`, o el validador falla.
