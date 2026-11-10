/** X4 · snapshot (cron, manual, ejecuciones, gancho de prueba) y tendencia (E6-B03) contra Postgres con fuentes simuladas. */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { cerrarBases, consultaDuenio, limpiarIndicadores, prismaServicio } from '../ayudas-bd.js';
import { montar, type Montaje } from '../montaje.js';
import { CELULAS, CRON_SECRET, crearHdus, Mundo, PERSONAS, SPRINTS, SUPERVISION_BASE, TOKEN_SEMILLA } from '../mundo.js';

let m: Montaje;
const mundo = new Mundo();
/** «Hoy» de las pruebas: 2026-11-04 03:00 en Santiago (06:00 UTC, la hora del cron). */
const AHORA = new Date('2026-11-04T06:00:00Z');

before(async () => {
  await mundo.iniciar();
  m = await montar({ mundo, reloj: { ahora: () => AHORA } });
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
  mundo.retrasoSnapshotMs = 0;
  mundo.credencialCert = mundo.credencialImp = mundo.credencialOrg = 'token-indicadores-de-pruebas-0123456789';
  mundo.llamadas = [];
  for (const clave of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) mundo.personas[clave] = { ...PERSONAS[clave] };
});

const cron = (autorizacion?: string) => {
  const peticion = request(m.app.getHttpServer()).get('/v1/cron/indicadores/snapshot');
  return autorizacion === undefined ? peticion : peticion.set('authorization', autorizacion);
};
const semilla = (instante: string, token: string | null = TOKEN_SEMILLA) => {
  const peticion = request(m.app.getHttpServer()).post('/v1/interno/carga/snapshots');
  return (token === null ? peticion : peticion.set('x-q360-servicio-token', token)).send({ instante });
};
const filas = async (where = '') => consultaDuenio<Record<string, unknown>>(`SELECT * FROM indicadores.snapshot_indicadores ${where} ORDER BY fecha, ambito, celula_nombre, sprint_nombre`);
const contarEjecuciones = async () => (await consultaDuenio<{ n: number }>('SELECT count(*)::int AS n FROM indicadores.ejecucion_snapshot'))[0]?.n ?? 0;
const dia = (valor: unknown): string => (valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10));
const ambitoQe = (clave: keyof typeof PERSONAS) => `QE:${PERSONAS[clave].id}`;

