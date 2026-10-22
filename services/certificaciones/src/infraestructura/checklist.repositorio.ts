/**
 * Persistencia del checklist en el esquema `certificaciones`, según el modelo de
 * datos: Certificacion (ciclo de una HU) → ItemChecklist y Entregable → Evidencia.
 * Cada cambio de un entregable, su evidencia y su evento de bitácora se guardan en
 * la misma transacción (E3-B04#1).
 *
 * Hacia la aplicación expone un registro plano por entregable (`RegistroEntregable`)
 * con su evidencia vigente, para que las reglas de E3 no dependan de las tablas.
 */
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES } from '@quality360/auth-nest';
import { Prisma, type Certificado, type TipoEvidencia } from '#prisma';

import { CLAVES_ENTREGABLE, NOMBRES_ENTREGABLE, type ClaveEntregable, type EstadoEntregable } from '../dominio/entregables.js';
import { calcularSeguimiento, type SeguimientoHdu } from '../dominio/seguimiento.js';
import { PrismaService } from './prisma/prisma.service.js';

/** Entregable con su evidencia vigente, tal como lo usan las reglas de E3. */
export interface RegistroEntregable {
  readonly id: string;
  readonly hduId: string;
  readonly clave: ClaveEntregable;
  readonly estado: EstadoEntregable;
  readonly evidenciaTipo: TipoEvidencia | null;
  readonly evidenciaUrl: string | null;
  readonly evidenciaRuta: string | null;
  readonly evidenciaNombre: string | null;
  readonly evidenciaTipoContenido: string | null;
  readonly evidenciaTamanoBytes: number | null;
  readonly evidenciaFolio: string | null;
  readonly completadoPorId: string | null;
  readonly completadoPorNombre: string | null;
  readonly completadoEn: Date | null;
  readonly aprobadoPorId: string | null;
  readonly aprobadoPorNombre: string | null;
  readonly aprobadoEn: Date | null;
  readonly observacion: string | null;
  readonly observadoPorId: string | null;
  readonly observadoPorNombre: string | null;
  readonly observadoEn: Date | null;
  readonly actualizadoEn: Date;
}

export type RegistroCertificado = Certificado;

export interface ActorEvento {
  readonly id: string;
  readonly nombre: string;
  readonly rol: string;
}

export type AccionChecklist = 'MARCAR' | 'DESMARCAR' | 'APROBAR' | 'RECHAZAR' | 'GENERAR_CERTIFICADO';

/**
 * Campos del entregable que cambian; los omitidos no se tocan. Un `evidenciaTipo`
 * con valor agrega una evidencia (la vigente pasa a ser esa); la evidencia deja de
 * estar vigente cuando `completadoEn` vuelve a nulo.
 */
export type CambioEntregable = Partial<
  Pick<
    RegistroEntregable,
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

type Tx = Prisma.TransactionClient;

/** Filtros de la bitácora global del Auditor (E7-B04). */
export interface FiltroBitacoraGlobal {
  readonly desde?: Date;
  readonly hasta?: Date;
  readonly hduId?: string;
  readonly actorId?: string;
  readonly accion?: AccionChecklist;
}

/** Filtros de los certificados del Auditor (E7-B04). */
export interface FiltroCertificadosGlobal {
  readonly desde?: Date;
  readonly hasta?: Date;
  readonly emitidoPorId?: string;
  readonly q?: string;
}

function whereBitacora(filtro: FiltroBitacoraGlobal): Prisma.EventoChecklistWhereInput {
  const where: Prisma.EventoChecklistWhereInput = {};
  if (filtro.hduId !== undefined) where.hduId = filtro.hduId;
  if (filtro.actorId !== undefined) where.actorId = filtro.actorId;
  if (filtro.accion !== undefined) where.accion = filtro.accion;
  if (filtro.desde !== undefined || filtro.hasta !== undefined) {
    where.fecha = { ...(filtro.desde !== undefined ? { gte: filtro.desde } : {}), ...(filtro.hasta !== undefined ? { lte: filtro.hasta } : {}) };
  }
  return where;
}

