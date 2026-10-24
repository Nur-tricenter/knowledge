# Gaps — MS2 Catálogo

## Inconsistencias doc ↔ código
- Ninguna conocida documentada. (Anotar aquí si se detectan.)

## Deuda / pendientes
- Consumidor de `user-updated` (`UserChanged`) no implementado en Catalog (cola `ms2.user-updated` declarada pero sin handler).
- `RecipePublished`/`RecipeUpdated` no transportan ingredientes: no existe evento "receta completa". Decisión de modelado pendiente.
- Gateway no aplica autorización por scopes (auth diferida); los scopes se enforce en los controllers.
- Sin tests en el repo de Catalog (0 tests; Inventory/Orders sí tienen).
- Seed de 30 foods / 25 recipes / 2 plans solo si `Seed:Enabled = true`.

## Dependencias bloqueantes
- Ninguna identificada para los flujos actuales.
