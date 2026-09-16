import { Injectable } from '@nestjs/common';
import type { Supervision as SupervisionPrisma, Usuario as UsuarioPrisma } from '@prisma/client';

import { decidirCambioSupervision } from '../../dominio/reglas/supervision.js';
import type {
  ResultadoCambioSupervision,
  ResumenSupervisionAdmin,
  SupervisionRepositorio,
} from '../../dominio/repositorios/supervision.repositorio.js';
import type { Actor, SupervisionConUsuarios } from '../../dominio/tipos.js';
import { PrismaService } from '../prisma/prisma.service.js';

type FilaConUsuarios = SupervisionPrisma & { qe: UsuarioPrisma; analista: UsuarioPrisma };

function aConUsuarios(fila: FilaConUsuarios): SupervisionConUsuarios {
  return {
    id: fila.id,
    qeId: fila.qeId,
    analistaId: fila.analistaId,
    desde: fila.desde,
    hasta: fila.hasta,
    motivo: fila.motivo,
    qe: { id: fila.qe.id, nombre: fila.qe.nombre, correo: fila.qe.correo },
    analista: { id: fila.analista.id, nombre: fila.analista.nombre, correo: fila.analista.correo },
    registradoPor: { tipo: fila.actorTipo, id: fila.actorId, nombre: fila.actorNombre },
  };
}

const INCLUYE_USUARIOS = { qe: true, analista: true } as const;

@Injectable()
export class SupervisionPrismaRepositorio implements SupervisionRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  async buscarQeVigente(analistaId: string): Promise<string | null> {
    const fila = await this.prisma.supervision.findFirst({
      where: { analistaId, hasta: null },
      select: { qeId: true },
    });
    return fila?.qeId ?? null;
  }

  async listarAnalistasVigentesIds(qeId: string): Promise<string[]> {
    const filas = await this.prisma.supervision.findMany({ where: { qeId, hasta: null }, select: { analistaId: true } });
    return filas.map((fila) => fila.analistaId);
  }

  async listarEquipoVigente(
    qeId: string,
  ): Promise<Array<{ analista: { id: string; nombre: string; correo: string; activo: boolean }; desde: Date }>> {
    const filas = await this.prisma.supervision.findMany({
      where: { qeId, hasta: null },
      include: { analista: true },
      orderBy: { analista: { nombre: 'asc' } },
    });
    return filas.map((fila) => ({
      analista: { id: fila.analista.id, nombre: fila.analista.nombre, correo: fila.analista.correo, activo: fila.analista.activo },
      desde: fila.desde,
    }));
  }

  async listarHistorialPorAnalista(analistaId: string): Promise<SupervisionConUsuarios[]> {
    const filas = await this.prisma.supervision.findMany({
      where: { analistaId },
      include: INCLUYE_USUARIOS,
      orderBy: { desde: 'asc' },
    });
    return filas.map(aConUsuarios);
  }

  async cerrarYCrearVigente(input: {
    analistaId: string;
    qeId: string;
    motivo: string | null;
    actor: Actor;
  }): Promise<ResultadoCambioSupervision> {
    return this.prisma.$transaction(async (tx) => {
      const vigente = await tx.supervision.findFirst({ where: { analistaId: input.analistaId, hasta: null }, include: INCLUYE_USUARIOS });
      const decision = decidirCambioSupervision(vigente, input.qeId);

      if (!decision.cambio) {
        // `vigente` no es null: `decidirCambioSupervision` solo devuelve
        // `cambio: false` cuando ya existe y coincide con el QE solicitado.
        return { cambio: false, vigente: aConUsuarios(vigente as FilaConUsuarios), anterior: null };
      }

      let anterior: SupervisionConUsuarios | null = null;
      if (vigente !== null) {
        const cerrada = await tx.supervision.update({
          where: { id: vigente.id },
          data: { hasta: new Date() },
          include: INCLUYE_USUARIOS,
        });
        anterior = aConUsuarios(cerrada);
      }

      const nueva = await tx.supervision.create({
        data: {
          qeId: input.qeId,
          analistaId: input.analistaId,
          motivo: input.motivo,
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
        },
        include: INCLUYE_USUARIOS,
      });

      await tx.auditoria.create({
        data: {
          actorTipo: input.actor.tipo,
          actorId: input.actor.id,
          actorNombre: input.actor.nombre,
          entidad: 'SUPERVISION',
          entidadId: nueva.id,
          accion: vigente === null ? 'ASIGNAR_SUPERVISOR' : 'CAMBIAR_SUPERVISOR',
          antes: vigente === null ? undefined : { qeId: vigente.qeId },
          despues: { qeId: nueva.qeId },
          motivo: input.motivo,
        },
      });

      return { cambio: true, vigente: aConUsuarios(nueva), anterior };
    });
  }

  async resumenAdmin(): Promise<ResumenSupervisionAdmin> {
    const [relacionesVigentes, analistasSinSupervisor, qeSinAnalistas] = await Promise.all([
      this.prisma.supervision.count({ where: { hasta: null } }),
      this.prisma.usuario.count({
        where: { rol: 'ANALISTA_QA', activo: true, supervisionesComoAnalista: { none: { hasta: null } } },
      }),
      this.prisma.usuario.count({
        where: { rol: 'QE', activo: true, supervisionesComoQe: { none: { hasta: null } } },
      }),
    ]);
    return { relacionesVigentes, analistasSinSupervisor, qeSinAnalistas };
  }
}

