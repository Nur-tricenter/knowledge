<!--
PLANTILLA — API expuesta (lo que OTROS consumen de ti).
Preguntas guía:
  - ¿Qué rutas expones, quién las llama y con qué scope?
  - ¿Qué recibe y qué devuelve cada una (ejemplo JSON mínimo)?
  - ¿Qué códigos de error devuelve y en qué caso?
  - ¿Es idempotente? ¿Qué pasa si el cliente reintenta?
Cada endpoint de esta página tiene que estar también en service.yaml → endpoints.
-->

# API — MSN

- **Prefijo interno:** `/api/v1`
- **Prefijo en el gateway:** `/api/<consul-name>/v1`
- **Autenticación:** JWT de nur-tricenter-identity con el scope indicado por endpoint.
- **Formato de error:** ProblemDetails (RFC 7807) — confirma si tu servicio lo usa.

## Resumen
| Método | Ruta | Llamado por | Scope | Idempotente |
|---|---|---|---|---|
| | | | | |

## Detalle por endpoint

### `MÉTODO /api/v1/ruta`
**Para qué:**
**Llamado por:**
**Scope:**

Request:
```json
{}
```
Response `200`:
```json
{}
```
Errores:
| Código | Cuándo |
|---|---|
| 400 | |
| 404 | |

## Mapeo de errores
<!-- Excepción de dominio/aplicación → código HTTP. Archivo donde se configura. -->
| Excepción | HTTP |
|---|---|
| | |
