# API — MS1

- **Prefijos internos:** `/api/v1/Patient` y `/api/v1/Consultation`, más dos controladores **sin** `/api` (`/Paciente`, `/Atencion`) que duplican funciones.
- **Prefijo en el gateway:** `/api/clinica-nutricional/v1/...` (MS1 se registra en Consul como `clinica-nutricional` desde MS1#1).
- **Autenticación:** JWT de identity en **todas** las rutas salvo `/health` (política de fallback "usuario autenticado"). No hay scopes de MS1 en el kernel, así que cualquier token válido sirve.
- **Formato de respuesta:** los comandos devuelven el `Result<T>` de Joseco serializado tal cual: `{ "value": …, "isSuccess": true, "isFailure": false, … }`. Los enums viajan como **número** (no hay `JsonStringEnumConverter`).
- **Formato de error:** no hay manejador de excepciones ni ProblemDetails configurado. Un recurso inexistente termina en **500** (los repositorios lanzan `NullReferenceException`).
- **Ids:** todos GUID.
- **Documentación interactiva:** NSwag, `/swagger`, activo salvo `OpenApi:Enabled=false` (la plataforma lo apaga). Cada llamada necesita el token.
- **Llamado por:** MS3 (`GET /api/v1/Patient/{id}`, como `ms3-service`, desde MS3#8). `contact-information` no lo llama nadie desde que MS5 dejó el ClinicService (MS5#4). El README prevé un frontend (paciente, recepción, nutricionista) que no existe; hoy se usa desde Swagger y desde `IntegrationTests`.

## Contrato para MS5: `POST /api/v1/patients/contact-information`
Cuerpo: arreglo de ids de paciente (`["<guid>", …]`). Respuesta: `{ value: [{ patientId, phoneNumber, fullName }], isSuccess, … }`; los ids que no existen se omiten. Controlador `PatientsContactController` (`api/v1/patients`). El teléfono sale de `Paciente.Telefono`, opcional en `CreatePaciente` (`telefono`).

## Resumen
| Método | Ruta | Llamado por (previsto) | Scope | Idempotente |
|---|---|---|---|---|
| POST | `/api/v1/Patient/CreatePaciente` | Frontend (recepción) | ninguno | no (crea otro paciente aunque repitas el `CI`) |
| GET | `/api/v1/Patient/{id}` | Frontend | ninguno | sí |
| POST | `/api/v1/Patient/{pacienteId}/Plan` | Frontend (nutricionista) | ninguno | no |
| PATCH | `/api/v1/Patient/{planAlimenticioId}/SchedulePlan` | Frontend (nutricionista) | ninguno | sí |
| POST | `/api/v1/Patient/{planAlimenticioId}/CreateControlEvaluacion` | Frontend (nutricionista) | ninguno | no |
| GET | `/api/v1/Patient/{planAlimenticioId}/ControlEvaluationHistory` | Frontend (nutricionista) | ninguno | sí |
| POST | `/api/v1/Consultation/{pacienteId}/Consultation` | Frontend (paciente) | ninguno | no |
| GET | `/api/v1/Consultation/{pacienteId}/Consultations` | Frontend (nutricionista) | ninguno | sí |
| POST | `/api/v1/Consultation/{consultaId}/Approve` | Frontend (recepción) | ninguno | sí |
| POST | `/Paciente/CreatePaciente` | (duplicado) | ninguno | no |
| GET | `/Paciente/{id}` | (duplicado) | ninguno | sí |
| POST | `/Paciente/{pacienteId}/CreateConsulta` | (duplicado) | ninguno | no |
| POST | `/Paciente/{planAlimenticioId}/CreateEvaluacion` | (duplicado) | ninguno | no |
| GET | `/Paciente/{planAlimenticioId}/Evaluaciones` | (duplicado) | ninguno | sí |
| POST | `/Atencion/{pacienteId}/Consultas` | (duplicado; lee con POST) | ninguno | sí |

Los nombres de ruta salen de `nameof(...)`, así que respetan mayúsculas tal como están arriba (ASP.NET las compara sin distinguir mayúsculas).

## Detalle por endpoint

### `POST /api/v1/Patient/CreatePaciente`
**Para qué:** registrar un paciente. Dispara `PacienteCreated` → outbox → `paciente-published`.

```json
// request
{ "ci": "1234567", "nombre": "Ana", "apellido": "Pérez" }
// 200
{ "value": "…guid del paciente…", "isSuccess": true, "isFailure": false }
```
- Sin validación: campos vacíos o un `CI` repetido crean otro paciente.

### `GET /api/v1/Patient/{id}`
Devuelve la entidad `Paciente` con sus consultas iniciales (`id`, `ci`, `nombre`, `apellido`, `telefono`, `consultaIniciales`). Si no existe → **404** (desde MS1#2; antes era 500 porque el repositorio lanzaba antes de llegar a la rama `NotFound`).

### `POST /api/v1/Patient/{pacienteId}/Plan`
```json
{ "nombre": "Plan hipocalórico", "descripcion": "…", "duracionPlan": 15, "fechaVencimiento": "2026-11-30T00:00:00",
  "estadoPlan": 0, "planComidas": [ { "nombre": "Pollo", "descripcion": "Almuerzo", "categoria": 4 } ] }
// 200 { "value": "…guid del plan…", "isSuccess": true, … }
```
- `estadoPlan`: `0` = Vigente, `1` = Vencido. `categoria`: índice de `CategoriaComida`.
- Paciente inexistente → 500.

### `PATCH /api/v1/Patient/{planAlimenticioId}/SchedulePlan`
```json
{ "proximaFecha": "2026-11-15T10:00:00" }   // → 200 { "value": "…planAlimenticioId…", … }
```
Fija `FechaSiguienteControl`. No valida la fecha. Plan inexistente → 500.

### `POST /api/v1/Patient/{planAlimenticioId}/CreateControlEvaluacion`
```json
{ "descripcion": "Bajó 2 kg" }   // → 200 { "value": "…guid de la evaluación…", … }
```
`Fecha` = hora local del servidor. Plan inexistente → 500.

### `GET /api/v1/Patient/{planAlimenticioId}/ControlEvaluationHistory`
Lista de `Evaluacion` (`id`, `descripcion`, `fecha`) envuelta en `Result`. Un plan inexistente devuelve una lista vacía.

### `POST /api/v1/Consultation/{pacienteId}/Consultation`
```json
{ "peso": 70, "altura": 1.75, "composicion": "…",
  "antecedentes": [ { "descripcion": "…", "problema": 1 } ],
  "habitoAlimenticios": [ { "nombre": "Desayuno", "descripcion": "…", "categoria": 0 } ] }
// 200 { "value": "…guid de la consulta…", … }
```
- `problema`: `0` = BajoPeso, `1` = SobrePeso. Un `problema` inválido o una descripción vacía lanza `ArgumentException` → 500.
- La `categoria` de cada hábito **se descarta** al mapear el request (queda en el valor por defecto, `Vegetariana`).
- No verifica que el paciente exista: la clave foránea de SQL Server lo rechaza → 500.

### `GET /api/v1/Consultation/{pacienteId}/Consultations`
Consultas del paciente con sus hábitos, de la más reciente a la más antigua.

### `POST /api/v1/Consultation/{consultaId}/Approve`
Pone `Estado = true`. Repetirlo no cambia nada. Consulta inexistente → 500.

### Rutas duplicadas sin `/api`
`PacienteController` (`/Paciente/...`) y `AtencionController` (`/Atencion/...`) llaman a los mismos comandos que los controladores `api/v1`. `POST /Atencion/{pacienteId}/Consultas` es una **lectura** expuesta como POST. Parecen restos de una versión anterior; los tests de integración todavía usan `/Atencion`.

## Mapeo de errores
No hay manejador global (`UseExceptionHandler`, `IExceptionHandler` o filtros). En la práctica:

| Situación | HTTP |
|---|---|
| JSON mal formado o tipos incorrectos (`[ApiController]`) | 400 |
| Recurso inexistente (`NullReferenceException` en repositorios) | 500 (salvo `GET /Patient/{id}`: 404 desde MS1#2) |
| Value object inválido (`ArgumentException` de `Antecedente`) | 500 |
| Violación de clave foránea en SQL Server | 500 |
