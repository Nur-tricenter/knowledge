# Guía: cómo cargar el contexto de tu microservicio

Esta guía es para **cada owner de un MS**. Te toma entre 1 y 3 horas, según lo documentado que esté tu repo. Al final, tu servicio queda descrito con el mismo formato que los demás, y la app visual del proyecto lo puede dibujar.

> **Ejemplo completo para copiar el estilo:** [`services/ms4-delivery-calendar/`](./services/ms4-delivery-calendar/). Ábrelo en otra pestaña mientras completas el tuyo.

---

## Antes de empezar
Necesitas:
- Git y **Node.js 20 o superior** (`node -v`).
- Acceso de escritura a `Nur-tricenter/knowledge` (o un fork).
- Tu repo del MS a mano: **lo que se documenta es lo que hace el código**, no lo que decía el plan original.

---

## Paso 1 — Clona y crea tu rama
```bash
git clone https://github.com/Nur-tricenter/knowledge.git
cd knowledge
npm install
git checkout -b ms<N>/context        # p. ej. ms2/context
```

## Paso 2 — Copia la plantilla
Elige el nombre de carpeta: `<id>-<nombre-corto>`. El `<id>` es `ms1`…`ms5`, `identity` o `gateway`.

```bash
# bash / Git Bash / macOS / Linux
cp -r templates/service services/ms2-catalog
```
```powershell
# PowerShell
Copy-Item -Recurse templates/service services/ms2-catalog
```

Te quedan 8 archivos para llenar en `services/ms2-catalog/`.

## Paso 3 — Llena los archivos EN ESTE ORDEN
El orden importa: cada archivo usa lo que descubriste en el anterior. Cada plantilla trae **preguntas guía** en comentarios `<!-- -->`; respóndelas y después borra los comentarios.

| # | Archivo | Qué pones | Dónde lo encuentras en tu repo |
|---|---|---|---|
| 1 | `README.md` | Propósito de negocio, responsabilidades, **lo que NO hace**, vecinos | Tu README, la consigna del diplomado |
| 2 | `domain.md` | Agregados, estados, reglas de negocio, lenguaje propio | `Domain/` (entidades, enums, excepciones) |
| 3 | `api.md` | Cada endpoint: quién lo llama, scope, request/response, errores | Controllers/endpoints, `RequireAuthorization`, el manejador de excepciones |
| 4 | `integrations.md` | A quién llamas por HTTP, con qué identidad, qué pasa si falla | `HttpClient`, adaptadores de `Infrastructure/`, `appsettings` |
| 5 | `messaging.md` | Eventos que publicas y consumes, outbox/inbox | Outbox, consumidores, `rabbitmq-definitions.json` |
| 6 | `flows.md` | 3 a 6 casos de uso de punta a punta, con diagramas de secuencia | Commands/handlers, tests de aceptación |
| 7 | `gaps.md` | Lo que falta, lo que no anda, las diferencias entre doc y código | Todo lo anterior + tus TODOs |
| 8 | `service.yaml` | Los datos de 3–7 en formato estructurado | Copia desde lo que ya escribiste |

### Preguntas clave por archivo (si no sabes qué escribir)
- **README:** si mañana se borra tu servicio, ¿qué deja de poder hacer el negocio?
- **domain:** ¿qué regla, si se rompe, genera un problema real a un paciente?
- **api:** ¿qué devuelves si te llaman dos veces con lo mismo?
- **integrations:** ¿por qué esta llamada es síncrona y no un evento?
- **messaging:** ¿qué hecho de tu dominio le podría interesar a otro servicio, aunque hoy nadie lo escuche?
- **flows:** ¿qué flujo mostrarías en la presentación para explicar la comunicación entre servicios?
- **gaps:** ¿qué te da vergüenza que alguien descubra? Escríbelo: para eso está.

## Paso 4 — Reglas de contenido
1. **Español** en la prosa. En `service.yaml` las **claves quedan en inglés** (las lee la app). Nombres de código (clases, rutas, scopes) tal cual están en el código.
2. **El código manda.** Si la doc vieja dice otra cosa, documenta el código y anota la diferencia en `gaps.md` → "Inconsistencias doc ↔ código".
3. **No inventes.** Si algo no existe o no lo sabes, no lo rellenes: va a `gaps.md`.
4. **Diagramas en Mermaid** (GitHub los renderiza). Flecha continua = REST, punteada = evento.
5. **Rutas:** en `api.md` y `service.yaml → endpoints`, la ruta **del servicio** (`/api/v1/...`). En `sync_calls`, la ruta **tal como sale** (con el prefijo del gateway: `/api/catalog/v1/...`).
6. **Eventos:** el exchange, la cola y el contrato tienen que coincidir con [`contracts/events.yaml`](./contracts/events.yaml). Si falta tu evento ahí, agrégalo en el mismo PR.
7. **Nada de secretos:** ni claves JWT, ni contraseñas, ni connection strings reales.

