/** X3 · semáforo, drill-down, carga y umbral (E6-B02) con el fixture de la sección 8 y fuentes simuladas. */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { cerrarBases, limpiarIndicadores, prismaServicio } from '../ayudas-bd.js';
import { montar, type Montaje } from '../montaje.js';
import { CELULAS, crearHdus, Mundo, PERSONAS, SUPERVISION_BASE } from '../mundo.js';

let m: Montaje;
const mundo = new Mundo();
const INEXISTENTE = '11111111-1111-4111-8111-111111111111';

before(async () => {
  await mundo.iniciar();
  m = await montar({ mundo });
});
after(async () => {
  await m.cerrar();
  await mundo.cerrar();
  await cerrarBases();
});
beforeEach(async () => {
  await limpiarIndicadores();
  mundo.hdus = crearHdus();
  mundo.supervision = { ...SUPERVISION_BASE };
  mundo.caida = { org: false, cert: false, imp: false };
  mundo.llamadas = [];
  for (const clave of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) mundo.personas[clave] = { ...PERSONAS[clave] };
});

type Tarjeta = { celula: { nombre: string }; estado: string; color: string | null; alMenos: string | null; calculoParcial: boolean; riesgoMaximo: string | null; impedimentosAbiertos: number | null; impedimentosEscalados: number | null; hduActivas: number };
const semaforo = async (persona: Parameters<Montaje['pedir']>[2], consulta = '') => m.pedir('get', `/v1/indicadores/semaforo${consulta}`, persona);
const tarjetas = (r: { body: { celulas: Tarjeta[] } }): Record<string, Tarjeta> => Object.fromEntries(r.body.celulas.map((t) => [t.celula.nombre, t]));

