/**
 * E5-B03 · Importación de CSV/JSON (vista previa, importación, upsert, modo estricto). Postgres local real; Organización
 * falsa (con el algoritmo del upsert) y lector falso (la validación de filas del lector real es de q360-integraciones).
 * Los IDs son los de `docs/backlog/e5-integracion-jira.md`.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { PERSONAS, cerrarBases, consultaDuenio, iniciarOrganizacionFalsa, type OrganizacionFalsa } from '../ayudas.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

const VISTA_PREVIA = '/v1/integraciones/archivos/vista-previa';
const IMPORTAR = '/v1/integraciones/archivos/importaciones';

let org: OrganizacionFalsa;
let m: Montaje;

before(async () => {
  org = await iniciarOrganizacionFalsa();
});

afterEach(async () => {
  await m?.cerrar();
  org.hdus.clear();
  org.inactivas.clear();
  org.inactivas.add('inact1');
  org.caida = false;
  org.fallarUpsertDesde = null;
  org.upserts.length = 0;
});

after(async () => {
  await org.cerrar();
  await cerrarBases();
});

const VALIDAS = ['codigo,titulo,descripcion,prioridad', 'ARC-1,Alta de cliente,Descripción uno,alta', 'ARC-2,Baja de cliente,,media', 'ARC-3,Consulta de cliente,,baja', 'ARC-4,Edición de cliente,,critica'].join('\n');

const archivo = (contenido: string, extra: Record<string, unknown> = {}) => ({ formato: 'CSV', nombre: 'historias.csv', contenido, ...extra });

async function conConfiguracion(config: Parameters<typeof montar>[0] = {}): Promise<Montaje> {
  m = await montar({ org, ...config });
  assert.equal((await guardarConfiguracion(m)).status, 200);
  return m;
}

const vistaPrevia = (cuerpo: unknown, persona: Parameters<Montaje['pedir']>[2] = 'adm1') => m.pedir('post', VISTA_PREVIA, persona, cuerpo);
const importar = (cuerpo: unknown, persona: Parameters<Montaje['pedir']>[2] = 'adm1') => m.pedir('post', IMPORTAR, persona, cuerpo);
const ejecuciones = async () => (await consultaDuenio<{ n: number }>('SELECT count(*)::int AS n FROM integraciones.ejecucion_integracion'))[0]?.n ?? 0;

describe('E5-B03#1 · validación y vista previa', () => {
  it('E5-B03-T01 la vista previa simula: cuenta lo que haría, no crea HDU, no registra ejecución y pide a Organización solo simular', async () => {
    await conConfiguracion();
    const r = await vistaPrevia(archivo(VALIDAS));
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.formato, r.body.filas, r.body.crear, r.body.actualizar, r.body.omitir, r.body.errores, r.body.advertencias], ['CSV', 4, 4, 0, 0, 0, 0]);
    assert.deepEqual(r.body.columnasIgnoradas, []);
    assert.equal(r.body.detalle.length, 4);
    assert.deepEqual(r.body.detalle[0], { fila: 1, codigo: 'ARC-1', titulo: 'Alta de cliente', accion: 'CREAR', motivo: null, advertencias: [], cambios: null });
    assert.equal(org.hdus.size, 0);
    assert.equal(await ejecuciones(), 0);
    assert.ok(org.upserts.length >= 1);
    assert.ok(org.upserts.every((u) => u.soloSimular === true));
  });

  it('E5-B03-T03 los errores de estructura rechazan el archivo con su código y no crean HDU', async () => {
    await conConfiguracion();
    const casos: Array<[string, Record<string, unknown>, number, string]> = [
      ['contenido vacío', archivo(''), 422, 'ARCHIVO_VACIO'],
      ['solo el encabezado', archivo('codigo,titulo'), 422, 'ARCHIVO_VACIO'],
      ['501 filas', archivo(['codigo,titulo', ...Array.from({ length: 501 }, (_, i) => `X-${i},Título ${i}`)].join('\n')), 422, 'DEMASIADAS_FILAS'],
      ['1,2 MB', archivo(`codigo,titulo\n${'A-1,'.padEnd(1_200_000, 'x')}`), 413, 'ARCHIVO_MUY_GRANDE'],
      ['formato XLSX', archivo(VALIDAS, { formato: 'XLSX' }), 422, 'FORMATO_NO_SOPORTADO'],
      ['comillas sin cerrar', archivo('codigo,titulo\nA-1,"sin cerrar'), 422, 'ARCHIVO_ILEGIBLE'],
      ['JSON mal formado', archivo('{', { formato: 'JSON', nombre: 'h.json' }), 422, 'ARCHIVO_ILEGIBLE'],
      ['JSON que no es una lista', archivo('{"a":1}', { formato: 'JSON', nombre: 'h.json' }), 422, 'ARCHIVO_ILEGIBLE'],
      ['sin codigo ni titulo', archivo('descripcion,prioridad\nuna,alta'), 422, 'COLUMNAS_FALTANTES'],
    ];
    for (const [nombre, cuerpo, estado, codigo] of casos) {
      const r = await vistaPrevia(cuerpo);
      assert.equal(r.status, estado, nombre);
      assert.equal(r.body.codigo, codigo, nombre);
      assert.equal(r.body.ejecucionId, null, nombre);
      assert.ok(Array.isArray(r.body.columnasFaltantes), nombre);
      assert.ok(typeof r.body.traceId === 'string' && r.body.traceId.length > 0, nombre);
      assert.equal(JSON.stringify(r.body).includes('ARC-1'), false, `${nombre}: no devuelve contenido del archivo`);
    }
    const faltantes = await vistaPrevia(archivo('descripcion\nuna'));
    assert.deepEqual(faltantes.body.columnasFaltantes, ['codigo', 'titulo']);
    assert.equal(faltantes.body.mensaje, 'Faltan las columnas: codigo, titulo');
    assert.equal(org.hdus.size, 0);
    assert.equal(await ejecuciones(), 0);
  });

  it('E5-B03-T03 una columna extra pasa con COLUMNA_IGNORADA (una sola vez, en la primera fila)', async () => {
    await conConfiguracion();
    const r = await vistaPrevia(archivo('codigo,titulo,notas\nA-1,Uno,x\nA-2,Dos,y'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.columnasIgnoradas, ['notas']);
    assert.equal(r.body.advertencias, 1);
    assert.deepEqual(r.body.detalle.map((f: { advertencias: string[] }) => f.advertencias), [['COLUMNA_IGNORADA'], []]);
  });

  it('el orden de validación es 413 → 400 → 422: un cuerpo grande pesa más que uno mal formado y lo mal formado se informa por campo', async () => {
    await conConfiguracion();
    const grande = await vistaPrevia({ contenido: 'x'.repeat(1_100_000), formato: 5 });
    assert.equal(grande.status, 413);
    assert.equal(grande.body.codigo, 'ARCHIVO_MUY_GRANDE');
    const malo = await vistaPrevia({ formato: 'CSV', contenido: 'a', sorpresa: true });
    assert.equal(malo.status, 400);
    assert.deepEqual(malo.body.detalles.map((d: { campo: string }) => d.campo).sort(), ['nombre', 'sorpresa']);
    assert.equal((await vistaPrevia({ ...archivo(VALIDAS), estricto: 'si' })).status, 400);
  });

  it('un cuerpo de más de 1,5 MB lo corta el analizador con ARCHIVO_MUY_GRANDE (D127)', async () => {
    await conConfiguracion();
    const r = await vistaPrevia(archivo('x'.repeat(1_700_000)));
    assert.equal(r.status, 413);
    assert.equal(r.body.codigo, 'ARCHIVO_MUY_GRANDE');
    assert.equal(r.body.ejecucionId, null);
    assert.deepEqual(r.body.columnasFaltantes, []);
  });

  it('sin configuración de Jira la vista previa funciona: las filas que necesitan el destino por defecto salen con error', async () => {
    m = await montar({ org });
    const contenido = ['codigo,titulo,celula,sprint,qe_correo', 'A-1,Con todo,CEL-C,E5 Sprint 1,qe2@quality360.local', 'A-2,Sin destino,,,'].join('\n');
    const r = await vistaPrevia(archivo(contenido));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.detalle.map((f: { accion: string; motivo: string | null }) => [f.accion, f.motivo]), [['CREAR', null], ['ERROR', 'CELULA_NO_ENCONTRADA']]);
  });
});

describe('E5-B03#2 · upsert', () => {
  it('importa las filas válidas con origen CSV; la ejecución cuenta lo creado', async () => {
    await conConfiguracion();
    const r = await importar(archivo(VALIDAS));
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.origen, r.body.leidas, r.body.creadas, r.body.resultado, r.body.hayMas, r.body.continuarDesde], ['CSV', 4, 4, 'EXITOSA', false, null]);
    assert.equal(org.hdus.size, 4);
    assert.equal(org.hdus.get('arc-1')?.origen, 'CSV');
    assert.equal(org.hdus.get('arc-1')?.prioridad, 'ALTA');
    assert.equal(org.hdus.get('arc-4')?.prioridad, 'CRITICA');
    assert.ok(org.upserts.every((u) => u.soloSimular === false && u.origen === 'CSV' && u.sprintNoEncontrado === 'ERROR'));
  });

  it('E5-B03-T04 actualiza solo título, descripción y prioridad; una descripción en blanco no borra', async () => {
    await conConfiguracion();
    await importar(archivo(VALIDAS));
    const r = await importar(archivo('codigo,titulo,descripcion,prioridad\nARC-1,Alta de cliente v2,,critica'));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.actualizadas, 1);
    assert.equal(r.body.creadas, 0);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle`, 'adm1');
    assert.deepEqual(detalle.body.items[0].cambios, {
      titulo: { antes: 'Alta de cliente', despues: 'Alta de cliente v2' },
      prioridad: { antes: 'ALTA', despues: 'CRITICA' },
    });
    assert.equal(org.hdus.get('arc-1')?.descripcion, 'Descripción uno');
  });

  it('E5-B03-T06 importar dos veces el mismo archivo: la segunda deja 4 omitidas SIN_CAMBIOS', async () => {
    await conConfiguracion();
    const uno = await importar(archivo(VALIDAS));
    assert.equal(uno.body.creadas, 4);
    const dos = await importar(archivo(VALIDAS));
    assert.deepEqual([dos.body.creadas, dos.body.actualizadas, dos.body.omitidas, dos.body.resultado], [0, 0, 4, 'EXITOSA']);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${dos.body.id}/detalle`, 'adm1');
    assert.ok(detalle.body.items.every((f: { motivo: string; mensaje?: string }) => f.motivo === 'SIN_CAMBIOS'));
  });

  it('E5-B03-T08 una HDU manual y una cerrada se omiten; con vincularExistentes la manual se actualiza y la cerrada sigue omitida', async () => {
    await conConfiguracion();
    org.agregarHdu({ codigo: 'H1', titulo: 'Creada a mano', origen: 'MANUAL' });
    org.agregarHdu({ codigo: 'H7', titulo: 'Cerrada', estado: 'CERRADA', origen: 'JIRA' });
    const contenido = 'codigo,titulo\nH1,Título importado\nH7,Otro título';
    const sin = await importar(archivo(contenido));
    const detalleSin = await m.pedir('get', `/v1/integraciones/ejecuciones/${sin.body.id}/detalle`, 'adm1');
    assert.deepEqual(detalleSin.body.items.map((f: { resultado: string; motivo: string }) => [f.resultado, f.motivo]), [['OMITIDA', 'HDU_MANUAL_EXISTENTE'], ['OMITIDA', 'HDU_CERRADA']]);
    assert.equal(org.hdus.get('h1')?.origen, 'MANUAL');

    const con = await importar(archivo(contenido, { vincularExistentes: true }));
    assert.equal(con.body.vincularExistentes, true);
    const detalleCon = await m.pedir('get', `/v1/integraciones/ejecuciones/${con.body.id}/detalle`, 'adm1');
    assert.deepEqual(detalleCon.body.items.map((f: { resultado: string }) => f.resultado), ['ACTUALIZADA', 'OMITIDA']);
    assert.equal(org.hdus.get('h1')?.origen, 'CSV');
    assert.equal(org.hdus.get('h1')?.titulo, 'Título importado');
    assert.equal(org.hdus.get('h7')?.titulo, 'Cerrada');
  });

  it('E5-B03-T14 un JSON con qeCorreo y qe_correo importa 3 HDU con origen JSON', async () => {
    await conConfiguracion();
    const json = JSON.stringify({
      historias: [
        { codigo: 'J-1', titulo: 'Uno', qeCorreo: 'qe1@quality360.local' },
        { codigo: 'J-2', titulo: 'Dos', qe_correo: 'qe2@quality360.local' },
        { codigo: 'J-3', titulo: 'Tres', prioridad: 'alta' },
      ],
    });
    const r = await importar({ formato: 'JSON', nombre: 'historias-validas.json', contenido: json });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.origen, r.body.creadas, r.body.resultado], ['JSON', 3, 'EXITOSA']);
    assert.deepEqual([...org.hdus.values()].map((h) => h.origen), ['JSON', 'JSON', 'JSON']);
    assert.equal(org.hdus.get('j-1')?.qeId, PERSONAS.qe1.id);
    assert.equal(org.hdus.get('j-2')?.qeId, PERSONAS.qe2.id);
  });
});

describe('E5-B03#3 · transacción y modo estricto (D125)', () => {
  const CON_ERRORES = [
    'codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo',
    'OK-1,Primera válida,,,,,',
    'OK-2,Segunda válida,,,,,',
    'con espacio,Código inválido,,,,,',
    'ERR-2,,,,,,',
    'ERR-3,Prioridad mala,,urgente,,,',
    'OK-1,Código repetido,,,,,',
    'ERR-5,Célula inexistente,,,No existe,,',
    'ERR-6,Sprint inexistente,,,,Sprint fantasma,',
    'ERR-7,QE inactivo,,,,,inact1@quality360.local',
  ].join('\n');

  it('E5-B03-T09 en modo normal importa las válidas e informa el motivo de cada fila con error', async () => {
    await conConfiguracion();
    const r = await importar(archivo(CON_ERRORES));
    assert.deepEqual([r.body.leidas, r.body.creadas, r.body.conError, r.body.resultado], [9, 2, 7, 'CON_ERRORES']);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle?soloErrores=true`, 'adm1');
    assert.deepEqual(detalle.body.items.map((f: { motivo: string }) => f.motivo), [
      'CODIGO_INVALIDO',
      'TITULO_VACIO',
      'PRIORIDAD_INVALIDA',
      'CODIGO_DUPLICADO_EN_ARCHIVO',
      'CELULA_NO_ENCONTRADA',
      'SPRINT_NO_ENCONTRADO',
      'QE_INVALIDO',
    ]);
    assert.equal(org.hdus.size, 2);
  });

  it('E5-B03-T09 en modo estricto, una sola fila con error no importa nada: FALLIDA MODO_ESTRICTO con las filas con error', async () => {
    await conConfiguracion();
    const r = await importar(archivo(CON_ERRORES, { estricto: true }));
    assert.equal(r.status, 200);
    assert.equal(r.body.resultado, 'FALLIDA');
    assert.equal(r.body.codigoError, 'MODO_ESTRICTO');
    assert.equal(r.body.mensajeError, 'No se importó nada porque el modo estricto detectó filas con error.');
    assert.deepEqual(r.body.sugerencias, ['CORREGIR_ARCHIVO']);
    assert.deepEqual([r.body.creadas, r.body.conError, r.body.estricto], [0, 7, true]);
    assert.equal(org.hdus.size, 0);
    assert.ok(org.upserts.every((u) => u.soloSimular === true), 'solo se simula');
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle`, 'adm1');
    assert.equal(detalle.body.total, 7);
  });

  it('E5-B03-T09 un archivo estricto sin errores se importa completo, con cada lote como una sola transacción en Organización', async () => {
    await conConfiguracion();
    const r = await importar(archivo(VALIDAS, { estricto: true }));
    assert.deepEqual([r.body.resultado, r.body.creadas, r.body.codigoError], ['EXITOSA', 4, null]);
    assert.equal(org.hdus.size, 4);
    const escrituras = org.upserts.filter((u) => u.soloSimular === false);
    assert.ok(escrituras.length >= 1);
    assert.ok(escrituras.every((u) => u.estricto === true));
    assert.ok(org.upserts.some((u) => u.soloSimular === true), 'primero se simula el archivo completo');
  });

  it('E5-B03-T10 una HDU creada a mano entre la vista previa y la confirmación queda omitida; las demás se crean', async () => {
    await conConfiguracion();
    const contenido = 'codigo,titulo\nCAR-1,Uno\nCAR-2,Dos\nCAR-3,Tres';
    const previa = await vistaPrevia(archivo(contenido));
    assert.equal(previa.body.crear, 3);
    org.agregarHdu({ codigo: 'CAR-2', titulo: 'a mano', origen: 'MANUAL' });
    const r = await importar(archivo(contenido));
    assert.deepEqual([r.body.creadas, r.body.omitidas], [2, 1]);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle`, 'adm1');
    assert.deepEqual(detalle.body.items.map((f: { resultado: string; motivo: string | null }) => [f.resultado, f.motivo]), [['CREADA', null], ['OMITIDA', 'HDU_MANUAL_EXISTENTE'], ['CREADA', null]]);
  });

  it('D118 si Organización cae a mitad del archivo: INCOMPLETA sin continuarDesde y sugiere importar el mismo archivo; repetirlo deja lo hecho SIN_CAMBIOS', async () => {
    await conConfiguracion();
    const cien = ['codigo,titulo', ...Array.from({ length: 100 }, (_, i) => `BLK-${i + 1},Historia ${i + 1}`)].join('\n');
    org.fallarUpsertDesde = 2;
    const r = await importar(archivo(cien));
    assert.deepEqual([r.body.resultado, r.body.codigoError, r.body.leidas, r.body.creadas, r.body.hayMas, r.body.continuarDesde], ['INCOMPLETA', 'ORGANIZACION_NO_DISPONIBLE', 25, 25, false, null]);
    assert.deepEqual(r.body.sugerencias, ['IMPORTAR_MISMO_ARCHIVO']);
    org.fallarUpsertDesde = null;
    const otra = await importar(archivo(cien));
    assert.deepEqual([otra.body.resultado, otra.body.creadas, otra.body.omitidas], ['EXITOSA', 75, 25]);
    assert.equal(org.hdus.size, 100);
  });

  it('D114 sin tiempo de presupuesto para el primer lote: FALLIDA con PRESUPUESTO_DE_TIEMPO', async () => {
    await conConfiguracion({ config: { presupuestoMs: 900 } });
    const r = await importar(archivo(VALIDAS));
    assert.deepEqual([r.body.resultado, r.body.codigoError, r.body.leidas], ['FALLIDA', 'PRESUPUESTO_DE_TIEMPO', 0]);
    assert.deepEqual(r.body.sugerencias, ['IMPORTAR_MISMO_ARCHIVO']);
    assert.equal(org.hdus.size, 0);
  });
});

describe('E5-B03 · acceso y destino', () => {
  it('E5-B03-T11 QE, Analista, Líder y Auditor: 403 en vista previa e importación; sin token 401; no se crean HDU ni ejecuciones', async () => {
    await conConfiguracion();
    for (const persona of ['qe1', 'ana1', 'lid1', 'aud1'] as const) {
      for (const ruta of [VISTA_PREVIA, IMPORTAR]) {
        const r = await m.pedir('post', ruta, persona, archivo(VALIDAS));
        assert.equal(r.status, 403, `${persona} ${ruta}`);
        assert.equal(r.body.codigo, 'ACCESO_DENEGADO');
      }
    }
    assert.equal((await vistaPrevia(archivo(VALIDAS), null)).status, 401);
    assert.equal((await importar(archivo(VALIDAS), null)).status, 401);
    assert.equal(org.hdus.size, 0);
    assert.equal(await ejecuciones(), 0);
  });

  it('E5-B03-T12 con el QE por defecto desactivado las filas que lo necesitan salen con QE_INVALIDO, y también la que trae a un QE inactivo; sin 5xx', async () => {
    await conConfiguracion();
    org.inactivas.add('qe2');
    const contenido = ['codigo,titulo,qe_correo', 'Q-1,Con el QE por defecto,', 'Q-2,Con un QE inactivo,inact1@quality360.local', 'Q-3,Con un QE válido,qe1@quality360.local'].join('\n');
    const r = await importar(archivo(contenido));
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.creadas, r.body.conError], [1, 2]);
    const detalle = await m.pedir('get', `/v1/integraciones/ejecuciones/${r.body.id}/detalle?soloErrores=true`, 'adm1');
    assert.deepEqual(detalle.body.items.map((f: { codigo: string; motivo: string }) => [f.codigo, f.motivo]), [['Q-1', 'QE_INVALIDO'], ['Q-2', 'QE_INVALIDO']]);
    const config = await m.pedir('get', '/v1/integraciones/jira/configuracion', 'adm1');
    assert.deepEqual(config.body.avisosDestino, ['QE_INVALIDO']);
  });

  it('con Organización caída antes de empezar la vista previa y la importación son 503 y no registran nada', async () => {
    await conConfiguracion();
    org.accesoCaido = true;
    try {
      assert.equal((await vistaPrevia(archivo(VALIDAS))).status, 503);
      assert.equal((await importar(archivo(VALIDAS))).status, 503);
    } finally {
      org.accesoCaido = false;
    }
    assert.equal(await ejecuciones(), 0);
  });

  it('una vista previa con Organización caída durante la simulación es 503 SERVICIO_NO_DISPONIBLE y no registra ejecución', async () => {
    await conConfiguracion();
    org.fallarUpsertDesde = 1;
    const r = await vistaPrevia(archivo(VALIDAS));
    assert.equal(r.status, 503);
    assert.equal(r.body.codigo, 'SERVICIO_NO_DISPONIBLE');
    assert.equal(await ejecuciones(), 0);
  });
});
