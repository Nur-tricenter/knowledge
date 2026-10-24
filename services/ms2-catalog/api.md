# API — MS2

- **Prefijo interno:** `/api/v1`
- **Prefijo en el gateway:** `/api/catalog/v1` (el gateway quita `/api/catalog` y agrega `/api`).
- **Autenticación:** JWT de nur-tricenter-identity con el scope del endpoint. Sin token → 401; con otro scope → 403. Los endpoints de meal-plans exigen además autenticación a nivel de clase (`[Authorize]` sin policy), porque el autor se lee del claim `sub`.
- **Formato de respuesta:** envoltorio `ApiResponse<T>` (`{ success, message, data, errors }`). Los errores de negocio llegan como `200`? No: los handlers devuelven `Result.Fail` y el controller responde `400` (commands) o `404` (lecturas). La validación de modelo de `[ApiController]` responde `400 ProblemDetails` antes de llegar al handler. No hay middleware global de excepciones: una excepción no controlada se convierte en `500` plano.
- **Ids:** `foodId`, `recipeId`, `mealPlanId`, `mealTimeId` son GUID. `page`/`pageSize` son enteros.
- **Enums:** `UnitOfMeasure` y `MealTimeType` viajan como **entero** (`1..8` y `1..5`), no como string.
- **Documentación interactiva:** Swagger/OpenAPI (Swashbuckle) cuando `Swagger:Enabled=true`.

## Resumen

| Método | Ruta | Llamado por | Scope | Idempotente |
|---|---|---|---|---|
| POST | `/foods` | Frontend | `catalog.food:create` | no |
| GET | `/foods/{id}` | Frontend, MS4 | `catalog.food:read` | sí |
| GET | `/foods` | Frontend | `catalog.food:read` | sí |
| GET | `/foods/category/{category}` | Frontend | `catalog.food:read` | sí |
| PUT | `/foods` | Frontend | `catalog.food:edit` | sí |
| POST | `/recipes` | Frontend | `catalog.recipe:create` | no |
| POST | `/recipes/ingredients` | Frontend | `catalog.recipe:edit` | no |
| DELETE | `/recipes/{recipeId}/ingredients/{foodId}` | Frontend | `catalog.recipe:edit` | no |
| GET | `/recipes/{id}` | Frontend, MS4 | `catalog.recipe:read` | sí |
| GET | `/recipes` | Frontend | `catalog.recipe:read` | sí |
| GET | `/recipes/{recipeId}/nutritional-info` | Frontend | `catalog.recipe:read` | sí |
| POST | `/meal-plans` | Frontend | `catalog.mealPlan:create` | no |
| POST | `/meal-plans/meal-times` | Frontend | `catalog.mealPlan:edit` | no |
| POST | `/meal-plans/assign-recipes` | Frontend | `catalog.mealPlan:edit` | no |
| DELETE | `/meal-plans/{mealPlanId}/meal-times/{mealTimeId}/recipes/{recipeId}` | Frontend | `catalog.mealPlan:edit` | no |
| GET | `/meal-plans/{mealPlanId}` | Frontend, MS4 | `catalog.mealPlan:read` | sí |
| GET | `/meal-plans` | Frontend | `catalog.mealPlan:read` | sí |
| GET | `/health` | Consul | (anónimo) | sí |

Todas las rutas son relativas al servicio (`/api/v1/...`). En el gateway se antepone `/api/catalog` (p. ej. `POST /api/catalog/v1/foods`).

## Detalle por endpoint

### `POST /api/v1/foods`
**Para qué:** crear un alimento (ingrediente) con sus facts nutricionales.

```json
// request
{ "name": "Arroz", "category": "Cereales", "unitOfMeasure": 1, "quantity": 100, "calories": 130, "protein": 2.7, "carbs": 28, "fat": 0.3 }
// 200
{ "success": true, "message": "Food created successfully", "data": "11111111-2222-3333-4444-555555555555" }
```
| Código | Cuándo |
|---|---|
| 200 | Creado. El nombre se guarda en **mayúsculas** (`ToUpperInvariant`). |
| 400 | Validación fallida (nombre/categoría vacíos, `Quantity <= 0`, `UnitOfMeasure` fuera de 1..8, modelo inválido) |

