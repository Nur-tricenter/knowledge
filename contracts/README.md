# Contratos de integración

> 🚧 **En preparación.** El grupo está completando el **documento oficial de eventos y contratos** de todos los microservicios. Cuando esté listo, se agrega en esta carpeta (p. ej. `contracts/catalogo-eventos-y-contratos.md`) y se reconcilia con `events.yaml`.

## Qué hay hoy
| Archivo | Contenido | Fuente |
|---|---|---|
| [events.yaml](./events.yaml) | 22 exchanges: publisher, contrato, `EventType`, payload y colas enlazadas | `nur-tricenter-local/topology/rabbitmq-definitions.json` + `nur-tricenter-shared-kernels/nur-tricenter-integration/Messages/**` |

Los **contratos REST** de cada servicio viven en su ficha: `services/<ms>/api.md` (humano) y `services/<ms>/service.yaml → endpoints` (máquina).

## Sobre común de todo evento
Todos los eventos heredan de `IntegrationMessageContract` (`Nur.Tricenter.Integration`):

```csharp
public abstract record IntegrationMessageContract
{
    Guid Id;               // clave de idempotencia del consumidor (inbox)
    DateTime CreatedAt;
    string? CorrelationId; // une el evento con la traza que lo originó
    string? Source;        // servicio que lo publicó
}
// Cada contrato agrega: string EventType => "Agregado.Evento" + su payload
```

## Reglas para agregar o cambiar un evento
1. El contrato se define en `nur-tricenter-shared-kernels` (`Messages/<Contexto>/`), **nunca** como copia local en un servicio.
2. El exchange (fanout, no durable) y las colas `{consumidor}.{exchange}` se piden por PR a `nur-tricenter-local/topology/rabbitmq-definitions.json`.
3. Se actualiza `events.yaml` aquí y el `service.yaml` del publisher y de cada consumidor.
4. `npm run validate` comprueba que publishers, consumidores y colas coincidan entre sí.
5. **Cambios compatibles:** solo agregar campos opcionales. Renombrar o quitar un campo rompe a los consumidores: en ese caso, crea un evento nuevo.

## Cómo reconciliar el documento oficial cuando llegue
- Si el documento define un evento que no está en `events.yaml`: agrégalo con `queues: []` y anótalo en `gaps/cross-service-gaps.md` hasta que exista en la topología.
- Si hay diferencias de nombre o payload con el kernel, **el kernel manda** (es lo que compila). La diferencia se registra como gap.
