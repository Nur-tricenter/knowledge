# Gaps — MS1

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms1-gap-01 | No integrado a la plataforma (sin Consul, gateway ni compose de plataforma) | high | MS1 / nur-tricenter-local | resuelto (MS1#1, local#8) |
| ms1-gap-02 | Sin scopes de MS1 (solo exige token válido); Swagger expuesto por defecto | medium | MS1 / kernels / identity | parcial (JWT desde MS1#1) |
| ms1-gap-03 | `POST /api/v1/patients/contact-information` que espera MS5, y `Paciente` sin teléfono | high | MS1 / MS5 | resuelto (MS1#1); MS5 ya no lo llama |
| ms1-gap-04 | `PacientePublished` salía con `PacienteId` incorrecto y campos cruzados | high | — | resuelto (MS1#1) |
| ms1-gap-05 | Contrato local, exchange fuera de la topología y sin consumidores | medium | MS1 / nur-tricenter-local | abierto |
| ms1-gap-06 | BD SQL Server cableada, no funcionaba en contenedor | high | — | resuelto (Postgres, MS1#1) |
| ms1-gap-07 | `Paciente` sin id de usuario de identity | medium | identity | abierto (X-08) |
| ms1-gap-08 | Sin manejo de errores: inexistente → 500 | medium | — | abierto |
| ms1-gap-09 | Modelo anémico, sin invariantes de negocio | medium | — | abierto |
| ms1-gap-10 | No consume ninguna de sus 7 colas `ms1.*` | low | — | abierto (X-06) |
| ms1-gap-11 | Rutas duplicadas sin `/api` (`/Paciente`, `/Atencion`) | low | — | abierto |
| ms1-gap-12 | `dockerfile` y `docker-compose.yml` rotos | low | — | resuelto (MS1#1) |
| ms1-gap-13 | `PlanAlimenticio` no se vincula con el plan de MS2 | medium | MS2 | abierto |

## Detalle

### ms1-gap-01 — No integrado a la plataforma
- **Resuelto el 2026-10-31** con [MS1#1](https://github.com/Nur-tricenter/ms1-gestion-clinica-nutricional/pull/1) y [nur-tricenter-local#8](https://github.com/Nur-tricenter/nur-tricenter-local/pull/8): `ms1.compose.yml`, registro en Consul como `clinica-nutricional`, JWT, Postgres y build en `start-stack`. Verificado con el stack completo (16 contenedores sanos) y `e2e-smoke.py` verde. Lo de abajo es el estado previo.
- **Qué pasa:** desde 2026-10-31 el repo está en la org (`Nur-tricenter/ms1-gestion-clinica-nutricional`; antes en `Juandcode/ClinicaNutricionalMicroservicio1`, que `setup-project` de `nur-tricenter-local` todavía clona). No se registra en Consul ni pasa por el gateway. `Directory.Packages.props` declara los kernels `Nur.Tricenter.*` y `Consul`, pero ningún proyecto los referencia. `nur-tricenter-local` incluye `ms1-clinica-nutricional/ms1.compose.yml` y compila `src/ClinicaNutricional.Api` y `src/ClinicaNutricional.WorkerService`, que no existen (los proyectos están en la raíz como `GestionClinicaNutricional*`).
- **Impacto:** `start-stack` falla en el paso de MS1 y el compose de la plataforma no levanta (X-12). Ningún servicio puede llamar al MS1 real.
- **Qué haría falta:** mover o forkear el repo a la org; agregar `ms1.compose.yml` con API + worker en la red compartida; registro en Consul como `clinica-nutricional` con `/health`; o bien ajustar los scripts de `nur-tricenter-local` a los nombres reales.

### ms1-gap-02 — Sin autenticación
- **Parcial desde MS1#1:** todas las rutas exigen un JWT de identity (salvo `/health`), pero MS1 no tiene permisos en `Nur.Tricenter.Access`, así que cualquier token válido puede leer y crear pacientes. Cerrarlo requiere una clase de permisos de MS1 en el kernel, publicar una versión nueva y una service account con scope para MS5. Lo de abajo es el estado previo.
- **Qué pasa:** no hay `AddAuthentication`/`AddSecurity`, `[Authorize]` ni scopes. Swagger está activo en todos los entornos.
- **Impacto:** cualquiera que llegue al puerto lee y modifica datos clínicos.
- **Qué haría falta:** referenciar `Nur.Tricenter.Security`, definir scopes de MS1 en `Nur.Tricenter.Access` (hoy no hay) y exigirlos por endpoint.

### ms1-gap-03 — El contrato que MS5 espera no existe
- **Resuelto en MS1#1:** el endpoint existe y `Paciente.Telefono` es opcional. MS5 dejó de llamarlo (MS5#4), por lo que sigue sin consumidor. Hoy el teléfono llega a MS5 por otra vía: MS3 lo lee de `GET /Patient/{id}` y lo manda en `PackageValidated.PatientPhone` (MS3#9, MS5#8, kernel 1.5.0). Lo de abajo es el estado previo.
- **Qué pasa:** MS5 llama a `POST /api/v1/patients/contact-information` (array de `patientId` → `[{ patientId, phoneNumber, fullName }]`) contra un mock de Postman. MS1 no tiene ese endpoint ni guarda teléfono.
- **Qué haría falta:** agregar teléfono al `Paciente` y el endpoint (detrás del gateway, con service account de MS5), o que MS5 se alimente de `paciente-published`. Acordar un único contrato con MS3, que también simula pacientes.

### ms1-gap-04 — El evento sale corrupto
- **Resuelto en MS1#1 (2026-10-31):** `Crear` asigna el `Id`, los argumentos van en orden y el publisher mapea `PacienteId`; hay un test (`PacienteCrearTests`). La doble publicación no se reprodujo (un mensaje por paciente). Lo de abajo describe el defecto original.
- **Cambios en el repo nuevo (2026-10-31, verificado leyendo el código):** `PacienteCreated` quedó con un único constructor completo (para que el outbox deserialice bien), pero `Paciente.Crear` sigue pasando `(paciente.Id, nombre, apellido, ci)`, así que los campos siguen cruzados. Además `PublishIntegrationEventWhenPacienteCreated` ahora asigna `PacienteId = pacienteCreated.Id` (el id del evento de dominio) en vez de `pacienteCreated.PacienteId`: el mensaje ya no lleva `Guid.Empty`, pero tampoco el id del paciente. Por eso el gap sigue abierto. El resto del detalle de abajo describe el comportamiento previo y sigue vigente salvo ese punto.
- **Qué pasa:** en `Paciente.Crear`, `new PacienteCreated(paciente.Id, nombre, apellido, ci)` no respeta el orden del constructor `(pacienteId, ci, nombre, apellido)`, y `paciente.Id` todavía es `Guid.Empty` (EF lo asigna después, en `AddAsync`). Además el worker registra `PublishIntegrationEventWhenPacienteCreated` dos veces (escaneo de MediatR + `AddIntegrationMessaging`), lo que probablemente publica cada mensaje dos veces (no verificado en ejecución).
- **Impacto:** un consumidor recibiría pacientes sin id y con los datos mezclados.
- **Qué haría falta:** asignar `Id = Guid.NewGuid()` dentro de `Crear`, pasar los argumentos en el orden correcto (o con nombre) y quitar el registro manual duplicado.

### ms1-gap-05 — Evento fuera del catálogo de la plataforma
- **Qué pasa:** `PacientePublished` es un record local (`GestionClinicaNutricional.Application.Contracts`), no está en `Nur.Tricenter.Integration` y no tiene `EventType`. El exchange `paciente-published` lo declara el worker de MS1 (fanout, no durable) junto con la cola sumidero durable `gestion-clinica-nutricional.default`. La topología de la plataforma no lo conoce y nadie lo consume.
- **Qué haría falta:** mover el contrato al kernel (con nombres en inglés, como los demás: `PatientRegistered` o similar), declarar exchange y colas de consumidores en `rabbitmq-definitions.json` y que MS3/MS5 lo consuman.

### ms1-gap-06 — Base de datos cableada
- **Resuelto en MS1#1:** PostgreSQL con `ConnectionStrings:DefaultConnection`, migración `InitialCreate` y job `--migrate`. Los datos de SQL Server no se migraron. Lo de abajo es el estado previo.
- **Cambios en el repo nuevo:** `AddInfrastructure` lee `GetConnectionString("DefaultConnection")` (lanza si está vacía) y ya no hay `OnConfiguring`. Pero el valor por defecto de `appsettings.json` sigue siendo `Server=localhost\SQLEXPRESS;Database=ClinicaNutricional3;…;Trusted_Connection=True` y el motor sigue siendo SQL Server (`UseSqlServer`). En Docker habría que inyectar `ConnectionStrings__DefaultConnection`.
- **Qué pasaba antes:** `AddDbContext` usaba una cadena literal (`localhost\SQLEXPRESS`, BD `ClinicaNutricional`, `Trusted_Connection`), y `DatabaseContext.OnConfiguring` la reemplazaba por `ClinicaNutricional3`. `appsettings.json` no se leía. El resto de la plataforma usa PostgreSQL.
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
- **Resuelto en MS1#1:** `dockerfile` con targets `api` y `worker`, `docker-compose.yml` standalone con Postgres y RabbitMQ, y `ms1.compose.yml` para la plataforma. Lo de abajo es el estado previo.
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
