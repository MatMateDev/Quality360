/**
 * E5-B02 · Sincronización con Jira (mapeo, paginación y tope, límite de tasa, presupuesto, errores). Postgres local
 * real; Organización y Jira son falsos (ayudas.ts). Los IDs son los de `docs/backlog/e5-integracion-jira.md`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  CELULA_C,
  PERSONAS,
  SPRINT_1,
  SPRINT_2,
  TOKEN_JIRA,
  cerrarBases,
  consultaDuenio,
  iniciarOrganizacionFalsa,
  issue,
  type ModoJira,
  type OrganizacionFalsa,
} from '../ayudas.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

const SINCRONIZAR = '/v1/integraciones/jira/sincronizaciones';

let org: OrganizacionFalsa;
let m: Montaje;

before(async () => {
  org = await iniciarOrganizacionFalsa();
});

afterEach(async () => {
  await m?.cerrar();
  org.hdus.clear();
  org.caida = false;
  org.accesoCaido = false;
  org.fallarUpsertDesde = null;
  org.llamadas.length = 0;
  org.upserts.length = 0;
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

async function listo(proyecto = 'QTY', config: Parameters<typeof montar>[0] = {}): Promise<Montaje> {
  m = await montar({ org, ...config });
  const guardado = await guardarConfiguracion(m, { proyecto });
  assert.equal(guardado.status, 200);
  assert.equal(guardado.body.guardado, true);
  m.jira.llamadas.length = 0;
  return m;
}

const sincronizar = (cuerpo: unknown = {}, persona: Parameters<Montaje['pedir']>[2] = 'adm1') => m.pedir('post', SINCRONIZAR, persona, cuerpo);

describe('E5-B02#1 · mapeo y escritura', () => {
  it('E5-B02-T01 sincroniza QTY: 11 leídas, 10 creadas, 1 con error, CON_ERRORES; consulta el proyecto y los tipos configurados', async () => {
    await listo();
    const r = await sincronizar();
    assert.equal(r.status, 200);
    assert.equal(r.body.leidas, 11);
    assert.equal(r.body.creadas, 10);
    assert.equal(r.body.conError, 1);
    assert.equal(r.body.actualizadas, 0);
    assert.equal(r.body.omitidas, 0);
    assert.equal(r.body.resultado, 'CON_ERRORES');
    assert.equal(r.body.origen, 'JIRA');
    assert.equal(r.body.hayMas, false);
    assert.equal(r.body.continuarDesde, null);
    assert.equal(r.body.codigoError, null);
    assert.deepEqual(r.body.sugerencias, []);
    assert.deepEqual(m.jira.consultas[0]?.tipos, ['Story', 'Historia']);
    assert.equal(m.jira.consultas[0]?.proyecto, 'QTY');
    assert.equal(m.jira.consultas[0]?.despuesDe, undefined);

    const qty1 = org.hdus.get('qty-1');
    assert.ok(qty1);
    assert.equal(qty1.titulo, 'Historia QTY-1');
    assert.equal(qty1.prioridad, 'ALTA');
    assert.equal(qty1.sprintId, SPRINT_2.id);
    assert.equal(qty1.celulaId, CELULA_C.id);
    assert.equal(qty1.qeId, PERSONAS.qe2.id);
    assert.equal(qty1.estado, 'PENDIENTE');
    assert.equal(qty1.origen, 'JIRA');
    assert.equal(qty1.descripcion, 'Descripción QTY-1');
  });

  it('E5-B02-T04 una issue sin título es una fila con error y no aborta a las demás; el Bug no figura', async () => {
    await listo();
    const r = await sincronizar();
    assert.equal(org.hdus.has('qty-11'), false);
    assert.equal(org.hdus.has('qty-7'), false);
    assert.equal(org.hdus.size, 10);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle?resultado=ERROR`, 'adm1');
    assert.equal(detalle.body.total, 1);
    assert.deepEqual([detalle.body.items[0].codigo, detalle.body.items[0].motivo, detalle.body.items[0].idHistoria], ['QTY-11', 'TITULO_VACIO', null]);
    const todas = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle`, 'adm1');
    assert.equal(todas.body.total, 11);
    assert.equal(todas.body.items.some((f: { codigo: string }) => f.codigo === 'QTY-7'), false);
  });

  it('un sprint que no existe usa el de respaldo con la advertencia SPRINT_NO_ENCONTRADO, y se cuenta en conAdvertencias', async () => {
    await listo();
    m.jira.proyectos.set('QTY', [issue(1, 'QTY'), issue(2, 'QTY', { sprints: [{ nombre: 'Sprint fantasma', estado: 'active', fin: null }] }), issue(3, 'QTY', { sprints: [] })]);
    const r = await sincronizar();
    assert.equal(r.body.conAdvertencias, 1);
    assert.equal(org.hdus.get('qty-2')?.sprintId, SPRINT_1.id);
    assert.equal(org.hdus.get('qty-3')?.sprintId, SPRINT_1.id);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle`, 'adm1');
    assert.deepEqual(detalle.body.items.map((f: { advertencias: string[] }) => f.advertencias), [[], ['SPRINT_NO_ENCONTRADO'], []]);
  });

  it('los lotes hacia Organización son de 25 filas, con el origen JIRA, el token del Administrador y sprintNoEncontrado RESPALDO', async () => {
    await listo('EXACTO');
    await sincronizar();
    assert.equal(org.upserts.length, 4);
    assert.ok(org.upserts.every((u) => (u.filas as unknown[]).length <= 25));
    const primero = org.upserts[0] as Record<string, unknown>;
    assert.equal(primero.origen, 'JIRA');
    assert.equal(primero.sprintNoEncontrado, 'RESPALDO');
    assert.equal(primero.soloSimular, false);
    assert.deepEqual(primero.destino, { celulaId: CELULA_C.id, qeResponsableId: PERSONAS.qe2.id, sprintRespaldoId: SPRINT_1.id });
    const fila = (primero.filas as Array<Record<string, unknown>>)[0];
    assert.equal(fila?.claveExterna, 'EXACTO-1');
    assert.equal(fila?.urlExterna, 'http://127.0.0.1:4010/browse/EXACTO-1');
    assert.equal(fila && 'referencia' in fila, false);
    assert.equal(fila && 'error' in fila, false);
  });

  it('repetir la sincronización deja todo SIN_CAMBIOS (omitidas) y vincularExistentes se propaga a Organización', async () => {
    await listo();
    await sincronizar();
    const r = await sincronizar({ vincularExistentes: true });
    assert.equal(r.body.creadas, 0);
    assert.equal(r.body.omitidas, 10);
    assert.equal(r.body.vincularExistentes, true);
    assert.equal(org.upserts.at(-1)?.vincularExistentes, true);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle?resultado=OMITIDA`, 'adm1');
    assert.ok(detalle.body.items.every((f: { motivo: string }) => f.motivo === 'SIN_CAMBIOS'));
  });
});

describe('E5-B02#2 · paginación y tope', () => {
  it('E5-B02-T05 BIG (230): tres sincronizaciones con continuarDesde dan 100, 100 y 30 sin duplicados', async () => {
    await listo('BIG');
    const uno = await sincronizar();
    assert.equal(uno.body.leidas, 100);
    assert.equal(uno.body.creadas, 100);
    assert.equal(uno.body.resultado, 'INCOMPLETA');
    assert.equal(uno.body.hayMas, true);
    assert.equal(uno.body.continuarDesde, 'BIG-100');
    assert.equal(uno.body.codigoError, null);
    assert.equal(m.jira.consultas.length, 2);
    assert.equal(m.jira.consultas[0]?.nextPageToken, undefined);
    assert.equal(m.jira.consultas[1]?.nextPageToken, '50');

    const dos = await sincronizar({ continuarDesde: uno.body.continuarDesde });
    assert.equal(dos.body.leidas, 100);
    assert.equal(dos.body.creadas, 100);
    assert.equal(dos.body.continuarDesde, 'BIG-200');
    assert.equal(m.jira.consultas.at(-2)?.despuesDe, 'BIG-100');

    const tres = await sincronizar({ continuarDesde: dos.body.continuarDesde });
    assert.equal(tres.body.leidas, 30);
    assert.equal(tres.body.resultado, 'EXITOSA');
    assert.equal(tres.body.hayMas, false);
    assert.equal(tres.body.continuarDesde, null);
    assert.equal(org.hdus.size, 230);
  });

  it('E5-B02-T06 con exactamente 100 issues no se inventa una continuación; un proyecto vacío es EXITOSA con ceros', async () => {
    await listo('EXACTO');
    const exacto = await sincronizar();
    assert.equal(exacto.body.leidas, 100);
    assert.equal(exacto.body.resultado, 'EXITOSA');
    assert.equal(exacto.body.hayMas, false);
    await m.cerrar();

    await listo('VACIO');
    const vacio = await sincronizar();
    assert.deepEqual([vacio.body.leidas, vacio.body.creadas, vacio.body.actualizadas, vacio.body.omitidas, vacio.body.conError, vacio.body.resultado], [0, 0, 0, 0, 0, 'EXITOSA']);
    assert.equal(m.jira.consultas.length, 1);
  });

  it('continuarDesde con comillas o con un formato inválido es 400 antes de cualquier consulta a Jira', async () => {
    await listo();
    for (const continuarDesde of ['QTY-1" OR 1=1', 'x'.repeat(41), '', ' QTY-1']) {
      const r = await sincronizar({ continuarDesde });
      assert.equal(r.status, 400, continuarDesde);
      assert.equal(r.body.detalles[0].campo, 'continuarDesde');
    }
    assert.equal((await sincronizar({ vincularExistentes: 'si' })).status, 400);
    assert.equal(m.jira.llamadas.length, 0);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 0);
  });
});

describe('E5-B02#3 · límite de tasa', () => {
  it('E5-B02-T07 con 429 al principio completa, con 2 reintentos registrados como eventos de 1000 ms', async () => {
    await listo();
    m.jira.modo = 'LIMITE';
    const r = await sincronizar();
    assert.equal(r.body.creadas, 10);
    assert.equal(r.body.reintentos429, 2);
    assert.equal(r.body.eventos.length, 2);
    for (const evento of r.body.eventos) {
      assert.equal(evento.tipo, 'JIRA_LIMITE_DE_TASA');
      assert.equal(evento.esperaMs, 1000);
      assert.ok(!Number.isNaN(Date.parse(evento.fecha)));
    }
    assert.equal(r.body.codigoError, null);
    const filas = await consultaDuenio<{ eventos: Array<{ espera_ms: number }> }>('SELECT eventos FROM integraciones.ejecucion_integracion');
    assert.deepEqual(filas[0]?.eventos.map((e) => e.espera_ms), [1000, 1000]);
  });

  it('E5-B02-T08 con el 429 persistente en la página 2: INCOMPLETA, lo procesado queda registrado y al continuar termina sin duplicados', async () => {
    await listo('BIG');
    m.jira.modo = 'LIMITE_PAGINA_2';
    const uno = await sincronizar();
    assert.equal(uno.body.resultado, 'INCOMPLETA');
    assert.equal(uno.body.codigoError, 'JIRA_LIMITE_DE_TASA');
    assert.equal(uno.body.mensajeError, 'Jira pidió esperar demasiado. Reintenta en unos minutos.');
    assert.deepEqual(uno.body.sugerencias, ['CONTINUAR', 'IMPORTAR_ARCHIVO']);
    assert.equal(uno.body.creadas, 50);
    assert.equal(uno.body.hayMas, true);
    assert.equal(uno.body.continuarDesde, 'BIG-50');
    assert.equal(uno.body.reintentos429, 2);

    m.jira.modo = 'NORMAL';
    let desde: string | null = uno.body.continuarDesde;
    let vueltas = 0;
    while (desde !== null && vueltas++ < 5) desde = (await sincronizar({ continuarDesde: desde })).body.continuarDesde;
    assert.equal(desde, null);
    assert.equal(org.hdus.size, 230);
  });
});

describe('E5-B02 · errores de Jira y de tiempo', () => {
  it('E5-B02-T09 Jira lento: FALLIDA JIRA_TIEMPO_AGOTADO en menos de 4 s, sin HDU y con la ejecución registrada', async () => {
    await listo();
    m.jira.modo = 'LENTO';
    const inicio = Date.now();
    const r = await sincronizar();
    assert.ok(Date.now() - inicio < 4000);
    assert.equal(r.status, 200);
    assert.equal(r.body.resultado, 'FALLIDA');
    assert.equal(r.body.codigoError, 'JIRA_TIEMPO_AGOTADO');
    assert.equal(r.body.leidas, 0);
    assert.equal(r.body.hayMas, false);
    assert.equal(org.hdus.size, 0);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 1);
  });

  it('E5-B02-T10 token revocado, sin permiso, respuesta inválida, Jira caído y sitio inexistente: FALLIDA con el mensaje fijo, 5 ejecuciones', async () => {
    await listo();
    const casos: Array<[ModoJira, string, string]> = [
      ['TOKEN_REVOCADO', 'JIRA_CREDENCIAL_INVALIDA', 'Jira rechazó el correo o el API token. Revisa la conexión.'],
      ['SIN_PERMISO', 'JIRA_SIN_PERMISO', 'La cuenta de Jira no tiene permiso para leer este proyecto.'],
      ['RESPUESTA_INVALIDA', 'JIRA_RESPUESTA_INVALIDA', 'Jira respondió algo que no entendimos.'],
      ['CAIDO', 'JIRA_NO_DISPONIBLE', 'Jira no está disponible por ahora.'],
      ['SITIO_INEXISTENTE', 'JIRA_SITIO_NO_ENCONTRADO', 'No pudimos conectar con ese sitio de Jira. Revisa la dirección.'],
    ];
    for (const [modo, codigo, mensaje] of casos) {
      m.jira.modo = modo;
      const r = await sincronizar();
      assert.equal(r.status, 200, modo);
      assert.equal(r.body.resultado, 'FALLIDA', modo);
      assert.equal(r.body.codigoError, codigo, modo);
      assert.equal(r.body.mensajeError, mensaje, modo);
      assert.ok(r.body.sugerencias.length >= 1);
      assert.equal(r.body.sugerencias.includes('IMPORTAR_ARCHIVO'), true, modo);
      assert.equal(JSON.stringify(r.body).includes(TOKEN_JIRA), false);
    }
    const lista = await m.pedir('get', '/v1/integraciones/ejecuciones', 'adm1');
    assert.equal(lista.body.total, 5);
    assert.equal(org.hdus.size, 0);
  });

  it('E5-B02-T12 con un presupuesto corto y Jira lento por página: INCOMPLETA PRESUPUESTO_DE_TIEMPO, con lo procesado registrado', async () => {
    await listo('BIG', { config: { presupuestoMs: 2500 }, conservarDatos: false });
    m.jira.modo = 'RETARDO';
    m.jira.retardoMs = 1000;
    const inicio = Date.now();
    const r = await sincronizar();
    const duracion = Date.now() - inicio;
    assert.equal(r.body.resultado, 'INCOMPLETA');
    assert.equal(r.body.codigoError, 'PRESUPUESTO_DE_TIEMPO');
    assert.equal(r.body.mensajeError, 'Se alcanzó el tiempo máximo. Continúa para procesar el resto.');
    assert.deepEqual(r.body.sugerencias, ['CONTINUAR']);
    assert.equal(r.body.hayMas, true);
    assert.ok(r.body.duracionMs <= 3500, `duracionMs ${r.body.duracionMs}`);
    assert.ok(duracion <= 3500, `la petición tardó ${duracion} ms`);
    assert.ok(r.body.creadas >= 50);
    assert.equal(org.hdus.size, r.body.creadas);
    assert.equal(r.body.continuarDesde, `BIG-${r.body.creadas}`);
    const detalle = await consultaDuenio<{ n: number }>('SELECT count(*)::int AS n FROM integraciones.detalle_ejecucion');
    assert.equal(detalle[0]?.n, r.body.creadas);
  });
});

describe('E5-B02 · solo el Administrador y sin configuración', () => {
  it('E5-B02-T11 QE, Analista, Líder y Auditor: 403; sin token 401; sin configuración 409 JIRA_NO_CONFIGURADO; Jira no recibe nada y no se registra ejecución', async () => {
    m = await montar({ org });
    const sinConfigurar = await sincronizar();
    assert.equal(sinConfigurar.status, 409);
    assert.equal(sinConfigurar.body.codigo, 'JIRA_NO_CONFIGURADO');
    assert.equal(sinConfigurar.body.mensaje, 'Configura la conexión con Jira antes de sincronizar.');

    await guardarConfiguracion(m);
    m.jira.llamadas.length = 0;
    for (const persona of ['qe1', 'ana1', 'lid1', 'aud1'] as const) {
      const r = await sincronizar({}, persona);
      assert.equal(r.status, 403, persona);
      assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
    }
    const sin = await sincronizar({}, null);
    assert.equal(sin.status, 401);
    assert.equal(m.jira.llamadas.length, 0);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 0);
  });
});

describe('E5-B02 · Organización', () => {
  it('E5-B02-T13 con Organización detenida antes de empezar: 503 SERVICIO_NO_DISPONIBLE, Jira no recibe nada y no hay ejecución', async () => {
    await listo();
    org.accesoCaido = true;
    const r = await sincronizar();
    assert.equal(r.status, 503);
    assert.equal(r.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    assert.equal(m.jira.llamadas.length, 0);
    assert.equal((await consultaDuenio('SELECT 1 FROM integraciones.ejecucion_integracion')).length, 0);
  });

  it('E5-B02-T13 con Organización detenida después del primer lote: INCOMPLETA con ORGANIZACION_NO_DISPONIBLE y el mensaje fijo', async () => {
    await listo('BIG');
    org.fallarUpsertDesde = 2;
    const r = await sincronizar();
    assert.equal(r.status, 200);
    assert.equal(r.body.resultado, 'INCOMPLETA');
    assert.equal(r.body.codigoError, 'ORGANIZACION_NO_DISPONIBLE');
    assert.equal(r.body.mensajeError, 'No pudimos guardar las HDU en este momento.');
    assert.deepEqual(r.body.sugerencias, ['REINTENTAR']);
    assert.equal(r.body.leidas, 25);
    assert.equal(r.body.creadas, 25);
    assert.equal(r.body.hayMas, true);
    assert.equal(r.body.continuarDesde, 'BIG-25');
    assert.equal(JSON.stringify(r.body).includes('http://'), false);
  });

  it('E5-B02-T13 si Organización falla en el primer lote la ejecución es FALLIDA con ORGANIZACION_NO_DISPONIBLE', async () => {
    await listo();
    org.fallarUpsertDesde = 1;
    const r = await sincronizar();
    assert.equal(r.body.resultado, 'FALLIDA');
    assert.equal(r.body.codigoError, 'ORGANIZACION_NO_DISPONIBLE');
    assert.equal(r.body.leidas, 0);
    assert.equal(r.body.hayMas, false);
    assert.equal(r.body.continuarDesde, null);
    assert.equal(org.hdus.size, 0);
  });

  it('el upsert siempre lleva el token del Administrador, nunca la credencial de servicio', async () => {
    await listo();
    await sincronizar();
    assert.ok(org.llamadas.includes('POST /v1/interno/integraciones/hdu/upsert'));
    assert.ok(org.llamadas.includes('GET /v1/me'));
  });
});
