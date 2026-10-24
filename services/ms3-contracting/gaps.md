# Gaps — MS3

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms3-gap-01 | Sin autenticación ni scopes: todos los endpoints son anónimos | high | kernels, identity | abierto (X-11) |
| ms3-gap-02 | Los pacientes (MS1) son 3 simulados | high | MS1 | abierto (X-04) |
| ms3-gap-03 | `PackageValidated` no trae el `packId` de MS4 ni el tipo de `PatientId` que usa MS5 | high | MS5, MS4 | abierto (X-10, X-01) |
| ms3-gap-04 | Errores de dominio devuelven 500 y la validación del lote es parcial | medium | — | abierto |
| ms3-gap-05 | Los contratos de MS3 y los espejos del catálogo son copias locales | medium | kernels, `NUGET_TOKEN` | abierto |
| ms3-gap-06 | Si MS4 rechaza el calendario, el contrato queda pagado y sin calendario | medium | MS4 | abierto |
| ms3-gap-07 | La orden de producción real depende del campo `menu` que MS4 aún no devuelve | medium | MS4 | abierto (PR propuesto) |
| ms3-gap-08 | `MealPlanPublished` no trae precio: el plan proyectado cuesta 0 | low | MS2 | abierto |
| ms3-gap-09 | Nadie avisa a MS4 que un día está `InProduction` | low | MS4 | abierto (ms4-gap-04) |
| ms3-gap-10 | Mensajes no persistentes y colas sin consumidor | low | Joseco, todos | abierto (X-06) |

## Detalle

### ms3-gap-01 — Sin autenticación
- **Qué pasa:** ningún endpoint de MS3 usa `RequireAuthorization`; a través del gateway cualquiera puede contratar, cobrar, cancelar y validar paquetes. MS3 no tiene permisos en `Nur.Tricenter.Access` y no usa `Nur.Tricenter.Security`.
- **Impacto:** cobros y cancelaciones sin identidad, sin saber qué paciente o qué supervisor los hace. `staffId` y `supervisorId` son texto libre del body.
- **Qué haría falta:** definir `contracting.*` en el kernel (contrato, factura, orden, paquete), adoptar `AddSecurity` y proteger cada endpoint, igual que MS2 y MS4. Y resolver la autorización por objeto (X-08).

### ms3-gap-02 — Pacientes simulados
- **Qué pasa:** `POST /contracts` y el etiquetado consultan a `ISimulationService`, que conoce 3 pacientes fijos. Cualquier otro `patientId` da 404 `PATIENT_NOT_FOUND`.
- **Impacto:** no se puede contratar con un paciente real.
- **Qué haría falta:** MS1 con un evento de paciente publicado (para una copia local, como los planes) o un endpoint. MS5 ya espera un contrato propio de MS1 (X-04); conviene acordar uno solo.

### ms3-gap-03 — El evento no calza con MS5 ni con MS4
- **Qué pasa:** el owner de MS5 decidió que el `packageId` del evento sea el `packId` de MS4, lo que además cerraría X-01 (MS5 podría informar el resultado de cada día). `PackageValidated.PackageId` es el id del paquete de MS3, un GUID propio. MS5 usa `string` para `patientId` y MS3/MS4 usan `Guid`. `AddressCoordinates` no admite nulos en MS5, y el evento los manda `null` si no hay calendario que coincida.
- **Impacto:** aunque MS5 consuma la cola, no puede correlacionar la entrega con el día de MS4, y puede rechazar paquetes sin coordenadas.
- **Qué haría falta:** acordar con MS5 el campo (agregar el `packId` de MS4 al evento) y el tipo del id de paciente. MS3 recibe el `packId` de cada entrega en `active-tomorrow` (hoy lo traduce a `SimActiveCalendar.PackageId`), pero no lo guarda en el `Package`; habría que asociarlo al crear el paquete.

### ms3-gap-04 — 500 en errores de negocio y lote parcial
- **Qué pasa:** `ProcessPayment`, `CancelContract` y las transiciones de `Package` lanzan `InvalidOperationException`/`ArgumentException`, y no hay un manejador que las convierta en 4xx. Pagar dos veces, cancelar un contrato sin pagar o armar un paquete ya armado responde 500. En `validate`, si un paquete del lote no está `Labeled`, la excepción corta el recorrido: los anteriores ya quedaron validados y los siguientes no.
- **Impacto:** el cliente no distingue un error propio de uno del servidor, y un lote puede quedar a medias.
- **Qué haría falta:** mapear esas excepciones a 409/422 y que `validate` reporte el fallo de cada paquete en `results[]`, como ya hace con los errores de `Result`.

