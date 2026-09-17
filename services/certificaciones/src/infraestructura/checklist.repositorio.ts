/**
 * Persistencia del checklist en el esquema `certificaciones`. Cada cambio de un
 * entregable y su evento de bitácora se guardan en la misma transacción (E3-B04#1).
 */
import { Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES } from '@quality360/auth-nest';
import { Prisma, type Certificado, type Entregable } from '#prisma';

import type { ClaveEntregable, EstadoEntregable } from '../dominio/entregables.js';
import { PrismaService } from './prisma/prisma.service.js';

export type RegistroEntregable = Entregable;
export type RegistroCertificado = Certificado;

export interface ActorEvento {
  readonly id: string;
  readonly nombre: string;
  readonly rol: string;
}

export type AccionChecklist = 'MARCAR' | 'DESMARCAR' | 'APROBAR' | 'RECHAZAR' | 'GENERAR_CERTIFICADO';

/** Campos del entregable que cambian; los omitidos no se tocan. */
export type CambioEntregable = Partial<
  Pick<
    Entregable,
    | 'estado'
    | 'evidenciaTipo'
    | 'evidenciaUrl'
    | 'evidenciaRuta'
    | 'evidenciaNombre'
    | 'evidenciaTipoContenido'
    | 'evidenciaTamanoBytes'
    | 'evidenciaFolio'
    | 'completadoPorId'
    | 'completadoPorNombre'
    | 'completadoEn'
    | 'aprobadoPorId'
    | 'aprobadoPorNombre'
    | 'aprobadoEn'
    | 'observacion'
    | 'observadoPorId'
    | 'observadoPorNombre'
    | 'observadoEn'
  >
>;

export interface NuevoCertificado {
  readonly hduId: string;
  readonly folio: string;
  readonly hduCodigo: string;
  readonly hduTitulo: string;
  readonly emitidoPorId: string;
  readonly emitidoPorNombre: string;
  readonly emitidoEn: Date;
  readonly rutaPdf: string;
  readonly huellaSha256: string;
}

/** Foto del entregable para la bitácora: estado, evidencia y responsables. */
export function fotoEntregable(registro: RegistroEntregable | null): Prisma.InputJsonObject | null {
  if (registro === null) return null;
  return {
    estado: registro.estado,
    evidencia:
      registro.evidenciaTipo === null
        ? null
        : {
            tipo: registro.evidenciaTipo,
            url: registro.evidenciaUrl,
            nombre: registro.evidenciaNombre,
            folio: registro.evidenciaFolio,
          },
    completadoPor: registro.completadoPorNombre,
    completadoEn: registro.completadoEn?.toISOString() ?? null,
    aprobadoPor: registro.aprobadoPorNombre,
    aprobadoEn: registro.aprobadoEn?.toISOString() ?? null,
    observacion: registro.observacion,
  };
}

function registroYaExiste(): ExcepcionQ360 {
  return new ExcepcionQ360(409, 'ENTREGABLE_YA_REGISTRADO', { mensaje: MENSAJES.ENTREGABLE_YA_REGISTRADO });
}

