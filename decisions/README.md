# Decisiones de arquitectura (ADR)

Un ADR registra **una decisión que afecta a más de un servicio**: qué se decidió, por qué y qué se descartó. Las decisiones internas de un MS van en su ficha.

## Cuándo escribir uno
- Cambia cómo se comunican dos o más servicios (REST ↔ evento, contrato nuevo, service account nueva).
- Cambia una convención de la plataforma (nombres de colas, scopes, ruteo).
- Para cerrar un gap transversal de [../gaps/cross-service-gaps.md](../gaps/cross-service-gaps.md).

## Cómo
1. Copia [adr-template.md](./adr-template.md) como `NNNN-titulo-corto.md` (número correlativo de 4 dígitos).
2. Estado inicial `propuesto`. Ábrelo como PR y discútelo ahí.
3. Al aprobarlo, cambia a `aceptado`. Si después se reemplaza, `reemplazado por NNNN`.

## Índice
| # | Decisión | Estado |
|---|---|---|
| — | _(todavía no hay ADRs)_ | |

### Decisiones ya tomadas que convendría formalizar
- No REST between services (2026-10-31, course rule): the daily production order travels as the event `production-order-ready` (a full snapshot published by MS4; it had been a `GET /active-tomorrow` query instead of `ProductionOrderRequired`), and the other three former calls are events too. See [platform/communication.md](../platform/communication.md).
- Exchanges fanout no durables, topología centralizada en `nur-tricenter-local`.
- El gateway no autentica; cada servicio valida su JWT.
- Planes de MS2 indexados por **número de día**, no por fecha.
