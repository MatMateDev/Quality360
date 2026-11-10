/**
 * E6 · Las SQL crudas de Indicadores (upsert del snapshot y bloqueo del umbral) deben nombrar su esquema, igual que
 * DEF-E5C-05. Tras el pooler de Supabase (modo transacción) el `search_path` fijado al conectar no llega al backend; sin
 * pooler no se ve. Aquí se reproduce: una sola conexión con `SET search_path TO public` y se recorren esos caminos.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { FilaSnapshot } from '../../src/dominio/repositorios.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { EjecucionPrismaRepositorio, SnapshotPrismaRepositorio, UmbralPrismaRepositorio } from '../../src/infraestructura/prisma/repositorios.prisma.js';
import { cerrarBases, limpiarIndicadores } from '../ayudas-bd.js';

let sinEsquema: PrismaService;

const fila = (): FilaSnapshot => ({
  fecha: '2026-11-04',
  idCelula: randomUUID(),
  celulaNombre: 'CEL-A',
  idSprint: randomUUID(),
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
});

before(async () => {
  const base = process.env.DATABASE_URL as string;
  sinEsquema = new PrismaService({ datasourceUrl: `${base}${base.includes('?') ? '&' : '?'}connection_limit=1` });
  await sinEsquema.$connect();
  await sinEsquema.$executeRawUnsafe('SET search_path TO public');
});
beforeEach(async () => {
  await limpiarIndicadores();
});
after(async () => {
  await sinEsquema.$disconnect();
  await cerrarBases();
});

describe('E6 · SQL crudas de Indicadores sin search_path del esquema', () => {
  it('la sesión de la prueba realmente no incluye el esquema indicadores', async () => {
    const [actual] = await sinEsquema.$queryRawUnsafe<Array<{ search_path: string }>>('SHOW search_path');
    assert.equal(actual?.search_path, 'public');
    await assert.rejects(sinEsquema.$queryRawUnsafe('SELECT 1 FROM umbral_carga'), /umbral_carga|42P01/);
  });

  it('el snapshot inserta y, repetido el mismo día, actualiza la fila', async () => {
    const ejecucion = await new EjecucionPrismaRepositorio(sinEsquema).iniciar({
      fecha: '2026-11-04',
      origen: 'MANUAL',
      actorId: randomUUID(),
      actorNombre: 'ADM1',
      ahora: new Date(),
      abandonoMs: 300_000,
    });
    const snapshots = new SnapshotPrismaRepositorio(sinEsquema);
    const una = fila();
    assert.deepEqual(await snapshots.guardarLote([una], ejecucion.id, new Date()), { nuevas: 1, actualizadas: 0 });
    assert.deepEqual(await snapshots.guardarLote([una], ejecucion.id, new Date()), { nuevas: 0, actualizadas: 1 });
  });

  it('fijar el umbral de carga bloquea su fila y registra el cambio', async () => {
    const umbrales = new UmbralPrismaRepositorio(sinEsquema);
    const idQe = randomUUID();
    const primero = await umbrales.fijar({ idQe, valor: 7, defecto: 5, actorId: randomUUID(), actorNombre: 'QE1' });
    assert.equal(primero.cambio, true);
    assert.equal(primero.umbral?.valor, 7);
    const segundo = await umbrales.fijar({ idQe, valor: 9, defecto: 5, actorId: randomUUID(), actorNombre: 'QE1' });
    assert.equal(segundo.cambio, true);
    assert.equal(segundo.umbral?.valor, 9);
  });
});
