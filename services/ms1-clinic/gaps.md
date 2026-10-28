# Gaps — MS1

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms1-gap-01 | Fuera de la org y no integrado a la plataforma (sin Consul, gateway ni compose de plataforma) | high | MS1 / nur-tricenter-local | abierto (X-04, X-12) |
| ms1-gap-02 | Sin autenticación ni scopes; Swagger siempre expuesto | high | MS1 / identity | abierto |
| ms1-gap-03 | No existe `POST /api/v1/patients/contact-information` que espera MS5, y `Paciente` no tiene teléfono | high | MS1 / MS5 | abierto (X-04) |
| ms1-gap-04 | `PacientePublished` sale con `PacienteId` vacío, campos cruzados y probablemente duplicado | high | — | abierto |
| ms1-gap-05 | Contrato local, exchange fuera de la topología y sin consumidores | medium | MS1 / nur-tricenter-local | abierto |
| ms1-gap-06 | BD SQL Server cableada en el código (`ClinicaNutricional3`), no funciona en contenedor | high | — | abierto |
| ms1-gap-07 | `Paciente` sin id de usuario de identity | medium | identity | abierto (X-08) |
| ms1-gap-08 | Sin manejo de errores: inexistente → 500 | medium | — | abierto |
| ms1-gap-09 | Modelo anémico, sin invariantes de negocio | medium | — | abierto |
| ms1-gap-10 | No consume ninguna de sus 7 colas `ms1.*` | low | — | abierto (X-06) |
| ms1-gap-11 | Rutas duplicadas sin `/api` (`/Paciente`, `/Atencion`) | low | — | abierto |
| ms1-gap-12 | `dockerfile` y `docker-compose.yml` rotos | low | — | abierto |
| ms1-gap-13 | `PlanAlimenticio` no se vincula con el plan de MS2 | medium | MS2 | abierto |

## Detalle

### ms1-gap-01 — No integrado a la plataforma
- **Qué pasa:** el repo está en `Juandcode/ClinicaNutricionalMicroservicio1`, fuera de `Nur-tricenter`. No se registra en Consul ni pasa por el gateway. `nur-tricenter-local` incluye `ms1-clinica-nutricional/ms1.compose.yml` y compila `src/ClinicaNutricional.Api` y `src/ClinicaNutricional.WorkerService`, que no existen (los proyectos están en la raíz como `GestionClinicaNutricional*`).
- **Impacto:** `start-stack` falla en el paso de MS1 y el compose de la plataforma no levanta (X-12). Ningún servicio puede llamar al MS1 real.
- **Qué haría falta:** mover o forkear el repo a la org; agregar `ms1.compose.yml` con API + worker en la red compartida; registro en Consul como `clinica-nutricional` con `/health`; o bien ajustar los scripts de `nur-tricenter-local` a los nombres reales.

### ms1-gap-02 — Sin autenticación
- **Qué pasa:** no hay `AddAuthentication`/`AddSecurity`, `[Authorize]` ni scopes. Swagger está activo en todos los entornos.
- **Impacto:** cualquiera que llegue al puerto lee y modifica datos clínicos.
- **Qué haría falta:** referenciar `Nur.Tricenter.Security`, definir scopes de MS1 en `Nur.Tricenter.Access` (hoy no hay) y exigirlos por endpoint.

### ms1-gap-03 — El contrato que MS5 espera no existe
- **Qué pasa:** MS5 llama a `POST /api/v1/patients/contact-information` (array de `patientId` → `[{ patientId, phoneNumber, fullName }]`) contra un mock de Postman. MS1 no tiene ese endpoint ni guarda teléfono.
- **Qué haría falta:** agregar teléfono al `Paciente` y el endpoint (detrás del gateway, con service account de MS5), o que MS5 se alimente de `paciente-published`. Acordar un único contrato con MS3, que también simula pacientes.

### ms1-gap-04 — El evento sale corrupto
- **Qué pasa:** en `Paciente.Crear`, `new PacienteCreated(paciente.Id, nombre, apellido, ci)` no respeta el orden del constructor `(pacienteId, ci, nombre, apellido)`, y `paciente.Id` todavía es `Guid.Empty` (EF lo asigna después, en `AddAsync`). Además el worker registra `PublishIntegrationEventWhenPacienteCreated` dos veces (escaneo de MediatR + `AddIntegrationMessaging`), lo que probablemente publica cada mensaje dos veces (no verificado en ejecución).
- **Impacto:** un consumidor recibiría pacientes sin id y con los datos mezclados.
- **Qué haría falta:** asignar `Id = Guid.NewGuid()` dentro de `Crear`, pasar los argumentos en el orden correcto (o con nombre) y quitar el registro manual duplicado.

### ms1-gap-05 — Evento fuera del catálogo de la plataforma
- **Qué pasa:** `PacientePublished` es un record local (`GestionClinicaNutricional.Application.Contracts`), no está en `Nur.Tricenter.Integration` y no tiene `EventType`. El exchange `paciente-published` lo declara el worker de MS1 (fanout, no durable) junto con la cola sumidero durable `gestion-clinica-nutricional.default`. La topología de la plataforma no lo conoce y nadie lo consume.
- **Qué haría falta:** mover el contrato al kernel (con nombres en inglés, como los demás: `PatientRegistered` o similar), declarar exchange y colas de consumidores en `rabbitmq-definitions.json` y que MS3/MS5 lo consuman.