## Paso 5 — Valida
```bash
npm run validate
```
- `✖` **errores:** hay que corregirlos (campo faltante, cola mal nombrada, exchange que no existe…).
- `⚠` **advertencias:** se pueden mergear, pero revísalas. Mientras queden `TODO` o `<placeholder>` en tu `service.yaml`, deja `status: draft`.

El mismo chequeo corre automáticamente en el PR (GitHub Actions).

## Paso 6 — Actualiza los índices
En el mismo PR:
- [`services/README.md`](./services/README.md): carpeta, owner y estado de tu fila.
- [`platform/overview.md`](./platform/overview.md) → "Mapa de servicios": link a tu ficha y estado.
- [`course/module-focus.md`](./course/module-focus.md): agrega en la columna "Evidencia" lo que tu servicio aporta a cada concepto.
- [`gaps/cross-service-gaps.md`](./gaps/cross-service-gaps.md): si tu servicio resuelve o descubre un gap entre servicios.
- [`glossary.md`](./glossary.md): términos nuevos de tu dominio.
- [`platform/security.md`](./platform/security.md): tus scopes y tus service accounts.

## Paso 7 — Abre el PR
```bash
git add services/ms2-catalog services/README.md platform course gaps glossary.md contracts
git commit -m "docs(ms2): add MS2 catalog context"
git push -u origin ms2/context
gh pr create --title "docs(ms2): contexto de MS2" --body "Ficha de MS2. Checklist de CONTRIBUTING completo."
```
**No se hace push directo a `main`**: todo entra por PR, con al menos una revisión de otro integrante.

---

## Checklist — definición de terminado
Marca `status: complete` en `service.yaml` solo si:
- [ ] Los 8 archivos están llenos, sin comentarios de plantilla ni `TODO`.
- [ ] Cada endpoint expuesto está en `api.md` **y** en `service.yaml`, con su scope y quién lo llama.
- [ ] Cada llamada HTTP saliente está en `integrations.md` **y** en `sync_calls`, con su `auth`.
- [ ] Cada evento publicado o consumido está en `messaging.md`, en `service.yaml` y en `contracts/events.yaml`.
- [ ] Hay al menos un diagrama de secuencia que cruza la frontera de tu servicio.
- [ ] `gaps.md` tiene la sección "Inconsistencias doc ↔ código" (aunque diga "ninguna").
- [ ] `npm run validate` sin errores.
- [ ] Índices actualizados (paso 6).

---

## Atajo: hacerlo con Claude Code (u otra IA) leyendo tu repo
Abre Claude Code **en la carpeta de tu MS** (no en esta) y pega el siguiente prompt, ajustando las rutas:

```text
Lee este repositorio completo (código primero, docs después) y genera la ficha de este microservicio
para la base de conocimiento de Nur-Tricenter, que está en ../knowledge.

1. Copia ../knowledge/templates/service a ../knowledge/services/<id>-<nombre>.
2. Llena los 8 archivos siguiendo ../knowledge/CONTRIBUTING.md (pasos 3 y 4) y respondiendo las
   preguntas guía de cada plantilla. Usa ../knowledge/services/ms4-delivery-calendar como ejemplo de
   estilo y profundidad.
3. Escribe la prosa en español. Las claves de service.yaml van en inglés, y los nombres de código tal cual.
4. El código manda: si la doc del repo contradice al código, documenta el código y anota la
   diferencia en gaps.md.
5. No inventes: si algo no está en el código, va a gaps.md.
6. Revisa que los exchanges, colas y contratos coincidan con ../knowledge/contracts/events.yaml.
7. Corre `npm run validate` en ../knowledge y corrige los errores.
8. Actualiza los índices del paso 6 de CONTRIBUTING.md.
No hagas commit: muéstrame un resumen para que lo revise.
```
**Revisa lo que genere.** Tú eres el responsable de que la ficha sea correcta.

---

## Preguntas frecuentes
**Mi servicio no publica eventos.** Deja `events_published: []` y explícalo en `messaging.md`. "No publico" también es información.

**Mi servicio no tiene repo todavía (MS1, MS3).** Crea la ficha igual con `status: draft`, documentando lo que **se espera** de él según los otros servicios (quién lo llama, qué colas tiene declaradas). Márcalo claramente como "diseño, no implementado" en el README de la ficha.

**El validador dice que mi cola no está en `events.yaml`.** Agrégala a `queues` del exchange correspondiente. Si tampoco está en `nur-tricenter-local/topology/rabbitmq-definitions.json`, anótalo como gap: hay que pedirla allá.

**Encontré un error en la ficha de otro servicio.** Abre un issue o un PR y menciona a su owner. No la reescribas sin avisar.
