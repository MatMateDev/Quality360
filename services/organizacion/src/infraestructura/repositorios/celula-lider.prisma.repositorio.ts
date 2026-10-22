import { Injectable } from '@nestjs/common';
import type { Prisma } from '#prisma';

import { diferenciaCelulas, hayCambioDeCelulas } from '../../dominio/reglas/rol-celulas.js';
import type { CelulaLiderRepositorio, ResultadoReemplazoCelulas } from '../../dominio/repositorios/celula-lider.repositorio.js';
import type { Actor, AsignacionCelulaLider, CatalogoRef, UsuarioResumen } from '../../dominio/tipos.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const INCLUYE_CELULA = { celula: { select: { id: true, nombre: true } } } as const;
type FilaConCelula = Prisma.CelulaLiderGetPayload<{ include: typeof INCLUYE_CELULA }>;

function aAsignacion(fila: FilaConCelula): AsignacionCelulaLider {
  return {
    id: fila.id,
    celula: { id: fila.celula.id, nombre: fila.celula.nombre },
    desde: fila.desde,
    hasta: fila.hasta,
    asignadoPor: { tipo: fila.asignadoPorTipo, id: fila.asignadoPorId, nombre: fila.asignadoPorNombre },
    retiradoPor:
      fila.retiradoPorTipo !== null && fila.retiradoPorId !== null && fila.retiradoPorNombre !== null
        ? { tipo: fila.retiradoPorTipo, id: fila.retiradoPorId, nombre: fila.retiradoPorNombre }
        : null,
  };
}

async function vigentesEnTx(tx: Tx, usuarioId: string): Promise<CatalogoRef[]> {
  const filas = await tx.celulaLider.findMany({
    where: { usuarioId, hasta: null },
    include: INCLUYE_CELULA,
    orderBy: { celula: { nombre: 'asc' } },
  });
  return filas.map((fila) => ({ id: fila.celula.id, nombre: fila.celula.nombre }));
}

/**
 * Fija las células vigentes de un Líder QA dentro de la transacción `tx`. El
 * llamador ya bloqueó la fila del usuario y comprobó que es `LIDER_QA` y que las
 * células existen. Audita `ASIGNAR_CELULAS_LIDER` solo si hay diferencias.
 */
export async function reemplazarCelulasEnTransaccion(
  tx: Tx,
  usuarioId: string,
  celulaIds: readonly string[],
  actor: Actor,
): Promise<{ cambio: boolean; antes: CatalogoRef[]; despues: CatalogoRef[] }> {
  const antes = await vigentesEnTx(tx, usuarioId);
  const diferencia = diferenciaCelulas(
    antes.map((celula) => celula.id),
    celulaIds,
  );
  if (!hayCambioDeCelulas(diferencia)) return { cambio: false, antes, despues: antes };

  const ahora = new Date();
  if (diferencia.cerrar.length > 0) {
    await tx.celulaLider.updateMany({
      where: { usuarioId, celulaId: { in: diferencia.cerrar }, hasta: null },
      data: { hasta: ahora, retiradoPorTipo: actor.tipo, retiradoPorId: actor.id, retiradoPorNombre: actor.nombre },
    });
  }
  if (diferencia.abrir.length > 0) {
    await tx.celulaLider.createMany({
      data: diferencia.abrir.map((celulaId) => ({
        usuarioId,
        celulaId,
        desde: ahora,
        asignadoPorTipo: actor.tipo,
        asignadoPorId: actor.id,
        asignadoPorNombre: actor.nombre,
      })),
    });
  }

  const despues = await vigentesEnTx(tx, usuarioId);
  await tx.auditoria.create({
    data: {
      actorTipo: actor.tipo,
      actorId: actor.id,
      actorNombre: actor.nombre,
      entidad: 'USUARIO',
      entidadId: usuarioId,
      accion: 'ASIGNAR_CELULAS_LIDER',
      antes: { celulas: antes.map((celula) => ({ id: celula.id, nombre: celula.nombre })) },
      despues: { celulas: despues.map((celula) => ({ id: celula.id, nombre: celula.nombre })) },
      motivo: null,
    },
  });
  return { cambio: true, antes, despues };
}

@Injectable()
export class CelulaLiderPrismaRepositorio implements CelulaLiderRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async listarVigentes(usuarioId: string): Promise<AsignacionCelulaLider[]> {
    const filas = await this.prisma.celulaLider.findMany({
      where: { usuarioId, hasta: null },
      include: INCLUYE_CELULA,
      orderBy: { celula: { nombre: 'asc' } },
    });
    return filas.map(aAsignacion);
  }

  async listarHistorial(usuarioId: string): Promise<AsignacionCelulaLider[]> {
    const filas = await this.prisma.celulaLider.findMany({
      where: { usuarioId },
      include: INCLUYE_CELULA,
      orderBy: [{ desde: 'desc' }, { celula: { nombre: 'asc' } }],
    });
    return filas.map(aAsignacion);
  }

  async mapaCelulasVigentes(usuarioIds: readonly string[]): Promise<Map<string, CatalogoRef[]>> {
    const mapa = new Map<string, CatalogoRef[]>();
    if (usuarioIds.length === 0) return mapa;
    const filas = await this.prisma.celulaLider.findMany({
      where: { usuarioId: { in: [...usuarioIds] }, hasta: null },
      include: INCLUYE_CELULA,
      orderBy: { celula: { nombre: 'asc' } },
    });
    for (const fila of filas) {
      const lista = mapa.get(fila.usuarioId) ?? [];
      lista.push({ id: fila.celula.id, nombre: fila.celula.nombre });
      mapa.set(fila.usuarioId, lista);
    }
    return mapa;
  }

  async reemplazar(input: { usuarioId: string; celulaIds: readonly string[]; actor: Actor }): Promise<ResultadoReemplazoCelulas> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id_usuario" FROM "usuario" WHERE "id_usuario" = ${input.usuarioId}::uuid FOR UPDATE`;
      const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: input.usuarioId }, include: { rol: { select: { nombre: true } } } });
      if (usuario.rol.nombre !== 'LIDER_QA') return { tipo: 'ROL_INCOMPATIBLE' } as const;
      const resultado = await reemplazarCelulasEnTransaccion(tx, input.usuarioId, input.celulaIds, input.actor);
      return { tipo: 'OK', ...resultado } as const;
    });
  }

  async lideresActivosSinCelulas(): Promise<UsuarioResumen[]> {
    return this.prisma.usuario.findMany({
      where: { rol: { nombre: 'LIDER_QA' }, activo: true, celulasLider: { none: { hasta: null } } },
      select: { id: true, nombre: true, correo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async celulasActivasSinLider(): Promise<CatalogoRef[]> {
    return this.prisma.celula.findMany({
      // Un Líder desactivado no cuenta como líder: sus asignaciones se conservan, sin retirarlas (D55).
      where: { activo: true, lideres: { none: { hasta: null, usuario: { activo: true } } } },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
  }
}
