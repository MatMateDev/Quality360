/**
 * E5-B05-T21 (lado Organización): la unicidad salta al insertar, después de que la búsqueda previa no encontró la HDU.
 * La fila queda `OMITIDA` `HDU_CREADA_DESPUES` y las demás se crean. Se prueba el caso de uso con repositorios falsos,
 * porque la carrera real no se puede provocar de forma determinista desde HTTP.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { IntegracionesAplicacion } from '../../src/aplicacion/integraciones.servicio.js';
import { ConflictoUnicidad } from '../../src/dominio/errores/conflicto-unicidad.js';
import type { UnidadTrabajoUpsert } from '../../src/dominio/repositorios/integracion-hdu.repositorio.js';

const IDS = { celula: 'c0000000-0000-4000-8000-000000000001', qe: 'a0000000-0000-4000-8000-000000000001', analista: 'a0000000-0000-4000-8000-000000000002', sprint: 's0000000-0000-4000-8000-000000000001' };

describe('upsert en modo confirmación · carrera de unicidad [E5-B05-T21]', () => {
  it('ConflictoUnicidad al insertar es HDU_CREADA_DESPUES por fila y no cancela el lote', async () => {
    const creadas: string[] = [];
    const existentes = new Map<string, { id: string }>();
    let busquedasPrevias = 0;
    const unidad = {
      buscarPorCodigoNormalizado: () => {
        busquedasPrevias += 1;
        return Promise.resolve(null);
      },
      crear: (datos: { codigo: string }) => {
        if (datos.codigo === 'QTY-2') {
          // Otro usuario la creó entre la búsqueda y el INSERT.
          existentes.set('qty-2', { id: 'h-ajena' });
          return Promise.reject(new ConflictoUnicidad('codigo'));
        }
        creadas.push(datos.codigo);
        return Promise.resolve({ id: `h-${datos.codigo}` });
      },
      actualizar: () => Promise.resolve(),
    } as unknown as UnidadTrabajoUpsert;
    const repositorio = {
      enTransaccion: <T>(trabajo: (u: UnidadTrabajoUpsert) => Promise<T>) => trabajo(unidad),
      soloLectura: (): UnidadTrabajoUpsert => ({ ...unidad, buscarPorCodigoNormalizado: (c) => Promise.resolve((existentes.get(c) as never) ?? null) }),
    };
    const celula = { id: IDS.celula, nombre: 'C' };
    const sprint = { id: IDS.sprint, nombre: 'S', celulaId: IDS.celula, inicio: new Date(), fin: new Date() };
    const qe = { id: IDS.qe, rol: 'QE', activo: true, nombre: 'QE' };
    const analista = { id: IDS.analista, rol: 'ANALISTA_QA', activo: true, nombre: 'A' };
    const servicio = new IntegracionesAplicacion(
      { buscarCelula: () => Promise.resolve(celula), buscarSprint: () => Promise.resolve(sprint) } as never,
      { buscarPorId: (id: string) => Promise.resolve(id === IDS.qe ? qe : analista) } as never,
      repositorio as never,
      {} as never,
      { listarAnalistasVigentesIds: () => Promise.resolve([IDS.analista]) } as never,
      {} as never,
    );
    const asignacion = { celulaId: IDS.celula, qeResponsableId: IDS.qe, analistaId: IDS.analista, sprintId: IDS.sprint };
    const fila = (n: number, codigo: string) => ({ fila: n, codigo, titulo: 'T', descripcion: null, prioridad: null, celula: null, sprint: null, qeCorreo: null, claveExterna: codigo, urlExterna: null, operacion: 'CREAR' as const, asignacion });
    const r = await servicio.upsert(
      { origen: 'JIRA', consultaId: 'q0000000-0000-4000-8000-000000000001', soloSimular: false, vincularExistentes: false, estricto: false, filas: [fila(1, 'QTY-1'), fila(2, 'QTY-2'), fila(3, 'QTY-3')] },
      { tipo: 'USUARIO', id: 'u1', nombre: 'Admin' },
    );
    assert.deepEqual(r.filas.map((f) => [f.resultado, f.motivo, f.idHistoria]), [['CREADA', null, 'h-QTY-1'], ['OMITIDA', 'HDU_CREADA_DESPUES', 'h-ajena'], ['CREADA', null, 'h-QTY-3']]);
    assert.deepEqual(creadas, ['QTY-1', 'QTY-3']);
    assert.equal(busquedasPrevias, 3);
  });
});
