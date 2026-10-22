#!/usr/bin/env node
// Fixture E7 (sección 3 de docs/backlog/e7-bandejas-por-rol.md): células CEL-A/B/C, usuarios
// ADM1, QE1, QE2, ANA1-ANA4, LID1, LID2, AUD1 e INACT1, y las HDU H1-H8 con el estado de su
// checklist. Idempotente: se puede repetir sin duplicar ni retroceder nada.
//
// Uso:  npm run seed:e7
// Requiere Organización (PERMITIR_CARGA_SEMILLA=true) y Certificaciones levantadas, y estas
// variables (o infrastructure/seed/mvp/.env.carga): X_Q360_SERVICIO_TOKEN, SUPABASE_ANON_KEY,
// y opcionalmente ORGANIZACION_URL, CERTIFICACIONES_URL, SUPABASE_URL, CONTRASENA_DEMO.
//
// Los valores esperados de la sección 3 (10 activos, 8 HDU, ...) solo se cumplen sobre una base
// vacía: si ya se cargó la semilla MVP (Patricia, Carla...), esos usuarios se suman a los conteos.
// Solo para entorno local: usa las cuentas de demo y la contraseña de demo.
//
// Las HDU llevan el código E7-H1..E7-H8 (H1..H8 del backlog). Las operaciones del checklist son las
// reales de Certificaciones, con la sesión de cada persona; nada se escribe en la base a mano.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// La llave pública de Supabase local se toma de SUPABASE_ANON_KEY o, si falta, del portal (apps/web/.env.local).
function llavePublica() {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
  const archivo = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/.env.local');
  if (!existsSync(archivo)) return undefined;
  return readFileSync(archivo, 'utf8').match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
}

const ORG = (process.env.ORGANIZACION_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const CERT = (process.env.CERTIFICACIONES_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const SUPABASE = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '');
const TOKEN_SERVICIO = process.env.X_Q360_SERVICIO_TOKEN;
const ANON = llavePublica();
const CONTRASENA = process.env.CONTRASENA_DEMO ?? 'Quality360Demo#2025';
if (!TOKEN_SERVICIO || !ANON) {
  console.error('Faltan X_Q360_SERVICIO_TOKEN y SUPABASE_ANON_KEY (ver infrastructure/seed/e7/README.md).');
  process.exit(2);
}

const CLAVES = ['PLAN_PRUEBAS', 'DASHBOARD', 'CASOS_PRUEBA', 'APROBACION_CASOS', 'EJECUCION', 'EVIDENCIAS', 'DEFECTOS', 'APROBACION_UAT', 'CERTIFICADO', 'CIERRE_PRUEBAS'];
const ESTADOS = ['PENDIENTE', 'DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE', 'CERRADA'];

const USUARIOS = [
  { clave: 'adm1', nombre: 'ADM1 Administrador', rol: 'ADMINISTRADOR' },
  { clave: 'qe1', nombre: 'QE1 Quality Engineer', rol: 'QE' },
  { clave: 'qe2', nombre: 'QE2 Quality Engineer', rol: 'QE' },
  { clave: 'ana1', nombre: 'ANA1 Analista', rol: 'ANALISTA_QA' },
  { clave: 'ana2', nombre: 'ANA2 Analista', rol: 'ANALISTA_QA' },
  { clave: 'ana3', nombre: 'ANA3 Analista', rol: 'ANALISTA_QA' },
  { clave: 'ana4', nombre: 'ANA4 Analista sin QE', rol: 'ANALISTA_QA' },
  { clave: 'lid1', nombre: 'LID1 Líder CEL-A y CEL-B', rol: 'LIDER_QA', celulas: ['CEL-A', 'CEL-B'] },
  { clave: 'lid2', nombre: 'LID2 Líder sin células', rol: 'LIDER_QA', celulas: [] },
  { clave: 'aud1', nombre: 'AUD1 Auditor', rol: 'AUDITOR' },
  { clave: 'inact1', nombre: 'INACT1 QE desactivado', rol: 'QE', activo: false },
].map((u) => ({ ...u, correo: `${u.clave}@quality360.local` }));

const SUPERVISIONES = [['ana1', 'qe1'], ['ana2', 'qe1'], ['ana3', 'qe2']];

// [clave, célula, QE, analista, estado]; `checklist` = hasta qué entregable llega y cómo.
const HDU = [
  { h: 'H1', celula: 'CEL-A', qe: 'qe1', analista: 'ana1', estado: 'EN_EJECUCION', prioridad: 'ALTA', checklist: { aprobados: 3, porAprobar: 1 } },
  { h: 'H2', celula: 'CEL-A', qe: 'qe1', analista: 'ana2', estado: 'EN_EJECUCION', prioridad: 'MEDIA', checklist: { aprobados: 1, rechazarSiguiente: 'Falta evidencia de datos' } },
  { h: 'H3', celula: 'CEL-B', qe: 'qe2', analista: 'ana3', estado: 'PENDIENTE', prioridad: 'MEDIA' },
  { h: 'H4', celula: 'CEL-C', qe: 'qe2', analista: 'ana3', estado: 'DISENO_PRUEBAS', prioridad: 'BAJA' },
  { h: 'H5', celula: 'CEL-A', qe: 'qe1', analista: null, estado: 'PENDIENTE', prioridad: 'MEDIA' },
  { h: 'H6', celula: 'CEL-B', qe: 'qe1', analista: 'ana1', estado: 'EN_EJECUCION', prioridad: 'BAJA', checklist: { aprobados: 8 } },
  { h: 'H7', celula: 'CEL-A', qe: 'qe2', analista: 'ana3', estado: 'CERRADA', prioridad: 'ALTA', checklist: { aprobados: 10, cierraCon: 'adm1' } },
  { h: 'H8', celula: 'CEL-C', qe: 'qe1', analista: 'ana2', estado: 'PENDIENTE_CIERRE', prioridad: 'MEDIA', checklist: { aprobados: 10 } },
];

const resumen = [];
const rechazos = [];

async function http(base, metodo, ruta, { cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no JSON */ }
  return { ok: r.ok, status: r.status, json, texto };
}

const servicio = (metodo, ruta, cuerpo) => http(ORG, metodo, ruta, { cuerpo, cabeceras: { 'x-q360-servicio-token': TOKEN_SERVICIO } });

async function sesion(clave) {
  const u = USUARIOS.find((x) => x.clave === clave);
  const r = await http(SUPABASE, 'POST', '/auth/v1/token?grant_type=password', { cuerpo: { email: u.correo, password: CONTRASENA }, cabeceras: { apikey: ANON } });
  if (!r.ok) throw new Error(`No se pudo iniciar sesión como ${clave}: HTTP ${r.status}`);
  return r.json.access_token;
}
const sesiones = new Map();
async function como(clave) {
  if (!sesiones.has(clave)) sesiones.set(clave, await sesion(clave));
  return { authorization: `Bearer ${sesiones.get(clave)}` };
}

function exigir(r, contexto) {
  if (!r.ok) throw new Error(`${contexto}: HTTP ${r.status} ${r.json?.codigo ?? ''} ${r.json?.mensaje ?? r.texto.slice(0, 120)}`);
  return r.json;
}

async function esperar(base, nombre) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/health')).ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`${nombre} no responde en ${base}/health.`);
  process.exit(2);
}

