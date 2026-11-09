/** Regresión E5/P2024 contra PostgreSQL local real; nunca importa el arnés que trunca la base. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Prisma } from '#prisma';

import { IntegracionesAplicacion, type SolicitudUpsert } from '../../src/aplicacion/integraciones.servicio.js';
import type { FilaUpsert } from '../../src/dominio/reglas/upsert-hdu.js';
import type { Actor } from '../../src/dominio/tipos.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { CelulaLiderPrismaRepositorio } from '../../src/infraestructura/repositorios/celula-lider.prisma.repositorio.js';
import { HduPrismaRepositorio } from '../../src/infraestructura/repositorios/hdu.prisma.repositorio.js';
import { SupervisionPrismaRepositorio } from '../../src/infraestructura/repositorios/supervision.prisma.repositorio.js';
import { CatalogoPrismaRepositorio } from '../../src/infraestructura/repositorios/catalogo.prisma.repositorio.js';
import { IntegracionHduPrismaRepositorio } from '../../src/infraestructura/repositorios/integracion-hdu.prisma.repositorio.js';
import { UsuarioPrismaRepositorio } from '../../src/infraestructura/repositorios/usuario.prisma.repositorio.js';

// Mismo rol de desarrollo que test/entorno.ts, sin cargar Auth ni archivos .env.
const url = new URL(process.env.DATABASE_URL ??
  'postgresql://svc_organizacion:svc_organizacion_local_dev@127.0.0.1:54322/postgres?schema=organizacion');
assert.ok(
  ['postgresql:', 'postgres:'].includes(url.protocol) &&
  ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '54322' &&
  url.username === 'svc_organizacion' && url.pathname === '/postgres' &&
  url.searchParams.get('schema') === 'organizacion',
  'Esta prueba solo admite el rol dev svc_organizacion en localhost/127.0.0.1:54322/postgres, schema=organizacion.',
);
url.searchParams.set('connection_limit', '1');
url.searchParams.set('pool_timeout', '1');
url.searchParams.set('connect_timeout', '2');

const prisma = new PrismaService({
  datasources: { db: { url: url.href } },
  log: [{ emit: 'event', level: 'query' }],
});
const consultas: Prisma.QueryEvent[] = [];
// PrismaService hereda el genérico de eventos por defecto; la opción log anterior habilita query en ejecución.
prisma.$on('query' as never, (evento: Prisma.QueryEvent) => consultas.push(evento));
const aplicacion = new IntegracionesAplicacion(
  new CatalogoPrismaRepositorio(prisma),
  new UsuarioPrismaRepositorio(prisma),
  new IntegracionHduPrismaRepositorio(prisma),
  new HduPrismaRepositorio(prisma),
  new SupervisionPrismaRepositorio(prisma),
  new CelulaLiderPrismaRepositorio(prisma),
);
const corrida = randomUUID();
const sufijo = corrida.replaceAll('-', '').slice(0, 12);
const destino = { celulaId: randomUUID(), sprintRespaldoId: randomUUID(), qeResponsableId: randomUUID() };
const etiqueta = { celulaId: randomUUID(), sprintId: randomUUID(), qeId: randomUUID(), analistaId: randomUUID() };
const nombreCelula = `E5 pool etiqueta ${corrida}`;
const nombreSprint = `E5 pool sprint etiqueta ${corrida}`;
const correoQe = `e5-pool-${corrida}@example.invalid`;
const codigos = new Set<string>();
const actores: string[] = [];
let conectada = false;

function actor(): Actor {
  const id = randomUUID();
  actores.push(id);
  return { tipo: 'USUARIO', id, nombre: `QA pool unico ${sufijo}` };
}

function filas(serie: string): FilaUpsert[] {
  return [1, 2].map((numero) => {
    const codigo = `E5POOL-${sufijo}-${serie}-${numero}`;
    codigos.add(codigo);
    return {
      fila: numero, codigo, titulo: `Historia Jira ${serie} ${numero}`,
      descripcion: `Regresion local ${corrida}`, prioridad: 'ALTA',
      // Son las referencias ya mapeadas de etiqueta Jira, sprint y correo; difieren del destino de respaldo.
      celula: ` ${nombreCelula.toUpperCase()} `, sprint: ` ${nombreSprint.toUpperCase()} `,
      qeCorreo: ` ${correoQe.toUpperCase()} `,
      claveExterna: codigo, urlExterna: `https://q360-test.atlassian.net/browse/${codigo}`,
    };
  });
}

function solicitud(filasLote: readonly FilaUpsert[], opciones: Partial<SolicitudUpsert> = {}): SolicitudUpsert {
  return {
    origen: 'JIRA', soloSimular: false, vincularExistentes: false, estricto: false,
    destino, sprintNoEncontrado: 'ERROR', filas: filasLote, ...opciones,
  };
}

async function historias(filasLote: readonly FilaUpsert[]) {
  return prisma.hdu.findMany({
    where: { codigoNormalizado: { in: filasLote.map((fila) => fila.codigo.toLowerCase()) } },
    include: { historiaSprints: true }, orderBy: { codigo: 'asc' },
  });
}

async function auditoria(idHistoria: readonly string[]) {
  return prisma.auditoria.findMany({
    where: { entidad: 'HDU', entidadId: { in: [...idHistoria] } }, orderBy: { id: 'asc' },
  });
}

before(async () => {
  await prisma.$connect();
  conectada = true;
  const rol = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'QE' } });
  const rolAnalista = await prisma.rol.findUniqueOrThrow({ where: { nombre: 'ANALISTA_QA' } });
  // IDs conocidos de antemano y una transacción: si falla la preparación no queda una fixture parcial.
  await prisma.$transaction([
    prisma.usuario.create({ data: { id: destino.qeResponsableId, nombre: `QE respaldo ${sufijo}`, correo: `e5-respaldo-${corrida}@example.invalid`, rolId: rol.id } }),
    prisma.usuario.create({ data: { id: etiqueta.qeId, nombre: `QE etiqueta ${sufijo}`, correo: correoQe, rolId: rol.id } }),
    prisma.usuario.create({ data: { id: etiqueta.analistaId, nombre: `Analista etiqueta ${sufijo}`, correo: `e5-analista-${corrida}@example.invalid`, rolId: rolAnalista.id } }),
    prisma.supervision.create({ data: { qeId: etiqueta.qeId, analistaId: etiqueta.analistaId, actorTipo: 'USUARIO', actorId: randomUUID(), actorNombre: `Fixture ${sufijo}` } }),
    prisma.celula.create({ data: { id: destino.celulaId, nombre: `E5 pool respaldo ${corrida}` } }),
    prisma.celula.create({ data: { id: etiqueta.celulaId, nombre: nombreCelula } }),
    prisma.sprint.create({ data: { id: destino.sprintRespaldoId, nombre: `E5 pool sprint respaldo ${corrida}`, celulaId: destino.celulaId, inicio: new Date('2026-11-01'), fin: new Date('2026-11-14') } }),
    prisma.sprint.create({ data: { id: etiqueta.sprintId, nombre: nombreSprint, celulaId: etiqueta.celulaId, inicio: new Date('2026-11-01'), fin: new Date('2026-11-14') } }),
  ]);
}, { timeout: 8000 });

after(async () => {
  try {
    if (!conectada) return;
    // Nunca borrar por prefijo, actor ni tabla completa. Recuperar exclusivamente los IDs de esta corrida.
    const propias = await prisma.hdu.findMany({
      where: {
        codigo: { in: [...codigos] }, creadoPorId: { in: actores },
        celulaId: { in: [destino.celulaId, etiqueta.celulaId] },
      }, select: { id: true },
    });
    const ids = propias.map(({ id }) => id);
    await prisma.$transaction([
      prisma.auditoria.deleteMany({ where: { entidad: 'HDU', entidadId: { in: ids } } }),
      prisma.supervision.deleteMany({ where: { analistaId: etiqueta.analistaId } }),
      prisma.hduHistorialResponsable.deleteMany({ where: { hduId: { in: ids } } }),
      prisma.hduHistorialAsignacion.deleteMany({ where: { hduId: { in: ids } } }),
      prisma.hduHistorialEstado.deleteMany({ where: { hduId: { in: ids } } }),
      prisma.historiaSprint.deleteMany({ where: { hduId: { in: ids } } }),
      prisma.hdu.deleteMany({ where: { id: { in: ids } } }),
      prisma.sprint.deleteMany({ where: { id: { in: [destino.sprintRespaldoId, etiqueta.sprintId] } } }),
      prisma.celula.deleteMany({ where: { id: { in: [destino.celulaId, etiqueta.celulaId] } } }),
      prisma.usuario.deleteMany({ where: { id: { in: [destino.qeResponsableId, etiqueta.qeId, etiqueta.analistaId] } } }),
    ]);
    assert.equal(await prisma.hdu.count({ where: { id: { in: ids } } }), 0);
    assert.equal((await auditoria(ids)).length, 0);
    assert.equal(await prisma.historiaSprint.count({ where: { hduId: { in: ids } } }), 0);
    assert.equal(await prisma.sprint.count({ where: { id: { in: [destino.sprintRespaldoId, etiqueta.sprintId] } } }), 0);
    assert.equal(await prisma.celula.count({ where: { id: { in: [destino.celulaId, etiqueta.celulaId] } } }), 0);
    assert.equal(await prisma.usuario.count({ where: { id: { in: [destino.qeResponsableId, etiqueta.qeId, etiqueta.analistaId] } } }), 0);
    console.log(`Limpieza verificada: ${ids.length} HDU propias; 0 HDU/auditorias/historiaSprint/sprints/celulas/QE residuales.`);
  } finally {
    await prisma.$disconnect();
  }
}, { timeout: 8000 });

describe('E5 pool unico real (connection_limit=1&pool_timeout=1)', { concurrency: false }, () => {
  it('[E5-B02#1] crea dos filas JIRA con lookup de celula, sprint y qeCorreo dentro de la transaccion', { timeout: 5000 }, async () => {
    const lote = filas('ALT');
    const quien = actor();
    const resultado = await aplicacion.upsert(solicitud(lote), quien);
    assert.equal(resultado.simulado, false);
    assert.deepEqual(resultado.filas.map(({ resultado, motivo }) => ({ resultado, motivo })), [
      { resultado: 'CREADA', motivo: null }, { resultado: 'CREADA', motivo: null },
    ], JSON.stringify(resultado));
    const guardadas = await historias(lote);
    assert.equal(guardadas.length, 2);
    assert.deepEqual(resultado.filas.map(({ idHistoria }) => idHistoria).sort(), guardadas.map(({ id }) => id).sort());
    for (const hdu of guardadas) {
      assert.equal(hdu.celulaId, etiqueta.celulaId);
      assert.equal(hdu.qeResponsableId, etiqueta.qeId);
      assert.equal(hdu.estado, 'PENDIENTE');
      assert.equal(hdu.analistaId, null);
      assert.equal(hdu.origen, 'JIRA');
      assert.equal(hdu.claveExterna, hdu.codigo);
      assert.equal(hdu.urlExterna, lote.find(({ codigo }) => codigo === hdu.codigo)?.urlExterna);
      assert.equal(hdu.creadoPorId, quien.id);
      assert.equal(hdu.historiaSprints.length, 1);
      assert.equal(hdu.historiaSprints[0]?.sprintId, etiqueta.sprintId);
      assert.equal(hdu.historiaSprints[0]?.fechaRetiro, null);
      const eventos = await auditoria([hdu.id]);
      assert.equal(eventos.length, 1);
      assert.equal(eventos[0]?.accion, 'CREAR_HDU');
      assert.equal(eventos[0]?.actorId, quien.id);
    }
  });

  it('[E5-B02#1] repetir dos filas JIRA es idempotente y no duplica auditoria ni sprint', { timeout: 5000 }, async () => {
    const lote = filas('IDEM');
    const quien = actor();
    const primera = await aplicacion.upsert(solicitud(lote), quien);
    assert.deepEqual(primera.filas.map(({ resultado }) => resultado), ['CREADA', 'CREADA'], JSON.stringify(primera));
    const antes = await historias(lote);
    const eventosAntes = await auditoria(antes.map(({ id }) => id));
    assert.equal(eventosAntes.length, 2);
    const repetida = await aplicacion.upsert(solicitud(lote), quien);
    assert.equal(repetida.simulado, false);
    assert.deepEqual(repetida.filas.map(({ resultado, motivo }) => ({ resultado, motivo })), [
      { resultado: 'OMITIDA', motivo: 'SIN_CAMBIOS' }, { resultado: 'OMITIDA', motivo: 'SIN_CAMBIOS' },
    ]);
    assert.deepEqual(repetida.filas.map(({ idHistoria }) => idHistoria), primera.filas.map(({ idHistoria }) => idHistoria));
    assert.deepEqual(await historias(lote), antes);
    assert.deepEqual(await auditoria(antes.map(({ id }) => id)), eventosAntes);
  });

  it('[E5-B03#3] estricto revierte alta, sprint y auditoria de la primera fila si la segunda tiene QE invalido', { timeout: 5000 }, async () => {
    const lote = filas('ROLL').map((fila, indice) => indice === 1 ? { ...fila, qeCorreo: `ausente-${corrida}@example.invalid` } : fila);
    const quien = actor();
    consultas.length = 0;
    const resultado = await aplicacion.upsert(solicitud(lote, { estricto: true }), quien);
    const sql = consultas.map(({ query }) => query);
    assert.equal(resultado.simulado, true);
    assert.deepEqual(resultado.filas.map(({ resultado, motivo, idHistoria }) => ({ resultado, motivo, idHistoria })), [
      { resultado: 'CREADA', motivo: null, idHistoria: null },
      { resultado: 'ERROR', motivo: 'QE_INVALIDO', idHistoria: null },
    ]);
    // La recuperación de errores también devuelve simulación: exigir escrituras reales seguidas de ROLLBACK.
    const alta = sql.findIndex((query) => /INSERT INTO "organizacion"\."historia_usuario"/.test(query));
    const evento = sql.findIndex((query) => /INSERT INTO "organizacion"\."auditoria"/.test(query));
    const rollback = sql.findIndex((query) => /^ROLLBACK\b/i.test(query));
    assert.ok(alta >= 0 && evento > alta && rollback > evento, 'Debe ejecutar INSERT HDU, INSERT auditoria y ROLLBACK, en ese orden.');
    assert.ok(sql.some((query) => /INSERT INTO "organizacion"\."historia_sprint"/.test(query)));
    assert.ok(!sql.some((query) => /^COMMIT\b/i.test(query)));
    assert.equal((await historias(lote)).length, 0);
    assert.equal(await prisma.auditoria.count({ where: { entidad: 'HDU', actorId: quien.id } }), 0);
    assert.equal(await prisma.historiaSprint.count({ where: { hdu: { creadoPorId: quien.id } } }), 0);
    console.log('Estricto: INSERT historia_usuario + historia_sprint + auditoria; ROLLBACK; 0 HDU/auditorias persistidas.');
  });

  it('[E5-B03#2] soloSimular resuelve dos altas y una actualizacion sin escribir ni auditar', { timeout: 5000 }, async () => {
    const base = filas('BASE');
    const quien = actor();
    const creada = await aplicacion.upsert(solicitud(base), quien);
    assert.deepEqual(creada.filas.map(({ resultado }) => resultado), ['CREADA', 'CREADA'], JSON.stringify(creada));
    const antes = await historias(base);
    const ids = antes.map(({ id }) => id);
    const eventosAntes = await auditoria(ids);
    const nuevas = filas('SIM');
    const existente = { ...base[0]!, fila: 3, titulo: 'Titulo que solo debe simularse' };
    consultas.length = 0;
    const resultado = await aplicacion.upsert(solicitud([...nuevas, existente], { soloSimular: true }), quien);
    const sql = consultas.map(({ query }) => query);
    assert.equal(resultado.simulado, true);
    assert.deepEqual(resultado.filas.map(({ resultado }) => resultado), ['CREADA', 'CREADA', 'ACTUALIZADA']);
    assert.deepEqual(resultado.filas.slice(0, 2).map(({ idHistoria }) => idHistoria), [null, null]);
    assert.equal(resultado.filas[2]?.idHistoria, creada.filas[0]?.idHistoria);
    assert.ok(!sql.some((query) => /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(query)), 'soloSimular debe emitir exclusivamente lecturas.');
    assert.equal((await historias(nuevas)).length, 0);
    assert.deepEqual(await historias(base), antes);
    assert.deepEqual(await auditoria(ids), eventosAntes);
    assert.equal(await prisma.auditoria.count({ where: { entidad: 'HDU', actorId: quien.id } }), 2);
  });

  // Modo confirmación (D140, D151): la validación de asignación no puede pedir una segunda conexión con la transacción abierta.
  const asignacionValida = { celulaId: etiqueta.celulaId, qeResponsableId: etiqueta.qeId, analistaId: etiqueta.analistaId, sprintId: etiqueta.sprintId };
  const confirmacion = (filasLote: readonly FilaUpsert[]): SolicitudUpsert => ({
    origen: 'JIRA', consultaId: randomUUID(), soloSimular: false, vincularExistentes: false, estricto: false, filas: filasLote,
  });
  function filaConfirmacion(serie: string, operacion: 'CREAR' | 'ACTUALIZAR', asignacion?: FilaUpsert['asignacion']): FilaUpsert {
    const codigo = `E5POOL-${sufijo}-${serie}`;
    codigos.add(codigo);
    return {
      fila: 1, codigo, titulo: `Historia confirmada ${serie}`, descripcion: null, prioridad: 'MEDIA', celula: null, sprint: null, qeCorreo: null,
      claveExterna: codigo, urlExterna: `https://q360-test.atlassian.net/browse/${codigo}`, operacion, ...(asignacion === undefined ? {} : { asignacion }),
    };
  }

  it('[E5-C] confirmacion CREAR valida crea la HDU con una sola conexion', { timeout: 5000 }, async () => {
    const fila = filaConfirmacion('CONF-OK', 'CREAR', asignacionValida);
    const quien = actor();
    const resultado = await aplicacion.upsert(confirmacion([fila]), quien);
    assert.deepEqual(resultado.filas.map(({ resultado, motivo }) => ({ resultado, motivo })), [{ resultado: 'CREADA', motivo: null }], JSON.stringify(resultado));
    const [hdu] = await historias([fila]);
    assert.equal(hdu?.celulaId, etiqueta.celulaId);
    assert.equal(hdu?.analistaId, etiqueta.analistaId);
    assert.equal(hdu?.qeResponsableId, etiqueta.qeId);
    assert.equal(hdu?.historiaSprints[0]?.sprintId, etiqueta.sprintId);
  });

  it('[E5-C] confirmacion CREAR con codigo existente da HDU_CREADA_DESPUES aunque la asignacion sea invalida', { timeout: 5000 }, async () => {
    const quien = actor();
    const original = filaConfirmacion('CONF-DUP', 'CREAR', asignacionValida);
    const primera = await aplicacion.upsert(confirmacion([original]), quien);
    assert.equal(primera.filas[0]?.resultado, 'CREADA', JSON.stringify(primera));
    const antes = await historias([original]);
    const repetida = await aplicacion.upsert(confirmacion([{ ...original, titulo: 'Otro titulo', asignacion: { ...asignacionValida, analistaId: randomUUID() } }]), quien);
    assert.deepEqual(repetida.filas.map(({ resultado, motivo, idHistoria }) => ({ resultado, motivo, idHistoria })), [
      { resultado: 'OMITIDA', motivo: 'HDU_CREADA_DESPUES', idHistoria: antes[0]?.id },
    ], JSON.stringify(repetida));
    assert.deepEqual(await historias([original]), antes);
  });

  it('[E5-C] confirmacion CREAR con asignacion invalida es ASIGNACION_INVALIDA y no escribe', { timeout: 5000 }, async () => {
    const fila = filaConfirmacion('CONF-BAD', 'CREAR', { ...asignacionValida, analistaId: randomUUID() });
    const quien = actor();
    const resultado = await aplicacion.upsert(confirmacion([fila]), quien);
    assert.deepEqual(resultado.filas.map(({ resultado, motivo }) => ({ resultado, motivo })), [{ resultado: 'ERROR', motivo: 'ASIGNACION_INVALIDA' }], JSON.stringify(resultado));
    assert.equal(resultado.filas[0]?.errorAsignacion?.campo, 'analistaId');
    assert.equal((await historias([fila])).length, 0);
  });

  it('[E5-C] confirmacion ACTUALIZAR vincula y actualiza el titulo', { timeout: 5000 }, async () => {
    const quien = actor();
    const fila = filaConfirmacion('CONF-UPD', 'CREAR', asignacionValida);
    assert.equal((await aplicacion.upsert(confirmacion([fila]), quien)).filas[0]?.resultado, 'CREADA');
    const resultado = await aplicacion.upsert(confirmacion([{ ...fila, operacion: 'ACTUALIZAR', asignacion: undefined, titulo: 'Titulo actualizado' }]), quien);
    assert.deepEqual(resultado.filas.map(({ resultado }) => resultado), ['ACTUALIZADA'], JSON.stringify(resultado));
    assert.equal((await historias([fila]))[0]?.titulo, 'Titulo actualizado');
  });
});
