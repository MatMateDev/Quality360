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
