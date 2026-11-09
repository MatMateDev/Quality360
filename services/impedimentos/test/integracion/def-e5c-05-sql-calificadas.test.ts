/**
 * DEF-E5C-05 · Las SQL crudas de Impedimentos (bloqueo de la fila del impedimento y el historial de gestión que une
 * `accion_impedimento`, `impedimento` y `riesgo_hdu`) deben nombrar su esquema. Tras el pooler de Supabase (modo
 * transacción) el `search_path` fijado al conectar no llega al backend; sin pooler no se ve. Aquí se reproduce con una
 * sola conexión y `SET search_path TO public`.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { PERSONAS, iniciarFalsos, type Falsos } from '../ayudas.js';
import { crearAppDePrueba } from '../ayudas-app.js';
import { crearFixture, type FixtureE4 } from '../fixture-e4.js';
import { GestionPrismaRepositorio } from '../../src/infraestructura/prisma/gestion.prisma.repositorio.js';
import { ImpedimentoPrismaRepositorio } from '../../src/infraestructura/prisma/impedimento.prisma.repositorio.js';
import { PrismaService } from '../../src/infraestructura/prisma/prisma.service.js';
import { RiesgoPrismaRepositorio } from '../../src/infraestructura/prisma/riesgo.prisma.repositorio.js';

let falsos: Falsos;
let app: NestExpressApplication;
let f: FixtureE4;
let sinEsquema: PrismaService;

before(async () => {
  falsos = await iniciarFalsos();
  app = await crearAppDePrueba(falsos.organizacionUrl, { certificacionesUrl: falsos.certificacionesUrl });
  f = await crearFixture(app, falsos);
  const base = process.env.DATABASE_URL as string;
  sinEsquema = new PrismaService({ datasourceUrl: `${base}${base.includes('?') ? '&' : '?'}connection_limit=1` });
  await sinEsquema.$connect();
  await sinEsquema.$executeRawUnsafe('SET search_path TO public');
});

after(async () => {
  await sinEsquema.$disconnect();
  await app.close();
  await falsos.cerrar();
});

describe('DEF-E5C-05 · SQL crudas de Impedimentos sin search_path del esquema', () => {
  it('la sesión de la prueba realmente no incluye el esquema impedimentos', async () => {
    const [fila] = await sinEsquema.$queryRawUnsafe<Array<{ search_path: string }>>('SHOW search_path');
    assert.equal(fila?.search_path, 'public');
    await assert.rejects(sinEsquema.$queryRawUnsafe('SELECT 1 FROM impedimento'), /impedimento|42P01/);
  });

  it('historial de gestión (ENTRADAS), bloqueo de impedimento y riesgo funcionan con search_path=public', async () => {
    const gestion = new GestionPrismaRepositorio(sinEsquema);
    const deHdu = await gestion.deHdu(f.h.H6.id, {}, false);
    assert.deepEqual(deHdu.map((e) => e.accion), ['REGISTRAR', 'FIJAR_RIESGO', 'ESCALAR']);
    const global = await gestion.global({}, 0, 100);
    assert.ok(global.total >= 3 && global.items.length >= 3);
    assert.equal(await gestion.contarGlobal({ tipo: 'RIESGO' }) >= 1, true);

    const actor = { id: PERSONAS.adm1.id, nombre: PERSONAS.adm1.nombre, rol: 'ADMINISTRADOR' as const };
    const resultado = await new ImpedimentoPrismaRepositorio(sinEsquema).transicionar(f.i.I1, () => ({
      tipo: 'RESOLVER',
      estado: 'RESUELTO',
      comentario: 'Resuelto por la prueba DEF-E5C-05',
      actor,
      ahora: new Date(),
    }));
    assert.equal(resultado.impedimento.estado, 'RESUELTO');

    const riesgo = await new RiesgoPrismaRepositorio(sinEsquema).fijar(f.h.H6.id, () => ({
      nivel: 'MEDIO',
      justificacion: 'Prueba DEF-E5C-05',
      sugeridoAlFijar: null,
      actor,
      ahora: new Date(),
    }));
    assert.equal(riesgo.registro.nivel, 'MEDIO');
  });
});
