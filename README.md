# Nur-Tricenter — Base de conocimiento

Contexto de **negocio y técnico** de toda la plataforma Nur-Tricenter, escrito por los owners de cada microservicio. Es la fuente para la **app visual del proyecto**, que va a mostrar el sistema completo con el foco del módulo del diplomado: **la comunicación entre microservicios**.

> **¿Eres owner de un MS y vienes a cargar tu contexto?** → [CONTRIBUTING.md](./CONTRIBUTING.md)

## Por dónde empezar
| Si quieres… | Lee |
|---|---|
| Entender el negocio y qué hace cada servicio | [platform/overview.md](./platform/overview.md) |
| Ver cómo está armada la plataforma (gateway, Consul, RabbitMQ, identity) | [platform/architecture.md](./platform/architecture.md) |
| **Entender cómo se comunican los servicios** (foco del módulo) | [platform/communication.md](./platform/communication.md) |
| Relacionar los conceptos del módulo con el código real | [course/module-focus.md](./course/module-focus.md) |
| JWT, scopes y service accounts | [platform/security.md](./platform/security.md) |
| Ver todos los eventos y contratos | [contracts/](./contracts/) |
| Saber qué falta o está roto entre servicios | [gaps/cross-service-gaps.md](./gaps/cross-service-gaps.md) |
| Levantar todo en local | [platform/local-stack.md](./platform/local-stack.md) |
| Buscar un término | [glossary.md](./glossary.md) |

## Estado de las fichas
| Servicio | Owner | Estado |
|---|---|---|
| MS1 — Pacientes | — | ⬜ sin empezar |
| MS2 — Catálogo de planes y recetas | Robert Perez Lino | ✅ [complete](./services/ms2-catalog/README.md) |
| MS3 — Contratación y producción | Luis Jesus Ferrufino | ✅ [complete](./services/ms3-contracting/README.md) |
| MS4 — Calendario de entregas | Franklin Andre Romero Padilla | ✅ [completa](./services/ms4-delivery-calendar/README.md) |
| MS5 — Logística y entregas | Andres Sebastian Guerrero Camacho | ✅ [complete](./services/ms5-logistics/README.md) |
| Identity | — | ⬜ sin empezar |
| API Gateway | — | ⬜ sin empezar |

Detalle y nombres de carpeta: [services/README.md](./services/README.md).

## Estructura
```
knowledge/
├── CONTRIBUTING.md        guía paso a paso para cargar tu MS
├── glossary.md            términos de negocio y técnicos
├── platform/              lo que es común a todos: negocio, arquitectura, comunicación, seguridad, stack local
├── contracts/             catálogo de eventos (events.yaml) + documento oficial de contratos (en preparación)
├── course/                conceptos del módulo ↔ evidencia en el proyecto
├── decisions/             ADRs: decisiones que afectan a más de un servicio
├── gaps/                  problemas entre servicios
├── templates/service/     PLANTILLA de ficha (se copia por cada MS)
├── services/<ms>/         una ficha por microservicio
├── schema/                JSON Schema de service.yaml y events.yaml
└── scripts/validate.mjs   validador (npm run validate; también corre en CI)
```

## Cómo está pensada
- **Markdown para personas** (`*.md`): explicaciones, diagramas Mermaid y decisiones.
- **YAML para máquinas** (`service.yaml`, `events.yaml`, `platform.yaml`): endpoints, llamadas y eventos estructurados. La app visual arma el grafo de comunicación desde aquí, sin parsear prosa.
- **Validado en cada PR**: un `service.yaml` que referencia un exchange inexistente o una cola mal nombrada no se mergea.

## Validar en local
```bash
npm install
npm run validate
```
