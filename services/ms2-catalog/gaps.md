# Gaps — MS2

| Id | Gap | Severidad | Depende de | Estado |
|---|---|---|---|---|
| ms2-gap-01 | Cola `ms2.user-updated` declarada sin consumidor (no se proyectan cambios de usuario) | medium | identity | abierto (X-06) |
| ms2-gap-02 | `food-nutritional-info-updated` está cableado (handler + publish) pero es inalcanzable: `UpdateNutritionalInfo` no tiene invocador | medium | — | abierto |
| ms2-gap-03 | `recipe-updated` está cableado pero es inalcanzable vía API: no hay endpoint de edición de receta y alta/baja de ingredientes no lo dispara | medium | — | abierto |
| ms2-gap-04 | `RecipePublished`/`RecipeUpdated` no transportan ingredientes ni composición; no existe evento "receta completa" | medium | consumidores | abierto |
| ms2-gap-05 | Cambios de alimento (`FoodUpdated`) solo se proyectan al read model; no hay contrato de integración para ellos | medium | consumidores | abierto |
| ms2-gap-06 | Cambios de plan (`MealPlanUpdated`, `MealTimeAddedToPlan`, `RecipeAssignedToMealTime`, `RecipeRemovedFromMealTime`) no se publican externamente | low | consumidores | abierto |
| ms2-gap-07 | Autorización por objeto (BOLA): cualquier token con scope `edit` modifica cualquier recurso; no se valida propiedad ni autoría | high | identity / MS1 | abierto (X-08) |
| ms2-gap-08 | `GetMealPlanComposition` consulta receta e ingredientes en bucle (N+1) contra el read model | low | — | abierto |
| ms2-gap-09 | Nombre en Consul inconsistente: default del código `catalog-service`, override de plataforma `catalog` (define el prefijo del gateway) | low | gateway | abierto |
| ms2-gap-10 | No hay endpoints para editar nombre/instrucciones de receta ni nombre/duración de plan | low | — | abierto |

## Detalle

### ms2-gap-01 — Cambios de usuario no se propagan al catálogo
- **Qué pasa:** MS2 solo proyecta `user-published` (alta inicial) en `PlanAuthors`. Si identity publica `user-updated` (cambio de nombre, email, scopes o desactivación), MS2 no lo recibe: la cola `ms2.user-updated` se acumula sin consumidor.
- **Impacto:** `PlanAuthors` queda con datos viejos (nombre/email) tras una edición de usuario; un usuario desactivado sigue apareciendo como autor válido.
- **Qué haría falta:** implementar `UserChangedConsumer` (Tracing → Idempotent → proyección) y decidir si un usuario desactivado invalida los planes existentes.

### ms2-gap-02 / ms2-gap-03 — Eventos cableados pero inalcanzables
- **Qué pasa:** existen `SaveInOutboxWhenFoodNutritionalInfoUpdated`, `PublishIntegrationEventWhenFoodNutritionalInfoUpdated`, `SaveInOutboxWhenRecipeUpdated` y `PublishIntegrationEventWhenRecipeUpdated`, pero ningún caso de uso dispara los eventos de dominio correspondientes (`Food.UpdateNutritionalInfo` y `Recipe.Update` no se invocan desde ningún handler). Alta/baja de ingredientes dispara `IngredientAddedToRecipe`/`IngredientRemovedFromRecipe`, que se proyectan al read model pero **no** se traducen a `recipe-updated`.
- **Impacto:** los consumidores (MS4 incluido, que renombra recetas en días abiertos) nunca reciben esos eventos, aunque la topología y el contrato existan. El contrato `recipe-updated` es, en la práctica, un evento muerto.
- **Qué haría falta:** agregar comandos `UpdateFoodNutritionalInfo` y `UpdateRecipe` (o traducir los eventos de ingrediente a `recipe-updated`), y decidir el contrato (hoy `RecipeUpdated` lleva solo `RecipeId, Name, Instructions`).

### ms2-gap-04 — Sin "receta completa"
- **Qué pasa:** `RecipePublished` y `RecipeUpdated` llevan solo identidad e instrucciones. Los ingredientes se agregan después y nunca se notifican.
- **Impacto:** un consumidor que necesite la receta con sus ingredientes debe llamar `GET /recipes/{id}` (síncrono) en lugar de reconstruirla por eventos.
- **Qué haría falta:** un evento `RecipeCompositionChanged` (o incluir ingredientes en `recipe-updated`), más la decisión de si el evento se dispara por ingrediente o por receta.

