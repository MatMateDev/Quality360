/**
 * Repositorio de la conexión OAuth con Jira (D211, D214, D215, D217). Reglas que no se negocian:
 *  - Todo SQL crudo va calificado con el esquema `"integraciones".` (DEF-E5C-05): tras el pooler de Supabase en modo
 *    transacción el `search_path` de la conexión no llega al backend.
 *  - Dentro de `conCandado` toda operación usa el cliente de la transacción (AsyncLocalStorage): con
 *    `connection_limit=1` una segunda conexión esperaría a la que tiene el candado y todo se bloquearía.
 *  - Ningún valor secreto (`state`, tokens) se registra: solo se guardan el hash del `state` y los tokens cifrados.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import { Prisma } from '#prisma';
import type { ConexionOauthJira } from '#prisma';

import { ConexionOauthRepositorio, type DatosEventoOauth, type TokensRenovados } from '../../aplicacion/puertos.js';
import { CandadoNoObtenido } from '../../dominio/errores.js';
import type { ConexionOauth, EstadoConexionOauth } from '../../dominio/oauth/conexion.js';
import { parsearPermisos, unirPermisos } from '../../dominio/oauth/permisos.js';
import type { SitioJira } from '../../dominio/oauth/sitios.js';
import type { SecretoCifrado } from '../../dominio/tipos.js';
import { PrismaService } from './prisma.service.js';

type Cliente = Prisma.TransactionClient;

const ID_UNICO = 1;
/** `lock_timeout` del candado y límites de la transacción interactiva: dentro del presupuesto de 8 s (D114, D214). */
const LOCK_TIMEOUT = '3s';
const OPCIONES_CANDADO = { maxWait: 2000, timeout: 7000 } as const;

/** La transacción que tiene el candado de la fila; las operaciones del repositorio la usan mientras exista. */
const candadoActual = new AsyncLocalStorage<Cliente>();

// ------------------------------------------------------------------ traducción
function aSecreto(cifrado: Uint8Array | null, iv: Uint8Array | null, tag: Uint8Array | null, llaveVersion: number): SecretoCifrado | null {
  if (cifrado === null || iv === null || tag === null) return null;
  return { cifrado: Buffer.from(cifrado), iv: Buffer.from(iv), tag: Buffer.from(tag), llaveVersion };
}

function aSitios(valor: unknown): SitioJira[] | null {
  if (!Array.isArray(valor)) return null;
  const sitios: SitioJira[] = [];
  for (const crudo of valor) {
    const s = crudo as { id?: unknown; nombre?: unknown; url?: unknown };
    if (typeof s.id === 'string' && typeof s.nombre === 'string' && typeof s.url === 'string') sitios.push({ id: s.id, nombre: s.nombre, url: s.url });
  }
  return sitios;
}