function esUnicidadViolada(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class ChecklistRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  listar(hduId: string): Promise<RegistroEntregable[]> {
    return this.prisma.entregable.findMany({ where: { hduId } });
  }

  listarPorAprobar(hduIds: readonly string[]): Promise<RegistroEntregable[]> {
    if (hduIds.length === 0) return Promise.resolve([]);
    return this.prisma.entregable.findMany({ where: { hduId: { in: [...hduIds] }, estado: 'POR_APROBAR' } });
  }

  buscarCertificado(hduId: string): Promise<RegistroCertificado | null> {
    return this.prisma.certificado.findUnique({ where: { hduId } });
  }

  buscarCertificadoPorFolio(folio: string): Promise<RegistroCertificado | null> {
    return this.prisma.certificado.findUnique({ where: { folio } });
  }

  bitacora(hduId: string) {
    return this.prisma.eventoChecklist.findMany({ where: { hduId }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }] });
  }

  /**
   * Aplica el cambio solo si el entregable sigue en `estadoEsperado` (control
   * optimista frente a dos solicitudes simultáneas) y registra el evento.
   * Un entregable PENDIENTE sin registro se crea; el índice único (hdu, clave)
   * rechaza el duplicado (E3-B01#2).
   */
  async cambiar(input: {
    hduId: string;
    clave: ClaveEntregable;
    estadoEsperado: EstadoEntregable;
    cambio: CambioEntregable;
    accion: AccionChecklist;
    actor: ActorEvento;
    motivo?: string | null;
  }): Promise<RegistroEntregable> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const anterior = await tx.entregable.findUnique({ where: { hduId_clave: { hduId: input.hduId, clave: input.clave } } });
        let actualizado: RegistroEntregable;
        if (anterior === null) {
          if (input.estadoEsperado !== 'PENDIENTE') throw registroYaExiste();
          actualizado = await tx.entregable.create({ data: { hduId: input.hduId, clave: input.clave, ...input.cambio } });
        } else {
          const { count } = await tx.entregable.updateMany({
            where: { id: anterior.id, estado: input.estadoEsperado },
            data: input.cambio,
          });
          if (count === 0) throw registroYaExiste();
          actualizado = await tx.entregable.findUniqueOrThrow({ where: { id: anterior.id } });
        }
        await tx.eventoChecklist.create({
          data: {
            hduId: input.hduId,
            clave: input.clave,
            accion: input.accion,
            actorId: input.actor.id,
            actorNombre: input.actor.nombre,
            actorRol: input.actor.rol,
            valorAnterior: fotoEntregable(anterior) ?? Prisma.DbNull,
            valorNuevo: fotoEntregable(actualizado) ?? Prisma.DbNull,
            motivo: input.motivo ?? null,
          },
        });
        return actualizado;
      });
    } catch (error) {
      if (esUnicidadViolada(error)) throw registroYaExiste();
      throw error;
    }
  }

  /**
   * Registra el certificado, deja el entregable 9 aprobado con el folio y audita
   * `GENERAR_CERTIFICADO`, todo junto (D19). Devuelve `null` si otra solicitud
   * emitió el certificado primero.
   */
  async emitirCertificado(certificado: NuevoCertificado, actor: ActorEvento): Promise<RegistroCertificado | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const creado = await tx.certificado.create({ data: certificado });
        const anterior = await tx.entregable.findUnique({ where: { hduId_clave: { hduId: certificado.hduId, clave: 'CERTIFICADO' } } });
        const datos = {
          estado: 'APROBADO' as const,
          evidenciaTipo: 'CERTIFICADO' as const,
          evidenciaUrl: null,
          evidenciaRuta: certificado.rutaPdf,
          evidenciaNombre: `${certificado.folio}.pdf`,
          evidenciaTipoContenido: 'application/pdf',
          evidenciaTamanoBytes: null,
          evidenciaFolio: certificado.folio,
          completadoPorId: actor.id,
          completadoPorNombre: actor.nombre,
          completadoEn: certificado.emitidoEn,
          aprobadoPorId: actor.id,
          aprobadoPorNombre: actor.nombre,
          aprobadoEn: certificado.emitidoEn,
          observacion: null,
          observadoPorId: null,
          observadoPorNombre: null,
          observadoEn: null,
        };
        const actualizado = await tx.entregable.upsert({
          where: { hduId_clave: { hduId: certificado.hduId, clave: 'CERTIFICADO' } },
          create: { hduId: certificado.hduId, clave: 'CERTIFICADO', ...datos },
          update: datos,
        });
        await tx.eventoChecklist.create({
          data: {
            hduId: certificado.hduId,
            clave: 'CERTIFICADO',
            accion: 'GENERAR_CERTIFICADO',
            actorId: actor.id,
            actorNombre: actor.nombre,
            actorRol: actor.rol,
            valorAnterior: fotoEntregable(anterior) ?? Prisma.DbNull,
            valorNuevo: { ...(fotoEntregable(actualizado) ?? {}), folio: certificado.folio, huellaSha256: certificado.huellaSha256 },
            motivo: null,
          },
        });
        return creado;
      });
    } catch (error) {
      if (esUnicidadViolada(error)) return null;
      throw error;
    }
  }
}
