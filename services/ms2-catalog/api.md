# API — MS2 Catálogo

Base (servicio): `/api/v1/...` · Vía gateway: `/api/catalog/v1/...`. Autenticación: JWT Bearer (cualquier autenticado a nivel de clase en MealPlan; Food/Recipe por policy).

## Foods (`/api/v1/foods`)
| Método | Ruta | Scope | Resumen |
|---|---|---|---|
| POST | `/api/v1/foods` | `catalog.food:create` | Crear alimento. |
| GET | `/api/v1/foods/{id}` | `catalog.food:read` | Obtener alimento por id. |
| GET | `/api/v1/foods` | `catalog.food:read` | Listar paginado (`page`, `pageSize`). |
| GET | `/api/v1/foods/category/{category}` | `catalog.food:read` | Buscar por categoría (paginado). |
| PUT | `/api/v1/foods` | `catalog.food:edit` | Actualizar alimento. |

## Recipes (`/api/v1/recipes`)
| Método | Ruta | Scope | Resumen |
|---|---|---|---|
| POST | `/api/v1/recipes` | `catalog.recipe:create` | Crear receta. |
| POST | `/api/v1/recipes/ingredients` | `catalog.recipe:edit` | Agregar ingrediente a receta. |
| DELETE | `/api/v1/recipes/{recipeId}/ingredients/{foodId}` | `catalog.recipe:edit` | Quitar ingrediente. |
| GET | `/api/v1/recipes/{id}` | `catalog.recipe:read` | Obtener receta (con ingredientes). |
| GET | `/api/v1/recipes` | `catalog.recipe:read` | Listar paginado. |
| GET | `/api/v1/recipes/{recipeId}/nutritional-info` | `catalog.recipe:read` | Info nutricional de la receta. |

## Meal plans (`/api/v1/meal-plans`)
| Método | Ruta | Scope | Resumen |
|---|---|---|---|
| POST | `/api/v1/meal-plans` | `catalog.mealPlan:create` | Crear plan (author = `sub` del token). |
| POST | `/api/v1/meal-plans/meal-times` | `catalog.mealPlan:edit` | Agregar meal time a un plan. |
| POST | `/api/v1/meal-plans/assign-recipes` | `catalog.mealPlan:edit` | Asignar receta a meal time. |
| DELETE | `/api/v1/meal-plans/{mealPlanId}/meal-times/{mealTimeId}/recipes/{recipeId}` | `catalog.mealPlan:edit` | Quitar receta. |
| GET | `/api/v1/meal-plans/{mealPlanId}` | `catalog.mealPlan:read` | Composición del plan. |
| GET | `/api/v1/meal-plans` | `catalog.mealPlan:read` | Listar planes. |

## Health
| Método | Ruta | Scope | Resumen |
|---|---|---|---|
| GET | `/health` | (anónimo) | Health check de Consul. |
