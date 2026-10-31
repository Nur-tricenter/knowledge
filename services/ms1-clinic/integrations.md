# Integraciones síncronas — MS1

## Resumen
**Este servicio no hace llamadas síncronas salientes.** No hay `HttpClient`, adaptadores HTTP ni service account. Sus únicas dependencias son la BD (SQL Server local) y RabbitMQ (ver [messaging.md](./messaging.md)).

| Destino | Método y ruta | Vía | Auth | Para qué |
|---|---|---|---|---|
| — | — | — | — | — |

## Lo que el README del repo dice y el código no hace
El README lista `GET /api/v1/catalog/plans/{id}` en MS2, "consumido internamente por MS1" para validar que el plan exista antes de asignarlo. **No existe esa llamada**: `CreatePlanAlimenticioHandler` crea el plan sin consultar a nadie, y el `PlanAlimenticio` de MS1 no guarda ningún id de plan de MS2. Además, esa ruta tampoco existe en MS2 (MS4 usa `GET /api/catalog/v1/meal-plans/{id}`). Ver gaps.

## Llamadas entrantes
Estado al 2026-10-31.

### MS3 → MS1: retirado (ahora es un evento)
MS3 used to call `GET /api/clinica-nutricional/v1/Patient/{id}` through the gateway with `ms3-service` (`Clinic__BaseUrl`). **Since MS3#11 and MS1#3 it does not:** MS1 publishes the kernel contract `PatientPublished` on `paciente-published` and MS3 projects it into `ClinicPatients` (name, phone), so it never calls MS1 ([messaging.md](./messaging.md)). The endpoint still exists (used from Swagger and the demo console); a missing id answers `404` (MS1#2). MS1 receives no inter-service REST call at all.

### MS5 → MS1: retirado
MS5 ya no llama a `POST /api/v1/patients/contact-information` (MS5#4). El endpoint existe en MS1 desde MS1#1 (con JWT) y nadie lo usa. Ver ms1-gap-03.