### ms2-gap-05 / ms2-gap-06 — Cambios internos no publicados
- **Qué pasa:** `FoodUpdated` (nombre, categoría, unidad, nutrición) se proyecta al read model pero no tiene handler de publicación. Lo mismo para `MealPlanUpdated`, `MealTimeAddedToPlan`, `RecipeAssignedToMealTime` y `RecipeRemovedFromMealTime`.
- **Impacto:** los consumidores solo se enteran del alta inicial (`food-published`, `meal-plan-published`, `recipe-published`); cualquier edición posterior no se propaga. MS4 no se entera de que un plan cambió después de publicado (aunque hoy no lo necesita, porque resuelve la composición por GET).
- **Qué haría falta:** decidir qué cambios son relevantes para otros servicios y agregar los contratos correspondientes en `Nur.Tricenter.Integration`.

### ms2-gap-07 — Autorización por objeto
- **Qué pasa:** los scopes controlan el *tipo* de cliente, no la *propiedad*. Un token con `catalog.food:edit` puede editar cualquier alimento; con `catalog.mealPlan:edit`, cualquier plan.
- **Impacto:** un usuario autenticado con el scope adecuado puede modificar recursos de otro usuario. El autor del plan se guarda (`AuthorId`), pero ningún endpoint lo valida.
- **Qué haría falta:** mapear el `sub` del token al recurso (el plan guarda `AuthorId`; alimentos y recetas no tienen autor) y validar propiedad en los endpoints de edición. Requiere decisión de negocio (¿un admin puede editar todo?).

### ms2-gap-08 — N+1 en la composición
- **Qué pasa:** `GetMealPlanCompositionHandler` consulta la receta y sus ingredientes dentro del bucle de días/tiempos de comida.
- **Impacto:** latencia alta para planes grandes; MS4 lo llama una vez por plan distinto por corrida, así que el costo se amortiza, pero sigue siendo ineficiente.
- **Qué haría falta:** un `Include`/proyección única o un read model desnormalizado.

### ms2-gap-09 — Nombre en Consul
- **Qué pasa:** el código default registra el servicio como `catalog-service`, pero `catalog.compose.yml` (plataforma) sobrescribe `ServiceRegistration__ServiceName` a `catalog`, que es el que determina el prefijo del gateway (`/api/catalog`). En modo Aspire/standalone queda `catalog-service` (prefijo `/api/catalog-service`).
- **Impacto:** el mismo binario se expone con prefijos distintos según el modo de despliegue; la documentación y los clientes asumen `/api/catalog`.
- **Qué haría falta:** unificar el nombre (probablemente `catalog`) y actualizar `platform/architecture.md`.

### ms2-gap-10 — Edición parcial no disponible
- **Qué pasa:** no hay comandos para editar nombre/instrucciones de una receta ni nombre/duración de un plan (solo se pueden crear). `Recipe.Update` y `MealPlan.Update` existen en el dominio pero no se exponen.
- **Impacto:** para cambiar un nombre hay que borrar y recrear (perdiendo asignaciones), o tocar la BD.
- **Qué haría falta:** endpoints `PUT /recipes` y `PUT /meal-plans/{id}` con sus scopes.

## Inconsistencias doc ↔ código

En esta ficha se documentó **el código**.

| Dónde | La doc previa decía | El código hace |
|---|---|---|
| `gaps.md` (ficha previa) | "Sin tests en el repo de Catalog (0 tests)" | El repo tiene **454 tests** (`dotnet test Test/Test.csproj`), todos verdes |
| `messaging.md` (ficha previa) | `user-updated` consumido con handler pendiente | **No se consume**: no hay `AddRabbitMqConsumer` para `UserChanged`; la cola se acumula (X-06) |
| `gaps.md` (ficha previa) | "Gateway no aplica autorización por scopes" | Es por diseño de la plataforma (el gateway no valida; cada servicio valida su JWT). No es un gap de MS2 |
| `FoodController` (OpenAPI implícita) | `PUT /foods` devuelve 404 si falla | Devuelve **404 solo si el alimento no existe**; si falla la validación devuelve **400** |
| `domain.md` (ficha previa) | "Food/Recipe/MealPlan no tienen estados" | Correcto, pero conviene aclarar que no hay máquina de estados ni bloqueos por fecha |
| `integrations.md` (ficha previa) | "MS2 no tiene llamadas salientes" | Correcto y se mantiene: no hay `HttpClient` ni adaptadores remotos |
| README del repo | Seed de "30 foods / 25 recipes / 2 planes" | Confirmado en `DbInitializer` (30 alimentos, 25 recetas, 2 planes) |
| README del repo | Kernels en 1.0.9 | Confirmado en `Directory.Packages.props` (`Nur.Tricenter.*` 1.0.9) |
| README del repo | Migraciones con `--migrate`, no en boot | Confirmado: `Migrations:ApplyOnStartup` por defecto `false` |
| `contracts/events.yaml` | `food-nutritional-info-updated` publicado por MS2 | El contrato y el handler existen, pero **no se dispara** en el código actual (ver ms2-gap-02) |