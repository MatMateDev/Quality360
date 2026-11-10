// Ayudantes comunes de seed:e6 y de escenarios.mjs. Solo usa APIs (Organizacion, Certificaciones,
// Indicadores); nunca SQL. Solo para entorno local.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const aqui = dirname(fileURLToPath(import.meta.url));
export const datos = JSON.parse(readFileSync(join(aqui, 'datos.json'), 'utf8'));

function llavePublica() {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
  const archivo = join(aqui, '../../../apps/web/.env.local');
  if (!existsSync(archivo)) return undefined;
  return readFileSync(archivo, 'utf8').match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
}

const url = (v, d) => (process.env[v] ?? d).replace(/\/$/, '');
export const ORG = url('ORGANIZACION_URL', 'http://localhost:3001');
export const CERT = url('CERTIFICACIONES_URL', 'http://localhost:3002');
export const IND = url('INDICADORES_URL', 'http://localhost:3005');
export const SUPABASE = url('SUPABASE_URL', 'http://127.0.0.1:54321');
export const TOKEN = process.env.X_Q360_SERVICIO_TOKEN;
export const ANON = llavePublica();
export const CONTRASENA = process.env.CONTRASENA_DEMO ?? 'Quality360Demo#2025';

export function exigirEntorno() {
  if (!TOKEN || !ANON) {
    console.error('Faltan X_Q360_SERVICIO_TOKEN y SUPABASE_ANON_KEY (ver infrastructure/seed/e6/README.md).');
    process.exit(2);
  }
}

export const correo = (clave) => `${clave}@quality360.local`;

export async function http(base, metodo, ruta, { cuerpo, cabeceras = {} } = {}) {
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

export const servicio = (base, metodo, ruta, cuerpo) =>
  http(base, metodo, ruta, { cuerpo, cabeceras: { 'x-q360-servicio-token': TOKEN } });

export function exigir(r, contexto) {
  if (!r.ok) throw new Error(`${contexto}: HTTP ${r.status} ${r.json?.codigo ?? ''} ${r.json?.mensaje ?? r.texto.slice(0, 120)}`);
  return r.json;
}

const sesiones = new Map();
/** Cabecera de autorizacion de la cuenta de demo `<clave>@quality360.local`. */
export async function como(clave) {
  if (!sesiones.has(clave)) {
    const r = await http(SUPABASE, 'POST', '/auth/v1/token?grant_type=password', {
      cuerpo: { email: correo(clave), password: CONTRASENA },
      cabeceras: { apikey: ANON },
    });
    if (!r.ok) throw new Error(`No se pudo iniciar sesión como ${clave}: HTTP ${r.status} (¿corriste npm run seed:e7?)`);
    sesiones.set(clave, r.json.access_token);
  }
  return { authorization: `Bearer ${sesiones.get(clave)}` };
}

export async function esperar(base, nombre) {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(base + '/health')).ok) return; } catch { /* aun no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`${nombre} no responde en ${base}/health. Levanta el stack con npm run local.`);
  process.exit(2);
}

/** Recorre todas las paginas (tamanoPagina 100) de un listado `{items,total,pagina,tamanoPagina}`. */
export async function todas(base, ruta, cabeceras) {
  const items = [];
  for (let pagina = 1; ; pagina++) {
    const sep = ruta.includes('?') ? '&' : '?';
    const j = exigir(await http(base, 'GET', `${ruta}${sep}pagina=${pagina}&tamanoPagina=100`, { cabeceras }), ruta);
    items.push(...j.items);
    if (j.items.length === 0 || items.length >= j.total) return items;
  }
}

export async function usuarioPorCorreo(clave) {
  const adm = await como('adm1');
  const lista = await todas(ORG, `/v1/usuarios?q=${encodeURIComponent(correo(clave))}`, adm);
  return lista.find((u) => u.correo === correo(clave));
}

export async function hduPorCodigo(codigo) {
  const adm = await como('adm1');
  return (await todas(ORG, '/v1/hdu', adm)).find((h) => h.codigo === codigo);
}

export async function celulaId(nombre) {
  return exigir(await servicio(ORG, 'POST', '/v1/interno/carga/celulas', { nombre }), `célula ${nombre}`).celula.id;
}

/** Alta idempotente (por correo) de un usuario de demo con contraseña de demo. Devuelve `{creado, usuario}`. */
export async function cargarUsuario({ clave, nombre, rol }, extra = {}) {
  return exigir(
    await servicio(ORG, 'POST', '/v1/interno/carga/usuarios', { nombre, correo: correo(clave), rol, contrasenaInicial: CONTRASENA, ...extra }),
    `usuario ${clave}`,
  );
}

/** Aprobados de 10 entregables de una HDU, por Certificaciones. */
export async function aprobados(hduId, comoClave = 'adm1') {
  const j = exigir(await http(CERT, 'GET', `/v1/hdu/${hduId}/entregables`, { cabeceras: await como(comoClave) }), `checklist ${hduId}`);
  return j.entregables.filter((e) => e.estado === 'APROBADO').length;
}
