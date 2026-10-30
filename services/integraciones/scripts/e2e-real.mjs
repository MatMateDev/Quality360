// Prueba de punta a punta de E5 con los servicios REALES: Organización e Integraciones compilados (dist) sobre el
// Supabase local, más un Jira falso mínimo (node:http) en 127.0.0.1. No usa mocks de Organización ni del cliente de Jira.
// Requisitos: Supabase local arriba, `npm run build` en services/organizacion y services/integraciones.
// Uso: node services/integraciones/scripts/e2e-real.mjs
import { spawn, execSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PUERTO_ORG = 3101, PUERTO_INT = 3104, PUERTO_JIRA = 4012;
const sufijo = randomBytes(3).toString('hex');

// ---- llaves del Supabase local (no se escriben en el repositorio)
const salida = execSync('npx --yes supabase@2.117.0 status --workdir . -o env', { cwd: join(RAIZ, 'infrastructure'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const sb = Object.fromEntries(salida.split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
const TOKEN_SERVICIO = `servicio-e2e-${randomBytes(8).toString('hex')}`;
const TOKEN_JIRA = `jira-e2e-${randomBytes(6).toString('hex')}`;

// ---- Jira falso
const issues = [1, 2, 3].map((n) => ({
  key: `E2E${sufijo.toUpperCase().replace(/[^A-Z]/g, 'X')}-${n}`,
  fields: {
    summary: `Historia Jira ${n}`,
    description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: `Descripción ADF ${n}` }] }] },
    priority: { name: n === 1 ? 'High' : 'Medium' },
    issuetype: { name: 'Story' },
    status: { name: 'In Progress' },
    assignee: { displayName: 'Dev Falso' },
    customfield_10020: [{ name: 'E2E Sprint', state: 'active', endDate: null }],
  },
}));
const PROYECTO = 'E2E';
const llamadasJira = [];
const jira = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  llamadasJira.push(url.pathname);
  const autorizado = req.headers.authorization === `Basic ${Buffer.from(`admin@e2e.local:${TOKEN_JIRA}`).toString('base64')}`;
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (!autorizado) return json(401, { errorMessages: [`rechazado ${TOKEN_JIRA}`] });
  if (url.pathname === '/rest/api/3/myself') return json(200, { displayName: 'Admin Jira E2E', accountId: 'x' });
  if (url.pathname === `/rest/api/3/project/${PROYECTO}`) return json(200, { key: PROYECTO, name: 'Proyecto E2E' });
  if (url.pathname === '/rest/api/3/field') return json(200, [{ id: 'customfield_10020', name: 'Sprint', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } }]);
  if (url.pathname === '/rest/api/3/search/jql') return json(200, { issues, isLast: true });
  return json(404, {});
});
await new Promise((r) => jira.listen(PUERTO_JIRA, '127.0.0.1', r));
// la clave del proyecto en las issues debe coincidir con la configurada
for (const i of issues) i.key = i.key.replace(/^E2E[A-Z]*-/, `${PROYECTO}-`);

