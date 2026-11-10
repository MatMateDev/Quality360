/** X1 · modelo y repositorios contra el Postgres local con el rol `svc_indicadores` (D161, D162, D164, D183, D184). */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { EjecucionEnCursoError, type FilaSnapshot } from '../../src/dominio/repositorios.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { EjecucionPrismaRepositorio, SnapshotPrismaRepositorio, UmbralPrismaRepositorio } from '../../src/infraestructura/prisma/repositorios.prisma.js';
import { cerrarBases, consultaDuenio, limpiarIndicadores, prismaServicio } from '../ayudas-bd.js';

const prisma = new PrismaService();
const snapshots = new SnapshotPrismaRepositorio(prisma);
const ejecuciones = new EjecucionPrismaRepositorio(prisma);
const umbrales = new UmbralPrismaRepositorio(prisma);

const CELULA = randomUUID();
const SPRINT = randomUUID();
const QE = randomUUID();
const ADMIN = randomUUID();

function fila(cambios: Partial<FilaSnapshot> = {}): FilaSnapshot {
  return {
    fecha: '2026-11-04',
    idCelula: CELULA,
    celulaNombre: 'CEL-A',
    idSprint: SPRINT,
    sprintNombre: 'SP-PROX',
    sprintInicio: '2026-10-28',
    sprintFin: '2026-11-10',
    ambito: 'TODOS',
    hduTotal: 3,
    certificadas: 1,
    cerradasExcepcion: 0,
    enCurso: 1,
    sinIniciar: 1,
    bloqueadas: 1,
    sumaAvance: 140,
    cumplimientoPromedio: 46.7,
    hduRiesgoAlto: 1,
    hduRiesgoMedio: 0,
    impedimentosAbiertos: 1,
    impedimentosEscalados: 0,
    semaforo: 'ROJO',
    ...cambios,
  };
}

async function nuevaEjecucion(origen: 'CRON' | 'MANUAL' = 'MANUAL', ahora = new Date()) {
  return ejecuciones.iniciar({ fecha: '2026-11-04', origen, actorId: origen === 'CRON' ? null : ADMIN, actorNombre: origen === 'CRON' ? 'SISTEMA' : 'ADM1', ahora, abandonoMs: 300_000 });
}

before(async () => {
  await prisma.$connect();
});
beforeEach(async () => {
  await limpiarIndicadores();
});
after(async () => {
  await prisma.$disconnect();
  await cerrarBases();
});

