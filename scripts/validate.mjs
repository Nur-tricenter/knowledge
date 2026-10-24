#!/usr/bin/env node
// Valida la base de conocimiento:
//   1. contracts/events.yaml contra schema/events.schema.json
//   2. cada services/<carpeta>/service.yaml contra schema/service.schema.json
//   3. reglas cruzadas: id ↔ carpeta, exchanges conocidos, colas {consumidor}.{exchange} declaradas
// Uso: npm run validate            (falla con código 1 si hay errores; las advertencias no fallan)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ajv = new Ajv2020({ allErrors: true, strict: false });
const errors = [];
const warnings = [];

const load = (rel) => parse(readFileSync(join(root, rel), 'utf8'));
const check = (schemaRel, data, label) => {
  const validate = ajv.compile(JSON.parse(readFileSync(join(root, schemaRel), 'utf8')));
  if (!validate(data)) {
    for (const e of validate.errors) errors.push(`${label}: ${e.instancePath || '(raíz)'} ${e.message}`);
  }
};

// 1. Catálogo de eventos
const events = load('contracts/events.yaml');
check('schema/events.schema.json', events, 'contracts/events.yaml');
const exchanges = new Map((events.exchanges ?? []).map((x) => [x.name, x]));

// 2 y 3. Fichas de servicio
const servicesDir = join(root, 'services');
const folders = readdirSync(servicesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
const seenIds = new Set();

for (const { name: folder } of folders) {
  const rel = `services/${folder}/service.yaml`;
  if (!existsSync(join(root, rel))) {
    errors.push(`${rel}: falta el archivo (copia templates/service/service.yaml)`);
    continue;
  }
  const svc = load(rel);
  check('schema/service.schema.json', svc, rel);
  if (!svc || typeof svc !== 'object') continue;

  if (!folder.startsWith(`${svc.id}-`)) errors.push(`${rel}: id "${svc.id}" no coincide con la carpeta "${folder}" (debe empezar con "${svc.id}-")`);
  if (seenIds.has(svc.id)) errors.push(`${rel}: id "${svc.id}" repetido en otra carpeta`);
  seenIds.add(svc.id);

  const raw = readFileSync(join(root, rel), 'utf8');
  if (/TODO|<[a-z-]+>/i.test(raw)) {
    (svc.status === 'complete' ? errors : warnings).push(`${rel}: quedan marcadores TODO o <placeholder>`);
  }

  for (const pub of svc.events_published ?? []) {
    const x = exchanges.get(pub.exchange);
    if (!x) errors.push(`${rel}: publica en "${pub.exchange}", que no existe en contracts/events.yaml`);
    else if (x.publisher !== svc.id) errors.push(`${rel}: publica en "${pub.exchange}", pero events.yaml dice que el publisher es ${x.publisher}`);
  }

  for (const sub of svc.events_consumed ?? []) {
    const x = exchanges.get(sub.exchange);
    if (!x) { errors.push(`${rel}: consume "${sub.exchange}", que no existe en contracts/events.yaml`); continue; }
    if (sub.queue !== `${svc.id}.${sub.exchange}`) errors.push(`${rel}: la cola "${sub.queue}" no sigue la convención {consumidor}.{exchange} → "${svc.id}.${sub.exchange}"`);
    if (!x.queues.includes(sub.queue)) warnings.push(`${rel}: la cola "${sub.queue}" no figura en events.yaml (¿falta declararla en la topología?)`);
    if (x.contract !== sub.contract) errors.push(`${rel}: contrato "${sub.contract}" distinto al de events.yaml ("${x.contract}") para "${sub.exchange}"`);
  }
}

for (const w of warnings) console.warn(`⚠  ${w}`);
for (const e of errors) console.error(`✖  ${e}`);
console.log(`\n${folders.length} servicio(s), ${exchanges.size} exchange(s) — ${errors.length} error(es), ${warnings.length} advertencia(s).`);
process.exit(errors.length ? 1 : 0);