/** Lleva el checklist de la HDU al punto pedido, usando las operaciones reales y retomando donde quedó. */
async function avanzarChecklist(hdu, ids) {
  const { checklist } = hdu;
  const id = ids.hdu[hdu.h];
  const analista = await como(hdu.analista);
  const qe = await como(hdu.qe);
  const enlace = { evidencia: { tipo: 'ENLACE', url: `https://jira.quality360.local/browse/${hdu.h}` } };
  const estado = async () => exigir(await http(CERT, 'GET', `/v1/hdu/${id}/entregables`, { cabeceras: qe }), `checklist ${hdu.h}`);

  for (let i = 0; i < checklist.aprobados; i++) {
    const clave = CLAVES[i];
    const actual = (await estado()).entregables.find((e) => e.clave === clave);
    if (actual.estado === 'APROBADO') continue;
    if (clave === 'CERTIFICADO') {
      exigir(await http(CERT, 'POST', `/v1/hdu/${id}/certificado`, { cabeceras: qe }), `certificado ${hdu.h}`);
      continue;
    }
    if (actual.estado === 'PENDIENTE') exigir(await http(CERT, 'POST', `/v1/hdu/${id}/entregables/${clave}/marcar`, { cuerpo: enlace, cabeceras: analista }), `marcar ${clave} ${hdu.h}`);
    exigir(await http(CERT, 'POST', `/v1/hdu/${id}/entregables/${clave}/aprobar`, { cabeceras: qe }), `aprobar ${clave} ${hdu.h}`);
  }

  const siguiente = CLAVES[checklist.aprobados];
  if (checklist.porAprobar || checklist.rechazarSiguiente) {
    const actual = (await estado()).entregables.find((e) => e.clave === siguiente);
    if (actual.estado === 'PENDIENTE' && actual.observacion === null) {
      exigir(await http(CERT, 'POST', `/v1/hdu/${id}/entregables/${siguiente}/marcar`, { cuerpo: enlace, cabeceras: analista }), `marcar ${siguiente} ${hdu.h}`);
      if (checklist.rechazarSiguiente) {
        exigir(await http(CERT, 'POST', `/v1/hdu/${id}/entregables/${siguiente}/rechazar`, { cuerpo: { comentario: checklist.rechazarSiguiente }, cabeceras: qe }), `rechazar ${siguiente} ${hdu.h}`);
      }
    }
  }
}

