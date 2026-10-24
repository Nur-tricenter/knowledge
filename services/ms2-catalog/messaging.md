# Messaging — MS2 Catálogo

## Eventos publicados
| Exchange | Contrato | Trigger | Cola pasiva (sink) |
|---|---|---|---|
| `food-published` | `FoodPublished` | Food creado | `catalog.default` (bind a todos) |
| `food-nutritional-info-updated` | `FoodNutritionalInfoUpdated` | Datos nutricionales cambiados | (idem) |
| `recipe-published` | `RecipePublished` | Recipe creado | (idem) |
| `recipe-updated` | `RecipeUpdated` | Recipe actualizado / ingrediente añadido o removido | (idem) |
| `meal-plan-published` | `MealPlanPublished` | Meal plan creado | (idem) |

Exchanges: fanout, no durables. Outbox: `SaveInOutboxWhen*` + `OutboxProcessor<DomainEvent>` en WorkerService.

## Eventos consumidos
| Exchange | Cola | Contrato | Handler | Efecto | Idempotente |
|---|---|---|---|---|---|
| `user-published` | `ms2.user-published` | `UserPublished` | `UserPublishedConsumer` (Tracing → Idempotent → proyección) | Upsert `PlanAuthors` (read model) | Sí (inbox) |
| `user-updated` | `ms2.user-updated` | `UserChanged` | (no implementado) | Pendiente | — |

## Notas
- `recipe-published`/`recipe-updated` llevan solo identidad e instrucciones (sin ingredientes): el domain event se dispara al crear la receta, antes de adjuntar ingredientes.
- `catalog.default` es sink pasivo (nunca consumido) que acumula el historial completo.
- `TracingConsumer` está fuera del inbox para que duplicados salteados aún dejen traza.
