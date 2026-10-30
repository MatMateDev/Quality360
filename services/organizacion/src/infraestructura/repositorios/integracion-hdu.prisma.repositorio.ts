import { Injectable } from '@nestjs/common';
import type { Prisma } from '#prisma';

import { ConflictoUnicidad } from '../../dominio/errores/conflicto-unicidad.js';
import {
  type DatosActualizacionUpsert,
  type DatosAltaUpsert,
  type HduParaUpsert,
  type IntegracionHduRepositorio,
  type UnidadTrabajoUpsert,
} from '../../dominio/repositorios/integracion-hdu.repositorio.js';
import type { Actor, OrigenHdu } from '../../dominio/tipos.js';
import { esErrorUnicidad } from '../prisma/errores-prisma.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { crearHduEnTransaccion } from './hdu.prisma.repositorio.js';

const SELECCION = { id: true, estado: true, origen: true, titulo: true, descripcion: true, prioridad: true } as const;

type Cliente = Prisma.TransactionClient | PrismaService;

function aHduParaUpsert(fila: { id: string; estado: HduParaUpsert['estado']; origen: string; titulo: string; descripcion: string | null; prioridad: HduParaUpsert['prioridad'] }): HduParaUpsert {
  return { id: fila.id, estado: fila.estado, origen: fila.origen as OrigenHdu, titulo: fila.titulo, descripcion: fila.descripcion, prioridad: fila.prioridad };
}

async function buscar(cliente: Cliente, codigoNormalizado: string): Promise<HduParaUpsert | null> {
  const fila = await cliente.hdu.findUnique({ where: { codigoNormalizado }, select: SELECCION });
  return fila === null ? null : aHduParaUpsert(fila);
}

/** Unidad que escribe dentro de la transacción `tx`. */
function unidadEscritura(tx: Prisma.TransactionClient): UnidadTrabajoUpsert {
  return {
    buscarPorCodigoNormalizado: (codigoNormalizado) => buscar(tx, codigoNormalizado),

    async crear(datos: DatosAltaUpsert, actor: Actor) {
      try {
        const creada = await crearHduEnTransaccion(
          tx,
          {
            codigo: datos.codigo,
            titulo: datos.titulo,
            descripcion: datos.descripcion,
            celulaId: datos.celulaId,
            sprintId: datos.sprintId,
            prioridad: datos.prioridad,
            qeResponsableId: datos.qeResponsableId,
            origen: datos.origen,
            claveExterna: datos.claveExterna,
            urlExterna: datos.urlExterna,
          },
          actor,
        );
        return { id: creada.id };
      } catch (error) {
        if (esErrorUnicidad(error, 'historia_usuario_codigo_normalizado_key')) throw new ConflictoUnicidad('codigo');
        throw error;
      }
    },

    async actualizar({ antes, datos, vincula }: DatosActualizacionUpsert, actor: Actor) {
      const data: Prisma.HduUpdateInput = { ...datos };
      if (vincula !== null) {
        data.origen = vincula.origen;
        if (vincula.origen === 'JIRA') {
          data.claveExterna = vincula.claveExterna;
          data.urlExterna = vincula.urlExterna;
        }
      }
      await tx.hdu.update({ where: { id: antes.id }, data });
      const valoresAntes: Record<string, unknown> = {};
      const valoresDespues: Record<string, unknown> = {};
      for (const campo of ['titulo', 'descripcion', 'prioridad'] as const) {
        if (datos[campo] === undefined) continue;
        valoresAntes[campo] = antes[campo];
        valoresDespues[campo] = datos[campo];
      }
      if (vincula !== null) {
        valoresAntes.origen = antes.origen;
        valoresDespues.origen = vincula.origen;
        if (vincula.origen === 'JIRA') valoresDespues.claveExterna = vincula.claveExterna;
      }
      await tx.auditoria.create({
        data: {
          actorTipo: actor.tipo,
          actorId: actor.id,
          actorNombre: actor.nombre,
          entidad: 'HDU',
          entidadId: antes.id,
          accion: 'ACTUALIZAR_HDU',
          antes: valoresAntes as Prisma.InputJsonValue,
          despues: valoresDespues as Prisma.InputJsonValue,
          motivo: null,
        },
      });
    },
  };
}

@Injectable()
export class IntegracionHduPrismaRepositorio implements IntegracionHduRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(trabajo: (unidad: UnidadTrabajoUpsert) => Promise<T>): Promise<T> {
    // Un lote estricto de 25 altas puede tardar más que los 5 s por defecto de una transacción interactiva.
    return this.prisma.$transaction((tx) => trabajo(unidadEscritura(tx)), { maxWait: 5000, timeout: 20_000 });
  }

  soloLectura(): UnidadTrabajoUpsert {
    return {
      buscarPorCodigoNormalizado: (codigoNormalizado) => buscar(this.prisma, codigoNormalizado),
      crear: () => Promise.resolve({ id: '' }),
      actualizar: () => Promise.resolve(),
    };
  }
}