describe('snapshot_indicadores [E6-B03#1, #2, D162, D164]', () => {
  it('[E6-B03-T04] guardar dos veces la misma clave actualiza: una sola fila, con nuevas y actualizadas informadas', async () => {
    const e1 = await nuevaEjecucion();
    const primera = await snapshots.guardarLote([fila(), fila({ ambito: `QE:${QE}` })], e1.id, new Date());
    assert.deepEqual(primera, { nuevas: 2, actualizadas: 0 });
    await ejecuciones.terminarExitosa(e1.id, 2, 0, new Date());
    const e2 = await nuevaEjecucion();
    const segunda = await snapshots.guardarLote([fila({ sumaAvance: 160, cumplimientoPromedio: 53.3 }), fila({ ambito: `QE:${QE}` })], e2.id, new Date());
    assert.deepEqual(segunda, { nuevas: 0, actualizadas: 2 });
    assert.equal(await snapshots.contar(), 2);
    const [guardada] = await snapshots.consultar({ ambito: 'TODOS', desde: '2026-11-04', hasta: '2026-11-04' });
    assert.equal(guardada?.sumaAvance, 160);
    assert.equal(guardada?.cumplimientoPromedio, 53.3);
    assert.equal(guardada?.idEjecucion, e2.id, 'queda el estado de la última ejecución');
  });

  it('[E6-B03-T04] una inserción directa con la misma clave viola la restricción única', async () => {
    const e = await nuevaEjecucion();
    await snapshots.guardarLote([fila()], e.id, new Date());
    await assert.rejects(
      () =>
        prismaServicio.$executeRawUnsafe(
          `INSERT INTO snapshot_indicadores (fecha, id_celula, celula_nombre, id_sprint, sprint_nombre, sprint_inicio, sprint_fin, ambito, hdu_total, certificadas, cerradas_excepcion, en_curso, sin_iniciar, bloqueadas, suma_avance, hdu_riesgo_alto, hdu_riesgo_medio, impedimentos_abiertos, impedimentos_escalados, semaforo, id_ejecucion)
           VALUES ('2026-11-04', '${CELULA}', 'x', '${SPRINT}', 'x', '2026-10-28', '2026-11-10', 'TODOS', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'VERDE', '${e.id}')`,
        ),
      (error: { meta?: unknown }) => /23505|snapshot_clave_key/.test(JSON.stringify(error.meta ?? '')),
    );
  });

  it('todo o nada: si una fila del lote viola una restricción no se escribe ninguna', async () => {
    const e = await nuevaEjecucion();
    await assert.rejects(() => snapshots.guardarLote([fila(), fila({ idSprint: randomUUID(), hduTotal: 99 })], e.id, new Date()));
    assert.equal(await snapshots.contar(), 0);
  });

  it('el CHECK exige hdu_total = certificadas + cerradas con excepción + en curso + sin iniciar, y el catálogo de semáforo y ámbito', async () => {
    const e = await nuevaEjecucion();
    await assert.rejects(() => snapshots.guardarLote([fila({ hduTotal: 4 })], e.id, new Date()), /snapshot_suma_ck/);
    await assert.rejects(() => snapshots.guardarLote([fila({ semaforo: 'NARANJA' as never })], e.id, new Date()), /snapshot_semaforo_ck/);
    await assert.rejects(() => snapshots.guardarLote([fila({ ambito: 'QE:no-es-uuid' })], e.id, new Date()), /snapshot_ambito_ck/);
    await assert.rejects(() => snapshots.guardarLote([fila({ bloqueadas: -1 })], e.id, new Date()), /snapshot_enteros_ck/);
  });

  it('el rol del servicio no puede borrar filas del snapshot (REVOKE DELETE)', async () => {
    const e = await nuevaEjecucion();
    await snapshots.guardarLote([fila()], e.id, new Date());
    await assert.rejects(() => prismaServicio.$executeRawUnsafe('DELETE FROM snapshot_indicadores'), /permission denied|permiso denegado/i);
    assert.equal(await snapshots.contar(), 1);
  });

  it('consultar filtra por ámbito, rango, células y sprint, y ordena por fecha ascendente', async () => {
    const e = await nuevaEjecucion();
    const otraCelula = randomUUID();
    await snapshots.guardarLote(
      [
        fila({ fecha: '2026-11-04', sumaAvance: 140 }),
        fila({ fecha: '2026-11-02', sumaAvance: 100 }),
        fila({ fecha: '2026-11-03', sumaAvance: 120 }),
        fila({ fecha: '2026-11-03', idCelula: otraCelula, celulaNombre: 'CEL-B' }),
        fila({ fecha: '2026-11-03', ambito: `QE:${QE}` }),
      ],
      e.id,
      new Date(),
    );
    const serie = await snapshots.consultar({ ambito: 'TODOS', desde: '2026-11-01', hasta: '2026-11-30', celulaIds: [CELULA], sprintId: SPRINT });
    assert.deepEqual(serie.map((f) => [f.fecha, f.sumaAvance]), [['2026-11-02', 100], ['2026-11-03', 120], ['2026-11-04', 140]]);
    assert.equal((await snapshots.consultar({ ambito: 'TODOS', desde: '2026-11-03', hasta: '2026-11-03' })).length, 2);
    assert.equal((await snapshots.consultar({ ambito: `QE:${QE}`, desde: '2026-11-01', hasta: '2026-11-30' })).length, 1);
    assert.equal((await snapshots.consultar({ ambito: 'TODOS', desde: '2026-11-01', hasta: '2026-11-30', celulaIds: [] })).length, 0);
  });
});

