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
| ms2-gap-11 | Los handlers capturan toda excepción y la devuelven como `Result.Fail(ex.Message)`: una caída de BD responde `400`/`404` (no `5xx`) exponiendo el mensaje interno; `PUT /foods` responde `404` ante cualquier fallo | medium | — | abierto |
| ms2-gap-12 | Scopes `catalog.{food,recipe,mealPlan}:manage` definidos en el kernel pero sin endpoint que los exija; `CatalogRoutes` del kernel no coincide con las rutas reales | low | — | abierto |

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
- **Qué pasa:** el código default registra el servicio como `catalog-service` (`ServiceRegistrationOptions.DefaultServiceId`), pero `catalog.compose.yml` (plataforma) sobrescribe `ServiceRegistration__ServiceName` a `catalog`, que es el que determina el prefijo del gateway (`/api/catalog`). La ficha usa `catalog` como `consul_name` porque es lo que corre en la plataforma. Si se levanta con Consul pero sin ese override, quedaría `catalog-service` (prefijo `/api/catalog-service`); el `docker-compose.yml` standalone no configura Consul, así que ahí no se registra. El README del repo dice además "`ServiceName = catalog-service` (so the gateway routes `/api/catalog/**`)", lo cual no es cierto: con ese nombre el gateway rutearía `/api/catalog-service/**`.
- **Impacto:** el mismo binario se expone con prefijos distintos según el modo de despliegue; la documentación y los clientes asumen `/api/catalog`.
- **Qué haría falta:** unificar el nombre (probablemente `catalog`) y actualizar `platform/architecture.md`.

### ms2-gap-10 — Edición parcial no disponible
- **Qué pasa:** no hay comandos para editar nombre/instrucciones de una receta ni nombre/duración de un plan (solo se pueden crear). `Recipe.Update` y `MealPlan.Update` existen en el dominio pero no se exponen.
- **Impacto:** para cambiar un nombre hay que borrar y recrear (perdiendo asignaciones), o tocar la BD.
- **Qué haría falta:** endpoints `PUT /recipes` y `PUT /meal-plans/{id}` con sus scopes.

### ms2-gap-11 — Excepciones convertidas en 400/404
- **Qué pasa:** todos los handlers de comandos y queries envuelven su cuerpo en `try/catch (Exception)` y devuelven `Result.Fail(ex.Message)`. El controller traduce cualquier fallo a `400` (comandos y listados) o `404` (lecturas por id). `FoodController.Update` responde `NotFound` para **todo** `Result.Fail`, así que un `UnitOfMeasure` inválido o una `NutritionalInfo` inválida en `PUT /foods` devuelven `404`.
- **Impacto:** una caída de Postgres no se ve como `5xx`: `GET /meal-plans/{id}` devuelve `404` y MS4 lo trata como "plan inexistente"; el monitoreo por códigos HTTP no detecta la falla, y el mensaje interno de la excepción llega al cliente.
- **Qué haría falta:** distinguir errores de negocio de errores técnicos (dejar propagar las excepciones técnicas a un manejador global que responda `500`/`503` sin filtrar el mensaje) y mapear `PUT /foods` a `400`/`404` según el caso.

### ms2-gap-12 — Scopes `:manage` y `CatalogRoutes` sin uso
- **Qué pasa:** `Nur.Tricenter.Access` 1.1.0 define `catalog.food:manage`, `catalog.recipe:manage` y `catalog.mealPlan:manage` en `CatalogPermission.PermissionsList` (MS2 crea una policy por cada uno), pero ningún endpoint los exige. Además `CatalogRoutes` (documentación de rutas del kernel, que hoy nadie lee) usa `/api/catalog/foods` sin `/v1`, declara `PUT /foods/{id}` (el código expone `PUT /foods`) y omite `GET /foods/category/{category}` y `GET /recipes/{recipeId}/nutritional-info`.
- **Impacto:** bajo hoy; confunde a quien asigne scopes o lea el kernel como fuente de rutas.
- **Qué haría falta:** decidir si `:manage` reemplaza a `create`+`edit` (y usarlo) o eliminarlo; alinear `CatalogRoutes` con los controllers (cambio en `nur-tricenter-shared-kernels`).

## Inconsistencias doc ↔ código

En esta ficha se documentó **el código**.

