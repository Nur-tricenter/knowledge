# Gaps — MS3

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms3-gap-01 | Sin autenticación ni scopes: todos los endpoints son anónimos | high | kernels, identity | abierto (X-11) |
| ms3-gap-02 | Los pacientes (MS1) son 3 simulados | high | MS1 | abierto (X-04) |
| ms3-gap-03 | `PackageValidated` no trae el `packId` de MS4 ni el tipo de `PatientId` que usa MS5 | high | MS5, MS4 | `packId` resuelto (MS3#6, kernel 1.4.0); falta alinear el tipo de `PatientId` (X-10, X-01) |
| ms3-gap-04 | Errores de dominio devuelven 500 y la validación del lote es parcial | medium | — | abierto |
| ms3-gap-05 | Los contratos de MS3 y los espejos del catálogo son copias locales | medium | kernels, `NUGET_TOKEN` | abierto |
| ms3-gap-06 | Si MS4 rechaza el calendario, el contrato queda pagado y sin calendario | medium | MS4 | abierto |
| ms3-gap-07 | La orden de producción real depende del campo `menu` que MS4 aún no devuelve | medium | MS4 | resuelto (MS4#4 devuelve `menu`; MS3 arma la orden desde ahí) |
| ms3-gap-08 | `MealPlanPublished` no trae precio: el plan proyectado cuesta 0 | low | MS2 | abierto |
| ms3-gap-09 | Nadie avisa a MS4 que un día está `InProduction` | low | MS4 | abierto (ms4-gap-04) |
| ms3-gap-10 | Mensajes no persistentes y colas sin consumidor | low | Joseco, todos | abierto (X-06) |
| ms3-gap-11 | El outbox no es atómico: el cambio y su fila se guardan en dos `CommitAsync` | medium | — | abierto |
| ms3-gap-12 | Re-validar una orden da 500 por los paquetes ya validados | high | — | resuelto (MS3#3) |
| ms3-gap-13 | El seed corre en la plataforma y crea una orden falsa para mañana | high | — | resuelto (MS3#4) |
| ms3-gap-14 | `daily-order` se congela al primer pedido de la fecha | medium | MS4 | abierto |
| ms3-gap-15 | Un paciente puede tener varios contratos activos a la vez | low | MS4 | abierto (decisión de negocio) |
| ms3-gap-16 | Un `GET` con `Content-Type: application/json` y sin cuerpo responde 400 | low | — | abierto |

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
> **Actualización 2026-10-29:** el `packId` de MS4 ya viaja en `PackageValidated.DeliveryDayId` (kernel 1.4.0, [kernel#5](https://github.com/Nur-tricenter/nur-tricenter-shared-kernels/pull/5)). MS3 lo envía ([MS3#6](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/6)), MS5 lo reenvía ([MS5#5](https://github.com/Nur-tricenter/ms5-logistics-and-delivery/pull/5)) y MS4 lo usa para enlazar la entrega (MS4#6, reunido en MS4#8, pendiente de merge). Es `null` si no hay calendario que coincida. Siguen abiertos el tipo de `PatientId` (`string` en MS5, `Guid` en MS3/MS4) y las coordenadas nulas. El texto de abajo es el análisis original.

- **Qué pasa:** el owner de MS5 decidió que el `packageId` del evento sea el `packId` de MS4, lo que además cerraría X-01 (MS5 podría informar el resultado de cada día). `PackageValidated.PackageId` es el id del paquete de MS3, un GUID propio. MS5 usa `string` para `patientId` y MS3/MS4 usan `Guid`. `AddressCoordinates` no admite nulos en MS5, y el evento los manda `null` si no hay calendario que coincida.
- **Impacto:** MS5 ya consume la cola (rama `dev`), pero no puede correlacionar la entrega con el día de MS4. MS4 consume los eventos de entrega de MS5 (PR #3 de MS4, abierto) y espera que su `PackageId` sea el `packId` entero; con el GUID de MS3 no puede cerrar el día (`Delivered`/`Failed`).
- **Qué haría falta:** acordar con MS5 el campo (agregar el `packId` de MS4 al evento) y el tipo del id de paciente. MS3 recibe el `packId` de cada entrega en `active-tomorrow` (hoy lo traduce a `SimActiveCalendar.PackageId`), pero no lo guarda en el `Package`; habría que asociarlo al crear el paquete.

### ms3-gap-04 — 500 en errores de negocio y lote parcial
- **Qué pasa:** `ProcessPayment`, `CancelContract` y las transiciones de `Package` lanzan `InvalidOperationException`/`ArgumentException`, y no hay un manejador que las convierta en 4xx. Pagar dos veces, cancelar un contrato sin pagar o armar un paquete ya armado responde 500. En `validate`, si un paquete del lote no está `Labeled`, la excepción corta el recorrido: los anteriores ya quedaron validados y los siguientes no.
- **Impacto:** el cliente no distingue un error propio de uno del servidor, y un lote puede quedar a medias.
- **Qué haría falta:** mapear esas excepciones a 409/422 y que `validate` reporte el fallo de cada paquete en `results[]`, como ya hace con los errores de `Result`.

### ms3-gap-05 — Contratos como copias locales
- **Qué pasa:** el feed de GitHub Packages exige `NUGET_TOKEN`, que MS3 aún no usa. `PackageValidated` ya está en `main` del kernel (PR #3, versión 1.2.0), y MS5 lo referencia en su rama `dev`. MS3 no referencia ningún paquete `Nur.Tricenter.*`: usa copias locales equivalentes (mismos campos y `EventType`, namespace `Nurtricenter.MS3.Infrastructure.Messaging.Contracts.*`) de `PackageValidated`, `MealPlanPublished`, `RecipePublished` y `RecipeUpdated`.
- **Impacto:** si el publicador cambia un campo, las copias no se enteran (el JSON desconocido se ignora sin error). La regla del equipo es no tener copias locales.
- **Qué haría falta:** que MS3 referencie `Nur.Tricenter.Integration` 1.2.0. El formato en el cable es el mismo, así que el cambio es solo de referencias.

### ms3-gap-06 — Contrato pagado sin calendario
- **Qué pasa:** el pago y la creación del calendario no son atómicos. Si MS4 responde 400/422 (p. ej. el plan dura 7 días y MS4 solo acepta 15 o 30), la fila queda `Rejected` y no se reintenta, pero el contrato ya está `Active` y cobrado.
- **Impacto:** un paciente que pagó y no recibe entregas, sin alerta.
- **Qué haría falta:** validar la duración antes de cobrar (o contra la proyección de MS2), o una acción compensatoria (cancelar/reembolsar) y una alerta sobre filas `Rejected`.

### ms3-gap-07 — `menu` en `active-tomorrow`
- **Qué pasa:** MS3 arma la orden con el `menu` de cada entrega. `main` de MS4 no lo devuelve (`ActiveTomorrowLineDto` no tiene `Menu`); el cambio está en la rama `feat/active-tomorrow-menu` de MS4, sin PR abierto (revisado 2026-10-28).
- **Impacto:** sin ese cambio, la orden diaria solo funciona con los 3 planes simulados; con un plan real responde 422 `NO_RECIPES` (antes era un 500).
- **Qué haría falta:** abrir el PR de esa rama en MS4, revisarlo y mergearlo (aditivo: no rompe a los demás consumidores).

### ms3-gap-08 — Precio del plan
`MealPlanPublished` no trae el precio. El plan proyectado se expone con costo 0; nada lo usa hoy porque el monto llega en el pago. Si MS3 tuviera que validarlo, MS2 debe agregarlo al contrato.

### ms3-gap-09 — `InProduction`
MS4 tiene el estado `InProduction` y lo acepta como origen de `delivery-result`, pero nada lo asigna. Le correspondería a MS3 avisar "empecé a producir", y no hay endpoint ni contrato (ms4-gap-04).

### ms3-gap-10 — Entrega de mensajes
La librería Joseco publica mensajes no persistentes en exchanges no durables: un reinicio de RabbitMQ pierde los mensajes en cola. Ya se mitigó reimportando la topología en cada arranque, pero no los mensajes. Además, las colas `ms3.food-*` y `ms3.user-*` no se consumen y acumulan.

### ms3-gap-11 — Outbox no atómico
- **Qué pasa:** `ProcessPaymentCommandHandler` y `ApproveQualityCommandHandler` llaman dos veces a `IUnitOfWork.CommitAsync` (que es un `SaveChangesAsync`): primero el agregado (contrato pagado, paquete `Validated`) y después la fila del outbox (`CreateSchedule`, `TransferToLogistics`). No hay transacción explícita que envuelva ambos.
- **Impacto:** si el API cae o la BD falla entre los dos commits, el cambio queda guardado sin su fila: un contrato cobrado al que nunca se le pide calendario, o un paquete validado que MS5 nunca recibe. Nada lo detecta ni lo reintenta.
- **Qué haría falta:** agregar la fila antes del primer `CommitAsync` y guardar todo en un solo `SaveChangesAsync` (o envolver ambos en `BeginTransactionAsync`).

Los gaps 12 a 16 salieron de la prueba integral en el stack local del 2026-10-28.

### ms3-gap-12 — Re-validar una orden
`POST /production/packages/validate` recorre **todos** los paquetes de la orden y `ApproveQualityControl` lanza si el paquete no está `Labeled`. Si la orden ya se validó y se le agrega otro paquete, la segunda llamada responde **500** por los ya `Validated`, y el nuevo nunca sale a MS5. **PR [MS3#3](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/3):** los ya validados cuentan como éxito y no se re-aprueban (tampoco se duplica su `TransferToLogistics`).

### ms3-gap-13 — Seed en la plataforma
`contracting.compose.yml` tenía `Seed__Enabled: "true"`. El seed crea una `DailyProductionOrder` para mañana con recetas inventadas, 2 paquetes (`Assembled` y `Pending`) y contratos pagados sin calendario en MS4. Con esa orden, `daily-order` de mañana **no consulta a MS4**, y los paquetes sembrados salen como `package-validated` sin un día detrás, o hacen fallar la validación. **PR [MS3#4](https://github.com/Nur-tricenter/ms3-contract-and-production/pull/4):** `Seed__Enabled: "false"` en la variante de plataforma (el standalone conserva el seed).

### ms3-gap-14 — Orden de producción congelada
Si ya existe la orden de una fecha, `daily-order` la devuelve sin volver a pedir `active-tomorrow`. Los días que MS4 deja listos después (contrato pagado o dirección cargada más tarde) no entran en `recipesSummary`, aunque se les puede crear el paquete igual (`POST /production/packages` no valida que el paciente esté en la orden). Opciones: reconsolidar mientras la orden no esté en producción, o fijar un horario de corte que MS4 también respete.

### ms3-gap-15 — Varios contratos activos por paciente
`POST /contracts` no impide que un paciente con un contrato activo contrate otro, y MS4 crea un calendario por contrato: el paciente termina con dos entregas el mismo día. `charge-control` sí rechaza el caso (`ACTIVE_CONTRACT`). Es una decisión de negocio; también afecta el enlace por paciente de MS4 (ver ms4 `messaging.md`).

### ms3-gap-16 — `GET` con `Content-Type` y sin cuerpo
FastEndpoints intenta deserializar el cuerpo cuando la petición trae `Content-Type: application/json`, aunque sea un `GET` vacío: `GET /production/daily-order` responde 400 (`The input does not contain any JSON tokens`). Algunos clientes HTTP mandan ese header siempre.

## Inconsistencias doc ↔ código
En esta ficha se documentó **el código**.

| Dónde | La doc dice | El código hace |
|---|---|---|
| `README.md` del repo (versión anterior a la integración) | MS1, MS2, MS4 y MS5 están simulados y los eventos solo se registran en una tabla | MS2 y MS4 son reales en la plataforma (eventos y REST) y MS5 recibe un evento; la simulación queda solo para MS1 y para el modo standalone |
| `README.md` del repo (tabla de dependencias) | `MS3 → MS4`: «Evento: crear calendario post-pago» | Es una **llamada REST** `POST /schedule`; la fila `CreateSchedule` del outbox solo la entrega |
| Estado `Simulated` de `OutgoingIntegrationEvent` | Parece «evento simulado» | Significa **pendiente de entregar**; se conserva el nombre por compatibilidad con las pruebas |
| `ContractActivatedDomainEvent` / `ContractCanceledDomainEvent` | Nombres de eventos de integración | Son eventos de dominio internos; **ningún contrato `contract-*` sale de MS3** |
| X-10 (cross-service-gaps, antes de esta ficha) | El evento de MS3 «no existe» y MS3 «sin repo» | `PackageValidated` existe en el kernel (rama `feat/contracting-messages`) y se publica desde MS3; falta su consumidor en MS5 |
| Esta ficha: `integrations.md`, `messaging.md`, `domain.md` y F2 (corregido 2026-10-28, revisión transversal) | El cambio y su fila del outbox se guardan «en la misma transacción» | Dos `CommitAsync` sin transacción explícita en `ProcessPaymentCommandHandler` y `ApproveQualityCommandHandler` (`ms3-gap-11`) |
| Esta ficha: `messaging.md` (corregido 2026-10-28, revisión transversal) | MS3 usa una copia local «idéntica» del contrato del kernel | Copia **equivalente**: mismos campos y `EventType`, pero namespace `Nurtricenter.MS3.Infrastructure.Messaging.Contracts.*` (no `Nur.Tricenter.Integration.Messages.*`) y base `IntegrationMessage` de Joseco |
| Esta ficha: `ms3-gap-05` (corregido 2026-10-28, revisión transversal) | `PackageValidated` en una rama del kernel, 1.2.0 sin publicar | Ya fusionado en `main` del kernel (versión 1.2.0) y referenciado por la rama `dev` de MS5; MS3 sigue sin referenciar ningún paquete `Nur.Tricenter.*` |
| Esta ficha: F4 y `messaging.md` (corregido 2026-10-28, revisión transversal) | `ms5.package-validated` no tiene consumidor | MS5 lo consume con `PackageValidatedConsumer` en su rama `dev` (aún no en `main`) |
| Esta ficha: `ms3-gap-07` (corregido 2026-10-28, revisión transversal) | El `menu` de `active-tomorrow` está en un «PR propuesto» a MS4 | Solo existe la rama `feat/active-tomorrow-menu` de MS4, sin PR; `ActiveTomorrowLineDto` en `main` de MS4 no tiene `Menu` |
