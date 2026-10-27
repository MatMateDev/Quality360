#!/usr/bin/env node
// Fixture E4 (seccion 7 de docs/backlog/e4-impedimentos-y-riesgos.md), encima del fixture E7.
// Carga sprints con fin relativo a hoy (America/Santiago), pone cada HDU en su sprint, registra
// I1-I5 con sus acciones y fechas, y fija el riesgo de H6. Solo usa las APIs (nada de SQL).
//
// Uso:  npm run seed:e7 && npm run seed:e4        (--sin-verificar omite la verificacion final)
// Requiere Organizacion e Impedimentos levantados con PERMITIR_CARGA_SEMILLA=true y
// X_Q360_SERVICIO_TOKEN (infrastructure/seed/mvp/.env.carga). Variables opcionales:
// ORGANIZACION_URL (3001), IMPEDIMENTOS_URL (3003), SUPABASE_URL, SUPABASE_ANON_KEY,
// CONTRASENA_DEMO. Solo para entorno local.
//
// Idempotente: sprints por nombre (lleva la fecha de fin, asi que otro dia crea sprints nuevos y
// mueve las HDU), impedimentos por hduId + titulo, riesgo por hduId + fecha. Una segunda corrida
// el mismo dia no cambia nada; en otro dia las fechas de impedimentos y riesgo ya cargadas no se
// mueven (para un fixture fresco, reiniciar impedimentos.* y volver a cargar, como hace q360-qa).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const datos = JSON.parse(readFileSync(join(aqui, 'datos.json'), 'utf8'));

function llavePublica() {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
  const archivo = join(aqui, '../../../apps/web/.env.local');
  if (!existsSync(archivo)) return undefined;
  return readFileSync(archivo, 'utf8').match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
}

const url = (v, d) => (process.env[v] ?? d).replace(/\/$/, '');
const ORG = url('ORGANIZACION_URL', 'http://localhost:3001');
const IMP = url('IMPEDIMENTOS_URL', 'http://localhost:3003');
const SUPABASE = url('SUPABASE_URL', 'http://127.0.0.1:54321');
const TOKEN = process.env.X_Q360_SERVICIO_TOKEN;
const ANON = llavePublica();
const CONTRASENA = process.env.CONTRASENA_DEMO ?? 'Quality360Demo#2025';
const VERIFICAR = !process.argv.includes('--sin-verificar');
if (!TOKEN || !ANON) {
  console.error('Faltan X_Q360_SERVICIO_TOKEN y SUPABASE_ANON_KEY (ver infrastructure/seed/e4/README.md).');
  process.exit(2);
}

// Usuarios del fixture E7 que usa E4 (mismos nombres y roles que seed/e7: el alta es idempotente).
const USUARIOS = {
  qe1: { nombre: 'QE1 Quality Engineer', rol: 'QE' },
  qe2: { nombre: 'QE2 Quality Engineer', rol: 'QE' },
  ana1: { nombre: 'ANA1 Analista', rol: 'ANALISTA_QA' },
  ana2: { nombre: 'ANA2 Analista', rol: 'ANALISTA_QA' },
  ana3: { nombre: 'ANA3 Analista', rol: 'ANALISTA_QA' },
  lid1: { nombre: 'LID1 Líder CEL-A y CEL-B', rol: 'LIDER_QA' },
};
const CELULAS_LID1 = ['CEL-A', 'CEL-B'];