export function aConexionOauth(fila: ConexionOauthJira): ConexionOauth {
  const sitio: SitioJira | null =
    fila.cloudId !== null && fila.sitioUrl !== null && fila.sitioNombre !== null ? { id: fila.cloudId, nombre: fila.sitioNombre, url: fila.sitioUrl } : null;
  return {
    estado: fila.estado as EstadoConexionOauth,
    cloudId: fila.cloudId,
    sitio,
    candidatos: aSitios(fila.sitiosCandidatos),
    cuentaId: fila.cuentaId,
    cuentaNombre: fila.cuentaNombre,
    permisos: parsearPermisos(fila.scopesConcedidos),
    acceso: aSecreto(fila.accesoCifrado, fila.accesoIv, fila.accesoTag, fila.llaveVersion),
    renovacion: aSecreto(fila.renovacionCifrada, fila.renovacionIv, fila.renovacionTag, fila.llaveVersion),
    accesoExpiraEn: fila.accesoExpiraEn,
    renovadoEn: fila.renovadoEn,
    conectadoPor: { id: fila.conectadoPorId, nombre: fila.conectadoPorNombre },
    conectadoEn: fila.conectadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}

const bytes = (b: Buffer | null | undefined): Uint8Array<ArrayBuffer> | null => (b === null || b === undefined ? null : new Uint8Array(b));

function columnas(c: ConexionOauth, ahora: Date) {
  return {
    estado: c.estado,
    cloudId: c.cloudId,
    sitioUrl: c.sitio?.url ?? null,
    sitioNombre: c.sitio?.nombre ?? null,
    sitiosCandidatos: c.candidatos === null ? Prisma.DbNull : (c.candidatos.map((s) => ({ id: s.id, nombre: s.nombre, url: s.url })) as Prisma.InputJsonValue),
    cuentaId: c.cuentaId,
    cuentaNombre: c.cuentaNombre,
    scopesConcedidos: unirPermisos(c.permisos),
    accesoCifrado: bytes(c.acceso?.cifrado),
    accesoIv: bytes(c.acceso?.iv),
    accesoTag: bytes(c.acceso?.tag),
    renovacionCifrada: bytes(c.renovacion?.cifrado),
    renovacionIv: bytes(c.renovacion?.iv),
    renovacionTag: bytes(c.renovacion?.tag),
    accesoExpiraEn: c.accesoExpiraEn,
    renovadoEn: c.renovadoEn,
    llaveVersion: c.acceso?.llaveVersion ?? c.renovacion?.llaveVersion ?? 1,
    conectadoPorId: c.conectadoPor.id,
    conectadoPorNombre: c.conectadoPor.nombre,
    conectadoEn: c.conectadoEn,
    actualizadoEn: ahora,
  };
}

/** El candado no se obtuvo (55P03 `lock_not_available`), o la transacción no consiguió conexión o venció (P2024, P2028). */
export function esCandadoNoObtenido(error: unknown): boolean {
  if (error instanceof CandadoNoObtenido) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2024' || error.code === 'P2028') return true;
    const meta = error.meta as { code?: unknown; message?: unknown } | undefined;
    if (meta?.code === '55P03') return true;
    if (typeof meta?.message === 'string' && /lock timeout|55P03/i.test(meta.message)) return true;
  }
  return error instanceof Error && /55P03|lock timeout/i.test(error.message);
}

