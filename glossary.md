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
| Contrato | Compra de un plan por un paciente; origina el calendario | MS3 |
| Calendario de entregas | Secuencia de días de entrega de un paciente, uno por día del plan | MS4 |
| Día de entrega (`DeliveryDay`) | Una entrega concreta: fecha, dirección, menú, estado y evidencia | MS4 |
| Regla de 48h | No se puede reprogramar ni cancelar un día a menos de 48h de su fecha | MS4 |
| Orden de producción | Foto consolidada de todo lo que hay que producir para una fecha | MS4 (la consume MS3) |
| Ruta | Conjunto de entregas asignadas a un repartidor en un día | MS5 |
| Repartidor (courier) | Persona que ejecuta la ruta | MS5 |
| Evidencia de entrega | Foto/firma y momento de la entrega | MS5 → MS4 |

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