Publica `food-published` (outbox) al crearse.

### `GET /api/v1/foods/{id}`
```json
// 200
{ "success": true, "data": { "id": "…", "name": "ARROZ", "category": "CEREALES", "unitOfMeasure": "Gram", "quantity": 100, "calories": 130, "protein": 2.7, "carbs": 28, "fat": 0.3 } }
```
`404` si no existe.

### `GET /api/v1/foods?page=&pageSize=`
Lista paginada. `page` por defecto 1, `pageSize` por defecto 10. Devuelve `PagedList<FoodDto>` con `items`, `totalCount`, `page`, `pageSize`.

### `GET /api/v1/foods/category/{category}`
Búsqueda por categoría (paginada, mismos parámetros `page`/`pageSize`). La categoría se compara tal cual se envía (el handler filtra por el valor guardado, que está en mayúsculas).

### `PUT /api/v1/foods`
```json
// request
{ "foodId": "…guid…", "name": "Arroz integral", "category": "Cereales", "unitOfMeasure": 1, "quantity": 100, "calories": 111, "protein": 2.6, "carbs": 23, "fat": 0.9 }
// 200
{ "success": true, "message": "Food updated successfully" }
```
| Código | Cuándo |
|---|---|
| 200 | Actualizado. |
| 400 | Validación fallida o `UnitOfMeasure` inválido. |
| 404 | Alimento inexistente. |

**Importante:** `UpdateFood` dispara el evento de dominio `FoodUpdated` (que se proyecta al read model) pero **no** publica `food-nutritional-info-updated` ni ningún otro contrato de integración. Ver [gaps.md](./gaps.md).

### `POST /api/v1/recipes`
```json
// request
{ "name": "Ensalada cesar", "instructions": "Mezclar lechuga, pollo y aderezo." }
// 200
{ "success": true, "message": "Recipe created successfully", "data": "…guid…" }
```
`400` si las instrucciones están vacías o el nombre vacío. Publica `recipe-published` (outbox) con `RecipeId`, `Name` e `Instructions` (sin ingredientes).

### `POST /api/v1/recipes/ingredients`
```json
// request
{ "recipeId": "…guid…", "ingredients": [ { "foodId": "…guid…", "quantity": 100 } ] }
// 200
{ "success": true, "message": "1 ingredient(s) added successfully" }
```
| Código | Cuándo |
|---|---|
| 200 | Ingredientes agregados. |
| 400 | Receta o alimento inexistente, ingrediente duplicado, porción ≤ 0, o lista vacía (`[MinLength(1)]`). |

No publica un evento de integración propio: dispara `IngredientAddedToRecipe` (interno) que se proyecta al read model. El contrato `recipe-updated` **no** se publica por este camino (ver [gaps.md](./gaps.md)).

### `DELETE /api/v1/recipes/{recipeId}/ingredients/{foodId}`
Quita un ingrediente. `200` si existía; `400` si la receta no existe o el ingrediente no estaba asignado.

### `GET /api/v1/recipes/{id}`
Devuelve la receta con sus ingredientes (`RecipeDto`):
```json
{ "success": true, "data": { "id": "…", "name": "Ensalada cesar", "instructions": "…", "ingredients": [ { "foodId": "…", "foodName": "LECHUGA", "quantity": 100 } ] } }
```
`404` si no existe.

### `GET /api/v1/recipes?page=&pageSize=`
Lista paginada de recetas (`RecipeDto` con ingredientes).

### `GET /api/v1/recipes/{recipeId}/nutritional-info`
Calcula la info nutricional total de la receta a partir de sus ingredientes y los facts del alimento:
```json
{ "success": true, "data": { "quantity": 1, "calories": 120.5, "protein": 8.2, "carbs": 5.1, "fat": 7.0 } }
```
`404` si la receta no existe. `NutritionalInfo` usa `Quantity = 1` como base del total.

