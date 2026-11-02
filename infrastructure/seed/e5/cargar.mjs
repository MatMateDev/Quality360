#!/usr/bin/env node
// Semilla E5 (secciones 10.2 y 10.4 de docs/backlog/e5-integracion-jira.md): los sprints
// «E5 Sprint 1» y «E5 Sprint 2» de la célula CEL-C. Son los que el Jira simulado (y un Jira real de
// prueba) nombran en sus issues, y «E5 Sprint 1» es el sprint de respaldo de la configuración base.
// Solo usa la API de Organización (POST /v1/interno/carga/{celulas,sprints}); nada de SQL.
//
// Uso:  npm run seed:e7 && npm run seed:e5       (E7 deja CEL-C y los usuarios; no hace falta E4)
// Requiere Organización con PERMITIR_CARGA_SEMILLA=true y el mismo X_Q360_SERVICIO_TOKEN
// (infrastructure/seed/mvp/.env.carga). Variable opcional: ORGANIZACION_URL (3001). Solo local.
//
// Idempotente: la célula y cada sprint se identifican por nombre; repetir no crea nada y no mueve
// las fechas de un sprint que ya existe. No crea HDU ni usuarios y no toca Integraciones.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const datos = JSON.parse(readFileSync(join(aqui, 'datos.json'), 'utf8'));

const ORG = (process.env.ORGANIZACION_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.X_Q360_SERVICIO_TOKEN;
if (!TOKEN) {
  console.error('Falta X_Q360_SERVICIO_TOKEN (ver infrastructure/seed/e5/README.md).');
  process.exit(2);
}

// «Hoy» es el día calendario en America/Santiago, como en seed:e4.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

async function servicio(metodo, ruta, cuerpo) {
  const r = await fetch(ORG + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-q360-servicio-token': TOKEN },
    body: JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no JSON */ }
  if (!r.ok) throw new Error(`${ruta}: HTTP ${r.status} ${json?.codigo ?? ''} ${json?.mensaje ?? texto.slice(0, 120)}`);
  return { status: r.status, json };
}

async function esperarOrganizacion() {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`${ORG}/health`)).ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`Organización no responde en ${ORG}/health. Levanta el stack con npm run local.`);
  process.exit(2);
}

try {
  await esperarOrganizacion();
  const celula = (await servicio('POST', '/v1/interno/carga/celulas', { nombre: datos.celula })).json.celula;
  const resumen = [];
  for (const s of datos.sprints) {
    const inicio = sumarDias(hoy, s.inicioDias);
    const fin = sumarDias(hoy, s.finDias);
    const r = await servicio('POST', '/v1/interno/carga/sprints', { nombre: s.nombre, inicio, fin, celulaId: celula.id });
    // Idempotencia por nombre: si ya existía en otra célula, no sirve para CEL-C (D120).
    if (r.json.sprint.celulaId && r.json.sprint.celulaId !== celula.id) {
      throw new Error(`${s.nombre} ya existe en otra célula: la regla sprint–célula (D120) lo hace inutilizable para ${datos.celula}.`);
    }
    resumen.push(`${s.nombre} (${r.json.creado ? 'creado' : 'ya existía'})`);
  }
  console.log(`Semilla E5 cargada en ${datos.celula}: ${resumen.join('; ')}.`);
} catch (e) {
  console.error(`Semilla E5 incompleta: ${e.message}`);
  process.exit(1);
}