| Dónde | La doc previa decía | El código hace |
|---|---|---|
| `gaps.md` (ficha previa) | "Sin tests en el repo de Catalog (0 tests)" | El repo tiene tests (`dotnet test Test/Test.csproj`): 369 métodos `[Fact]`/`[Theory]` en main ca0c9de (la cifra previa de "454 tests, todos verdes" no se re-verificó en la revisión transversal) |
| `messaging.md` (ficha previa) | `user-updated` consumido con handler pendiente | **No se consume**: no hay `AddRabbitMqConsumer` para `UserChanged`; la cola se acumula (X-06) |
| `gaps.md` (ficha previa) | "Gateway no aplica autorización por scopes" | Es por diseño de la plataforma (el gateway no valida; cada servicio valida su JWT). No es un gap de MS2 |
| `FoodController` (OpenAPI implícita) | `PUT /foods` devuelve 404 si falla | Correcto: devuelve **404 ante cualquier `Result.Fail`** (incluida validación); solo la validación de modelo de `[ApiController]` da 400. La versión anterior de esta ficha decía lo contrario (corregido el 2026-10-28, ver abajo) |
| `domain.md` (ficha previa) | "Food/Recipe/MealPlan no tienen estados" | Correcto, pero conviene aclarar que no hay máquina de estados ni bloqueos por fecha |
| `integrations.md` (ficha previa) | "MS2 no tiene llamadas salientes" | Correcto y se mantiene: no hay `HttpClient` ni adaptadores remotos |
| README del repo | Seed de "30 foods / 25 recipes / 2 planes" | Confirmado en `DbInitializer` (30 alimentos, 25 recetas, 2 planes) |
| README del repo | Kernels en 1.0.9 | `Directory.Packages.props` fija `Nur.Tricenter.Access/Integration/Observability/Security` en **1.1.0**. El README del repo quedó desactualizado |
| README del repo | Migraciones con `--migrate`, no en boot | Es el default (`Migrations:ApplyOnStartup=false`) y lo que hace el standalone (`webapi-migrate`), pero en la **plataforma** `catalog-api` migra en el arranque (`Migrations__ApplyOnStartup=true`) y `start-stack.*` corre además `--migrate` desde el host |
| README del repo | "`ServiceName = catalog-service` (so the gateway routes `/api/catalog/**`)" | Con `catalog-service` el gateway rutearía `/api/catalog-service/**`; `/api/catalog` sale del override `catalog` de `catalog.compose.yml` (ms2-gap-09) |
| `catalog.compose.yml` (comentario de seed) | El seed hace llegar eventos a los 5 exchanges, incluidos `recipe-updated` y `food-nutritional-info-updated` | El seed solo crea entidades: dispara `*Created`, no `RecipeUpdated` ni `FoodNutritionalInfoUpdated` (ver ms2-gap-02/03) |
| `MealPlanController.Create` (comentario) | "The gateway has already verified this token" | El gateway no valida JWT; lo valida MS2 con `AddSecurity` |
| `contracts/events.yaml` | `food-nutritional-info-updated` publicado por MS2 | El contrato y el handler existen, pero **no se dispara** en el código actual (ver ms2-gap-02) |

### Correcciones de la revisión transversal (2026-10-28)

Contra main `ca0c9de`. Cada fila es algo que **esta ficha** decía mal y se corrigió:

| Dónde (ficha) | Decía | El código hace |
|---|---|---|
| `gaps.md` | Kernels `Nur.Tricenter.*` en 1.0.9, "confirmado" | **1.1.0** en `Directory.Packages.props` |
| `service.yaml`, `api.md` | MS4 llama `GET /foods/{id}` y `GET /recipes/{id}` | MS4 solo llama `GET /api/catalog/v1/meal-plans/{id}` (`CatalogOptions.MealPlanPathTemplate`); ningún MS llama a `/foods` ni `/recipes` |
| `api.md` | Health en `GET /api/v1/health` | `MapHealthChecks("/health")`, fuera de `/api/v1` |
| `api.md` | `GET /meal-plans` devuelve `MealPlanDto` con días, meal times y recetas | Lista plana `{ id, name, durationType, totalDays, mealsPerDay, authorId, authorName }` (`ListMealPlansHandler`); la composición de `GET /meal-plans/{id}` también trae `authorId`/`authorName` |
| `service.yaml` | `workers: [catalog-workerservice, catalog-migrate]` | No existe `catalog-migrate`: en la plataforma migra `catalog-api` al arrancar (más el `--migrate` del host en `start-stack.*`); en standalone el one-shot se llama `webapi-migrate` |
| `service.yaml` | `consul_name: catalog-service` | La plataforma registra **`catalog`** (`catalog.compose.yml`); `catalog-service` es solo el default del código (ms2-gap-09) |
| `api.md`, `integrations.md` | Excepción no controlada / BD caída → `500` | Los handlers capturan toda excepción → `400`/`404` con el mensaje (ms2-gap-11) |
| `api.md` | `PUT /foods`: validación fallida → `400` | Cualquier `Result.Fail` → `404` |
| `api.md` | Sin mención de los scopes `:manage` | Existen en el kernel y no los usa ningún endpoint (ms2-gap-12) |
| `README.md` | Operaciones dispara migraciones y seed por REST | No hay endpoint: migraciones por CLI (`--migrate`) o `Migrations__ApplyOnStartup`; seed por `Seed__Enabled` |
| `README.md` | Consumidores de los eventos: MS1/MS3/MS4/MS5 | Hay colas para los cuatro, pero solo consumen MS3 y MS4 |
| `messaging.md` | Texto basura de un agente después del diagrama Mermaid | Eliminado |