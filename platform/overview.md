# Visión general de Nur-Tricenter

## El negocio
Nur-Tricenter gestiona la **alimentación a domicilio de pacientes con un plan nutricional**. El ciclo completo es:

1. El paciente se registra (datos clínicos y de contacto).
2. Se elige un **plan nutricional** de 15 o 30 días, armado por nutricionistas a partir de recetas y alimentos.
3. El paciente **contrata y paga** el plan.
4. El contrato se convierte en un **calendario de entregas**: un día de comida por cada día del plan, con fecha, dirección y estado.
5. Cada noche se consolida **qué hay que cocinar mañana** y se produce en cocina.
6. Un repartidor sale con su **ruta del día**, entrega en el domicilio y registra la evidencia (foto, firma) o el motivo del fallo.

Cada paso pertenece a un microservicio distinto, y el foco del diplomado está en **cómo se comunican entre sí** (ver [communication.md](./communication.md) y [../course/module-focus.md](../course/module-focus.md)).

## Mapa de servicios

| Id | Servicio | Responsabilidad | Repo | Estado de la ficha |
|---|---|---|---|---|
| MS1 | Pacientes (clínica) | Paciente, consulta inicial, plan alimenticio y evaluaciones de control | [ClinicaNutricionalMicroservicio1](https://github.com/Juandcode/ClinicaNutricionalMicroservicio1) (fuera de la org; no integrado al stack) | [draft](../services/ms1-clinic/README.md) |
| MS2 | Catálogo de planes y recetas | Alimentos, recetas y planes nutricionales por número de día | [ms2-plans-and-recipes-catalog](https://github.com/Nur-tricenter/ms2-plans-and-recipes-catalog) | [complete](../services/ms2-catalog/README.md) |
| MS3 | Contratación y producción | Contrato, cobro, calendario en MS4, orden de producción diaria y control de calidad de paquetes | [ms3-contract-and-production](https://github.com/Nur-tricenter/ms3-contract-and-production) | [complete](../services/ms3-contracting/README.md) |
| MS4 | Calendario de entregas | Calendario por paciente, reglas de cambio (48h), orden de producción consolidada | [ms4-delivery-schedule-management](https://github.com/Nur-tricenter/ms4-delivery-schedule-management) | [completa](../services/ms4-delivery-calendar/README.md) |
| MS5 | Logística y entregas | Repartidores, ruta del día con la secuencia de paradas y resultado de cada entrega (evidencia o motivo del fallo). Publica 10 eventos; MS4 consume los de entrega para cerrar cada día | [ms5-logistics-and-delivery](https://github.com/Nur-tricenter/ms5-logistics-and-delivery) | [complete](../services/ms5-logistics/README.md) |
| — | Identity | Usuarios, scopes y emisión de JWT | [nur-tricenter-identity](https://github.com/Nur-tricenter/nur-tricenter-identity) | [complete](../services/identity-service/README.md) |
| — | API Gateway | Punto de entrada único, ruteo dinámico vía Consul | [nur-tricenter-api-gateway](https://github.com/Nur-tricenter/nur-tricenter-api-gateway) | [complete](../services/gateway-api/README.md) |

MS1 runs in the local stack since 2026-10-31 and MS3 uses it: MS1 publishes `paciente-published` (kernel 1.6.0 contract `PatientPublished`) and MS3 keeps a local copy of the patient, which is where the name and phone it sends to MS5 in `package-validated` come from (MS3#9, MS5#8). Nobody calls MS1 over REST. Su ficha sigue en `draft` hasta que lo revise Diego; falta el vínculo `sub` → paciente (X-08).

Repos de soporte (no son microservicios de negocio):
- [nur-tricenter-shared-kernels](https://github.com/Nur-tricenter/nur-tricenter-shared-kernels): paquetes NuGet compartidos (`Access`, `Security`, `Integration`, `Observability`).
- [nur-tricenter-local](https://github.com/Nur-tricenter/nur-tricenter-local): levanta toda la plataforma en local con Docker Compose.

## Flujo de negocio de punta a punta

```mermaid
sequenceDiagram
  autonumber
  actor P as Paciente
  participant MS1 as MS1 Pacientes
  participant MS2 as MS2 Catálogo
  participant MS3 as MS3 Contratación
  participant MS4 as MS4 Calendario
  participant MS5 as MS5 Logística

  MS2-->>MS4: event meal-plan-published (the plan exists and lasts N days)
  MS2-->>MS4: event meal-plan-composition-changed (the plan's days, meal times and recipes)
  P->>MS1: registers
  MS1-->>MS3: event paciente-published (MS3 keeps a local copy of the patient)
  P->>MS3: contracts and pays a plan
  MS3-->>MS4: event contract-activated (MS4 creates the N-day calendar)
  P->>MS4: sets address / reschedules / cancels (48h rule)
  Note over MS4: Night D-1: catalog job (day N menu from its local projection)
  MS4-->>MS3: event production-order-ready (tomorrow's production order)
  Note over MS3: kitchen produces
  MS5->>MS5: arma ruta y entrega
  MS3--)MS5: evento package-validated (paquetes listos; MS5 lo consume en main desde MS5#3)
  MS5--)MS4: eventos delivery-added-to-route / delivery-completed / delivery-failed
```

Solid arrows are REST from a person or the frontend to a service (through the gateway); dotted arrows are RabbitMQ events. **There is no business REST between services any more:** whatever a service needs from another arrives as an event and is stored in a local projection (see [communication.md](./communication.md)). The last two steps close de punta a punta: MS5 consume `package-validated` y MS4 reconoce el día por `DeliveryDayId` (kernel 1.4.0), con respaldo por `PackageId` numérico y por paciente (X-01, X-10 en [../gaps/cross-service-gaps.md](../gaps/cross-service-gaps.md); MS4#8).

## Actores humanos
| Actor | Interactúa con | Cómo |
|---|---|---|
| Paciente | MS1, MS3, MS4 | Frontend (sin repo aún) → gateway |
| Nutricionista | MS2 | Arma alimentos, recetas y planes |
| Cocina / producción | MS3 | Consume la orden de producción diaria |
| Repartidor | MS5 | App de reparto: ruta del día, entregar o fallar |
| Operaciones | MS4, MS5 | Dispara el job diario de catálogo de MS4 (manual por ahora); da de alta repartidores y rutas en MS5 |
| Administrador | Identity | Crea usuarios y asigna scopes |