// ---- servicios reales
const hijos = [];
function levantar(nombre, carpeta, entorno, puerto) {
  const hijo = spawn(process.execPath, ['dist/main.js'], { cwd: join(RAIZ, 'services', carpeta), env: { ...process.env, ...entorno, PORT: String(puerto) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let registro = '';
  hijo.stdout.on('data', (d) => (registro += d));
  hijo.stderr.on('data', (d) => (registro += d));
  hijos.push(hijo);
  return { hijo, registro: () => registro, nombre };
}
async function esperar(url) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no respondió ${url}`);
}
const comun = { SUPABASE_URL: sb.API_URL, SUPABASE_JWT_SECRET: sb.JWT_SECRET, NODE_ENV: 'development' };
const org = levantar('organizacion', 'organizacion', {
  ...comun, DATABASE_URL: 'postgresql://svc_organizacion:svc_organizacion_local_dev@127.0.0.1:54322/postgres?schema=organizacion',
  SUPABASE_SERVICE_ROLE_KEY: sb.SERVICE_ROLE_KEY, X_Q360_SERVICIO_TOKEN: TOKEN_SERVICIO, PERMITIR_CARGA_SEMILLA: 'true',
  CERTIFICACIONES_URL: 'http://127.0.0.1:9', IMPEDIMENTOS_URL: 'http://127.0.0.1:9',
}, PUERTO_ORG);
const integraciones = levantar('integraciones', 'integraciones', {
  ...comun, DATABASE_URL: 'postgresql://svc_integraciones:svc_integraciones_local_dev@127.0.0.1:54322/postgres?schema=integraciones',
  ORGANIZACION_URL: `http://127.0.0.1:${PUERTO_ORG}`, INTEGRACIONES_LLAVE_CIFRADO: randomBytes(32).toString('base64'), INTEGRACIONES_PERMITIR_HOST_PRUEBA: 'true',
}, PUERTO_INT);

let codigoSalida = 0;
try {
  await esperar(`http://127.0.0.1:${PUERTO_ORG}/health`);
  await esperar(`http://127.0.0.1:${PUERTO_INT}/health`);

  const semilla = async (ruta, cuerpo) => {
    const r = await fetch(`http://127.0.0.1:${PUERTO_ORG}/v1/interno/carga/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-q360-servicio-token': TOKEN_SERVICIO }, body: JSON.stringify(cuerpo) });
    const cuerpoR = await r.json();
    assert.ok(r.status === 200 || r.status === 201, `${ruta} ${r.status} ${JSON.stringify(cuerpoR)}`);
    return cuerpoR;
  };
  const claveUsuario = 'E2e-Local-12345678';
  const admin = await semilla('usuarios', { nombre: `Admin E2E ${sufijo}`, correo: 'admin@e2e.local'.replace('@', `.${sufijo}@`), rol: 'ADMINISTRADOR', contrasenaInicial: claveUsuario });
  const qe = await semilla('usuarios', { nombre: `QE E2E ${sufijo}`, correo: `qe.${sufijo}@e2e.local`, rol: 'QE', contrasenaInicial: claveUsuario });
  const celula = await semilla('celulas', { nombre: `CEL-E2E-${sufijo}` });
  const idCelula = (celula.celula ?? celula).id;
  const sprint = await semilla('sprints', { nombre: `E2E Sprint ${sufijo}`, inicio: '2026-10-01', fin: '2026-10-31', celulaId: idCelula });
  const idSprint = (sprint.sprint ?? sprint).id;
  const idQe = (qe.usuario ?? qe).id;
  const correoAdmin = (admin.usuario ?? admin).correo ?? `admin.${sufijo}@e2e.local`;

  const login = await fetch(`${sb.API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: sb.ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: correoAdmin, password: claveUsuario }) });
  const sesion = await login.json();
  assert.equal(login.status, 200, JSON.stringify(sesion).slice(0, 200));
  const H = { authorization: `Bearer ${sesion.access_token}`, 'content-type': 'application/json' };
  const API = `http://127.0.0.1:${PUERTO_INT}`;
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(`${API}${ruta}`, { method: metodo, headers: H, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    return { status: r.status, body: await r.json() };
  };

  // 1. Configuración con prueba real contra el Jira falso (cliente HTTP real).
  const config = { sitio: `http://127.0.0.1:${PUERTO_JIRA}`, correo: 'admin@e2e.local', token: TOKEN_JIRA, proyecto: PROYECTO, tiposIssue: ['Story'], celulaId: idCelula, qeResponsableId: idQe, sprintRespaldoId: idSprint };
  const guardado = await pedir('PUT', '/v1/integraciones/jira/configuracion', config);
  assert.equal(guardado.status, 200, JSON.stringify(guardado.body));
  assert.equal(guardado.body.guardado, true, JSON.stringify(guardado.body));
  assert.equal(guardado.body.prueba.usuarioJira, 'Admin Jira E2E');
  assert.equal(JSON.stringify(guardado.body).includes(TOKEN_JIRA), false);
  console.log('OK configuración: guardada tras probar contra el Jira falso');

  // 2. Sincronización real: Jira falso -> mapeo real -> upsert de Organización real.
  const sync = await pedir('POST', '/v1/integraciones/jira/sincronizaciones', {});
  assert.equal(sync.status, 200, JSON.stringify(sync.body));
  assert.deepEqual([sync.body.resultado, sync.body.leidas, sync.body.creadas], ['EXITOSA', 3, 3], JSON.stringify(sync.body));
  const detalle = await pedir('GET', `/v1/integraciones/ejecuciones/${sync.body.id}/detalle`, undefined);
  assert.equal(detalle.body.total, 3);
  const hdu = await (await fetch(`http://127.0.0.1:${PUERTO_ORG}/v1/hdu/${detalle.body.items[0].idHistoria}`, { headers: H })).json();
  assert.deepEqual([hdu.codigo, hdu.titulo, hdu.prioridad, hdu.origen, hdu.descripcion, hdu.estado], [`${PROYECTO}-1`, 'Historia Jira 1', 'ALTA', 'JIRA', 'Descripción ADF 1', 'PENDIENTE']);
  assert.equal(hdu.urlExterna, `http://127.0.0.1:${PUERTO_JIRA}/browse/${PROYECTO}-1`);
  assert.equal(hdu.celula.id, idCelula);
  assert.equal(hdu.qeResponsable.id, idQe);
  console.log('OK sincronización: 3 HDU creadas en Organización real; detalle con origen, descripción ADF y enlace');

  const otra = await pedir('POST', '/v1/integraciones/jira/sincronizaciones', {});
  assert.deepEqual([otra.body.creadas, otra.body.omitidas], [0, 3]);
  console.log('OK repetir: 3 omitidas (SIN_CAMBIOS)');

  // 3. Importación de un CSV pequeño (vista previa y escritura) contra Organización real.
  const csv = [`codigo,titulo,descripcion,prioridad`, `CSV-${sufijo}-1,Primera del archivo,Detalle,alta`, `CSV-${sufijo}-2,Segunda del archivo,,baja`, `CSV-${sufijo}-3,,sin título,media`].join('\n');
  const previa = await pedir('POST', '/v1/integraciones/archivos/vista-previa', { formato: 'CSV', nombre: 'e2e.csv', contenido: csv });
  assert.deepEqual([previa.status, previa.body.crear, previa.body.errores], [200, 2, 1], JSON.stringify(previa.body));
  const importacion = await pedir('POST', '/v1/integraciones/archivos/importaciones', { formato: 'CSV', nombre: 'e2e.csv', contenido: csv });
  assert.deepEqual([importacion.body.resultado, importacion.body.creadas, importacion.body.conError], ['CON_ERRORES', 2, 1], JSON.stringify(importacion.body));
  const estricto = await pedir('POST', '/v1/integraciones/archivos/importaciones', { formato: 'CSV', nombre: 'e2e.csv', contenido: csv, estricto: true });
  assert.deepEqual([estricto.body.resultado, estricto.body.codigoError], ['FALLIDA', 'MODO_ESTRICTO']);
  const estado = await pedir('GET', '/v1/integraciones/estado', undefined);
  assert.equal(estado.body.ultimaCompletada.id, importacion.body.id);
  console.log('OK importación CSV: vista previa 2 crear/1 error; importación 2 creadas; estricto rechaza');

  // 4. Sin secretos en los registros de ambos servicios.
  for (const s of [org, integraciones]) {
    for (const secreto of [TOKEN_JIRA, TOKEN_SERVICIO, 'Basic ']) assert.equal(s.registro().includes(secreto), false, `${s.nombre}: ${secreto}`);
  }
  console.log('OK sin secretos en los registros');
  console.log('E2E real: TODO OK');
} catch (error) {
  codigoSalida = 1;
  console.error('E2E real: FALLÓ', error);
  console.error('--- organizacion ---\n' + org.registro().slice(-1500));
  console.error('--- integraciones ---\n' + integraciones.registro().slice(-1500));
} finally {
  for (const h of hijos) h.kill();
  jira.close();
  setTimeout(() => process.exit(codigoSalida), 500);
}
void randomUUID;