async function main() {
  await esperar(ORG, 'Organización');
  await esperar(CERT, 'Certificaciones');

  const ids = { celula: {}, usuario: {}, hdu: {} };
  for (const nombre of ['CEL-A', 'CEL-B', 'CEL-C']) {
    const j = exigir(await servicio('POST', '/v1/interno/carga/celulas', { nombre }), `célula ${nombre}`);
    ids.celula[nombre] = j.celula.id;
  }
  const sprint = exigir(await servicio('POST', '/v1/interno/carga/sprints', { nombre: 'Sprint E7', inicio: '2026-10-01', fin: '2026-10-31', celulaId: ids.celula['CEL-A'] }), 'sprint E7');

  for (const u of USUARIOS) {
    const cuerpo = { nombre: u.nombre, correo: u.correo, rol: u.rol, contrasenaInicial: CONTRASENA };
    if (u.activo === false) cuerpo.activo = false;
    if (u.celulas?.length) cuerpo.celulaIds = u.celulas.map((c) => ids.celula[c]);
    const j = exigir(await servicio('POST', '/v1/interno/carga/usuarios', cuerpo), `usuario ${u.clave}`);
    ids.usuario[u.clave] = j.usuario.id;
  }
  resumen.push(`usuarios ${USUARIOS.length}`, 'células 3');

  for (const [analista, qe] of SUPERVISIONES) {
    exigir(await servicio('PUT', `/v1/analistas/${ids.usuario[analista]}/supervisor`, { qeId: ids.usuario[qe] }), `supervisión ${analista}`);
  }

  for (const hdu of HDU) {
    const j = exigir(
      await servicio('POST', '/v1/interno/carga/hdu', {
        codigo: `E7-${hdu.h}`,
        titulo: `Historia E7 ${hdu.h}`,
        celulaId: ids.celula[hdu.celula],
        sprintId: sprint.sprint.id,
        prioridad: hdu.prioridad,
        qeResponsableId: ids.usuario[hdu.qe],
      }),
      `HDU ${hdu.h}`,
    );
    ids.hdu[hdu.h] = j.hdu.id;
    // Una HDU ya cerrada no admite cambios: si el analista ya es el correcto, no se toca (idempotencia).
    if (hdu.analista && j.hdu.analista?.id !== ids.usuario[hdu.analista]) exigir(await servicio('PUT', `/v1/hdu/${j.hdu.id}/analista`, { analistaId: ids.usuario[hdu.analista] }), `analista ${hdu.h}`);
  }

  for (const hdu of HDU) {
    const id = ids.hdu[hdu.h];
    // Se lleva la HDU hasta PENDIENTE_CIERRE con la credencial de servicio; CERRADA la pide el Administrador.
    const destino = ESTADOS.indexOf(hdu.estado === 'CERRADA' ? 'PENDIENTE_CIERRE' : hdu.estado);
    const detalle = await http(ORG, 'GET', `/v1/hdu/${id}`, { cabeceras: await como('adm1') });
    let actual = ESTADOS.indexOf(exigir(detalle, `detalle ${hdu.h}`).estado);
    while (actual < destino) {
      exigir(await servicio('POST', `/v1/hdu/${id}/estado`, { estado: ESTADOS[actual + 1] }), `estado ${hdu.h}`);
      actual += 1;
    }
    if (hdu.checklist) await avanzarChecklist(hdu, ids);
    if (hdu.estado === 'CERRADA' && actual < ESTADOS.indexOf('CERRADA')) {
      exigir(await http(ORG, 'POST', `/v1/hdu/${id}/estado`, { cuerpo: { estado: 'CERRADA' }, cabeceras: await como(hdu.checklist.cierraCon) }), `cerrar ${hdu.h}`);
    }
  }
  resumen.push(`HDU ${HDU.length}`);
}

try {
  await main();
  console.log(`Fixture E7 cargado: ${resumen.join(', ')}.`);
} catch (e) {
  rechazos.push(e.message);
  console.error(`Fixture E7 incompleto: ${e.message}`);
  process.exit(1);
}