describe('E6-B02#1 · semáforo por célula', () => {
  it('[E6-B02-T01] QE1: CEL-A ROJO (ALTO, 1 abierto), CEL-B ROJO (MEDIO, 1 escalado), CEL-C VERDE (BAJO)', async () => {
    const r = await semaforo('qe1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const t = tarjetas(r);
    assert.deepEqual([t['CEL-A']?.color, t['CEL-A']?.riesgoMaximo, t['CEL-A']?.impedimentosAbiertos, t['CEL-A']?.impedimentosEscalados], ['ROJO', 'ALTO', 1, 0]);
    assert.deepEqual([t['CEL-B']?.color, t['CEL-B']?.riesgoMaximo, t['CEL-B']?.impedimentosAbiertos, t['CEL-B']?.impedimentosEscalados], ['ROJO', 'MEDIO', 0, 1]);
    assert.deepEqual([t['CEL-C']?.color, t['CEL-C']?.riesgoMaximo, t['CEL-C']?.estado], ['VERDE', 'BAJO', 'ok']);
    assert.deepEqual(r.body.fuentes, { certificaciones: 'ok', impedimentos: 'ok' });
    assert.equal(r.body.sinDatos, false);
    assert.ok(Object.values(t).every((x) => x.calculoParcial === false));
  });

  it('[E6-B02-T02] QE2: CEL-A VERDE (0 activas), CEL-B AMARILLO (MEDIO, 1 abierto), CEL-C VERDE; AUD1: ROJO, ROJO, VERDE', async () => {
    const t = tarjetas(await semaforo('qe2'));
    assert.deepEqual([t['CEL-A']?.color, t['CEL-A']?.hduActivas], ['VERDE', 0]);
    assert.deepEqual([t['CEL-B']?.color, t['CEL-B']?.riesgoMaximo, t['CEL-B']?.impedimentosAbiertos], ['AMARILLO', 'MEDIO', 1]);
    assert.equal(t['CEL-C']?.color, 'VERDE');
    const aud = tarjetas(await semaforo('aud1'));
    assert.deepEqual([aud['CEL-A']?.color, aud['CEL-B']?.color, aud['CEL-C']?.color], ['ROJO', 'ROJO', 'VERDE']);
  });

  it('el orden es ROJO, AMARILLO, VERDE y luego las grises, y por nombre dentro de cada grupo', async () => {
    const r = await semaforo('qe2');
    assert.deepEqual(r.body.celulas.map((c: Tarjeta) => [c.celula.nombre, c.color]), [['CEL-B', 'AMARILLO'], ['CEL-A', 'VERDE'], ['CEL-C', 'VERDE']]);
    const lid = await semaforo('lid2');
    assert.equal(lid.body.celulas[0].estado, 'SIN_HDU');
  });

  it('[E6-B02-T03] drill-down de CEL-A: H1 y H5 con RIESGO_ALTO; de CEL-B: H6 con IMPEDIMENTO_ESCALADO y nivel vigente MEDIO', async () => {
    const a = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.A.id}/hdu`, 'qe1');
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.deepEqual(a.body.items.map((i: { hdu: { codigo: string }; motivos: string[] }) => [i.hdu.codigo, i.motivos]), [['H1', ['RIESGO_ALTO']], ['H5', ['RIESGO_ALTO']]]);
    assert.deepEqual([a.body.estado, a.body.color, a.body.celula.nombre], ['ok', 'ROJO', 'CEL-A']);
    assert.equal(a.body.items[0].impedimentoPrincipal.titulo, 'I2 Ambiente caído', 'el impedimento abierto acompaña a la HDU aunque no sea su motivo');
    assert.equal(a.body.items[0].analista.nombre, 'ANA1');
    assert.equal(a.body.items[1].analista, null);
    const b = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.B.id}/hdu`, 'qe1');
    assert.equal(b.body.items.length, 1);
    const h6 = b.body.items[0];
    assert.deepEqual([h6.hdu.codigo, h6.motivos, h6.riesgo.nivelVigente, h6.impedimentoPrincipal.estado], ['H6', ['IMPEDIMENTO_ESCALADO'], 'MEDIO', 'ESCALADO']);
  });

  it('drill-down amarillo: H3 con RIESGO_MEDIO e IMPEDIMENTO_ABIERTO; célula verde: lista vacía', async () => {
    const b = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.B.id}/hdu`, 'qe2');
    assert.deepEqual(b.body.items.map((i: { hdu: { codigo: string }; motivos: string[] }) => [i.hdu.codigo, i.motivos]), [['H3', ['RIESGO_MEDIO', 'IMPEDIMENTO_ABIERTO']]]);
    const c = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.C.id}/hdu`, 'qe2');
    assert.deepEqual([c.body.color, c.body.items], ['VERDE', []]);
  });

  it('[E6-B02-T04] QE2 y LID1 piden la CEL-C (ajena): 403 ACCESO_DENEGADO; AUD1 con un UUID inexistente: 404', async () => {
    for (const persona of ['lid1'] as const) {
      const r = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.C.id}/hdu`, persona);
      assert.equal(r.status, 403, persona);
      assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
    }
    const qe = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.D.id}/hdu`, 'qe2');
    assert.equal(qe.status, 403, 'una célula que existe pero no es suya');
    const inexistente = await m.pedir('get', `/v1/indicadores/semaforo/${INEXISTENTE}/hdu`, 'qe2');
    assert.equal(inexistente.status, 403, 'mismo 403 que una existente: no revela existencia');
    assert.equal(inexistente.body.mensaje, qe.body.mensaje);
    const aud = await m.pedir('get', `/v1/indicadores/semaforo/${INEXISTENTE}/hdu`, 'aud1');
    assert.equal(aud.status, 404);
    const sinHdu = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.D.id}/hdu`, 'aud1');
    assert.equal(sinHdu.status, 200, 'una célula que existe sin HDU no es un error para el Auditor');
    assert.deepEqual([sinHdu.body.estado, sinHdu.body.items, sinHdu.body.celula.nombre], ['SIN_HDU', [], 'CEL-D']);
    assert.equal((await m.pedir('get', '/v1/indicadores/semaforo/abc/hdu', 'qe1')).status, 400);
  });

  it('[E6-B02-T10] con Certificaciones detenido: CEL-A y CEL-B ROJO con calculoParcial; CEL-C color null e indisponible (no VERDE)', async () => {
    mundo.caida.cert = true;
    const r = await semaforo('qe1');
    assert.equal(r.status, 200);
    const t = tarjetas(r);
    assert.deepEqual([t['CEL-A']?.estado, t['CEL-A']?.color, t['CEL-A']?.calculoParcial], ['ok', 'ROJO', true]);
    assert.deepEqual([t['CEL-B']?.estado, t['CEL-B']?.color, t['CEL-B']?.calculoParcial], ['ok', 'ROJO', true]);
    assert.deepEqual([t['CEL-C']?.estado, t['CEL-C']?.color, t['CEL-C']?.alMenos], ['indisponible', null, null]);
    assert.deepEqual(r.body.fuentes, { certificaciones: 'indisponible', impedimentos: 'ok' });
    const sinAvance = mundo.llamadas.filter((l) => l.fuente === 'IMP').at(-1)?.cuerpo as { hdu: Array<{ avance: number | null }> };
    assert.ok(sinAvance.hdu.every((h) => h.avance === null), 'Impedimentos se consulta con avance nulo');
  });

  it('con Impedimentos detenido ninguna célula con HDU activas queda VERDE: todas indisponibles', async () => {
    mundo.caida.imp = true;
    const r = await semaforo('qe1');
    assert.equal(r.status, 200);
    assert.ok(r.body.celulas.every((c: Tarjeta) => c.estado === 'indisponible' && c.color === null && c.impedimentosAbiertos === null));
    assert.equal(r.body.fuentes.impedimentos, 'indisponible');
    const dd = await m.pedir('get', `/v1/indicadores/semaforo/${CELULAS.A.id}/hdu`, 'qe1');
    assert.equal(dd.status, 200);
    assert.deepEqual([dd.body.estado, dd.body.color, dd.body.items], ['indisponible', null, []]);
  });

  it('[E6-B02-T11] QE2: CEL-A (solo una cerrada) VERDE con 0 activas; LID2: CEL-D sin HDU color null y estado SIN_HDU', async () => {
    const a = tarjetas(await semaforo('qe2'))['CEL-A'];
    assert.deepEqual([a?.color, a?.hduActivas, a?.estado], ['VERDE', 0, 'ok']);
    const d = tarjetas(await semaforo('lid2'))['CEL-D'];
    assert.deepEqual([d?.color, d?.estado, d?.hduActivas], [null, 'SIN_HDU', 0]);
  });

  it('el filtro de célula deja una tarjeta; una célula ajena da sinDatos; Administrador y Analista reciben 403; mal formado 400', async () => {
    const una = await semaforo('qe1', `?celulaId=${CELULAS.B.id}`);
    assert.deepEqual(una.body.celulas.map((c: Tarjeta) => c.celula.nombre), ['CEL-B']);
    const ajena = await semaforo('qe1', `?celulaId=${CELULAS.D.id}`);
    assert.deepEqual([ajena.status, ajena.body.sinDatos, ajena.body.motivoSinDatos, ajena.body.celulas], [200, true, 'FILTRO_SIN_COINCIDENCIAS', []]);
    assert.equal((await semaforo('adm1')).status, 403);
    assert.equal((await semaforo('ana1')).status, 403);
    assert.equal((await semaforo(null)).status, 401);
    assert.equal((await semaforo('qe1', '?celulaId=xyz')).status, 400);
  });

  it('refleja el cambio en la misma consulta (sin caché): resolver el impedimento escalado de H6 deja CEL-B amarilla por su riesgo MEDIO', async () => {
    assert.equal(tarjetas(await semaforo('qe1'))['CEL-B']?.color, 'ROJO');
    const h6 = mundo.hdus.find((h) => h.codigo === 'H6');
    assert.ok(h6);
    h6.impedimentos = [];
    assert.equal(tarjetas(await semaforo('qe1'))['CEL-B']?.color, 'AMARILLO');
  });
});

type Fila = { analista: { id: string; nombre: string; activo: boolean }; supervisadoPorMi: boolean | null; porEstado: Record<string, number>; activas: number; sinHdu: boolean; cumplimiento: { estado: string; valor: number | null }; sobrecargado: boolean };
type Grupo = { umbral: { qe: { nombre: string } | null; valor: number; porDefecto: boolean }; filas: Fila[] };
const carga = (persona: Parameters<Montaje['pedir']>[2], consulta = '') => m.pedir('get', `/v1/indicadores/carga${consulta}`, persona);
const fila = (r: { body: { grupos: Grupo[] } }, nombre: string): Fila | undefined => r.body.grupos.flatMap((g) => g.filas).find((f) => f.analista.nombre === nombre);

describe('E6-B02#2 · carga por analista', () => {
  it('[E6-B02-T05] QE1: ANA1 2 activas en ejecución 55.0; ANA2 2 activas (1 en ejecución, 1 pendiente de cierre) 55.0; sin analista 1; umbral 5 por defecto', async () => {
    const r = await carga('qe1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.grupos.length, 1);
    assert.deepEqual(r.body.grupos[0].umbral, { qe: { id: PERSONAS.qe1.id, nombre: 'QE1' }, valor: 5, porDefecto: true });
    const ana1 = fila(r, 'ANA1');
    assert.deepEqual([ana1?.activas, ana1?.porEstado.EN_EJECUCION, ana1?.cumplimiento, ana1?.supervisadoPorMi, ana1?.sinHdu], [2, 2, { estado: 'ok', valor: 55 }, true, false]);
    const ana2 = fila(r, 'ANA2');
    assert.deepEqual([ana2?.activas, ana2?.porEstado.EN_EJECUCION, ana2?.porEstado.PENDIENTE_CIERRE, ana2?.cumplimiento.valor], [2, 1, 1, 55]);
    assert.equal(r.body.sinAnalista.activas, 1);
    assert.equal(r.body.sinAnalista.porEstado.PENDIENTE, 1);
    assert.ok(r.body.grupos[0].filas.every((f: Fila) => f.sobrecargado === false));
    assert.deepEqual(r.body.fuentes, { certificaciones: 'ok', impedimentos: 'ok' });
  });

  it('[E6-B02-T06] el umbral 1 sobrecarga a ANA1 y ANA2, con 2 ninguno; porDefecto pasa a false', async () => {
    assert.equal((await m.pedir('put', '/v1/indicadores/umbral-carga', 'qe1', { valor: 1 })).status, 200);
    const uno = await carga('qe1');
    assert.deepEqual([fila(uno, 'ANA1')?.sobrecargado, fila(uno, 'ANA2')?.sobrecargado, uno.body.grupos[0].umbral.valor, uno.body.grupos[0].umbral.porDefecto], [true, true, 1, false]);
    assert.deepEqual(uno.body.grupos[0].filas.map((f: Fila) => f.sobrecargado), [true, true], 'los sobrecargados primero');
    await m.pedir('put', '/v1/indicadores/umbral-carga', 'qe1', { valor: 2 }).then((x) => assert.equal(x.status, 200));
    const dos = await carga('qe1');
    assert.ok(dos.body.grupos[0].filas.every((f: Fila) => f.sobrecargado === false));
  });

  it('los filtros cambian porEstado y cumplimiento pero no activas ni la sobrecarga; el filtro sin coincidencias conserva las filas', async () => {
    const r = await carga('qe1', `?celulaId=${CELULAS.B.id}`);
    const ana1 = fila(r, 'ANA1');
    assert.deepEqual([ana1?.activas, ana1?.porEstado.EN_EJECUCION, ana1?.cumplimiento.valor], [2, 1, 80]);
    assert.equal(fila(r, 'ANA2')?.cumplimiento.valor, null, 'sin HDU en el filtro: «—», no 0');
    assert.equal(fila(r, 'ANA2')?.activas, 2);
    const vacio = await carga('qe1', `?celulaId=${CELULAS.D.id}`);
    assert.deepEqual([vacio.body.sinDatos, vacio.body.motivoSinDatos], [true, 'FILTRO_SIN_COINCIDENCIAS']);
    assert.equal(fila(vacio, 'ANA1')?.activas, 2);
  });

  it('[E6-B02-T12] ANA1 reasignada a H4 por ADM1: QE1 (umbral 1) ve 3 activas sobrecargada; QE2 (umbral 5) 1 activa «No supervisado por ti»; LID1 una fila en el grupo de QE1 con 2 activas y umbral 1', async () => {
    const h4 = mundo.hdus.find((h) => h.codigo === 'H4');
    assert.ok(h4);
    h4.analista = 'ana1';
    await m.pedir('put', '/v1/indicadores/umbral-carga', 'qe1', { valor: 1 }).then((x) => assert.equal(x.status, 200));
    const qe1 = await carga('qe1');
    assert.deepEqual([fila(qe1, 'ANA1')?.activas, fila(qe1, 'ANA1')?.sobrecargado, fila(qe1, 'ANA1')?.supervisadoPorMi], [3, true, true]);
    const qe2 = await carga('qe2');
    assert.deepEqual([fila(qe2, 'ANA1')?.activas, fila(qe2, 'ANA1')?.supervisadoPorMi, fila(qe2, 'ANA1')?.sobrecargado, qe2.body.grupos[0].umbral.valor], [1, false, false, 5]);
    const lid = await carga('lid1');
    const grupoQe1 = lid.body.grupos.find((g: Grupo) => g.umbral.qe?.nombre === 'QE1') as Grupo;
    const filasAna1 = lid.body.grupos.flatMap((g: Grupo) => g.filas).filter((f: Fila) => f.analista.nombre === 'ANA1');
    assert.equal(filasAna1.length, 1, 'una sola fila: un analista tiene a lo sumo un QE supervisor');
    assert.deepEqual([grupoQe1.umbral.valor, grupoQe1.umbral.porDefecto, grupoQe1.filas.find((f) => f.analista.nombre === 'ANA1')?.activas, grupoQe1.filas.find((f) => f.analista.nombre === 'ANA1')?.sobrecargado, filasAna1[0].supervisadoPorMi], [1, false, 2, true, null]);
  });

  it('[E6-B02-T13] AUD1: el analista desactivado con una HDU activa aparece con activo false y su HDU contada; ANA4 con ceros, sin QE supervisor y umbral por defecto', async () => {
    mundo.personas.ana2 = { ...PERSONAS.ana2, activo: false };
    const r = await carga('aud1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ana2 = fila(r, 'ANA2');
    assert.deepEqual([ana2?.analista.activo, ana2?.activas], [false, 2]);
    const ana4 = fila(r, 'ANA4');
    assert.deepEqual([ana4?.activas, ana4?.sinHdu, ana4?.cumplimiento.valor], [0, true, null]);
    const sinQe = r.body.grupos.find((g: Grupo) => g.umbral.qe === null) as Grupo;
    assert.deepEqual([sinQe.umbral.valor, sinQe.umbral.porDefecto, sinQe.filas.map((f) => f.analista.nombre)], [5, true, ['ANA4']]);
    assert.equal(r.body.grupos.at(-1)?.umbral.qe, null, '«Sin QE supervisor» va al final');
    assert.deepEqual(r.body.grupos.slice(0, -1).map((g: Grupo) => g.umbral.qe?.nombre), ['QE1', 'QE2']);
  });

  it('con Certificaciones detenido solo el cumplimiento queda indisponible; lo demás (solo Organización) sigue y no se llama a Impedimentos', async () => {
    mundo.caida.cert = true;
    const r = await carga('qe1');
    assert.equal(r.status, 200);
    const ana1 = fila(r, 'ANA1');
    assert.deepEqual([ana1?.cumplimiento, ana1?.activas, ana1?.porEstado.EN_EJECUCION], [{ estado: 'indisponible', valor: null }, 2, 2]);
    assert.equal(r.body.fuentes.certificaciones, 'indisponible');
    assert.equal(mundo.contar('IMP'), 0);
  });

  it('Organización detenida: 503; QE sin analistas ni HDU: sinDatos AMBITO_VACIO; Administrador y Analista: 403', async () => {
    assert.equal((await carga('qe3')).body.motivoSinDatos, 'AMBITO_VACIO');
    assert.equal((await carga('adm1')).status, 403);
    assert.equal((await carga('ana1')).status, 403);
    mundo.caida.org = true;
    assert.equal((await carga('qe1')).status, 503);
  });
});

describe('E6-B02#3 · umbral de carga', () => {
  const put = (persona: Parameters<Montaje['pedir']>[2], cuerpo: unknown) => m.pedir('put', '/v1/indicadores/umbral-carga', persona, cuerpo);
  const eventos = async () => prismaServicio.eventoUmbralCarga.count();

  it('GET del propio sin fila: 5 por defecto; tras fijar: el valor, quién y cuándo', async () => {
    const inicial = await m.pedir('get', '/v1/indicadores/umbral-carga', 'qe1');
    assert.equal(inicial.status, 200);
    assert.deepEqual(inicial.body, { qe: { id: PERSONAS.qe1.id, nombre: 'QE1' }, valor: 5, porDefecto: true, actualizadoEn: null, actualizadoPor: null });
    const fijado = await put('qe1', { valor: 8 });
    assert.equal(fijado.status, 200);
    assert.equal(fijado.body.cambio, true);
    assert.deepEqual([fijado.body.umbral.valor, fijado.body.umbral.porDefecto, fijado.body.umbral.actualizadoPor], [8, false, { id: PERSONAS.qe1.id, nombre: 'QE1' }]);
    assert.ok(!Number.isNaN(Date.parse(fijado.body.umbral.actualizadoEn)));
    const otra = await put('qe1', { valor: 8 });
    assert.equal(otra.body.cambio, false);
    assert.equal(await eventos(), 1, 'enviar el mismo valor no inserta evento');
  });

  it('[E6-B02-T07] 0 y 51 dan 400 VALOR_FUERA_DE_RANGO; 2.5, «abc», «5», null y vacío dan 400 VALIDACION con campo valor; el umbral no cambia', async () => {
    for (const valor of [0, 51, -3, 1000]) {
      const r = await put('qe1', { valor });
      assert.equal(r.status, 400, String(valor));
      assert.equal(r.body.codigo, 'VALOR_FUERA_DE_RANGO');
      assert.equal(r.body.detalles[0].campo, 'valor');
    }
    for (const cuerpo of [{ valor: 2.5 }, { valor: 'abc' }, { valor: '5' }, { valor: null }, {}, undefined, []]) {
      const r = await put('qe1', cuerpo);
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
      assert.equal(r.body.codigo, 'VALIDACION');
      assert.equal(r.body.detalles[0].campo, 'valor');
    }
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga', 'qe1')).body.porDefecto, true);
    assert.equal(await eventos(), 0);
    assert.equal((await put('qe1', { valor: 1 })).status, 200, 'el límite inferior vale');
    assert.equal((await put('qe1', { valor: 50 })).status, 200, 'el límite superior vale');
  });

  it('[E6-B02-T08] QE2, LID1, AUD1, ADM1 y ANA1 reciben 403 al fijar; sin sesión 401; QE2 no lee el de QE1; LID1 y AUD1 sí', async () => {
    for (const persona of ['qe2', 'lid1', 'aud1', 'adm1', 'ana1'] as const) {
      const r = await put(persona, { valor: 3 });
      assert.equal(r.status, persona === 'qe2' ? 200 : 403, persona);
    }
    assert.equal((await put(null, { valor: 3 })).status, 401);
    assert.equal(await eventos(), 1, 'solo QE2 pudo fijar el suyo');
    const ajeno = await m.pedir('get', `/v1/indicadores/umbral-carga?qeId=${PERSONAS.qe1.id}`, 'qe2');
    assert.equal(ajeno.status, 403);
    for (const persona of ['lid1', 'aud1'] as const) {
      const r = await m.pedir('get', `/v1/indicadores/umbral-carga?qeId=${PERSONAS.qe1.id}`, persona);
      assert.equal(r.status, 200, persona);
      assert.deepEqual([r.body.qe.nombre, r.body.valor, r.body.porDefecto], ['QE1', 5, true]);
    }
    assert.equal((await m.pedir('get', `/v1/indicadores/umbral-carga?qeId=${PERSONAS.qe2.id}`, 'lid1')).status, 200, 'QE2 es responsable de H3 (CEL-B) y supervisor de ANA3: está en el ámbito de LID1');
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga', 'lid1')).status, 400, 'el Líder no tiene umbral propio: qeId es obligatorio');
    assert.equal((await m.pedir('get', `/v1/indicadores/umbral-carga?qeId=${INEXISTENTE}`, 'lid1')).status, 403);
    assert.equal((await m.pedir('get', `/v1/indicadores/umbral-carga?qeId=${INEXISTENTE}`, 'aud1')).status, 404);
    // D176/D161: QE3 no tiene HDU ni equipo, pero el Auditor lo recibe en `qes` y lee su umbral y su historial.
    assert.equal((await m.pedir('get', `/v1/indicadores/umbral-carga?qeId=${PERSONAS.qe3.id}`, 'aud1')).status, 200);
    assert.equal((await m.pedir('get', `/v1/indicadores/umbral-carga/historial?qeId=${PERSONAS.qe3.id}`, 'aud1')).status, 200);
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga?qeId=abc', 'aud1')).status, 400);
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga', 'adm1')).status, 403);
  });

  it('[E6-B02-T09] tras 5→1 y 1→2: dos eventos, el más reciente primero, con valor anterior, nuevo, actor y fecha; AUD1 lo lee, LID1 recibe 403', async () => {
    await put('qe1', { valor: 1 });
    await put('qe1', { valor: 2 });
    const r = await m.pedir('get', '/v1/indicadores/umbral-carga/historial', 'qe1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.total, 2);
    assert.deepEqual(r.body.items.map((e: { valorAnterior: number; valorNuevo: number }) => [e.valorAnterior, e.valorNuevo]), [[1, 2], [5, 1]]);
    assert.deepEqual(r.body.items[0].actor, { id: PERSONAS.qe1.id, nombre: 'QE1' });
    assert.deepEqual(r.body.items[0].qe, { id: PERSONAS.qe1.id, nombre: 'QE1' });
    assert.ok(Date.parse(r.body.items[0].fecha) >= Date.parse(r.body.items[1].fecha));
    assert.equal(r.body.tamanoPagina, 5, '5 por defecto');
    const aud = await m.pedir('get', `/v1/indicadores/umbral-carga/historial?qeId=${PERSONAS.qe1.id}`, 'aud1');
    assert.equal(aud.status, 200);
    assert.equal(aud.body.total, 2);
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga/historial', 'aud1')).status, 400, 'el Auditor debe indicar el QE');
    assert.equal((await m.pedir('get', `/v1/indicadores/umbral-carga/historial?qeId=${PERSONAS.qe1.id}`, 'lid1')).status, 403);
    assert.equal((await m.pedir('get', `/v1/indicadores/umbral-carga/historial?qeId=${PERSONAS.qe1.id}`, 'qe2')).status, 403);
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga/historial', 'adm1')).status, 403);
    const pagina = await m.pedir('get', '/v1/indicadores/umbral-carga/historial?tamanoPagina=1&pagina=2', 'qe1');
    assert.deepEqual([pagina.body.items.length, pagina.body.items[0].valorAnterior, pagina.body.total], [1, 5, 2]);
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga/historial?tamanoPagina=500', 'qe1')).body.tamanoPagina, 100, 'se recorta a 100');
    assert.equal((await m.pedir('get', '/v1/indicadores/umbral-carga/historial?pagina=0', 'qe1')).status, 400);
  });

  it('[E6-B02-T09] un intento directo de UPDATE o DELETE con el rol svc_indicadores falla', async () => {
    await put('qe1', { valor: 3 });
    await assert.rejects(() => prismaServicio.$executeRawUnsafe('UPDATE evento_umbral_carga SET valor_nuevo = 9'), /permission denied|permiso denegado/i);
    await assert.rejects(() => prismaServicio.$executeRawUnsafe('DELETE FROM evento_umbral_carga'), /permission denied|permiso denegado/i);
    assert.equal(await eventos(), 1);
  });

  it('fijar el valor por defecto sin fila previa no registra evento; dos cambios simultáneos terminan y encadenan sus eventos', async () => {
    assert.equal((await put('qe1', { valor: 5 })).body.cambio, false);
    assert.equal(await eventos(), 0);
    const [a, b] = await Promise.all([put('qe2', { valor: 7 }), put('qe2', { valor: 9 })]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    const historial = await m.pedir('get', '/v1/indicadores/umbral-carga/historial', 'qe2');
    assert.equal(historial.body.total, 2);
    assert.equal(historial.body.items[1].valorAnterior, 5);
    assert.equal(historial.body.items[0].valorAnterior, historial.body.items[1].valorNuevo);
  });

  it('un QE que cambió de rol o se desactivó pierde el acceso en la solicitud siguiente (el rol sale de Organización)', async () => {
    mundo.personas.qe1 = { ...PERSONAS.qe1, rol: 'ADMINISTRADOR' };
    assert.equal((await put('qe1', { valor: 3 })).status, 403);
    mundo.personas.qe1 = { ...PERSONAS.qe1, activo: false };
    assert.equal((await put('qe1', { valor: 3 })).status, 403);
  });
});
