/**
 * Historial de gestión (E4-B04): une `accion_impedimento` y `riesgo_hdu`, ambas de solo
 * inserción, en una sola lista cronológica. Es una lectura; no escribe nada.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '#prisma';

import { GestionRepositorio, type AccionGestion, type EntradaGestionRegistro, type FiltroGestion } from '../../dominio/repositorios.js';
import type { NivelRiesgo, RolUsuario, TipoImpedimento } from '../../dominio/tipos.js';
import { PrismaService } from './prisma.service.js';

interface FilaGestion {
  id: string;
  tipo: 'IMPEDIMENTO' | 'RIESGO';
  accion: AccionGestion;
  hdu_id: string;
  imp_id: string | null;
  imp_titulo: string | null;
  imp_tipo: string | null;
  actor_id: string;
  actor_nombre: string;
  actor_rol: string;
  fecha: Date;
  anterior: string | null;
  nuevo: string;
  comentario: string | null;
  sugerido: string | null;
  detalle: Record<string, unknown> | null;
}

const ENTRADAS = Prisma.sql`
  SELECT a."id_accion_impedimento" AS id, 'IMPEDIMENTO'::text AS tipo, a."tipo_accion"::text AS accion,
         i."id_historia" AS hdu_id, i."id_impedimento" AS imp_id, i."titulo"::text AS imp_titulo, i."tipo"::text AS imp_tipo,
         a."actor_id", a."actor_nombre"::text, a."actor_rol"::text, a."fecha_accion" AS fecha,
         a."estado_anterior"::text AS anterior, a."estado"::text AS nuevo, a."descripcion"::text AS comentario,
         NULL::text AS sugerido, a."detalle" AS detalle
    FROM "accion_impedimento" a JOIN "impedimento" i ON i."id_impedimento" = a."id_impedimento"
  UNION ALL
  SELECT r."id_riesgo", 'RIESGO'::text, 'FIJAR_RIESGO'::text,
         r."id_historia", NULL::uuid, NULL::text, NULL::text,
         r."actor_id", r."actor_nombre"::text, r."actor_rol"::text, r."fecha",
         r."nivel_anterior"::text, r."nivel"::text, r."justificacion"::text,
         r."sugerido_al_fijar"::text, NULL::jsonb
    FROM "riesgo_hdu" r`;

function condiciones(filtro: FiltroGestion, hduId?: string): Prisma.Sql {
  const partes: Prisma.Sql[] = [];
  const hdu = hduId ?? filtro.hduId;
  if (hdu !== undefined) partes.push(Prisma.sql`g.hdu_id = ${hdu}::uuid`);
  if (filtro.desde !== undefined) partes.push(Prisma.sql`g.fecha >= ${filtro.desde}`);
  if (filtro.hasta !== undefined) partes.push(Prisma.sql`g.fecha <= ${filtro.hasta}`);
  if (filtro.actorId !== undefined) partes.push(Prisma.sql`g.actor_id = ${filtro.actorId}::uuid`);
  if (filtro.accion !== undefined) partes.push(Prisma.sql`g.accion = ${filtro.accion}`);
  if (filtro.tipo !== undefined) partes.push(Prisma.sql`g.tipo = ${filtro.tipo}`);
  // `estado` y `tipoImpedimento` solo existen en las entradas de impedimentos.
  if (filtro.estado !== undefined) partes.push(Prisma.sql`(g.tipo = 'IMPEDIMENTO' AND g.nuevo = ${filtro.estado})`);
  if (filtro.tipoImpedimento !== undefined) partes.push(Prisma.sql`(g.tipo = 'IMPEDIMENTO' AND g.imp_tipo = ${filtro.tipoImpedimento})`);
  return partes.length === 0 ? Prisma.sql`TRUE` : Prisma.join(partes, ' AND ');
}

function aEntrada(fila: FilaGestion): EntradaGestionRegistro {
  return {
    id: fila.id,
    tipo: fila.tipo,
    accion: fila.accion,
    hduId: fila.hdu_id,
    impedimento: fila.imp_id === null ? null : { id: fila.imp_id, titulo: fila.imp_titulo ?? '', tipo: fila.imp_tipo as TipoImpedimento },
    actor: { id: fila.actor_id, nombre: fila.actor_nombre, rol: fila.actor_rol as RolUsuario },
    fecha: fila.fecha,
    anterior: fila.anterior,
    nuevo: fila.nuevo,
    comentario: fila.comentario,
    sugeridoAlFijar: fila.sugerido as NivelRiesgo | null,
    detalle: fila.detalle,
  };
}

@Injectable()
export class GestionPrismaRepositorio extends GestionRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async deHdu(hduId: string, filtro: FiltroGestion, descendente: boolean): Promise<EntradaGestionRegistro[]> {
    const orden = descendente ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const filas = await this.prisma.$queryRaw<FilaGestion[]>`
      SELECT * FROM (${ENTRADAS}) g WHERE ${condiciones(filtro, hduId)} ORDER BY g.fecha ${orden}, g.id ${orden}`;
    return filas.map(aEntrada);
  }

  async global(filtro: FiltroGestion, desplazamiento: number, limite: number): Promise<{ items: EntradaGestionRegistro[]; total: number }> {
    const [filas, total] = await Promise.all([
      this.prisma.$queryRaw<FilaGestion[]>`
        SELECT * FROM (${ENTRADAS}) g WHERE ${condiciones(filtro)} ORDER BY g.fecha DESC, g.id DESC LIMIT ${limite} OFFSET ${desplazamiento}`,
      this.contarGlobal(filtro),
    ]);
    return { items: filas.map(aEntrada), total };
  }

  async contarGlobal(filtro: FiltroGestion): Promise<number> {
    const filas = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM (${ENTRADAS}) g WHERE ${condiciones(filtro)}`;
    return Number(filas[0]?.total ?? 0);
  }
}