describe('ejecucion_snapshot [E6-B03#1, D164, D184]', () => {
  it('[E6-B03-T06] una segunda ejecución simultánea es EjecucionEnCursoError y queda una sola EN_CURSO', async () => {
    const resultados = await Promise.allSettled([nuevaEjecucion(), nuevaEjecucion()]);
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    const rechazada = resultados.find((r) => r.status === 'rejected');
    assert.ok(rechazada?.status === 'rejected' && rechazada.reason instanceof EjecucionEnCursoError);
    assert.equal((await ejecuciones.listar(1, 10)).total, 1);
  });

  it('terminada la primera, otra puede empezar; EXITOSA guarda las filas y FALLIDA no escribe nada', async () => {
    const a = await nuevaEjecucion('CRON');
    assert.equal(a.actorId, null);
    assert.equal(a.actorNombre, 'SISTEMA');
    const ok = await ejecuciones.terminarExitosa(a.id, 3, 1, new Date());
    assert.deepEqual([ok.resultado, ok.filasNuevas, ok.filasActualizadas, ok.filasEscritas, ok.motivo], ['EXITOSA', 3, 1, 4, null]);
    const b = await nuevaEjecucion();
    const mala = await ejecuciones.terminarFallida(b.id, 'IMPEDIMENTOS_NO_DISPONIBLE', new Date());
    assert.deepEqual([mala.resultado, mala.filasEscritas, mala.motivo], ['FALLIDA', 0, 'IMPEDIMENTOS_NO_DISPONIBLE']);
    assert.ok(mala.fin !== null);
  });

  it('una ejecución EN_CURSO de más de 5 minutos se cierra como FALLIDA/INTERRUMPIDA y deja de bloquear', async () => {
    const hace10 = new Date(Date.now() - 10 * 60_000);
    const vieja = await nuevaEjecucion('MANUAL', hace10);
    const nueva = await nuevaEjecucion();
    assert.notEqual(nueva.id, vieja.id);
    const lista = await ejecuciones.listar(1, 10);
    const cerrada = lista.items.find((e) => e.id === vieja.id);
    assert.deepEqual([cerrada?.resultado, cerrada?.motivo], ['FALLIDA', 'INTERRUMPIDA']);
    assert.ok(cerrada?.fin !== null);
  });

  it('una ejecución de menos de 5 minutos sí bloquea', async () => {
    await nuevaEjecucion('MANUAL', new Date(Date.now() - 60_000));
    await assert.rejects(() => nuevaEjecucion(), EjecucionEnCursoError);
  });

  it('los CHECK impiden una fallida con filas, una cerrada sin fin y un motivo fuera del catálogo', async () => {
    const e = await nuevaEjecucion();
    await assert.rejects(() => prismaServicio.$executeRawUnsafe(`UPDATE ejecucion_snapshot SET resultado = 'FALLIDA', motivo = 'ERROR_INTERNO', fin = now(), filas_nuevas = 1, filas_escritas = 1 WHERE id = '${e.id}'::uuid`), /ejecucion_fallida_sin_filas_ck/);
    await assert.rejects(() => prismaServicio.$executeRawUnsafe(`UPDATE ejecucion_snapshot SET resultado = 'EXITOSA' WHERE id = '${e.id}'::uuid`), /ejecucion_cierre_ck/);
    await assert.rejects(() => prismaServicio.$executeRawUnsafe(`UPDATE ejecucion_snapshot SET resultado = 'FALLIDA', motivo = 'OTRO', fin = now() WHERE id = '${e.id}'::uuid`), /ejecucion_motivo_ck/);
  });

  it('listar pagina, ordena por inicio descendente y las filas no se borran', async () => {
    for (let i = 0; i < 3; i += 1) {
      const e = await nuevaEjecucion('MANUAL', new Date(Date.now() - (3 - i) * 1000));
      await ejecuciones.terminarExitosa(e.id, 0, 0, new Date());
    }
    const pagina = await ejecuciones.listar(1, 2);
    assert.equal(pagina.total, 3);
    assert.equal(pagina.items.length, 2);
    assert.ok(pagina.items[0]!.inicio.getTime() >= pagina.items[1]!.inicio.getTime());
    await assert.rejects(() => prismaServicio.$executeRawUnsafe('DELETE FROM ejecucion_snapshot'), /permission denied|permiso denegado/i);
  });
});

