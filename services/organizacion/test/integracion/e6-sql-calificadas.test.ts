/**
 * E6 · La SQL cruda del cierre con excepción (bloqueo `FOR UPDATE` de la historia) debe nombrar su esquema, igual que
 * DEF-E5C-05. Tras el pooler de Supabase (modo transacción) el `search_path` fijado al conectar no llega al backend; sin
 * pooler no se ve. Aquí se reproduce: una sola conexión con `SET search_path TO public` y se recorre el cierre.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../../src/dominio/tipos.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { HduPrismaRepositorio } from '../../src/infraestructura/repositorios/hdu.prisma.repositorio.js';
import { crearUsuarioDePrueba, limpiarBaseDeDatos, prisma } from '../ayudas.js';

let sinEsquema: PrismaService;

before(async () => {
  await limpiarBaseDeDatos();
  const base = process.env.DATABASE_URL as string;
  sinEsquema = new PrismaService({ datasourceUrl: `${base}${base.includes('?') ? '&' : '?'}connection_limit=1` });
  await sinEsquema.$connect();
  await sinEsquema.$executeRawUnsafe('SET search_path TO public');
});

after(async () => {
  await sinEsquema.$disconnect();
  await prisma.$disconnect();
});

describe('E6 · SQL cruda del cierre con excepción sin search_path del esquema', () => {
  it('la sesión de la prueba realmente no incluye el esquema organizacion', async () => {
    const [fila] = await sinEsquema.$queryRawUnsafe<Array<{ search_path: string }>>('SHOW search_path');
    assert.equal(fila?.search_path, 'public');
    await assert.rejects(sinEsquema.$queryRawUnsafe('SELECT 1 FROM historia_usuario'), /historia_usuario|42P01/);
  });

  it('cerrar con excepción una HDU en PENDIENTE_CIERRE funciona y deja una sola constancia', async () => {
    const qe = await crearUsuarioDePrueba('QE', { nombre: 'QE cierre E6' });
    const actor: Actor = { tipo: 'USUARIO', id: qe.id, nombre: qe.nombre };
    const celula = await prisma.celula.create({ data: { nombre: 'Célula E6 SQL' } });
    const hdu = await prisma.hdu.create({
      data: {
        codigo: 'E6-SQL-1',
        codigoNormalizado: 'e6-sql-1',
        titulo: 'HDU E6 SQL',
        celulaId: celula.id,
        prioridad: 'MEDIA',
        estado: 'PENDIENTE_CIERRE',
        qeResponsableId: qe.id,
        creadoPorTipo: 'USUARIO',
        creadoPorId: qe.id,
        creadoPorNombre: qe.nombre,
      },
    });

    const sprint = await prisma.sprint.create({
      data: { nombre: 'Sprint E6 SQL', inicio: new Date('2026-11-02'), fin: new Date('2026-11-13'), celulaId: celula.id },
    });
    const repositorio = new HduPrismaRepositorio(sinEsquema);
    assert.deepEqual(await repositorio.fijarSprintVigente(hdu.id, sprint.id), { cambio: true });

    const resultado = await repositorio.cerrarConExcepcion({
      hduId: hdu.id,
      aprobados: 7,
      pendientes: ['PLAN_PRUEBAS', 'EVIDENCIA_REGRESION', 'INFORME_FINAL'],
      justificacion: 'Cierre con excepción de prueba: el resto queda fuera del alcance del sprint.',
      actor,
      actorRol: 'QE',
    });

    assert.equal(resultado.hdu.estado, 'CERRADA');
    assert.equal(resultado.hdu.cierreParcial, true);
    assert.equal(resultado.estadoAnterior, 'PENDIENTE_CIERRE');
    assert.equal(await prisma.cierreHdu.count({ where: { hduId: hdu.id } }), 1);
  });
});
