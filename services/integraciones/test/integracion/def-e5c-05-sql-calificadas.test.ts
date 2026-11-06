/**
 * DEF-E5C-05 · Las SQL crudas deben nombrar su esquema. Tras el pooler de Supabase (modo transacción) el `search_path`
 * que Prisma fija al conectar no llega al backend que ejecuta la consulta; sin pooler el defecto no se ve. Aquí se
 * reproduce sin pooler: una sola conexión (`connection_limit=1`) con `SET search_path TO public`, y se recorren los
 * caminos con SQL cruda del repositorio de la consulta (conteos, edición en grupo, bloqueo de filas, confirmación).
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { ConsultaPrismaRepositorio } from '../../src/infraestructura/prisma/consulta.prisma.repositorio.js';
import { CELULA_C, PERSONAS, SPRINT_2, cerrarBases, iniciarOrganizacionFalsa, type OrganizacionFalsa } from '../ayudas.js';
import { guardarConfiguracion, montar, type Montaje } from '../montaje.js';

let org: OrganizacionFalsa;
let m: Montaje;
let sinEsquema: PrismaService;

before(async () => {
  org = await iniciarOrganizacionFalsa();
  const base = process.env.DATABASE_URL as string;
  sinEsquema = new PrismaService({ datasourceUrl: `${base}${base.includes('?') ? '&' : '?'}connection_limit=1` });
  await sinEsquema.$connect();
  await sinEsquema.$executeRawUnsafe('SET search_path TO public');
});

afterEach(async () => {
  await m?.cerrar();
  org.hdus.clear();
});

after(async () => {
  await sinEsquema.$disconnect();
  await org.cerrar();
  await cerrarBases();
});

describe('DEF-E5C-05 · SQL crudas de la consulta sin search_path del esquema', () => {
  it('la sesión de la prueba realmente no incluye el esquema integraciones', async () => {
    const [fila] = await sinEsquema.$queryRawUnsafe<Array<{ search_path: string }>>('SHOW search_path');
    assert.equal(fila?.search_path, 'public');
    await assert.rejects(sinEsquema.$queryRawUnsafe('SELECT 1 FROM consulta_item'), /consulta_item|42P01/);
  });

  it('conteos, bloqueo de filas, edición en grupo e inicio de confirmación funcionan con search_path=public', async () => {
    m = await montar({ org });
    assert.equal((await guardarConfiguracion(m, { proyecto: 'QTY' })).status, 200);
    const consulta = (await m.pedir('post', '/v1/integraciones/jira/consultas', 'adm1', {})).body.consulta;
    const id = consulta.id as string;
    const nuevas = (await m.pedir('get', `/v1/integraciones/jira/consultas/${id}/items?grupo=NUEVA&tamanoPagina=100`, 'adm1')).body.items as Array<{ id: string }>;
    const ids = nuevas.slice(0, 2).map((f) => f.id);
    assert.equal(ids.length, 2);

    const repo = new ConsultaPrismaRepositorio(sinEsquema);

    const antes = await repo.conteos(id);
    assert.equal(antes.asignadas, 0);

    await repo.conFilasBloqueadas(id, ids, async () => {
      const nueva = await repo.guardarEdiciones(
        id,
        ids.map((itemId) => ({
          itemId,
          analistaAuto: false,
          asignacion: {
            celula: { id: CELULA_C.id, nombre: CELULA_C.nombre },
            qe: { id: PERSONAS.qe2.id, nombre: PERSONAS.qe2.nombre },
            analista: { id: PERSONAS.ana3.id, nombre: PERSONAS.ana3.nombre },
            sprint: { id: SPRINT_2.id, nombre: SPRINT_2.nombre },
            sprintOrigen: 'MANUAL',
          } as never,
          avisoSinLider: false,
          marcada: true,
          advertencias: [],
          asignadoPor: { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre } as never,
          asignadoEn: new Date(),
        })),
        new Date(),
      );
      assert.equal(typeof nueva, 'number');
    });

    const despues = await repo.conteos(id);
    assert.deepEqual([despues.completas, despues.marcadasNuevas], [2, 2]);

    const inicio = await repo.iniciarConfirmacion(
      id,
      (await m.pedir('get', `/v1/integraciones/jira/consultas/${id}`, 'adm1')).body.version,
      {
        origen: 'JIRA',
        estricto: false,
        vincularExistentes: false,
        actor: { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre, rol: 'ADMINISTRADOR' } as never,
        proyecto: 'QTY',
        sitioHost: 'h',
        archivo: null,
        iniciadaEn: new Date(),
      },
      60_000,
    );
    assert.equal(inicio.tipo, 'OK');
  });
});

describe('E5 detalle y confirmación por HDU · caminos nuevos con connection_limit=1 y search_path=public (DEF-E5C-05)', () => {
  const CONSULTAR = '/v1/integraciones/jira/consultas';
  const COMPLETA = { celulaId: CELULA_C.id, qeId: PERSONAS.qe2.id };

  it('repositorio: toma, liberación, yaAsignada, limpieza, listado, conteos, detalle y confirmación de una fila; dentro del bloqueo todo usa la transacción', async () => {
    m = await montar({ org });
    assert.equal((await guardarConfiguracion(m, { proyecto: 'QTY' })).status, 200);
    const consulta = (await m.pedir('post', CONSULTAR, 'adm1', {})).body.consulta;
    const id = consulta.id as string;
    const nuevas = (await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=NUEVA&tamanoPagina=100`, 'adm1')).body.items as Array<{ id: string; codigo: string }>;
    const [a, b, c] = nuevas.slice(0, 3) as [{ id: string; codigo: string }, { id: string; codigo: string }, { id: string; codigo: string }];
    assert.equal((await m.pedir('patch', `${CONSULTAR}/${id}/items`, 'adm1', { itemIds: [a.id, b.id, c.id], asignacion: COMPLETA })).status, 200);
    assert.equal((await m.pedir('patch', `${CONSULTAR}/${id}/items`, 'adm1', { itemIds: [b.id, c.id], marcada: true })).status, 200);
    const revision = async (itemId: string): Promise<number> => (await repo.obtenerItems(id, [itemId]))[0]?.revision as number;

    const repo = new ConsultaPrismaRepositorio(sinEsquema);
    // Toma atómica (UPDATE … RETURNING con make_interval): la segunda no puede; liberada, sí.
    assert.equal(await repo.tomarFila(id, a.id, await revision(a.id)), true);
    assert.equal(await repo.tomarFila(id, a.id, await revision(a.id)), false);
    assert.equal((await repo.obtenerItems(id, [a.id]))[0]?.aplicando, true);
    await repo.liberarFila(id, a.id);
    assert.equal((await repo.obtenerItems(id, [a.id]))[0]?.aplicando, false);
    assert.equal(await repo.tomarFila(id, a.id, 999), false, 'otra revisión no toma');

    // Dentro del bloqueo de filas (una sola conexión) todo debe usar la transacción que tiene el bloqueo: si alguna operación
    // pidiera otra conexión, esperaría a la que retiene el bloqueo y la prueba no terminaría.
    await repo.conFilasBloqueadas(id, [b.id], async () => {
      assert.equal(await repo.tomarFila(id, b.id, await revision(b.id)), true);
      await repo.liberarFila(id, b.id);
      const leida = await repo.obtenerItemConDetalle(id, b.id);
      assert.equal(leida?.item.id, b.id);
      assert.equal((await repo.itemsMarcadosPendientes(id)).length, 2);
      assert.deepEqual((await repo.tomarFilas(id, [b.id, c.id])).sort(), [b.id, c.id].sort());
      await repo.liberarFilas(id, [b.id, c.id]);
    });

    // Lote: solo toma lo marcado, sin aplicar y sin toma vigente.
    assert.deepEqual((await repo.tomarFilas(id, [a.id, b.id, c.id])).sort(), [b.id, c.id].sort(), 'a no está marcada');
    assert.deepEqual(await repo.tomarFilas(id, [b.id, c.id]), [], 'ya tomadas');
    await repo.liberarFilas(id, [b.id, c.id]);

    // Otra persona creó la HDU de c; el analista de b dejó de ser válido.
    const hdu = '0b000000-0000-4000-8000-0000000000c1';
    const ya = await repo.registrarYaAsignada(id, c.id, { idHistoria: hdu, qe: 'Carla QE', analista: null });
    assert.deepEqual([ya?.yaAsignada?.qe, ya?.idHistoria, ya?.marcada, ya?.aplicando], ['Carla QE', hdu, false, false]);
    const limpia = await repo.limpiarAsignacion({ consultaId: id, itemId: b.id, limpiar: ['analistaId'] });
    assert.deepEqual([limpia.item?.asignacion.analista, limpia.item?.marcada, limpia.item?.analistaAuto, typeof limpia.version], [null, false, false, 'number']);

    // Listado con yaAsignadas y conteos con ya_asignadas (SQL cruda), sin el detalle.
    const pagina = await repo.listarItems(id, { grupo: 'NUEVA' }, 1, 100);
    assert.equal(pagina.yaAsignadas, 1);
    assert.equal((await repo.conteos(id)).yaAsignadas, 1);
    assert.equal('detalle' in (pagina.items[0] as object), false);
    const conDetalle = await repo.obtenerItemConDetalle(id, a.id);
    assert.equal(typeof (conDetalle?.detalle as { resumen?: unknown } | null)?.resumen, 'string');
    assert.ok(conDetalle?.leidaEn instanceof Date);

    // Confirmación de una fila: fila aplicada, ejecución HDU ya cerrada, detalle y creadas, en una transacción.
    const guardada = await repo.confirmarFila({
      consultaId: id,
      itemId: a.id,
      idHistoria: '0b000000-0000-4000-8000-0000000000c2',
      actor: { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre, rol: 'ADMINISTRADOR' },
      iniciadaEn: new Date(Date.now() - 50),
      terminadaEn: new Date(),
      duracionMs: 50,
      proyecto: 'QTY',
      sitioHost: '127.0.0.1:4010',
      detalle: { fila: 1, codigo: a.codigo, titulo: 'T', idHistoria: '0b000000-0000-4000-8000-0000000000c2', resultado: 'CREADA', motivo: null, mensaje: null, advertencias: [], cambios: null, referencia: null, asignacion: { celula: 'CEL-C', qe: 'Marcos QE', analista: 'Ana Tres', sprint: 'S' } },
    });
    assert.deepEqual([guardada.item?.aplicada, guardada.item?.aplicacion?.alcance, guardada.consulta.creadas, guardada.ejecucion.alcance, guardada.ejecucion.leidas], [true, 'HDU', 1, 'HDU', 1]);
    // Idempotente: repetirla no duplica la ejecución ni suma otra creada.
    const otra = await repo.confirmarFila({
      consultaId: id,
      itemId: a.id,
      idHistoria: '0b000000-0000-4000-8000-0000000000c2',
      actor: { id: PERSONAS.adm1.id, nombre: 'x', rol: 'ADMINISTRADOR' },
      iniciadaEn: new Date(),
      terminadaEn: new Date(),
      duracionMs: 1,
      proyecto: 'QTY',
      sitioHost: 'h',
      detalle: { fila: 1, codigo: a.codigo, titulo: 'T', idHistoria: '0b000000-0000-4000-8000-0000000000c2', resultado: 'CREADA', motivo: null, mensaje: null, advertencias: [], cambios: null, referencia: null, asignacion: null },
    });
    assert.deepEqual([otra.ejecucion.id, otra.consulta.creadas], [guardada.ejecucion.id, 1]);
    assert.equal(await repo.ejecucionDeHdu(id, '0b000000-0000-4000-8000-0000000000c2').then((e) => e?.id), guardada.ejecucion.id);

    // Cerrar (Terminar revisión): descartadas cuenta las filas sin confirmar y creadas se conserva.
    const cerrada = await repo.cerrar(id, { estado: 'DESCARTADA', en: new Date(), por: { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre } });
    assert.deepEqual([cerrada?.estado, cerrada?.creadas, cerrada?.descartadas], ['DESCARTADA', 1, consulta.leidas - 1]);
  });

  it('flujo HTTP completo con UNA conexión: consultar, editar, confirmar una fila, confirmar el lote, detalle y descartar', async () => {
    const original = process.env.DATABASE_URL as string;
    process.env.DATABASE_URL = `${original}${original.includes('?') ? '&' : '?'}connection_limit=1`;
    try {
      m = await montar({ org });
      assert.equal((await guardarConfiguracion(m, { proyecto: 'QTY' })).status, 200);
      const consulta = (await m.pedir('post', CONSULTAR, 'adm1', {})).body.consulta;
      const id = consulta.id as string;
      const nuevas = (await m.pedir('get', `${CONSULTAR}/${id}/items?grupo=NUEVA&tamanoPagina=100`, 'adm1')).body.items as Array<{ id: string }>;
      const [a, b] = nuevas as [{ id: string }, { id: string }];
      const editar = await m.pedir('patch', `${CONSULTAR}/${id}/items`, 'adm1', { itemIds: [a.id, b.id], asignacion: COMPLETA });
      assert.equal(editar.status, 200);
      assert.equal(editar.body.items[0].analistaAuto, true);
      assert.equal((await m.pedir('patch', `${CONSULTAR}/${id}/items`, 'adm1', { itemIds: [b.id], marcada: true })).status, 200);
      const detalle = await m.pedir('get', `${CONSULTAR}/${id}/items/${a.id}`, 'adm1');
      assert.equal(detalle.status, 200);
      assert.equal(typeof detalle.body.detalle.resumen, 'string');
      const unica = await m.pedir('post', `${CONSULTAR}/${id}/items/${a.id}/confirmaciones`, 'adm1', { revision: editar.body.items[0].revision });
      assert.equal(unica.status, 200, JSON.stringify(unica.body));
      const version = (await m.pedir('get', `${CONSULTAR}/${id}`, 'adm1')).body.version;
      const lote = await m.pedir('post', `${CONSULTAR}/${id}/confirmaciones`, 'adm1', { version });
      assert.equal(lote.status, 200, JSON.stringify(lote.body));
      assert.deepEqual([lote.body.ejecucion.alcance, lote.body.ejecucion.creadas, lote.body.consulta.estado, lote.body.consulta.creadas], ['LOTE', 1, 'CONFIRMADA', 2]);
      const segunda = (await m.pedir('post', CONSULTAR, 'adm1', {})).body.consulta;
      assert.equal((await m.pedir('post', `${CONSULTAR}/${segunda.id}/descartes`, 'adm1', {})).status, 200);
    } finally {
      process.env.DATABASE_URL = original;
    }
  });
});