function whereCertificados(filtro: FiltroCertificadosGlobal): Prisma.CertificadoWhereInput {
  const where: Prisma.CertificadoWhereInput = {};
  if (filtro.emitidoPorId !== undefined) where.emitidoPorId = filtro.emitidoPorId;
  if (filtro.desde !== undefined || filtro.hasta !== undefined) {
    where.emitidoEn = { ...(filtro.desde !== undefined ? { gte: filtro.desde } : {}), ...(filtro.hasta !== undefined ? { lte: filtro.hasta } : {}) };
  }
  if (filtro.q !== undefined) {
    where.OR = [
      { folio: { contains: filtro.q, mode: 'insensitive' } },
      { hduCodigo: { contains: filtro.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/** La última evidencia cargada; si es vigente lo decide `aRegistro`. */
const INCLUYE_EVIDENCIA = { evidencias: { orderBy: { fechaCarga: 'desc' }, take: 1 } } as const satisfies Prisma.EntregableInclude;

type FilaEntregable = Prisma.EntregableGetPayload<{ include: typeof INCLUYE_EVIDENCIA }>;

function aRegistro(fila: FilaEntregable, hduId: string): RegistroEntregable {
  const ultima = fila.evidencias[0];
  const vigente = ultima !== undefined && fila.completadoEn !== null && ultima.fechaCarga.getTime() >= fila.completadoEn.getTime() ? ultima : null;
  return {
    id: fila.id,
    hduId,
    clave: fila.clave,
    estado: fila.estado,
    evidenciaTipo: vigente?.tipo ?? null,
    evidenciaUrl: vigente?.tipo === 'ENLACE' ? vigente.referencia : null,
    evidenciaRuta: vigente !== null && vigente.tipo !== 'ENLACE' ? vigente.referencia : null,
    evidenciaNombre: vigente !== null && vigente.tipo !== 'ENLACE' ? vigente.nombre : null,
    evidenciaTipoContenido: vigente?.tipoContenido ?? null,
    evidenciaTamanoBytes: vigente?.tamanoBytes ?? null,
    evidenciaFolio: vigente?.folio ?? null,
    completadoPorId: fila.completadoPorId,
    completadoPorNombre: fila.completadoPorNombre,
    completadoEn: fila.completadoEn,
    aprobadoPorId: fila.aprobadoPorId,
    aprobadoPorNombre: fila.aprobadoPorNombre,
    aprobadoEn: fila.fechaValidacion,
    observacion: fila.observacion,
    observadoPorId: fila.observadoPorId,
    observadoPorNombre: fila.observadoPorNombre,
    observadoEn: fila.observadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}

/** Columnas de `entregable` que toca un cambio (la evidencia va en su propia tabla). */
function datosEntregable(cambio: CambioEntregable): Prisma.EntregableUpdateManyMutationInput {
  const datos: Prisma.EntregableUpdateManyMutationInput = {};
  if (cambio.estado !== undefined) datos.estado = cambio.estado;
  if (cambio.completadoPorId !== undefined) datos.completadoPorId = cambio.completadoPorId;
  if (cambio.completadoPorNombre !== undefined) datos.completadoPorNombre = cambio.completadoPorNombre;
  if (cambio.completadoEn !== undefined) datos.completadoEn = cambio.completadoEn;
  if (cambio.aprobadoPorId !== undefined) datos.aprobadoPorId = cambio.aprobadoPorId;
  if (cambio.aprobadoPorNombre !== undefined) datos.aprobadoPorNombre = cambio.aprobadoPorNombre;
  if (cambio.aprobadoEn !== undefined) datos.fechaValidacion = cambio.aprobadoEn;
  if (cambio.observacion !== undefined) datos.observacion = cambio.observacion;
  if (cambio.observadoPorId !== undefined) datos.observadoPorId = cambio.observadoPorId;
  if (cambio.observadoPorNombre !== undefined) datos.observadoPorNombre = cambio.observadoPorNombre;
  if (cambio.observadoEn !== undefined) datos.observadoEn = cambio.observadoEn;
  return datos;
}

/** Evidencia que agrega el cambio, si trae una. Se carga en el mismo instante en que se marca. */
function evidenciaNueva(cambio: CambioEntregable): Omit<Prisma.EvidenciaUncheckedCreateInput, 'entregableId'> | null {
  if (cambio.evidenciaTipo === undefined || cambio.evidenciaTipo === null) return null;
  const referencia = cambio.evidenciaTipo === 'ENLACE' ? cambio.evidenciaUrl : cambio.evidenciaRuta;
  if (referencia === undefined || referencia === null) throw new Error('La evidencia no trae URL ni ruta');
  return {
    tipo: cambio.evidenciaTipo,
    nombre: (cambio.evidenciaNombre ?? referencia).slice(0, 150),
    referencia,
    fechaCarga: cambio.completadoEn ?? new Date(),
    tipoContenido: cambio.evidenciaTipoContenido ?? null,
    tamanoBytes: cambio.evidenciaTamanoBytes ?? null,
    folio: cambio.evidenciaFolio ?? null,
  };
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

/** Valor anterior para la bitácora: nulo si el entregable nunca tuvo un evento (E3-B04#2). */
async function valorAnterior(tx: Tx, hduId: string, clave: ClaveEntregable, anterior: RegistroEntregable): Promise<Prisma.InputJsonObject | null> {
  const previo = await tx.eventoChecklist.findFirst({ where: { hduId, clave }, select: { id: true } });
  return previo === null ? null : fotoEntregable(anterior);
}

/** COMPLETADA con fecha de fin cuando los 10 entregables están aprobados; si no, EN_CURSO. */
async function actualizarEstadoCertificacion(tx: Tx, certificacionId: string): Promise<void> {
  const aprobados = await tx.entregable.count({ where: { certificacionId, estado: 'APROBADO' } });
  const completa = aprobados === CLAVES_ENTREGABLE.length;
  await tx.certificacion.update({
    where: { id: certificacionId },
    data: { estado: completa ? 'COMPLETADA' : 'EN_CURSO', fechaFin: completa ? new Date() : null },
  });
}

/** Deja al analista que marca o desmarca como el asignado vigente del ciclo. */
async function registrarAsignacion(tx: Tx, certificacionId: string, usuarioId: string): Promise<void> {
  const vigente = await tx.asignacionCertificacion.findFirst({ where: { certificacionId, fechaHasta: null } });
  if (vigente?.usuarioId === usuarioId) return;
  const ahora = new Date();
  if (vigente !== null) await tx.asignacionCertificacion.update({ where: { id: vigente.id }, data: { fechaHasta: ahora } });
  await tx.asignacionCertificacion.create({ data: { certificacionId, usuarioId, fechaDesde: ahora } });
}

@Injectable()
export class ChecklistRepositorio {
  constructor(private readonly prisma: PrismaService) {}

  /** Entregables del ciclo activo de la HU; vacío si aún no tiene certificación. */
  async listar(hduId: string): Promise<RegistroEntregable[]> {
    const filas = await this.prisma.entregable.findMany({
      where: { certificacion: { hduId, activo: true } },
      include: INCLUYE_EVIDENCIA,
      orderBy: { itemChecklist: { orden: 'asc' } },
    });
    return filas.map((fila) => aRegistro(fila, hduId));
  }

  async listarPorAprobar(hduIds: readonly string[]): Promise<RegistroEntregable[]> {
    if (hduIds.length === 0) return [];
    const filas = await this.prisma.entregable.findMany({
      where: { estado: 'POR_APROBAR', certificacion: { hduId: { in: [...hduIds] }, activo: true } },
      include: { ...INCLUYE_EVIDENCIA, certificacion: { select: { hduId: true } } },
    });
    return filas.map((fila) => aRegistro(fila, fila.certificacion.hduId));
  }

  /**
   * Seguimiento de varias HDU en pocas consultas (D46): entregables del ciclo activo, último
   * evento de cada entregable, certificado y última actividad. Una HDU sin ciclo devuelve 0
   * aprobados. Mantiene el orden de `hduIds`.
   */
  async seguimientoLote(hduIds: readonly string[]): Promise<SeguimientoHdu[]> {
    if (hduIds.length === 0) return [];
    const ids = [...hduIds];
    const [entregables, ultimosEventos, certificados, actividad] = await Promise.all([
      this.prisma.entregable.findMany({
        where: { certificacion: { hduId: { in: ids }, activo: true } },
        select: { clave: true, estado: true, fechaValidacion: true, completadoEn: true, certificacion: { select: { hduId: true } } },
      }),
      this.prisma.eventoChecklist.findMany({
        where: { hduId: { in: ids } },
        distinct: ['hduId', 'clave'],
        orderBy: [{ hduId: 'asc' }, { clave: 'asc' }, { fecha: 'desc' }, { id: 'desc' }],
        select: { hduId: true, clave: true, accion: true },
      }),
      this.prisma.certificado.findMany({ where: { hduId: { in: ids } }, select: { hduId: true, folio: true, emitidoEn: true } }),
      this.prisma.eventoChecklist.groupBy({ by: ['hduId'], where: { hduId: { in: ids } }, _max: { fecha: true } }),
    ]);

    const entregablesPorHdu = new Map<string, Array<{ clave: ClaveEntregable; estado: EstadoEntregable; completadoEn: Date | null; aprobadoEn: Date | null }>>();
    for (const fila of entregables) {
      const lista = entregablesPorHdu.get(fila.certificacion.hduId) ?? [];
      lista.push({ clave: fila.clave, estado: fila.estado, completadoEn: fila.completadoEn, aprobadoEn: fila.fechaValidacion });
      entregablesPorHdu.set(fila.certificacion.hduId, lista);
    }
    const accionesPorHdu = new Map<string, Map<ClaveEntregable, string>>();
    for (const evento of ultimosEventos) {
      const mapa = accionesPorHdu.get(evento.hduId) ?? new Map<ClaveEntregable, string>();
      mapa.set(evento.clave, evento.accion);
      accionesPorHdu.set(evento.hduId, mapa);
    }
    const certificadoPorHdu = new Map(certificados.map((fila) => [fila.hduId, { folio: fila.folio, emitidoEn: fila.emitidoEn }]));
    const actividadPorHdu = new Map(actividad.map((fila) => [fila.hduId, fila._max.fecha]));

    return ids.map((hduId) =>
      calcularSeguimiento({
        hduId,
        entregables: entregablesPorHdu.get(hduId) ?? [],
        ultimaAccionPorClave: accionesPorHdu.get(hduId) ?? new Map(),
        certificado: certificadoPorHdu.get(hduId) ?? null,
        ultimaActividad: actividadPorHdu.get(hduId) ?? null,
      }),
    );
  }

  /** Certificados emitidos y eventos de los últimos 7 días, sobre todo el sistema (bandeja del Auditor). */
  async resumenAuditoria(ahora: Date): Promise<{ certificados: number; eventosUltimos7Dias: number }> {
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [certificados, eventosUltimos7Dias] = await Promise.all([
      this.prisma.certificado.count(),
      this.prisma.eventoChecklist.count({ where: { fecha: { gte: hace7Dias } } }),
    ]);
    return { certificados, eventosUltimos7Dias };
  }

  async bitacoraGlobal(filtro: FiltroBitacoraGlobal, desde: number, cantidad: number) {
    const where = whereBitacora(filtro);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.eventoChecklist.findMany({ where, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], skip: desde, take: cantidad }),
      this.prisma.eventoChecklist.count({ where }),
    ]);
    return { items, total };
  }

  contarBitacora(filtro: FiltroBitacoraGlobal): Promise<number> {
    return this.prisma.eventoChecklist.count({ where: whereBitacora(filtro) });
  }

  async certificadosGlobal(filtro: FiltroCertificadosGlobal, desde: number, cantidad: number) {
    const where = whereCertificados(filtro);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.certificado.findMany({ where, orderBy: [{ emitidoEn: 'desc' }, { id: 'desc' }], skip: desde, take: cantidad }),
      this.prisma.certificado.count({ where }),
    ]);
    return { items, total };
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
   * Ciclo activo de la HU. El primero se crea con sus 10 ítems y 10 entregables
   * PENDIENTE; si otra solicitud lo crea al mismo tiempo, se usa el de ella.
   */
  async asegurarCertificacion(hduId: string): Promise<string> {
    const activa = await this.prisma.certificacion.findFirst({ where: { hduId, activo: true }, select: { id: true } });
    if (activa !== null) return activa.id;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ultimo = await tx.certificacion.aggregate({ where: { hduId }, _max: { numeroCiclo: true } });
        const certificacion = await tx.certificacion.create({ data: { hduId, numeroCiclo: (ultimo._max.numeroCiclo ?? 0) + 1 } });
        const items = CLAVES_ENTREGABLE.map((clave, indice) => ({
          id: randomUUID(),
          clave,
          nombre: NOMBRES_ENTREGABLE[clave],
          orden: indice + 1,
          certificacionId: certificacion.id,
        }));
        await tx.itemChecklist.createMany({ data: items });
        await tx.entregable.createMany({
          data: items.map((item) => ({ clave: item.clave, nombre: item.nombre, certificacionId: certificacion.id, itemChecklistId: item.id })),
        });
        return certificacion.id;
      });
    } catch (error) {
      if (!esUnicidadViolada(error)) throw error;
      const otra = await this.prisma.certificacion.findFirstOrThrow({ where: { hduId, activo: true }, select: { id: true } });
      return otra.id;
    }
  }

  /**
   * Aplica el cambio solo si el entregable sigue en `estadoEsperado` (control
   * optimista frente a dos solicitudes simultáneas) y registra el evento.
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
    const certificacionId = await this.asegurarCertificacion(input.hduId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const filaAnterior = await tx.entregable.findUniqueOrThrow({
          where: { certificacionId_clave: { certificacionId, clave: input.clave } },
          include: INCLUYE_EVIDENCIA,
        });
        const anterior = aRegistro(filaAnterior, input.hduId);
        const { count } = await tx.entregable.updateMany({
          where: { id: filaAnterior.id, estado: input.estadoEsperado },
          data: datosEntregable(input.cambio),
        });
        if (count === 0) throw registroYaExiste();
        const evidencia = evidenciaNueva(input.cambio);
        if (evidencia !== null) await tx.evidencia.create({ data: { ...evidencia, entregableId: filaAnterior.id } });

        const actualizado = aRegistro(
          await tx.entregable.findUniqueOrThrow({ where: { id: filaAnterior.id }, include: INCLUYE_EVIDENCIA }),
          input.hduId,
        );
        await tx.eventoChecklist.create({
          data: {
            hduId: input.hduId,
            clave: input.clave,
            accion: input.accion,
            actorId: input.actor.id,
            actorNombre: input.actor.nombre,
            actorRol: input.actor.rol,
            valorAnterior: (await valorAnterior(tx, input.hduId, input.clave, anterior)) ?? Prisma.DbNull,
            valorNuevo: fotoEntregable(actualizado) ?? Prisma.DbNull,
            motivo: input.motivo ?? null,
          },
        });
        await actualizarEstadoCertificacion(tx, certificacionId);
        if (input.accion === 'MARCAR' || input.accion === 'DESMARCAR') await registrarAsignacion(tx, certificacionId, input.actor.id);
        return actualizado;
      });
    } catch (error) {
      if (esUnicidadViolada(error)) throw registroYaExiste();
      throw error;
    }
  }

  /**
   * Registra el certificado, deja el entregable 9 aprobado con el PDF como
   * evidencia y audita `GENERAR_CERTIFICADO`, todo junto (D19). Devuelve `null`
   * si otra solicitud emitió el certificado primero.
   */
  async emitirCertificado(certificado: NuevoCertificado, actor: ActorEvento): Promise<RegistroCertificado | null> {
    const certificacionId = await this.asegurarCertificacion(certificado.hduId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const creado = await tx.certificado.create({ data: { ...certificado, certificacionId } });
        const filaAnterior = await tx.entregable.findUniqueOrThrow({
          where: { certificacionId_clave: { certificacionId, clave: 'CERTIFICADO' } },
          include: INCLUYE_EVIDENCIA,
        });
        const anterior = aRegistro(filaAnterior, certificado.hduId);
        await tx.entregable.update({
          where: { id: filaAnterior.id },
          data: {
            estado: 'APROBADO',
            completadoPorId: actor.id,
            completadoPorNombre: actor.nombre,
            completadoEn: certificado.emitidoEn,
            aprobadoPorId: actor.id,
            aprobadoPorNombre: actor.nombre,
            fechaValidacion: certificado.emitidoEn,
            observacion: null,
            observadoPorId: null,
            observadoPorNombre: null,
            observadoEn: null,
          },
        });
        await tx.evidencia.create({
          data: {
            entregableId: filaAnterior.id,
            tipo: 'CERTIFICADO',
            nombre: `${certificado.folio}.pdf`,
            referencia: certificado.rutaPdf,
            fechaCarga: certificado.emitidoEn,
            tipoContenido: 'application/pdf',
            folio: certificado.folio,
          },
        });
        const actualizado = aRegistro(
          await tx.entregable.findUniqueOrThrow({ where: { id: filaAnterior.id }, include: INCLUYE_EVIDENCIA }),
          certificado.hduId,
        );
        await tx.eventoChecklist.create({
          data: {
            hduId: certificado.hduId,
            clave: 'CERTIFICADO',
            accion: 'GENERAR_CERTIFICADO',
            actorId: actor.id,
            actorNombre: actor.nombre,
            actorRol: actor.rol,
            valorAnterior: (await valorAnterior(tx, certificado.hduId, 'CERTIFICADO', anterior)) ?? Prisma.DbNull,
            valorNuevo: { ...(fotoEntregable(actualizado) ?? {}), folio: certificado.folio, huellaSha256: certificado.huellaSha256 },
            motivo: null,
          },
        });
        await actualizarEstadoCertificacion(tx, certificacionId);
        return creado;
      });
    } catch (error) {
      if (esUnicidadViolada(error)) return null;
      throw error;
    }
  }
}
