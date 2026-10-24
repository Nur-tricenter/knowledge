# Integraciones síncronas — MS2 Catálogo

## Llamadas salientes
Ninguna. MS2 es productor de eventos y proveedor de datos por REST; no llama a otros microservicios de forma síncrona. (MS4 lo consulta a MS2, no al revés.)

## Llamadas entrantes relevantes
- MS4 (calendario) consulta `GET /api/catalog/v1/meal-plans/{planId}` y recetas para resolver menús. Autenticación: service account `ms4-service` con scope `catalog.mealPlan:read` (login en Identity).
- Frontend/admin vía gateway para CRUD.

## Notas
- La autorización se enforce dentro de cada controller con `[Authorize(Policy = ...)]`; el gateway hoy no aplica scopes (auth diferida).
- El author de un plan se toma del claim `sub` del JWT validado.
