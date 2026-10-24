# Dominio — MS2 Catálogo

## Agregados

- **Food** (raíz): alimento/ingrediente con categoría, facts nutricionales por 100 unidades y unidad de medida. Eventos: `FoodCreated`, `FoodUpdated`, `FoodNutritionalInfoUpdated`.
- **Recipe** (raíz): receta con nombre, instrucciones e ingredientes (RecipeIngredient). Eventos: `RecipeCreated`, `RecipeUpdated`, `IngredientAddedToRecipe`, `IngredientRemovedFromRecipe`.
- **MealPlan** (raíz): plan de comida con duración, días (PlanDay), meal times (MealTime) y asignaciones de recetas (RecipeAssignment). Eventos: `MealPlanCreated`, `MealPlanUpdated`, `MealTimeAddedToPlan`, `RecipeAssignedToMealTime`, `RecipeRemovedFromMealTime`.

## Entidades internas
- `RecipeIngredient` (Food + Portion + Ration).
- `PlanDay`, `MealTime`, `RecipeAssignment`.

## Value Objects
- `FoodName`, `CategoryName`, `NutritionalInfo` (calorías, proteína, grasa, carbs + cantidad + unidad), `UnitOfMeasure`, `RecipeName`, `MealPlanName`, `DurationType`, `PlanDuration`, `Portion`, `Ration`, `MealTimeType`, `PlanAuthorId`.

## Reglas de negocio
- El autor de un plan se lee del claim `sub` del token (nunca del body).
- Una receta se publica como evento al crearse, **antes** de tener ingredientes; los ingredientes se agregan después.
- Los valores nutricionales viajan como `double` en los contratos (el dominio los tiene como `decimal`).

## Estados
- Food/Recipe/MealPlan no tienen estados explícitos en el dominio actual (sin máquina de estados documentada). Los ingredientes se agregan/remueven incrementalmente.

## Inconsistencias doc ↔ código
- Ninguna documentada. (Si se detectan, anotar aquí.)