async function http(base, metodo, ruta, { cuerpo, cabeceras = {} } = {}) {
  const r = await fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...cabeceras }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* no JSON */ }
  return { ok: r.ok, status: r.status, json, texto };
}
const servicio = (base, metodo, ruta, cuerpo) => http(base, metodo, ruta, { cuerpo, cabeceras: { 'x-q360-servicio-token': TOKEN } });
function exigir(r, contexto) {
  if (!r.ok) throw new Error(`${contexto}: HTTP ${r.status} ${r.json?.codigo ?? ''} ${r.json?.mensaje ?? r.texto.slice(0, 120)}`);
  return r.json;
}
async function esperar(base, nombre) {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(base + '/health')).ok) return; } catch { /* aun no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`${nombre} no responde en ${base}/health.`);
  process.exit(2);
}
async function sesion(clave) {
  const r = await http(SUPABASE, 'POST', '/auth/v1/token?grant_type=password', { cuerpo: { email: `${clave}@quality360.local`, password: CONTRASENA }, cabeceras: { apikey: ANON } });
  if (!r.ok) throw new Error(`No se pudo iniciar sesión como ${clave}: HTTP ${r.status}`);
  return { authorization: `Bearer ${r.json.access_token}` };
}

// Fechas: "hoy" es el dia calendario en America/Santiago; los instantes se calculan desde ahora.
const hoySantiago = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const instante = (hace) => new Date(Date.now() - ((hace.dias ?? 0) * 24 + (hace.horas ?? 0)) * 3600 * 1000).toISOString();

const resumen = [];

async function main() {
  await esperar(ORG, 'Organización');
  await esperar(IMP, 'Impedimentos');

  // Celulas y usuarios (alta idempotente, ya existen por seed:e7).
  const celulas = {};
  for (const nombre of ['CEL-A', 'CEL-B', 'CEL-C']) {
    celulas[nombre] = exigir(await servicio(ORG, 'POST', '/v1/interno/carga/celulas', { nombre }), `célula ${nombre}`).celula.id;
  }
  const usuarios = {};
  for (const [clave, u] of Object.entries(USUARIOS)) {
    const cuerpo = { nombre: u.nombre, correo: `${clave}@quality360.local`, rol: u.rol, contrasenaInicial: CONTRASENA };
    if (clave === 'lid1') cuerpo.celulaIds = CELULAS_LID1.map((c) => celulas[c]);
    const j = exigir(await servicio(ORG, 'POST', '/v1/interno/carga/usuarios', cuerpo), `usuario ${clave}`);
    usuarios[clave] = { id: j.usuario.id, nombre: u.nombre, rol: u.rol };
  }
  const persona = (c) => ({ id: usuarios[c].id, nombre: usuarios[c].nombre, rol: usuarios[c].rol });
  const responsable = (c) => ({ id: usuarios[c].id, nombre: usuarios[c].nombre, externo: false });

  // HDU del fixture E7 (no se crean: si faltan, falta correr seed:e7).
  const admin = await sesion('adm1');
  // Recorre todas las páginas: con más de 100 HDU en la base las del fixture pueden no estar en la primera.
  const hdu = {};
  for (let numero = 1; ; numero++) {
    const pagina = exigir(await http(ORG, 'GET', `/v1/hdu?tamanoPagina=100&pagina=${numero}`, { cabeceras: admin }), 'listar HDU');
    for (const h of pagina.items) {
      const m = /^E7-(H[1-8])$/.exec(h.codigo);
      if (m) hdu[m[1]] = { id: h.id, celula: h.celula.nombre, celulaId: h.celula.id };
    }
    if (pagina.items.length === 0 || numero * pagina.tamanoPagina >= pagina.total) break;
  }
  const faltan = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8'].filter((h) => !hdu[h]);
  if (faltan.length) throw new Error(`Faltan las HDU ${faltan.join(', ')} del fixture E7: corre antes npm run seed:e7.`);

  // Sprints: uno por (alias, celula) con las HDU de esa celula; H7 (cerrada) no se toca.
  let sprints = 0;
  for (const s of datos.sprints) {
    const fin = sumarDias(hoySantiago, s.finDias);
    for (const h of s.hdu) {
      const nombre = `${s.alias} ${hdu[h].celula} ${fin}`;
      const sp = exigir(await servicio(ORG, 'POST', '/v1/interno/carga/sprints', { nombre, inicio: sumarDias(fin, -14), fin, celulaId: hdu[h].celulaId }), `sprint ${nombre}`);
      exigir(await servicio(ORG, 'PUT', `/v1/interno/carga/hdu/${hdu[h].id}/sprint`, { sprintId: sp.sprint.id }), `sprint de ${h}`);
      sprints += 1;
    }
  }
  resumen.push(`${sprints} HDU en sprints`);

  // Impedimentos con su historial.
  let nuevos = 0;
  for (const i of datos.impedimentos) {
    const cuerpo = {
      hduId: hdu[i.hdu].id, tipo: i.tipo, titulo: i.titulo, descripcion: i.descripcion,
      responsableInicial: responsable(i.responsableInicial), creadoPor: persona(i.creadoPor),
      acciones: i.acciones.map((a) => ({
        tipo: a.tipo, ...(a.estadoAnterior ? { estadoAnterior: a.estadoAnterior } : {}), estado: a.estado,
        actor: persona(a.actor), fecha: instante(a.hace), comentario: a.comentario,
        ...(a.responsableNuevo ? { responsableNuevo: responsable(a.responsableNuevo) } : {}),
      })),
    };
    const r = await servicio(IMP, 'POST', '/v1/interno/carga/impedimentos', cuerpo);
    exigir(r, `impedimento ${i.id}`);
    if (r.status === 201) nuevos += 1;
  }
  resumen.push(`${datos.impedimentos.length} impedimentos (${nuevos} nuevos)`);

  // Riesgo fijado. Idempotente por hduId + fecha: la fecha se redondea al dia para que repetir el mismo dia no duplique.
  for (const r of datos.riesgo) {
    const fecha = instante(r.hace).slice(0, 10) + 'T12:00:00Z';
    exigir(await servicio(IMP, 'POST', '/v1/interno/carga/riesgo', { hduId: hdu[r.hdu].id, nivel: r.nivel, justificacion: r.justificacion, actor: persona(r.actor), fecha }), `riesgo ${r.hdu}`);
  }
  resumen.push(`${datos.riesgo.length} nivel de riesgo fijado`);

  if (VERIFICAR) await verificar(hdu);
}

/** Compara con la seccion 7: bloqueo y riesgo por HDU, consultados como QE1 (H1, H2, H5, H6, H8) y QE2 (H3, H4). */
async function verificar(hdu) {
  const sesiones = { qe1: await sesion('qe1'), qe2: await sesion('qe2') };
  const duenos = { H1: 'qe1', H2: 'qe1', H5: 'qe1', H6: 'qe1', H8: 'qe1', H3: 'qe2', H4: 'qe2' };
  const fallos = [];
  for (const [h, e] of Object.entries(datos.esperado)) {
    const cab = sesiones[duenos[h]];
    const imp = exigir(await http(IMP, 'GET', `/v1/hdu/${hdu[h].id}/impedimentos`, { cabeceras: cab }), `impedimentos ${h}`);
    const rie = exigir(await http(IMP, 'GET', `/v1/hdu/${hdu[h].id}/riesgo`, { cabeceras: cab }), `riesgo ${h}`);
    const codigos = (rie.factores ?? []).map((f) => f.codigo).sort();
    const comprobaciones = [
      ['bloqueada', imp.bloqueada, e.bloqueada], ['sugerido', rie.nivelSugerido, e.sugerido],
      ['vigente', rie.nivelVigente, e.vigente], ['origen', rie.origen, e.origen],
      ['factores', codigos.join(','), [...e.factores].sort().join(',')],
    ];
    for (const [campo, obtenido, esperado] of comprobaciones) {
      if (obtenido !== esperado) fallos.push(`${h}.${campo}: esperado ${esperado}, obtenido ${obtenido}`);
    }
  }
  if (fallos.length) throw new Error(`Los valores derivados no coinciden con la sección 7:\n  ${fallos.join('\n  ')}`);
  resumen.push('valores derivados verificados (7 HDU)');
}

try {
  await main();
  console.log(`Fixture E4 cargado: ${resumen.join(', ')}.`);
} catch (e) {
  console.error(`Fixture E4 incompleto: ${e.message}`);
  process.exit(1);
}
