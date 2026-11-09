/**
 * DEF-E5C-05 · Las SQL crudas de Organización (bloqueos `FOR UPDATE` de usuario e historia) deben nombrar su esquema.
 * Tras el pooler de Supabase (modo transacción) el `search_path` fijado al conectar no llega al backend; sin pooler no
 * se ve. Aquí se reproduce: una sola conexión con `SET search_path TO public` y se recorren los caminos con SQL cruda.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Actor } from '../../src/dominio/tipos.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { CelulaLiderPrismaRepositorio } from '../../src/infraestructura/repositorios/celula-lider.prisma.repositorio.js';
import { HduPrismaRepositorio } from '../../src/infraestructura/repositorios/hdu.prisma.repositorio.js';
import { UsuarioPrismaRepositorio } from '../../src/infraestructura/repositorios/usuario.prisma.repositorio.js';
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

describe('DEF-E5C-05 · SQL crudas de Organización sin search_path del esquema', () => {
  it('la sesión de la prueba realmente no incluye el esquema organizacion', async () => {
    const [fila] = await sinEsquema.$queryRawUnsafe<Array<{ search_path: string }>>('SHOW search_path');
    assert.equal(fila?.search_path, 'public');
    await assert.rejects(sinEsquema.$queryRawUnsafe('SELECT 1 FROM usuario'), /usuario|42P01/);
  });

  it('bloqueos de usuario (cambiar rol, reemplazar células) y de historia (sprint vigente, reasignar QE) funcionan', async () => {
    const admin = await crearUsuarioDePrueba('ADMINISTRADOR', { nombre: 'Admin DEF' });
    const qe1 = await crearUsuarioDePrueba('QE', { nombre: 'QE uno' });
    const qe2 = await crearUsuarioDePrueba('QE', { nombre: 'QE dos' });
    const actor: Actor = { tipo: 'USUARIO', id: admin.id, nombre: admin.nombre };
    const celula = await prisma.celula.create({ data: { nombre: 'Célula DEF' } });
    const inicio = new Date('2026-01-01');
    const fin = new Date('2026-01-14');
    const sprint = await prisma.sprint.create({ data: { nombre: 'Sprint DEF', inicio, fin, celulaId: celula.id } });
    const hdu = await prisma.hdu.create({
      data: {
        codigo: 'DEF-1',
        codigoNormalizado: 'def-1',
        titulo: 'HDU DEF',
        celulaId: celula.id,
        prioridad: 'MEDIA',
        qeResponsableId: qe1.id,
        creadoPorTipo: 'USUARIO',
        creadoPorId: admin.id,
        creadoPorNombre: admin.nombre,
      },
    });

    // usuario.prisma: FOR UPDATE sobre "usuario"
    const cambio = await new UsuarioPrismaRepositorio(sinEsquema).cambiarRolAtomico({
      id: qe1.id,
      rolNuevo: 'QE',
      celulaIds: undefined,
      actor,
      decidir: () => ({ tipo: 'SIN_CAMBIO' }),
    });
    assert.notEqual(cambio.tipo, 'RECHAZADO');

    // celula-lider.prisma: FOR UPDATE sobre "usuario"; un QE no es Líder QA
    const reemplazo = await new CelulaLiderPrismaRepositorio(sinEsquema).reemplazar({ usuarioId: qe1.id, celulaIds: [celula.id], actor });
    assert.equal(reemplazo.tipo, 'ROL_INCOMPATIBLE');

    // hdu.prisma: FOR UPDATE sobre "historia_usuario"
    const hduRepo = new HduPrismaRepositorio(sinEsquema);
    assert.deepEqual(await hduRepo.fijarSprintVigente(hdu.id, sprint.id), { cambio: true });
    const reasignada = await hduRepo.reasignarQeResponsable({ hduId: hdu.id, qeNuevoId: qe2.id, motivo: 'Prueba DEF-E5C-05', actor });
    assert.equal(reasignada.cambio, true);
  });
});
