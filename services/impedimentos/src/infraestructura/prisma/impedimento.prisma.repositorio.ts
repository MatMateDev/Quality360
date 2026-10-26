/** Persistencia de impedimentos y sus acciones (solo inserción en el historial, D65, D70). */
import { Injectable } from '@nestjs/common';
import { Prisma } from '#prisma';

import {
  ImpedimentoRepositorio,
  type FiltroAuditorImpedimentos,
  type FiltroImpedimentos,
  type NuevoImpedimento,
  type PlanTransicion,
  type ResultadoTransicion,
} from '../../dominio/repositorios.js';
import { COMENTARIO_REGISTRO } from '../../dominio/impedimento.js';
import type { AccionRegistro, ImpedimentoRegistro } from '../../dominio/tipos.js';
import { aAccion, aImpedimento, responsableAJson } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

function condicionAuditor(filtro: FiltroAuditorImpedimentos): Prisma.ImpedimentoWhereInput {
  const rango =
    filtro.desde === undefined && filtro.hasta === undefined
      ? undefined
      : { ...(filtro.desde === undefined ? {} : { gte: filtro.desde }), ...(filtro.hasta === undefined ? {} : { lte: filtro.hasta }) };
  const texto =
    filtro.q === undefined
      ? undefined
      : [
          { titulo: { contains: filtro.q, mode: 'insensitive' as const } },
          ...(filtro.hduIdsPorTexto !== undefined && filtro.hduIdsPorTexto.length > 0 ? [{ historiaId: { in: [...filtro.hduIdsPorTexto] } }] : []),
        ];
  return {
    ...(rango === undefined ? {} : { fechaRegistro: rango }),
    ...(filtro.hduId === undefined ? {} : { historiaId: filtro.hduId }),
    ...(filtro.estado === undefined ? {} : { estado: filtro.estado }),
    ...(filtro.tipo === undefined ? {} : { tipo: filtro.tipo }),
    ...(texto === undefined ? {} : { OR: texto }),
  };
}