### ms3-gap-05 — Contratos como copias locales
- **Qué pasa:** el feed de GitHub Packages exige `NUGET_TOKEN`, que aún no se tiene. `PackageValidated` está en la rama `feat/contracting-messages` del kernel (1.2.0), sin publicar. Mientras, MS3 usa `Infrastructure/Messaging/Contracts/` y copias de `MealPlanPublished`, `RecipePublished` y `RecipeUpdated`.
- **Impacto:** si el publicador cambia un campo, las copias no se enteran (el JSON desconocido se ignora sin error). La regla del equipo es no tener copias locales.
- **Qué haría falta:** publicar 1.2.0 y que MS3 referencie `Nur.Tricenter.Integration`. El formato en el cable es el mismo, así que el cambio es solo de referencias.

### ms3-gap-06 — Contrato pagado sin calendario
- **Qué pasa:** el pago y la creación del calendario no son atómicos. Si MS4 responde 400/422 (p. ej. el plan dura 7 días y MS4 solo acepta 15 o 30), la fila queda `Rejected` y no se reintenta, pero el contrato ya está `Active` y cobrado.
- **Impacto:** un paciente que pagó y no recibe entregas, sin alerta.
- **Qué haría falta:** validar la duración antes de cobrar (o contra la proyección de MS2), o una acción compensatoria (cancelar/reembolsar) y una alerta sobre filas `Rejected`.

### ms3-gap-07 — `menu` en `active-tomorrow`
- **Qué pasa:** MS3 arma la orden con el `menu` de cada entrega. Hoy MS4 no lo devuelve; el cambio está propuesto en la rama `feat/active-tomorrow-menu` de MS4.
- **Impacto:** sin ese cambio, la orden diaria solo funciona con los 3 planes simulados; con un plan real responde 422 `NO_RECIPES` (antes era un 500).
- **Qué haría falta:** revisar y mergear el PR de MS4 (aditivo: no rompe a los demás consumidores).

### ms3-gap-08 — Precio del plan
`MealPlanPublished` no trae el precio. El plan proyectado se expone con costo 0; nada lo usa hoy porque el monto llega en el pago. Si MS3 tuviera que validarlo, MS2 debe agregarlo al contrato.

### ms3-gap-09 — `InProduction`
MS4 tiene el estado `InProduction` y lo acepta como origen de `delivery-result`, pero nada lo asigna. Le correspondería a MS3 avisar "empecé a producir", y no hay endpoint ni contrato (ms4-gap-04).

### ms3-gap-10 — Entrega de mensajes
La librería Joseco publica mensajes no persistentes en exchanges no durables: un reinicio de RabbitMQ pierde los mensajes en cola. Ya se mitigó reimportando la topología en cada arranque, pero no los mensajes. Además, las colas `ms3.food-*` y `ms3.user-*` no se consumen y acumulan.

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código**.

| Dónde | La doc dice | El código hace |
|---|---|---|
| `README.md` del repo (versión anterior a la integración) | MS1, MS2, MS4 y MS5 están simulados y los eventos solo se registran en una tabla | MS2 y MS4 son reales en la plataforma (eventos y REST) y MS5 recibe un evento; la simulación queda solo para MS1 y para el modo standalone |
| `README.md` del repo (tabla de dependencias) | `MS3 → MS4`: «Evento: crear calendario post-pago» | Es una **llamada REST** `POST /schedule`; la fila `CreateSchedule` del outbox solo la entrega |
| Estado `Simulated` de `OutgoingIntegrationEvent` | Parece «evento simulado» | Significa **pendiente de entregar**; se conserva el nombre por compatibilidad con las pruebas |
| `ContractActivatedDomainEvent` / `ContractCanceledDomainEvent` | Nombres de eventos de integración | Son eventos de dominio internos; **ningún contrato `contract-*` sale de MS3** |
| X-10 (cross-service-gaps, antes de esta ficha) | El evento de MS3 «no existe» y MS3 «sin repo» | `PackageValidated` existe en el kernel (rama `feat/contracting-messages`) y se publica desde MS3; falta su consumidor en MS5 |