describe('umbral_carga y evento_umbral_carga [E6-B02#3, D161, D183]', () => {
  const fijar = (valor: number, idQe = QE) => umbrales.fijar({ idQe, valor, defecto: 5, actorId: idQe, actorNombre: 'QE1' });

  it('[E6-B02-T06] el primer cambio registra el 5 implícito como anterior; el mismo valor no inserta evento', async () => {
    assert.equal(await umbrales.obtener(QE), null);
    const uno = await fijar(1);
    assert.equal(uno.cambio, true);
    assert.equal(uno.umbral?.valor, 1);
    const repetido = await fijar(1);
    assert.equal(repetido.cambio, false);
    const dos = await fijar(2);
    assert.equal(dos.cambio, true);
    const { items, total } = await umbrales.historial(QE, 1, 10);
    assert.equal(total, 2);
    assert.deepEqual(items.map((e) => [e.valorAnterior, e.valorNuevo]), [[1, 2], [5, 1]], 'el más reciente primero');
  });

  it('fijar el valor por defecto sin fila previa no cambia nada ni registra evento', async () => {
    const r = await fijar(5);
    assert.deepEqual([r.cambio, r.umbral], [false, null]);
    assert.equal((await umbrales.historial(QE, 1, 10)).total, 0);
    assert.equal(await umbrales.obtener(QE), null);
  });

  it('[E6-B02-T09] el rol del servicio no puede modificar ni borrar el historial', async () => {
    await fijar(3);
    await assert.rejects(() => prismaServicio.$executeRawUnsafe('UPDATE evento_umbral_carga SET valor_nuevo = 9'), /permission denied|permiso denegado/i);
    await assert.rejects(() => prismaServicio.$executeRawUnsafe('DELETE FROM evento_umbral_carga'), /permission denied|permiso denegado/i);
    assert.equal((await umbrales.historial(QE, 1, 10)).total, 1);
  });

  it('el CHECK limita el umbral a 1–50 en la base', async () => {
    await assert.rejects(() => prismaServicio.$executeRawUnsafe(`INSERT INTO umbral_carga (id_qe, valor, actualizado_por) VALUES ('${randomUUID()}'::uuid, 51, '${QE}'::uuid)`), /umbral_valor_ck/);
    await assert.rejects(() => prismaServicio.$executeRawUnsafe(`INSERT INTO umbral_carga (id_qe, valor, actualizado_por) VALUES ('${randomUUID()}'::uuid, 0, '${QE}'::uuid)`), /umbral_valor_ck/);
  });

  it('dos primeros cambios simultáneos del mismo QE: ambos terminan y el historial es coherente', async () => {
    const [a, b] = await Promise.all([fijar(7), fijar(8)]);
    assert.ok(a.cambio && b.cambio);
    const { items } = await umbrales.historial(QE, 1, 10);
    assert.equal(items.length, 2);
    const actual = await umbrales.obtener(QE);
    assert.equal(actual?.valor, items[0]?.valorNuevo, 'el valor vigente es el del último evento');
    assert.deepEqual([items[1]?.valorAnterior], [5]);
    assert.equal(items[0]?.valorAnterior, items[1]?.valorNuevo, 'los eventos encadenan');
  });

  it('obtenerVarios devuelve solo los QE con fila', async () => {
    const otro = randomUUID();
    await fijar(4);
    const mapa = await umbrales.obtenerVarios([QE, otro]);
    assert.deepEqual([...mapa.keys()], [QE]);
    assert.equal((await umbrales.obtenerVarios([])).size, 0);
  });
});

describe('esquema', () => {
  it('no hay llaves foráneas hacia otro esquema ni tablas fuera de `indicadores`', async () => {
    const fk = await consultaDuenio<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace s ON s.oid = t.relnamespace
       JOIN pg_class r ON r.oid = c.confrelid JOIN pg_namespace sr ON sr.oid = r.relnamespace
       WHERE c.contype = 'f' AND s.nspname = 'indicadores' AND sr.nspname <> 'indicadores'`,
    );
    assert.equal(fk[0]?.n, 0);
    const tablas = await consultaDuenio<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'indicadores' AND tablename <> '_prisma_migrations' ORDER BY 1`);
    assert.deepEqual(tablas.map((t) => t.tablename), ['ejecucion_snapshot', 'evento_umbral_carga', 'snapshot_indicadores', 'umbral_carga']);
  });

  it('el rol svc_indicadores no alcanza otros esquemas', async () => {
    await assert.rejects(() => prismaServicio.$queryRawUnsafe('SELECT 1 FROM organizacion.usuario LIMIT 1'), /permission denied|permiso denegado/i);
  });
});
