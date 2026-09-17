#!/usr/bin/env node
// Carga idempotente de la semilla MVP (E1 y E2) contra Organización.
// Uso: X_Q360_SERVICIO_TOKEN=... [ORGANIZACION_URL=http://localhost:3001] [CONTRASENA_DEMO=...] node infrastructure/seed/mvp/cargar.mjs
// Organización debe correr con PERMITIR_CARGA_SEMILLA=true y el mismo token. Solo para entorno local.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.ORGANIZACION_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.X_Q360_SERVICIO_TOKEN;
if (!TOKEN) { console.error('Falta X_Q360_SERVICIO_TOKEN.'); process.exit(2); }

const datos = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'datos.json'), 'utf8'));
// En la nube se usa otra contraseña de demo, pasada por variable de entorno (nunca versionada).
const CONTRASENA = process.env.CONTRASENA_DEMO ?? datos.contrasenaDemo;
if (CONTRASENA.length < 12) { console.error('CONTRASENA_DEMO debe tener al menos 12 caracteres.'); process.exit(2); }
const ORDEN = ['PENDIENTE', 'DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE'];
const resumen = {};
const rechazos = [];
const anotar = (entidad, clave) => { resumen[entidad] ??= {}; resumen[entidad][clave] = (resumen[entidad][clave] ?? 0) + 1; };

async function llamar(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-q360-servicio-token': TOKEN },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* respuesta no JSON */ }
  return { ok: r.ok, status: r.status, json, texto };
}

async function paso(entidad, id, fn) {
  try {
    const r = await fn();
    if (!r.ok) {
      anotar(entidad, 'rechazados');
      rechazos.push(`${entidad} ${id}: HTTP ${r.status} ${r.json?.codigo ?? ''} ${r.json?.mensaje ?? r.texto.slice(0, 120)}`);
      return null;
    }
    return r.json;
  } catch (e) {
    anotar(entidad, 'rechazados');
    rechazos.push(`${entidad} ${id}: ${e.message}`);
    return null;
  }
}

async function esperarOrganizacion() {
  // Hasta 150 s: en Render gratis un servicio dormido tarda ~1 minuto en despertar.
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(BASE + '/health')).ok) return; } catch { /* aún no responde */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`Organización no responde en ${BASE}/health.`); process.exit(2);
}

await esperarOrganizacion();
const ids = { celula: {}, sprint: {}, usuario: {}, hdu: {} };
const creadoEnEstaCorrida = new Set();

for (const c of datos.celulas) {
  const j = await paso('celulas', c.clave, () => llamar('POST', '/v1/interno/carga/celulas', { nombre: c.nombre }));
  if (j) { ids.celula[c.clave] = j.celula.id; anotar('celulas', j.creado ? 'creados' : 'existentes'); }
}
for (const s of datos.sprints) {
  const j = await paso('sprints', s.clave, () => llamar('POST', '/v1/interno/carga/sprints', { nombre: s.nombre, inicio: s.inicio, fin: s.fin }));
  if (j) { ids.sprint[s.clave] = j.sprint.id; anotar('sprints', j.creado ? 'creados' : 'existentes'); }
}
for (const u of datos.usuarios) {
  const cuerpo = { nombre: u.nombre, correo: u.correo, rol: u.rol, contrasenaInicial: CONTRASENA };
  if (u.activo === false) cuerpo.activo = false;
  const j = await paso('usuarios', u.clave, () => llamar('POST', '/v1/interno/carga/usuarios', cuerpo));
  if (j) {
    ids.usuario[u.clave] = j.usuario.id;
    if (j.creado) creadoEnEstaCorrida.add(u.clave);
    anotar('usuarios', j.creado ? 'creados' : 'existentes');
  }
}
for (const sup of datos.supervisiones) {
  const analistaId = ids.usuario[sup.analista];
  if (!analistaId) continue;
  // Historial completo solo si el analista nació en esta corrida; si no, solo se confirma el supervisor final.
  const tramos = creadoEnEstaCorrida.has(sup.analista) ? sup.historial : sup.historial.slice(-1);
  for (const t of tramos) {
    const cuerpo = { qeId: ids.usuario[t.qe] };
    if (t.motivo) cuerpo.motivo = t.motivo;
    const j = await paso('supervisiones', `${sup.analista}→${t.qe}`, () => llamar('PUT', `/v1/analistas/${analistaId}/supervisor`, cuerpo));
    if (j) anotar('supervisiones', j.cambio === false ? 'sin cambios' : 'aplicadas');
  }
}
const estadoHdu = {};
for (const h of datos.hdu) {
  const cuerpo = { codigo: h.codigo, titulo: h.titulo, celulaId: ids.celula[h.celula], sprintId: ids.sprint[h.sprint], prioridad: h.prioridad, qeResponsableId: ids.usuario[h.qeResponsable] };
  const j = await paso('hdu', h.codigo, () => llamar('POST', '/v1/interno/carga/hdu', cuerpo));
  if (j) { ids.hdu[h.clave] = j.hdu.id; estadoHdu[h.clave] = j.hdu.estado; anotar('hdu', j.creado ? 'creados' : 'existentes'); }
}
for (const a of datos.asignacionesAnalista) {
  const hduId = ids.hdu[a.hdu];
  if (!hduId) continue;
  const cuerpo = { analistaId: ids.usuario[a.analista] };
  if (a.motivo) cuerpo.motivo = a.motivo;
  const j = await paso('asignaciones', `${a.hdu}→${a.analista}`, () => llamar('PUT', `/v1/hdu/${hduId}/analista`, cuerpo));
  if (j) anotar('asignaciones', j.cambio === false ? 'sin cambios' : 'aplicadas');
}
for (const e of datos.estadosHdu) {
  const hduId = ids.hdu[e.hdu];
  if (!hduId) continue;
  let actual = ORDEN.indexOf(estadoHdu[e.hdu] ?? 'PENDIENTE');
  const objetivo = ORDEN.indexOf(e.estado);
  if (actual >= objetivo) { anotar('estados', 'ya en destino'); continue; }
  while (actual < objetivo) {
    const siguiente = ORDEN[actual + 1];
    const j = await paso('estados', `${e.hdu}→${siguiente}`, () => llamar('POST', `/v1/hdu/${hduId}/estado`, { estado: siguiente }));
    if (!j) break;
    actual += 1;
  }
  if (actual === objetivo) anotar('estados', 'aplicados');
}

console.log(`Semilla MVP contra ${BASE}`);
for (const [entidad, cuentas] of Object.entries(resumen)) {
  console.log(`  ${entidad.padEnd(14)} ${Object.entries(cuentas).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
}
if (rechazos.length) {
  console.log(`Rechazos (${rechazos.length}):`);
  for (const r of rechazos) console.log(`  - ${r}`);
  process.exit(1);
}
console.log('Sin rechazos.');