@Injectable()
export class ConexionOauthPrismaRepositorio extends ConexionOauthRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Dentro de `conCandado`, el cliente de la transacción que tiene el candado. */
  private cliente(): Cliente | PrismaService {
    return candadoActual.getStore() ?? this.prisma;
  }

  private transaccion<T>(fn: (tx: Cliente) => Promise<T>): Promise<T> {
    const bloqueada = candadoActual.getStore();
    return bloqueada === undefined ? this.prisma.$transaction(fn) : fn(bloqueada);
  }

  async obtener(): Promise<ConexionOauth | null> {
    const fila = await this.cliente().conexionOauthJira.findUnique({ where: { id: ID_UNICO } });
    return fila === null ? null : aConexionOauth(fila);
  }

  async hayConexionRegistrada(): Promise<boolean> {
    const cantidad = await this.cliente().eventoOauthJira.count({ where: { tipo: { in: ['CONECTAR_OAUTH', 'RECONECTAR'] } } });
    return cantidad > 0;
  }

  async guardar(conexion: ConexionOauth, evento: DatosEventoOauth | null): Promise<void> {
    const datos = columnas(conexion, conexion.actualizadoEn);
    await this.transaccion(async (tx) => {
      await tx.conexionOauthJira.upsert({ where: { id: ID_UNICO }, create: { id: ID_UNICO, ...datos }, update: datos });
      if (evento !== null) await tx.eventoOauthJira.create({ data: datosEvento(evento) });
    });
  }

  async eliminar(evento: DatosEventoOauth): Promise<boolean> {
    return this.transaccion(async (tx) => {
      const borradas = await tx.conexionOauthJira.deleteMany({ where: { id: ID_UNICO } });
      if (borradas.count === 0) return false;
      await tx.eventoOauthJira.create({ data: datosEvento(evento) });
      return true;
    });
  }

  async guardarTokens(tokens: TokensRenovados): Promise<ConexionOauth> {
    const fila = await this.cliente().conexionOauthJira.update({
      where: { id: ID_UNICO },
      data: {
        accesoCifrado: new Uint8Array(tokens.acceso.cifrado),
        accesoIv: new Uint8Array(tokens.acceso.iv),
        accesoTag: new Uint8Array(tokens.acceso.tag),
        renovacionCifrada: new Uint8Array(tokens.renovacion.cifrado),
        renovacionIv: new Uint8Array(tokens.renovacion.iv),
        renovacionTag: new Uint8Array(tokens.renovacion.tag),
        accesoExpiraEn: tokens.accesoExpiraEn,
        renovadoEn: tokens.renovadoEn,
        llaveVersion: tokens.acceso.llaveVersion,
        actualizadoEn: tokens.renovadoEn,
      },
    });
    return aConexionOauth(fila);
  }

  async marcarReconexion(ahora: Date, evento: DatosEventoOauth | null): Promise<void> {
    const cliente = this.cliente();
    await cliente.conexionOauthJira.update({
      where: { id: ID_UNICO },
      data: {
        estado: 'RECONEXION_NECESARIA',
        // Se conservan la cuenta y el sitio, si los había («Última cuenta», diseño §3.2); se borra todo lo secreto.
        sitiosCandidatos: Prisma.DbNull,
        accesoCifrado: null,
        accesoIv: null,
        accesoTag: null,
        renovacionCifrada: null,
        renovacionIv: null,
        renovacionTag: null,
        accesoExpiraEn: null,
        actualizadoEn: ahora,
      },
    });
    if (evento !== null) await cliente.eventoOauthJira.create({ data: datosEvento(evento) });
  }

  async conCandado<T>(accion: () => Promise<T>): Promise<T> {
    // Un candado dentro de otro candado (misma transacción) no vuelve a abrir nada.
    if (candadoActual.getStore() !== undefined) return accion();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
        // SQL cruda calificada (DEF-E5C-05). Sin fila no hay nada que bloquear y no es un error.
        await tx.$queryRaw`SELECT "id" FROM "integraciones"."conexion_oauth_jira" WHERE "id" = ${ID_UNICO} FOR UPDATE`;
        return candadoActual.run(tx, accion);
      }, OPCIONES_CANDADO);
    } catch (error) {
      if (esCandadoNoObtenido(error)) throw new CandadoNoObtenido();
      throw error;
    }
  }

  async crearEstado(estadoHash: string, actorId: string, creadoEn: Date, expiraEn: Date, purgarAntesDe: Date): Promise<void> {
    await this.transaccion(async (tx) => {
      // La purga de más de 1 día va aquí porque no hay tareas programadas (D96, D211).
      await tx.$executeRaw`DELETE FROM "integraciones"."oauth_estado_jira" WHERE "creado_en" < ${purgarAntesDe}`;
      await tx.$executeRaw`INSERT INTO "integraciones"."oauth_estado_jira" ("estado_hash", "actor_id", "creado_en", "expira_en") VALUES (${estadoHash}, ${actorId}::uuid, ${creadoEn}, ${expiraEn})`;
    });
  }

  async consumirEstado(estadoHash: string, actorId: string): Promise<boolean> {
    const filas = await this.cliente().$queryRaw<Array<{ id: string }>>`UPDATE "integraciones"."oauth_estado_jira" SET "usado_en" = now() WHERE "estado_hash" = ${estadoHash} AND "actor_id" = ${actorId}::uuid AND "usado_en" IS NULL AND "expira_en" > now() RETURNING "id"`;
    return filas.length === 1;
  }
}

function datosEvento(e: DatosEventoOauth) {
  return {
    actorId: e.actor.id,
    actorNombre: e.actor.nombre,
    fecha: e.fecha,
    tipo: e.tipo,
    sitioNombre: e.sitioNombre,
    cuentaNombre: e.cuentaNombre,
    codigo: e.codigo,
  };
}