@Injectable()
export class ImpedimentoPrismaRepositorio extends ImpedimentoRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crear(datos: NuevoImpedimento): Promise<{ impedimento: ImpedimentoRegistro; accion: AccionRegistro }> {
    return this.prisma.$transaction(async (tx) => {
      const fila = await tx.impedimento.create({
        data: {
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          tipo: datos.tipo,
          estado: 'ABIERTO',
          fechaRegistro: datos.ahora,
          abiertoDesde: datos.ahora,
          actualizadoEn: datos.ahora,
          certificacionId: datos.certificacionId,
          historiaId: datos.hduId,
          responsableId: datos.responsable.id,
          responsableNombre: datos.responsable.nombre,
          creadoPorId: datos.creadoPor.id,
          creadoPorNombre: datos.creadoPor.nombre,
          creadoPorRol: datos.creadoPor.rol,
        },
      });
      const accion = await tx.accionImpedimento.create({
        data: {
          impedimentoId: fila.id,
          tipoAccion: 'REGISTRAR',
          estado: 'ABIERTO',
          estadoAnterior: null,
          descripcion: COMENTARIO_REGISTRO,
          fechaAccion: datos.ahora,
          actorId: datos.creadoPor.id,
          actorNombre: datos.creadoPor.nombre,
          actorRol: datos.creadoPor.rol,
        },
      });
      return { impedimento: aImpedimento(fila), accion: aAccion(accion) };
    });
  }

  async buscarPorId(id: string): Promise<ImpedimentoRegistro | null> {
    const fila = await this.prisma.impedimento.findUnique({ where: { id } });
    return fila === null ? null : aImpedimento(fila);
  }

  async acciones(impedimentoId: string): Promise<AccionRegistro[]> {
    const filas = await this.prisma.accionImpedimento.findMany({ where: { impedimentoId }, orderBy: [{ fechaAccion: 'asc' }, { id: 'asc' }] });
    return filas.map(aAccion);
  }

  async listarPorHdu(hduId: string): Promise<ImpedimentoRegistro[]> {
    const filas = await this.prisma.impedimento.findMany({ where: { historiaId: hduId } });
    return filas.map(aImpedimento);
  }

  async listar(filtro: FiltroImpedimentos): Promise<ImpedimentoRegistro[]> {
    const filas = await this.prisma.impedimento.findMany({
      where: {
        ...(filtro.hduIds === null ? {} : { historiaId: { in: [...filtro.hduIds] } }),
        ...(filtro.estados === undefined ? {} : { estado: { in: [...filtro.estados] } }),
        ...(filtro.tipo === undefined ? {} : { tipo: filtro.tipo }),
      },
      orderBy: [{ abiertoDesde: 'asc' }, { id: 'asc' }],
    });
    return filas.map(aImpedimento);
  }

  async transicionar(id: string, decidir: (actual: ImpedimentoRegistro) => PlanTransicion): Promise<ResultadoTransicion> {
    return this.prisma.$transaction(async (tx) => {
      // D62: la fila queda tomada hasta el final de la transacción; la segunda de dos órdenes
      // simultáneas espera, ve el estado nuevo y recibe 409.
      await tx.$queryRaw`SELECT "id_impedimento" FROM "impedimento" WHERE "id_impedimento" = ${id}::uuid FOR UPDATE`;
      const actual = aImpedimento(await tx.impedimento.findUniqueOrThrow({ where: { id } }));
      const plan = decidir(actual);

      const datos: Prisma.ImpedimentoUpdateInput = { estado: plan.estado, actualizadoEn: plan.ahora };
      if (plan.tipo === 'RESOLVER') datos.fechaResolucion = plan.ahora;
      if (plan.tipo === 'REABRIR') {
        datos.fechaResolucion = null;
        datos.abiertoDesde = plan.ahora;
      }
      if (plan.tipo === 'ESCALAR' && plan.responsableNuevo !== undefined) {
        datos.responsableId = plan.responsableNuevo.id;
        datos.responsableNombre = plan.responsableNuevo.nombre;
      }
      const fila = await tx.impedimento.update({ where: { id }, data: datos });
      const accion = await tx.accionImpedimento.create({
        data: {
          impedimentoId: id,
          tipoAccion: plan.tipo,
          estado: plan.estado,
          estadoAnterior: actual.estado,
          descripcion: plan.comentario,
          fechaAccion: plan.ahora,
          actorId: plan.actor.id,
          actorNombre: plan.actor.nombre,
          actorRol: plan.actor.rol,
          detalle:
            plan.tipo === 'ESCALAR' && plan.responsableNuevo !== undefined
              ? { responsableAnterior: responsableAJson(actual.responsable), responsableNuevo: responsableAJson(plan.responsableNuevo) }
              : Prisma.DbNull,
        },
      });
      const abiertosHdu = await tx.impedimento.count({ where: { historiaId: fila.historiaId, estado: { not: 'RESUELTO' } } });
      return { impedimento: aImpedimento(fila), accion: aAccion(accion), abiertosHdu };
    });
  }

  contarBloqueantes(hduId: string): Promise<number> {
    return this.prisma.impedimento.count({ where: { historiaId: hduId, estado: { not: 'RESUELTO' } } });
  }

  async bloqueantesDeHdu(hduId: string, limite: number): Promise<{ total: number; items: ImpedimentoRegistro[] }> {
    const donde = { historiaId: hduId, estado: { not: 'RESUELTO' } };
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.impedimento.count({ where: donde }),
      this.prisma.impedimento.findMany({ where: donde, orderBy: [{ abiertoDesde: 'asc' }, { id: 'asc' }], take: limite }),
    ]);
    return { total, items: filas.map(aImpedimento) };
  }

  async listarAuditor(filtro: FiltroAuditorImpedimentos, desplazamiento: number, limite: number) {
    const donde = condicionAuditor(filtro);
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.impedimento.count({ where: donde }),
      this.prisma.impedimento.findMany({ where: donde, orderBy: [{ fechaRegistro: 'desc' }, { id: 'asc' }], skip: desplazamiento, take: limite }),
    ]);
    return { items: filas.map(aImpedimento), total };
  }

  contarAuditor(filtro: FiltroAuditorImpedimentos): Promise<number> {
    return this.prisma.impedimento.count({ where: condicionAuditor(filtro) });
  }
}