### ms1-gap-06 — Base de datos cableada
- **Qué pasa:** `AddDbContext` usa una cadena literal (`localhost\SQLEXPRESS`, BD `ClinicaNutricional`, `Trusted_Connection`), y `DatabaseContext.OnConfiguring` la reemplaza por `ClinicaNutricional3`. `appsettings.json` no se lee. El resto de la plataforma usa PostgreSQL.
- **Impacto:** solo corre en una máquina Windows con SQL Express; dentro de un contenedor no hay `localhost\SQLEXPRESS` ni autenticación de Windows. Los tests de integración escriben en la misma BD de desarrollo.
- **Qué haría falta:** leer `ConnectionStrings:DefaultConnection`, quitar `OnConfiguring` y decidir el motor (Postgres compartido, como MS2–MS5).

### ms1-gap-07 — Sin vínculo con identity
`Paciente` no guarda el id de usuario de identity, y MS1 no consume `ms1.user-published`. Sin ese mapeo no se puede cerrar la autorización por objeto en MS4 ni en MS1 (X-08).

### ms1-gap-08 — Errores como 500
Los repositorios lanzan `NullReferenceException` cuando no encuentran algo, `Antecedente` lanza `ArgumentException` y no hay manejador global. La rama `NotFound` de `GetPacienteById` es inalcanzable.

### ms1-gap-09 — Reglas de negocio ausentes
Setters públicos y sin invariantes: `CI` no es único, se crea un plan sin consulta aprobada, `EstadoPlan` lo manda el cliente y no se recalcula con `FechaVencimiento`, `SchedulePlan` acepta cualquier fecha, y la `Categoria` de los hábitos se descarta al mapear el request.

### ms1-gap-10 — Colas sin consumir
Las 7 colas `ms1.*` de la topología acumulan mensajes. Ver [messaging.md](./messaging.md).

### ms1-gap-11 — Rutas duplicadas
`PacienteController` (`/Paciente`) y `AtencionController` (`/Atencion`) repiten casos de uso de `api/v1`, y `POST /Atencion/{pacienteId}/Consultas` es una lectura por POST.

### ms1-gap-12 — Docker roto
`dockerfile` hace `COPY /GestionClinicaNutricionalService .`, carpeta que no existe (los proyectos están en la raíz). `docker-compose.yml` usa la imagen `logfile1995/gestionclinicanutricional:latest` y `ASPNETCORE_URLS=http://*:80.` (con un punto final). Aunque la imagen arranque, no llega a la BD (ms1-gap-06).

### ms1-gap-13 — Plan propio, sin relación con MS2
El README dice que MS1 valida el plan contra MS2 (`GET /api/v1/catalog/plans/{id}`). El código no lo hace y `PlanAlimenticio` no guarda ningún id de plan de MS2, así que no hay forma de saber qué plan del catálogo contrata el paciente en MS3.

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código** (rama `main`).

| Dónde | La doc dice | El código hace |
|---|---|---|
| `README.md` del repo, #1 | `POST /api/v1/consultation` | `POST /api/v1/Consultation/{pacienteId}/Consultation` |
| `README.md`, #2 | `PATCH /api/v1/consultation/{patientId}/approve` | `POST /api/v1/Consultation/{consultaId}/Approve` (POST, y recibe el id de la consulta) |
| `README.md`, #5 | `POST …/{planAlimenticioId}/CreateControlEvaluation` | `…/CreateControlEvaluacion` |
| `README.md`, #7 | `GET /api/v1/consultations/{patientId}/consultations` | `GET /api/v1/Consultation/{pacienteId}/Consultations` |
| `README.md`, #8 | `GET /api/v1/patient/{id}/evolutions` | No existe. Hay `GET /api/v1/Patient/{id}` (datos del paciente) |
| `README.md` | No menciona `CreatePaciente` ni las rutas `/Paciente` y `/Atencion` | Existen |
| `README.md`, sección MS2 | MS1 llama a `GET /api/v1/catalog/plans/{id}` para validar el plan | No hay ninguna llamada HTTP saliente |
| `README.md`, tests de integración | Usan la BD `ClinicaNutricional` | `OnConfiguring` fuerza `ClinicaNutricional3` |
| `appsettings.json` (WebApi y worker) | Connection strings y sección `Joseco:…:RabbitMQ` | Se ignoran: la cadena está en el código y el worker lee `RabbitMqSettings` |
| `Directory.Packages.props` | Kernels `Nur.Tricenter.*` 1.0.9 | Ninguno se referencia (las referencias están comentadas) |
| `GestionClinicaNutricionalService.http` | `GET /weatherforecast/` | Ese endpoint no existe |
| `nur-tricenter-local` (scripts y compose) | `ms1.compose.yml`, `src/ClinicaNutricional.*`, ruta `/api/clinica-nutricional` | Nada de eso existe en el repo |
| Base de conocimiento, X-04 | "No hay repo de MS1 en la org" | Hay repo, pero en una cuenta personal (`Juandcode`) |
