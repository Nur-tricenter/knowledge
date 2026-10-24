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
- La orden de producción diaria se obtiene por **consulta** (`GET /active-tomorrow`) y no por el evento `ProductionOrderRequired`.
- Exchanges fanout no durables, topología centralizada en `nur-tricenter-local`.
- El gateway no autentica; cada servicio valida su JWT.
- Planes de MS2 indexados por **número de día**, no por fecha.
