# Flujos — MS1

Los flujos siguen el recorrido clínico de un paciente. Solo F1 cruza la frontera del servicio (vía RabbitMQ); F5 describe lo que otros servicios esperan y hoy no ocurre.

## F1 — Registrar un paciente (Frontend → MS1 ⇢ RabbitMQ)
- **Actor:** recepción (previsto; hoy Swagger o tests).
- **Disparador:** `POST /api/v1/Patient/CreatePaciente`.
- **Precondición:** ninguna.
- **Camino feliz:**
  1. `Paciente.Crear` crea la entidad y levanta `PacienteCreated`.
  2. `UnitOfWork.CommitAsync` despacha el evento: `SaveInOutboxWhenPacienteCreated` lo guarda en `OutboxMessages`.
  3. Se guardan paciente y outbox en la misma transacción. Responde el `Id`.
  4. El WorkerService lee el outbox y publica `PacientePublished` en `paciente-published`.
- **Errores:** ninguno de negocio; fallos de BD → 500.
- **Idempotencia:** ninguna. Repetir el request crea otro paciente (no hay unicidad de `CI`).
- **Evento:** sale con el `PacienteId` real y los campos en su sitio (corregido en MS1#1, ms1-gap-04). Verificado en RabbitMQ: un solo mensaje por paciente.

```mermaid
sequenceDiagram
  participant FE as Cliente (Swagger)
  participant API as MS1 WebApi
  participant DB as SQL Server
  participant W as MS1 WorkerService
  participant MQ as RabbitMQ
  FE->>API: POST /api/v1/Patient/CreatePaciente { ci, nombre, apellido }
  API->>API: Paciente.Crear → PacienteCreated
  API->>DB: INSERT Paciente + OutboxMessages (una transacción)
  API-->>FE: 200 { value: pacienteId, isSuccess: true }
  W->>DB: lee OutboxMessages pendientes
  W-)MQ: PacientePublished → paciente-published
  MQ-)MQ: gestion-clinica-nutricional.default (sin consumidor)
```

## F2 — Consulta inicial y aprobación (Frontend → MS1)
- **Actor:** paciente (crea la consulta) y recepción (la aprueba).
- **Disparadores:** `POST /api/v1/Consultation/{pacienteId}/Consultation`, luego `POST /api/v1/Consultation/{consultaId}/Approve`.
- **Camino feliz:**
  1. Crea la `ConsultaInicial` con antecedentes (JSON) y hábitos (tabla propia), `Estado = false`.
  2. La aprobación pone `Estado = true`.
- **Errores:**
  | Situación | Resultado |
  |---|---|
  | Paciente inexistente | 500 (clave foránea) |
  | Antecedente sin descripción o `problema` inválido | 500 (`ArgumentException`) |
  | Consulta inexistente al aprobar | 500 (`NullReferenceException`) |
- **Idempotencia:** crear no es idempotente; aprobar sí.
- **Consulta:** `GET /api/v1/Consultation/{pacienteId}/Consultations` devuelve el historial.

## F3 — Asignar un plan alimenticio y agendar el control (Frontend → MS1)
- **Actor:** nutricionista.
- **Disparadores:** `POST /api/v1/Patient/{pacienteId}/Plan`, luego `PATCH /api/v1/Patient/{planAlimenticioId}/SchedulePlan`.
- **Camino feliz:** crea el `PlanAlimenticio` (duración 15/30, estado, vencimiento, comidas) y después fija `FechaSiguienteControl`.
- **Lo que no se verifica:** que haya una consulta aprobada, que el plan exista en MS2 (el README dice que sí; el código no) ni que las fechas sean coherentes.
- **Errores:** paciente o plan inexistente → 500.

## F4 — Evaluaciones de control (Frontend → MS1)
- **Actor:** nutricionista.
- **Disparadores:** `POST /api/v1/Patient/{planAlimenticioId}/CreateControlEvaluacion` y `GET /api/v1/Patient/{planAlimenticioId}/ControlEvaluationHistory`.
- **Camino feliz:** agrega una `Evaluacion` con la fecha actual del servidor y lista el historial del plan.
- **Errores:** plan inexistente → 500 al crear; lista vacía al consultar.

## F5 — Lo que la plataforma toma de MS1
- **MS3** lee el paciente (`GET /api/v1/Patient/{id}`, por el gateway como `ms3-service`) al crear un contrato, etiquetar y liberar el paquete; de ahí sale el teléfono que viaja a MS5 en `PackageValidated.PatientPhone` (MS3#8 y #9). Un id inexistente da 404 (MS1#2).
- **MS5** ya no pide nada a MS1 (MS5#4): `POST /api/v1/patients/contact-information` existe pero nadie lo llama.
- **Nadie consume `paciente-published`.** Ni MS3 ni MS5 mantienen una copia de pacientes a partir del evento.

```mermaid
sequenceDiagram
  participant MS3
  participant GW as Gateway
  participant MS1
  participant MS5
  MS3->>GW: GET /api/clinica-nutricional/v1/Patient/{id} (Bearer ms3-service)
  GW->>MS1: GET /api/v1/Patient/{id}
  MS1-->>MS3: { id, nombre, apellido, telefono, … } | 404
  MS3-)MS5: package-validated { PatientName, PatientPhone }
  Note over MS1,MS5: MS5 no llama a MS1; recibe el nombre y el teléfono en el evento
```
