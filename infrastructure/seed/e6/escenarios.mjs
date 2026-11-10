// Ayudantes de escenario de E6 para q360-qa (seccion 8 del backlog, «Datos que agregan las pruebas»).
// Cada funcion es idempotente y usa solo APIs. Cambian el estado del fixture: no se llaman desde
// `npm run seed:e6`. Importar desde un script de Node con las mismas variables de entorno que seed:e6.
import {
  IND, ORG, aprobados, cargarUsuario, celulaId, como, datos, exigir, exigirEntorno, hduPorCodigo, http, servicio,
  usuarioPorCorreo,
} from './lib.mjs';

exigirEntorno();

/** ANA4 pasa a ser supervisada por QE2 (para «sin asignaciones»). Idempotente. */
export async function supervisarAna4ConQe2() {
  const [ana4, qe2] = await Promise.all([usuarioPorCorreo('ana4'), usuarioPorCorreo('qe2')]);
  if (!ana4 || !qe2) throw new Error('Faltan ANA4 o QE2: corre npm run seed:e7 primero.');
  if (ana4.supervisorVigente?.id === qe2.id) return { cambiado: false };
  exigir(await servicio(ORG, 'PUT', `/v1/analistas/${ana4.id}/supervisor`, { qeId: qe2.id, motivo: 'Escenario E6: ANA4 con QE2' }), 'supervisión ANA4');
  return { cambiado: true };
}

/**
 * H4 (QE2) pasa a ANA1 (supervisada por QE1) con ADM1 (D190). Se pide con sesion de Administrador;
 * con la credencial de servicio se validaria el equipo de QE2 y fallaria.
 */
export async function reasignarH4AAna1() {
  const [h4, ana1] = await Promise.all([hduPorCodigo('E7-H4'), usuarioPorCorreo('ana1')]);
  if (!h4 || !ana1) throw new Error('Faltan E7-H4 o ANA1: corre npm run seed:e7 primero.');
  if (h4.analista?.id === ana1.id) return { cambiado: false };
  exigir(await http(ORG, 'PUT', `/v1/hdu/${h4.id}/analista`, { cuerpo: { analistaId: ana1.id }, cabeceras: await como('adm1') }), 'reasignar H4');
  return { cambiado: true };
}

/**
 * Crea ANAD (analista de QE2), le asigna la HDU E6-HD1 (CEL-A, en el sprint de E7-H1) y lo desactiva por la
 * API del Administrador (E1-B07 solo impide desactivar a un QE con analistas). Suma 1 usuario inactivo y 1
 * HDU al fixture: no usar en la corrida de regresion E7.
 */
export async function crearAnalistaDesactivadoConHdu() {
  const cfg = datos.analistaDesactivado;
  const adm = await como('adm1');
  const [qe, base] = await Promise.all([usuarioPorCorreo(cfg.hdu.qe), hduPorCodigo(cfg.hdu.hduDelSprint)]);
  if (!qe || !base) throw new Error('Faltan QE2 o E7-H1: corre npm run seed:e7 primero.');
  const anad = (await cargarUsuario({ clave: cfg.clave, nombre: cfg.nombre, rol: 'ANALISTA_QA' })).usuario;
  const actual = (await usuarioPorCorreo(cfg.clave)) ?? anad;
  if (actual.supervisorVigente?.id !== qe.id) {
    exigir(await servicio(ORG, 'PUT', `/v1/analistas/${anad.id}/supervisor`, { qeId: qe.id, motivo: 'Escenario E6: analista desactivado' }), 'supervisión ANAD');
  }
  const hdu = exigir(
    await servicio(ORG, 'POST', '/v1/interno/carga/hdu', {
      codigo: cfg.hdu.codigo, titulo: cfg.hdu.titulo, celulaId: await celulaId(cfg.hdu.celula), sprintId: base.sprint.id,
      prioridad: cfg.hdu.prioridad, qeResponsableId: qe.id,
    }),
    'HDU de ANAD',
  ).hdu;
  if (hdu.analista?.id !== anad.id) {
    exigir(await http(ORG, 'PUT', `/v1/hdu/${hdu.id}/analista`, { cuerpo: { analistaId: anad.id }, cabeceras: adm }), 'asignar HDU a ANAD');
  }
  if (actual.activo) exigir(await http(ORG, 'PATCH', `/v1/usuarios/${anad.id}`, { cuerpo: { activo: false }, cabeceras: adm }), 'desactivar ANAD');
  return { analistaId: anad.id, hduId: hdu.id };
}

/**
 * Corre el snapshot como si fuera cada instante (D184, POST /v1/interno/carga/snapshots de Indicadores).
 * `instantes`: fechas-hora ISO 8601. Devuelve las ejecuciones. Para la serie de tres dias (H1 en 30, 30 y
 * 40 %) usar `instantesDeLaSerie()` y subir el avance de H1 (aprobar el 4º entregable) antes del tercero.
 */
export async function cargarSnapshots(instantes) {
  const salida = [];
  for (const instante of instantes) {
    salida.push(exigir(await servicio(IND, 'POST', '/v1/interno/carga/snapshots', { instante }), `snapshot ${instante}`));
  }
  return salida;
}

/** Los instantes de `datos.serieSnapshots`: 15:00 UTC de hoy y de los dos dias anteriores. */
export function instantesDeLaSerie() {
  const hoy = new Date();
  return datos.serieSnapshots.diasAtras.map((d) =>
    new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - d, 15, 0, 0)).toISOString());
}

/** Avance en % (aprobados × 10) de una HDU por su codigo, p. ej. `avanceDe('E7-H1')`. */
export async function avanceDe(codigo) {
  const h = await hduPorCodigo(codigo);
  if (!h) throw new Error(`No existe ${codigo}.`);
  return (await aprobados(h.id)) * 10;
}
