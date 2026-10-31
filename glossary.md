# Glosario

Términos del negocio y técnicos usados en toda la plataforma. Si tu servicio usa un término con un significado distinto, acláralo en su `domain.md`.

## Negocio
| Término | Significado | Servicio dueño |
|---|---|---|
| Paciente | Persona que recibe la alimentación a domicilio | MS1 |
| Plan nutricional (meal plan) | Plan de 15 o 30 días. Cada día (`PlanDay`, por **número** de día) tiene tiempos de comida con recetas y raciones | MS2 |
| Receta | Preparación compuesta de porciones de alimentos, con nutrientes calculados | MS2 |
| Tiempo de comida (meal time) | Desayuno, media mañana, almuerzo, merienda o cena dentro de un día del plan | MS2 |
| Porción (`Portion`) | Cantidad de un ingrediente dentro de una receta (decimal) | MS2 |
| Ración (`Ration`) | Cantidad de una receta dentro de un tiempo de comida (entero) | MS2 |
| `PlanAuthors` | Read model local de MS2 con los datos del autor del plan, proyectado desde `user-published` | MS2 |
| Contrato | Compra de un plan por un paciente; al pagarse, MS3 pide el calendario a MS4 | MS3 |
| Calendario de entregas | Secuencia de días de entrega de un paciente, uno por día del plan | MS4 |
| Día de entrega (`DeliveryDay`) | Una entrega concreta: fecha, dirección, menú, estado y evidencia | MS4 |
| Regla de 48h | No se puede reprogramar ni cancelar un día a menos de 48h de su fecha | MS4 |
| Orden de producción | Foto consolidada de todo lo que hay que producir para una fecha | MS4 (la consume MS3) |
| Orden de producción diaria (MS3) | Recetas y raciones totales que la cocina produce un día, armada con el menú de cada entrega de MS4. No es la orden de producción de MS4 | MS3 |
| Paquete | Entrega física en producción: se arma, se etiqueta y pasa control de calidad antes de liberarse a logística | MS3 |
| Service account | Usuario técnico con el mínimo de scopes (`ms3-service`, `ms4-service`); ya no lo usa ningún servicio (las llamadas servicio a servicio pasaron a eventos), solo la vista de seguridad de la demo | identity |
| Ruta | Conjunto de entregas asignadas a un repartidor en un día | MS5 |
| Repartidor (courier) | Persona que ejecuta la ruta | MS5 |
| Entrega / parada (`Delivery`) | Un paquete a llevar a una dirección dentro de una ruta. Entidad hija de la ruta en MS5; no confundir con el `DeliveryDay` de MS4 | MS5 |
| Paquete validado (`ValidatedPackage`) | Lo que se entrega: `PackageId`, `PatientId` y los datos de la etiqueta | MS5 |
| Sucursal / punto de partida (`branchCoordinates`) | Coordenada fija desde la que sale todo repartidor; origen de la secuencia de entrega | MS5 |
| Secuencia de entrega (`SequenceOrder`) | Orden de las paradas, calculado al iniciar la ruta con el vecino más cercano desde la sucursal | MS5 |
| Evidencia de entrega (`DeliveryConfirmation`) | Foto, firma y momento de la entrega. Hoy queda solo en MS5: `DeliveryCompleted` no la lleva y a MS4 solo llega la hora de entrega (X-01) | MS5 → MS4 |
| ClinicService | Nombre con que MS5 llama al servicio de contacto de pacientes de MS1 (`POST /api/v1/patients/contact-information`). MS5 dejó de llamarlo en MS5#4; el MS1 real nunca expuso ese endpoint | MS1 |
| Consulta inicial (`ConsultaInicial`) | Evaluación clínica de entrada (peso, altura, composición, antecedentes); se aprueba antes de armar el plan alimenticio | MS1 |
| Plan alimenticio (`PlanAlimenticio`) | Plan clínico del paciente en MS1 (15 o 30 días, vigente o vencido, con evaluaciones de control). No es el plan del catálogo de MS2 | MS1 |

## Técnico
| Término | Significado |
|---|---|
| API Gateway | Punto de entrada único (YARP). Rutea `/api/{servicio}/**` |
| Consul | Registro de servicios y health checks |
| Scope | Permiso dentro del JWT, formato `servicio.recurso:acción` |
| Service account | Usuario técnico de identity para llamadas servicio → servicio |
| Exchange fanout | Exchange de RabbitMQ que copia cada mensaje a todas sus colas |
| Cola `{consumidor}.{exchange}` | Convención de nombres: una cola por servicio consumidor y evento |
| Contrato de integración | Record del kernel `Nur.Tricenter.Integration` que define un evento |
| `EventType` | Nombre lógico del evento, formato `Agregado.Evento` |
| `CorrelationId` | Identificador que une todos los pasos de una misma operación entre servicios |
| Outbox | Tabla donde se guarda el evento en la misma transacción que el cambio; un worker lo publica después |
| Inbox | Tabla de mensajes ya procesados (por `Id`) para descartar duplicados |
| At-least-once | Garantía de entrega: el mensaje llega una o más veces, nunca cero |
| Idempotencia | Repetir la operación produce el mismo resultado que hacerla una vez |
| Proyección / read model | Copia local de datos de otro servicio, alimentada por eventos |
| Consistencia eventual | Las copias convergen con el tiempo, no al instante |
| ProblemDetails | Formato estándar de error HTTP (RFC 7807) |
| Kernel | Paquete NuGet compartido de la plataforma |
| `catalog.default` | Cola pasiva y durable de MS2 que acumula el historial completo de todo lo publicado (sink de auditoría) |
| `nurtricenter.default` | Sink equivalente de MS5: cola durable enlazada a sus 10 exchanges, declarada por su worker y nunca consumida |
| `nurtricenter` | Nombre de MS5 en Consul (y por eso su prefijo en el gateway, `/api/nurtricenter`) |
| `identity-service` | Nombre de identity en Consul; prefijo `/api/identity-service` |
| `platform:*` | Scope comodín del admin; al hacer login se expande a todos los scopes concretos del kernel |
| YARP | Reverse proxy de .NET que usa el gateway; arma sus rutas desde Consul |