### `POST /api/v1/meal-plans`
**Para qué:** crear un plan de comida de 15 o 30 días. El autor se toma del claim `sub` del token validado.

```json
// request
{ "name": "Plan keto 15 días", "durationType": "FIFTEEN_DAYS", "mealsPerDay": 3 }
// 200
{ "success": true, "message": "Meal plan created successfully", "data": "…guid…" }
```
| Código | Cuándo |
|---|---|
| 200 | Creado. Se generan 15 `PlanDay` con `DayNumber` 1..15. |
| 400 | Validación fallida (`DurationType` distinto de `FIFTEEN_DAYS`/`THIRTY_DAYS`, nombre vacío, etc.) o token sin `sub` válido (`authorId = Guid.Empty`, que `PlanAuthorId.Create` rechaza). |

Publica `meal-plan-published` (outbox) con `PlanId`, `Name`, `DurationType` (string del enum, p. ej. `FIFTEEN_DAYS`), `TotalDays` y `MealsPerDay`. **No** incluye ingredientes ni composición.

### `POST /api/v1/meal-plans/meal-times`
```json
// request
{ "mealPlanId": "…guid…", "dayNumber": 1, "mealTimeType": 1 }
// 200
{ "success": true, "message": "Meal time added successfully" }
```
`mealTimeType`: 1=Breakfast, 2=MidMorning, 3=Lunch, 4=Snack, 5=Dinner. `400` si el plan no existe, el día no existe, o ya hay un tiempo de comida con ese `Order` en el día.

### `POST /api/v1/meal-plans/assign-recipes`
```json
// request
{ "mealPlanId": "…guid…", "mealTimeId": "…guid…", "recipes": [ { "recipeId": "…guid…", "rationQuantity": 1 } ] }
// 200
{ "success": true, "message": "Recipe(s) assigned successfully" }
```
`400` si el plan, el meal time o la receta no existen, o la receta ya está asignada a ese meal time. `rationQuantity` debe ser > 0.

### `DELETE /api/v1/meal-plans/{mealPlanId}/meal-times/{mealTimeId}/recipes/{recipeId}`
Quita la asignación de una receta. `200` si existía; `400` si el plan/meal time no existe o la receta no estaba asignada.

### `GET /api/v1/meal-plans/{mealPlanId}`
Composición completa del plan (read model), usada por MS4:
```json
{ "success": true, "data": { "mealPlanId": "…", "name": "Plan keto 15 días", "days": [ { "dayNumber": 1, "mealTimes": [ { "mealTimeId": "…", "name": "Breakfast", "order": 1, "recipes": [ { "recipeId": "…", "recipeName": "Ensalada cesar", "ration": { "quantity": 1 }, "ingredients": [ { "foodId": "…", "foodName": "LECHUGA", "portion": { "quantity": 100 } } ] } ] } ] } ] } }
```
`404` si no existe.

### `GET /api/v1/meal-plans`
Lista de planes (`MealPlanDto` con días, meal times y recetas asignadas, sin ingredientes).

### `GET /api/v1/health`
Health check anónimo para Consul. Devuelve el estado de salud en JSON (escrito por `HealthReportWriter`).

## Mapeo de errores

No hay middleware global de excepciones; el mapeo es el que implementa cada controller:

| Situación | HTTP |
|---|---|
| Handler devuelve `Result.Fail` en un comando (validación de negocio, regla rota, `UnitOfMeasure` inválido, etc.) | 400 |
| Handler devuelve `Result.Fail` en una lectura (entidad no encontrada) | 404 |
| Validación de modelo de `[ApiController]` (campos requeridos, tipos, `[MinLength]`) | 400 `ProblemDetails` |
| Sin token o token inválido | 401 |
| Token válido sin el scope requerido | 403 |
| Excepción no controlada | 500 (plano) |