describe('E6-B03#1 · generación del snapshot', () => {
  it('[E6-B03-T01] el cron con el secreto: ejecución EXITOSA, origen CRON, actor SISTEMA, filas escritas y fecha de hoy en Santiago', async () => {
    const r = await cron(`Bearer ${CRON_SECRET}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.resultado, r.body.origen, r.body.actor, r.body.fecha, r.body.motivo], ['EXITOSA', 'CRON', { id: null, nombre: 'SISTEMA' }, '2026-11-04', null]);
    assert.ok(r.body.filasEscritas > 0);
    assert.equal(r.body.filasEscritas, r.body.filasNuevas + r.body.filasActualizadas);
    assert.ok(r.body.duracionMs >= 0);
    assert.equal((await filas()).length, r.body.filasEscritas);
  });

  it('[E6-B03-T02] sin cabecera, con un secreto incorrecto, con la sesión de ADM1 o sin CRON_SECRET configurado: 401 y ninguna ejecución', async () => {
    for (const cabecera of [undefined, 'Bearer otro-secreto', `Bearer ${CRON_SECRET}x`, `Basic ${CRON_SECRET}`, await (await import('../mundo.js')).bearer('adm1')]) {
      const r = await cron(cabecera);
      assert.equal(r.status, 401, String(cabecera));
      assert.equal(r.body.codigo, 'NO_AUTENTICADO');
    }
    assert.equal(await contarEjecuciones(), 0);
    const sinSecreto = await montar({ mundo, conservarDatos: true, config: { cronSecret: null } });
    try {
      const r = await request(sinSecreto.app.getHttpServer()).get('/v1/cron/indicadores/snapshot').set('authorization', 'Bearer ');
      assert.equal(r.status, 401);
      assert.equal((await request(sinSecreto.app.getHttpServer()).get('/v1/cron/indicadores/snapshot').set('authorization', `Bearer ${CRON_SECRET}`)).status, 401, 'sin CRON_SECRET la ruta nunca queda abierta');
      assert.equal(await contarEjecuciones(), 0);
    } finally {
      await sinSecreto.cerrar();
    }
  });

  it('[E6-B03-T03] fila (CEL-A, SP-PROX) de QE1 y la fila TODOS: 1 HDU, suma 30, 30.0, 1 bloqueada; cada par suma el total; TODOS suma las 8 HDU', async () => {
    await cron(`Bearer ${CRON_SECRET}`);
    const todas = await filas();
    const par = (ambito: string) => todas.find((f) => f.ambito === ambito && f.celula_nombre === 'CEL-A' && f.sprint_nombre === 'SP-PROX');
    for (const ambito of [ambitoQe('qe1'), 'TODOS']) {
      const fila = par(ambito);
      assert.ok(fila, ambito);
      assert.deepEqual([fila.hdu_total, fila.suma_avance, Number(fila.cumplimiento_promedio), fila.bloqueadas, fila.en_curso, fila.hdu_riesgo_alto, fila.impedimentos_abiertos, fila.impedimentos_escalados, fila.semaforo], [1, 30, 30, 1, 1, 1, 1, 0, 'ROJO']);
      assert.equal(dia(fila.fecha), '2026-11-04');
    }
    for (const fila of todas) {
      assert.equal(fila.hdu_total, (fila.certificadas as number) + (fila.cerradas_excepcion as number) + (fila.en_curso as number) + (fila.sin_iniciar as number), `${fila.ambito} ${fila.celula_nombre}`);
    }
    assert.equal(todas.filter((f) => f.ambito === 'TODOS').reduce((total, f) => total + (f.hdu_total as number), 0), 8);
    const ambitos = new Set(todas.map((f) => f.ambito));
    assert.deepEqual([...ambitos].sort(), ['TODOS', ambitoQe('qe1'), ambitoQe('qe2')].sort(), 'QE3 no tiene HDU y no genera ámbito');
    const qe1Total = todas.filter((f) => f.ambito === ambitoQe('qe1')).reduce((total, f) => total + (f.hdu_total as number), 0);
    assert.equal(qe1Total, 5);
  });

  it('el semáforo de la fila usa las HDU no cerradas del par y es VERDE si no hay ninguna; H7 (cerrada, CEL-A/VENC) lo cuenta como certificada', async () => {
    await cron(`Bearer ${CRON_SECRET}`);
    const venc = (await filas()).find((f) => f.ambito === 'TODOS' && f.celula_nombre === 'CEL-A' && f.sprint_nombre === 'SP-VENC');
    assert.ok(venc);
    // CEL-A/SP-VENC: H2 (en ejecución, riesgo MEDIO) y H7 (cerrada con 10).
    assert.deepEqual([venc.hdu_total, venc.certificadas, venc.en_curso, venc.suma_avance, Number(venc.cumplimiento_promedio), venc.semaforo], [2, 1, 1, 110, 55, 'AMARILLO']);
    const soloCerrada = (await filas()).find((f) => f.ambito === ambitoQe('qe2') && f.celula_nombre === 'CEL-A');
    assert.deepEqual([soloCerrada?.hdu_total, soloCerrada?.semaforo, soloCerrada?.bloqueadas], [1, 'VERDE', 0]);
  });

  it('[E6-B03-T07] ADM1 dispara el manual: 200, origen MANUAL, actor ADM1; QE1, LID1, AUD1 y ANA1 reciben 403', async () => {
    const r = await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.resultado, r.body.origen, r.body.actor], ['EXITOSA', 'MANUAL', { id: PERSONAS.adm1.id, nombre: 'ADM1' }]);
    for (const persona of ['qe1', 'lid1', 'aud1', 'ana1'] as const) {
      const denegado = await m.pedir('post', '/v1/indicadores/snapshots', persona);
      assert.equal(denegado.status, 403, persona);
      assert.equal(denegado.body.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal((await m.pedir('post', '/v1/indicadores/snapshots', null)).status, 401);
    assert.equal(await contarEjecuciones(), 1);
    // Lee con la credencial de Indicadores, no con el token del usuario (D177).
    const lecturas = mundo.llamadas.filter((l) => l.fuente !== 'ORG' || l.ruta.includes('/snapshot'));
    assert.ok(lecturas.length >= 3);
    assert.ok(lecturas.every((l) => l.credencial === 'token-indicadores-de-pruebas-0123456789' && l.autorizacion === undefined));
  });
});

describe('E6-B03#2 · idempotencia y concurrencia', () => {
  it('[E6-B03-T04] dos ejecuciones el mismo día: el mismo número de filas; la segunda informa filas actualizadas y ninguna nueva', async () => {
    const primera = await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    const antes = (await filas()).length;
    const segunda = await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    assert.equal((await filas()).length, antes);
    assert.deepEqual([segunda.body.filasNuevas, segunda.body.filasActualizadas, segunda.body.filasEscritas], [0, antes, antes]);
    assert.equal(primera.body.filasNuevas, antes);
  });

  it('[E6-B03-T05] H1 pasa de 30 a 40 % entre dos ejecuciones: una sola fila por clave y la de H1 con suma 40 y 40.0', async () => {
    await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    const h1 = mundo.hdus.find((h) => h.codigo === 'H1');
    assert.ok(h1);
    h1.aprobados = 4;
    await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    const filasH1 = (await filas()).filter((f) => f.celula_nombre === 'CEL-A' && f.sprint_nombre === 'SP-PROX');
    assert.equal(filasH1.length, 2, 'TODOS y QE1: una por clave');
    assert.ok(filasH1.every((f) => f.suma_avance === 40 && Number(f.cumplimiento_promedio) === 40));
  });

  it('[E6-B03-T06] dos disparos manuales simultáneos: uno 200 y el otro 409 EJECUCION_EN_CURSO; una sola ejecución EXITOSA', async () => {
    mundo.retrasoSnapshotMs = 400;
    const [a, b] = await Promise.all([m.pedir('post', '/v1/indicadores/snapshots', 'adm1'), m.pedir('post', '/v1/indicadores/snapshots', 'adm1')]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const rechazada = a.status === 409 ? a : b;
    assert.equal(rechazada.body.codigo, 'EJECUCION_EN_CURSO');
    assert.equal(await contarEjecuciones(), 1);
    const [ejecucion] = await consultaDuenio<{ resultado: string }>('SELECT resultado FROM indicadores.ejecucion_snapshot');
    assert.equal(ejecucion?.resultado, 'EXITOSA');
    // El cron compite igual: mientras el manual corre, el cron recibe 409.
    const [manual, programado] = await Promise.all([m.pedir('post', '/v1/indicadores/snapshots', 'adm1'), (async () => { await new Promise((r) => setTimeout(r, 150)); return cron(`Bearer ${CRON_SECRET}`); })()]);
    assert.deepEqual([manual.status, programado.status], [200, 409]);
  });

  it('una ejecución EN_CURSO abandonada (más de 5 minutos) se cierra como INTERRUMPIDA y deja pasar la siguiente', async () => {
    await prismaServicio.ejecucionSnapshot.create({ data: { fecha: new Date('2026-11-03'), origen: 'MANUAL', actorNombre: 'ADM1', inicio: new Date(Date.now() - 10 * 60_000), resultado: 'EN_CURSO' } });
    const r = await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    assert.equal(r.status, 200);
    const lista = await m.pedir('get', '/v1/indicadores/snapshots/ejecuciones', 'adm1');
    assert.deepEqual(lista.body.items.map((e: { resultado: string; motivo: string | null }) => [e.resultado, e.motivo]), [['EXITOSA', null], ['FALLIDA', 'INTERRUMPIDA']]);
    // Una reciente sí bloquea.
    await prismaServicio.ejecucionSnapshot.create({ data: { fecha: new Date('2026-11-03'), origen: 'MANUAL', actorNombre: 'ADM1', inicio: new Date(Date.now() - 60_000), resultado: 'EN_CURSO' } });
    assert.equal((await m.pedir('post', '/v1/indicadores/snapshots', 'adm1')).status, 409);
  });

  it('[E6-B03-T08] con Impedimentos detenido: ejecución FALLIDA con IMPEDIMENTOS_NO_DISPONIBLE y 0 filas; repuesto el servicio, EXITOSA', async () => {
    mundo.caida.imp = true;
    const mala = await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    assert.equal(mala.status, 200, 'la ejecución se informa cerrada, no como error HTTP');
    assert.deepEqual([mala.body.resultado, mala.body.motivo, mala.body.filasEscritas, mala.body.filasNuevas, mala.body.filasActualizadas], ['FALLIDA', 'IMPEDIMENTOS_NO_DISPONIBLE', 0, 0, 0]);
    assert.equal((await filas()).length, 0, 'nada parcial');
    mundo.caida.imp = false;
    const buena = await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    assert.equal(buena.body.resultado, 'EXITOSA');
    assert.ok((await filas()).length > 0);
  });

  it('el resto de las fallas también dejan la ejecución FALLIDA sin filas: Organización, Certificaciones, tope, credencial rechazada o sin configurar', async () => {
    const casos: Array<[string, () => void, () => void, string]> = [
      ['Organización', () => (mundo.caida.org = true), () => (mundo.caida.org = false), 'ORGANIZACION_NO_DISPONIBLE'],
      ['Certificaciones', () => (mundo.caida.cert = true), () => (mundo.caida.cert = false), 'CERTIFICACIONES_NO_DISPONIBLE'],
      ['credencial de Certificaciones', () => (mundo.credencialCert = 'otra'), () => (mundo.credencialCert = 'token-indicadores-de-pruebas-0123456789'), 'CONFIGURACION_INVALIDA'],
      ['credencial de Impedimentos', () => (mundo.credencialImp = undefined), () => (mundo.credencialImp = 'token-indicadores-de-pruebas-0123456789'), 'CONFIGURACION_INVALIDA'],
      ['credencial de Organización', () => (mundo.credencialOrg = 'otra'), () => (mundo.credencialOrg = 'token-indicadores-de-pruebas-0123456789'), 'CONFIGURACION_INVALIDA'],
    ];
    for (const [nombre, romper, reparar, motivo] of casos) {
      romper();
      // Con Organización detenida no hay sesión que resolver: el disparo programado no la necesita.
      const r = nombre === 'Organización' ? await cron(`Bearer ${CRON_SECRET}`) : await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
      reparar();
      assert.deepEqual([r.status, r.body.resultado, r.body.motivo, r.body.filasEscritas], [200, 'FALLIDA', motivo, 0], nombre);
    }
    assert.equal((await filas()).length, 0);

    const sinCredencial = await montar({ mundo, conservarDatos: true, config: { servicioToken: null } });
    try {
      const r = await sinCredencial.pedir('post', '/v1/indicadores/snapshots', 'adm1');
      assert.deepEqual([r.body.resultado, r.body.motivo], ['FALLIDA', 'CONFIGURACION_INVALIDA']);
    } finally {
      await sinCredencial.cerrar();
    }
    const conTope = await montar({ mundo, conservarDatos: true, config: { topeHdu: 5 } });
    try {
      const r = await conTope.pedir('post', '/v1/indicadores/snapshots', 'adm1');
      assert.deepEqual([r.body.resultado, r.body.motivo, r.body.filasEscritas], ['FALLIDA', 'EXCEDE_TOPE', 0]);
    } finally {
      await conTope.cerrar();
    }
    assert.equal((await filas()).length, 0);
  });

  it('[E6-B03-T11] el Administrador ve las ejecuciones (fecha, origen, resultado, filas) sin cifras ni datos de células; los demás reciben 403', async () => {
    await m.pedir('post', '/v1/indicadores/snapshots', 'adm1');
    const r = await m.pedir('get', '/v1/indicadores/snapshots/ejecuciones', 'adm1');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.total, r.body.pagina, r.body.tamanoPagina], [1, 1, 25]);
    assert.deepEqual(Object.keys(r.body.items[0]).sort(), ['actor', 'duracionMs', 'fecha', 'filasActualizadas', 'filasEscritas', 'filasNuevas', 'fin', 'id', 'inicio', 'motivo', 'origen', 'resultado']);
    for (const persona of ['qe1', 'lid1', 'aud1', 'ana1'] as const) assert.equal((await m.pedir('get', '/v1/indicadores/snapshots/ejecuciones', persona)).status, 403, persona);
    assert.equal((await m.pedir('get', '/v1/indicadores/snapshots/ejecuciones?pagina=0', 'adm1')).status, 400);
    assert.equal((await m.pedir('get', '/v1/indicadores/snapshots/ejecuciones?tamanoPagina=999', 'adm1')).body.tamanoPagina, 100);
  });
});

describe('gancho de prueba POST /v1/interno/carga/snapshots [D184]', () => {
  it('[E6-B03-T12] 2026-07-01T02:30:00Z (22:30 del 30 de junio en Santiago, invierno) guarda la fecha 2026-06-30; origen MANUAL y actor «Carga de prueba»', async () => {
    const r = await semilla('2026-07-01T02:30:00Z');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.fecha, r.body.origen, r.body.actor, r.body.resultado], ['2026-06-30', 'MANUAL', { id: null, nombre: 'Carga de prueba' }, 'EXITOSA']);
    assert.ok((await filas()).every((f) => dia(f.fecha) === '2026-06-30'));
    const verano = await semilla('2026-12-15T02:30:00Z');
    assert.equal(verano.body.fecha, '2026-12-14', 'en verano el desfase es de 3 horas');
  });

  it('exige la credencial de la semilla y PERMITIR_CARGA_SEMILLA; un instante inválido es 400', async () => {
    assert.equal((await semilla('2026-07-01T02:30:00Z', null)).status, 401);
    assert.equal((await semilla('2026-07-01T02:30:00Z', 'otro')).status, 401);
    assert.equal((await semilla('2026-07-01T02:30:00Z', 'token-indicadores-de-pruebas-0123456789')).status, 401, 'la credencial de Indicadores no es la de la semilla');
    assert.equal((await semilla('ayer')).status, 400);
    assert.equal((await request(m.app.getHttpServer()).post('/v1/interno/carga/snapshots').set('x-q360-servicio-token', TOKEN_SEMILLA).send({})).status, 400);
    const deshabilitada = await montar({ mundo, conservarDatos: true, config: { permitirCargaSemilla: false } });
    try {
      assert.equal((await request(deshabilitada.app.getHttpServer()).post('/v1/interno/carga/snapshots').set('x-q360-servicio-token', TOKEN_SEMILLA).send({ instante: '2026-07-01T02:30:00Z' })).status, 403);
    } finally {
      await deshabilitada.cerrar();
    }
    const produccion = await montar({ mundo, conservarDatos: true, config: { produccion: true } });
    try {
      assert.equal((await request(produccion.app.getHttpServer()).post('/v1/interno/carga/snapshots').set('x-q360-servicio-token', TOKEN_SEMILLA).send({ instante: '2026-07-01T02:30:00Z' })).status, 403, 'nunca en producción');
    } finally {
      await produccion.cerrar();
    }
    assert.equal(await contarEjecuciones(), 0);
  });
});

describe('E6-B03#3 · tendencia', () => {
  const tres = async () => {
    // H1 en 30, 30 y 40 %: tres días con snapshot (E6-B03-T09).
    const h1 = mundo.hdus.find((h) => h.codigo === 'H1');
    assert.ok(h1);
    await semilla('2026-11-01T09:00:00Z');
    await semilla('2026-11-02T09:00:00Z');
    h1.aprobados = 4;
    await semilla('2026-11-03T09:00:00Z');
  };
  const consulta = (persona: Parameters<Montaje['pedir']>[2], extra = '') => m.pedir('get', `/v1/indicadores/tendencia?celulaId=${CELULAS.A.id}&sprintId=${SPRINTS.PROX.id}${extra}`, persona);

  it('[E6-B03-T09] QE1 con CEL-A y SP-PROX: una serie con 3 puntos ascendentes: 30.0, 30.0, 40.0', async () => {
    await tres();
    const r = await consulta('qe1');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.series.length, 1);
    const [serie] = r.body.series;
    assert.deepEqual(serie.puntos.map((p: { fecha: string; cumplimiento: number; hduTotal: number }) => [p.fecha, p.cumplimiento, p.hduTotal]), [['2026-11-01', 30, 1], ['2026-11-02', 30, 1], ['2026-11-03', 40, 1]]);
    assert.deepEqual([serie.celula.nombre, serie.sprint.nombre, serie.sprint.cerrado], ['CEL-A', 'SP-PROX', false]);
    assert.deepEqual([r.body.sinDatos, r.body.motivoSinDatos, r.body.totalSeries], [false, null, 1]);
    assert.deepEqual(r.body.filtros, { celulaId: CELULAS.A.id, sprintId: SPRINTS.PROX.id, desde: '2026-08-07', hasta: '2026-11-04' });
  });

  it('[E6-B03-T10] QE2 no ve H1: sinDatos; AUD1 ve la serie completa (ámbito TODOS); LID1 la ve por ser de su célula, pero no la de CEL-C', async () => {
    await tres();
    const qe2 = await consulta('qe2');
    assert.deepEqual([qe2.status, qe2.body.sinDatos, qe2.body.series, qe2.body.motivoSinDatos], [200, true, [], 'FILTRO_SIN_COINCIDENCIAS']);
    const aud = await consulta('aud1');
    assert.deepEqual(aud.body.series[0].puntos.map((p: { cumplimiento: number }) => p.cumplimiento), [30, 30, 40]);
    assert.equal((await consulta('lid1')).body.series.length, 1);
    const ajena = await m.pedir('get', `/v1/indicadores/tendencia?celulaId=${CELULAS.C.id}`, 'lid1');
    assert.deepEqual([ajena.status, ajena.body.sinDatos], [200, true], 'CEL-C no es de LID1');
    const lid2 = await consulta('lid2');
    assert.equal(lid2.body.sinDatos, true);
  });

  it('[E6-B03-T11] ADM1 y ANA1 reciben 403 en la tendencia; sin sesión 401', async () => {
    for (const persona of ['adm1', 'ana1'] as const) {
      const r = await consulta(persona);
      assert.equal(r.status, 403, persona);
      assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
    }
    assert.equal((await consulta(null)).status, 401);
  });

  it('un día sin snapshot es un hueco: no hay punto ni interpolación', async () => {
    await semilla('2026-11-01T09:00:00Z');
    await semilla('2026-11-03T09:00:00Z');
    const r = await consulta('qe1');
    assert.deepEqual(r.body.series[0].puntos.map((p: { fecha: string }) => p.fecha), ['2026-11-01', '2026-11-03']);
  });

  it('[E6-B03-T13] si H1 cambia de sprint después del snapshot: las filas anteriores no cambian, hay una fila nueva en SP-LEJ y la serie de SP-PROX termina el día anterior', async () => {
    await semilla('2026-11-01T09:00:00Z');
    await semilla('2026-11-02T09:00:00Z');
    const antes = await filas(`WHERE sprint_nombre = 'SP-PROX' AND celula_nombre = 'CEL-A'`);
    const h1 = mundo.hdus.find((h) => h.codigo === 'H1');
    assert.ok(h1);
    h1.sprint = 'LEJ';
    await semilla('2026-11-03T09:00:00Z');
    const despues = await filas(`WHERE sprint_nombre = 'SP-PROX' AND celula_nombre = 'CEL-A'`);
    assert.equal(despues.length, antes.length, 'ninguna fila nueva ni borrada en SP-PROX');
    assert.deepEqual(despues.map((f) => dia(f.fecha)).sort(), ['2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02']);
    const nueva = await filas(`WHERE sprint_nombre = 'SP-LEJ' AND celula_nombre = 'CEL-A'`);
    assert.deepEqual(nueva.map((f) => [dia(f.fecha), f.hdu_total]), [['2026-11-03', 1], ['2026-11-03', 1]]);
    const serie = (await consulta('qe1')).body.series[0];
    assert.equal(serie.puntos.at(-1).fecha, '2026-11-02');
    const lej = await m.pedir('get', `/v1/indicadores/tendencia?celulaId=${CELULAS.A.id}&sprintId=${SPRINTS.LEJ.id}`, 'qe1');
    assert.deepEqual(lej.body.series[0].puntos.map((p: { fecha: string }) => p.fecha), ['2026-11-03']);
  });

  it('sin filtros trae los sprints vigentes de las células visibles; sin ninguno vigente, el más reciente de cada célula; ordenadas por célula y luego sprint más reciente', async () => {
    await semilla('2026-11-03T09:00:00Z');
    const vigentes = await m.pedir('get', '/v1/indicadores/tendencia', 'aud1');
    // Hoy = 2026-11-04: vigentes SP-PROX (10-28..11-10) y SP-MED (11-02..11-20).
    assert.deepEqual(vigentes.body.series.map((s: { celula: { nombre: string }; sprint: { nombre: string } }) => `${s.celula.nombre}/${s.sprint.nombre}`), ['CEL-A/SP-MED', 'CEL-A/SP-PROX', 'CEL-B/SP-MED', 'CEL-B/SP-PROX']);
    assert.equal(vigentes.body.totalSeries, 4);
    // Con «hoy» muy posterior ya no hay sprint vigente: el sprint con snapshot más reciente de cada célula.
    const futuro = await montar({ mundo, conservarDatos: true, reloj: { ahora: () => new Date('2027-03-01T12:00:00Z') } });
    try {
      const r = await futuro.pedir('get', '/v1/indicadores/tendencia?desde=2026-11-01&hasta=2027-03-01', 'aud1');
      assert.deepEqual(r.body.series.map((s: { celula: { nombre: string } }) => s.celula.nombre), ['CEL-A', 'CEL-B', 'CEL-C']);
      assert.ok(r.body.series.every((s: { sprint: { cerrado: boolean } }) => s.sprint.cerrado === true), 'un sprint cerrado conserva su serie con la marca');
    } finally {
      await futuro.cerrar();
    }
  });

  it('el rango: desde posterior a hasta o mayor de 366 días es 400; fechas mal formadas 400; sin snapshots SIN_HISTORIAL; SIN_SPRINT sinDatos', async () => {
    assert.equal((await m.pedir('get', '/v1/indicadores/tendencia?desde=2026-11-04&hasta=2026-11-01', 'qe1')).status, 400);
    assert.equal((await m.pedir('get', '/v1/indicadores/tendencia?desde=2025-01-01&hasta=2026-11-01', 'qe1')).status, 400);
    assert.equal((await m.pedir('get', '/v1/indicadores/tendencia?desde=2025-11-01&hasta=2026-11-01', 'qe1')).status, 200, '365 días entran');
    const mala = await m.pedir('get', '/v1/indicadores/tendencia?desde=04-11-2026', 'qe1');
    assert.deepEqual([mala.status, mala.body.detalles[0].campo], [400, 'desde']);
    const vacia = await m.pedir('get', '/v1/indicadores/tendencia', 'qe1');
    assert.deepEqual([vacia.body.sinDatos, vacia.body.motivoSinDatos, vacia.body.totalSeries], [true, 'SIN_HISTORIAL', 0]);
    const sin = await m.pedir('get', '/v1/indicadores/tendencia?sprintId=SIN_SPRINT', 'qe1');
    assert.deepEqual([sin.body.sinDatos, sin.body.motivoSinDatos], [true, 'FILTRO_SIN_COINCIDENCIAS']);
  });

  it('el cumplimiento del punto es suma_avance / hdu_total (sin promedio de promedios): CEL-A/SP-VENC con H2 (10) y H7 (100) da 55.0', async () => {
    await semilla('2026-11-03T09:00:00Z');
    const r = await m.pedir('get', `/v1/indicadores/tendencia?celulaId=${CELULAS.A.id}&sprintId=${SPRINTS.VENC.id}&desde=2026-10-01`, 'aud1');
    assert.deepEqual(r.body.series[0].puntos, [{ fecha: '2026-11-03', cumplimiento: 55, hduTotal: 2 }]);
    assert.equal(r.body.series[0].sprint.cerrado, true);
  });
});
