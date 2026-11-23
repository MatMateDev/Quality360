import { Injectable } from '@nestjs/common';

import {
  ConfiguracionRepositorio,
  type DatosEventoConfiguracion,
  type DatosGuardadoConfiguracion,
} from '../../aplicacion/puertos.js';
import type { CampoConfiguracion, CodigoErrorIntegracion, ConfiguracionGuardada, EstadoConexion, EventoConfiguracion, Pagina, TipoEventoConfiguracion } from '../../dominio/tipos.js';
import { aConfiguracionGuardada, CAMPOS_CONFIGURACION } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

const ID_UNICO = 1;

/** Una fila de la mezcla de `evento_configuracion` y `evento_oauth_jira` (D217). */
interface FilaEventoMezclado {
  id: string;
  fecha: Date;
  tipo: string;
  actor_id: string;
  actor_nombre: string;
  campos_cambiados: unknown;
  token_cambiado: boolean;
  resultado_prueba: string;
  codigo: string | null;
  cuenta_nombre: string | null;
  sitio_nombre: string | null;
}

const TIPOS_OAUTH: readonly TipoEventoConfiguracion[] = ['CONECTAR_OAUTH', 'RECONECTAR', 'DESCONECTAR', 'REFRESCO_FALLIDO'];

@Injectable()
export class ConfiguracionPrismaRepositorio extends ConfiguracionRepositorio {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtener(): Promise<ConfiguracionGuardada | null> {
    const fila = await this.prisma.configuracionJira.findUnique({ where: { id: ID_UNICO } });
    return fila === null ? null : aConfiguracionGuardada(fila);
  }

  async guardar(datos: DatosGuardadoConfiguracion, evento: DatosEventoConfiguracion): Promise<void> {
    const columnas = {
      metodo: datos.metodo,
      sitioUrl: datos.sitio,
      correo: datos.correo,
      proyectoClave: datos.proyecto,
      tiposIssue: datos.tiposIssue.join(','),
      campoSprint: datos.campoSprint,
      campoCriterios: datos.campoCriterios,
      celulaId: datos.celulaId,
      qeResponsableId: datos.qeResponsableId,
      sprintRespaldoId: datos.sprintRespaldoId,
      // Con OAuth, el correo y el API token cifrado quedan nulos (CHECK `configuracion_jira_metodo_credencial_ck`).
      tokenCifrado: datos.token === null ? null : new Uint8Array(datos.token.cifrado),
      tokenIv: datos.token === null ? null : new Uint8Array(datos.token.iv),
      tokenTag: datos.token === null ? null : new Uint8Array(datos.token.tag),
      llaveVersion: datos.token?.llaveVersion ?? 1,
      tokenUltimos4: datos.token === null ? null : datos.token.ultimos4,
      estadoConexion: 'OK',
      ultimaPruebaEn: datos.fecha,
      ultimaPruebaCodigo: null,
      actualizadoPorId: datos.actor.id,
      actualizadoPorNombre: datos.actor.nombre,
      actualizadoEn: datos.fecha,
    } as const;
    // Todo en una sola transacción: el guardado, su evento y, en el cambio de OAuth a API token, el borrado de la
    // conexión OAuth con su evento `DESCONECTAR` (D209, D217).
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracionJira.upsert({ where: { id: ID_UNICO }, create: { id: ID_UNICO, ...columnas }, update: columnas });
      await tx.eventoConfiguracion.create({
        data: {
          actorId: evento.actor.id,
          actorNombre: evento.actor.nombre,
          fecha: evento.fecha,
          camposCambiados: evento.camposCambiados,
          tokenCambiado: evento.tokenCambiado,
          resultadoPrueba: evento.resultadoPrueba,
        },
      });
      const descarte = datos.descartarOauth;
      if (descarte !== null) {
        const borradas = await tx.conexionOauthJira.deleteMany({ where: { id: ID_UNICO } });
        if (borradas.count > 0) {
          await tx.eventoOauthJira.create({
            data: { actorId: descarte.actor.id, actorNombre: descarte.actor.nombre, fecha: descarte.fecha, tipo: descarte.tipo, sitioNombre: descarte.sitioNombre, cuentaNombre: descarte.cuentaNombre, codigo: descarte.codigo },
          });
        }
      }
    });
  }

  async registrarPrueba(estado: EstadoConexion, codigo: CodigoErrorIntegracion | null, fecha: Date): Promise<void> {
    // `updateMany` y no `update`: sin una fila previa no hay nada que actualizar y tampoco se inserta nada (D112).
    await this.prisma.configuracionJira.updateMany({
      where: { id: ID_UNICO },
      data: { estadoConexion: estado, ultimaPruebaEn: fecha, ultimaPruebaCodigo: codigo },
    });
  }

  /**
   * Los guardados y los eventos de la conexión OAuth, mezclados por fecha (D217). SQL cruda calificada con el esquema
   * (DEF-E5C-05): una sola consulta para la página y otra para el total, en una transacción por lote.
   */
  async listarEventos(pagina: number, tamanoPagina: number): Promise<Pagina<EventoConfiguracion>> {
    const [conteo, filas] = await this.prisma.$transaction([
      this.prisma.$queryRaw<Array<{ total: bigint }>>`SELECT ((SELECT count(*) FROM "integraciones"."evento_configuracion") + (SELECT count(*) FROM "integraciones"."evento_oauth_jira")) AS total`,
      this.prisma.$queryRaw<FilaEventoMezclado[]>`
        SELECT "id", "fecha", "tipo", "actor_id", "actor_nombre", "campos_cambiados", "token_cambiado", "resultado_prueba", "codigo", "cuenta_nombre", "sitio_nombre" FROM (
          SELECT "id_evento" AS "id", "fecha", 'CONFIGURACION'::text AS "tipo", "actor_id", "actor_nombre", "campos_cambiados", "token_cambiado", "resultado_prueba",
                 NULL::text AS "codigo", NULL::text AS "cuenta_nombre", NULL::text AS "sitio_nombre"
          FROM "integraciones"."evento_configuracion"
          UNION ALL
          SELECT "id_evento" AS "id", "fecha", "tipo"::text, "actor_id", "actor_nombre", '[]'::jsonb AS "campos_cambiados", false AS "token_cambiado", 'OK'::text AS "resultado_prueba",
                 "codigo", "cuenta_nombre", "sitio_nombre"
          FROM "integraciones"."evento_oauth_jira"
        ) AS "evento"
        ORDER BY "fecha" DESC, "id" DESC
        LIMIT ${tamanoPagina} OFFSET ${(pagina - 1) * tamanoPagina}`,
    ]);
    return { items: filas.map(aEventoMezclado), total: Number(conteo[0]?.total ?? 0), pagina, tamanoPagina };
  }
}

function aEventoMezclado(fila: FilaEventoMezclado): EventoConfiguracion {
  const tipo = (TIPOS_OAUTH as readonly string[]).includes(fila.tipo) ? (fila.tipo as TipoEventoConfiguracion) : 'CONFIGURACION';
  if (tipo === 'CONFIGURACION') {
    const campos = Array.isArray(fila.campos_cambiados) ? fila.campos_cambiados : [];
    return {
      id: fila.id,
      fecha: fila.fecha,
      tipo,
      oauth: null,
      actor: { id: fila.actor_id, nombre: fila.actor_nombre },
      camposCambiados: campos.filter((campo): campo is CampoConfiguracion => (CAMPOS_CONFIGURACION as readonly unknown[]).includes(campo)),
      tokenCambiado: fila.token_cambiado,
      resultadoPrueba: fila.resultado_prueba,
    };
  }
  return {
    id: fila.id,
    fecha: fila.fecha,
    tipo,
    oauth: { cuenta: fila.cuenta_nombre, sitio: fila.sitio_nombre },
    actor: { id: fila.actor_id, nombre: fila.actor_nombre },
    camposCambiados: [],
    tokenCambiado: false,
    // `REFRESCO_FALLIDO` lleva el código de error al que dio lugar; el resto no es una prueba fallida.
    resultadoPrueba: tipo === 'REFRESCO_FALLIDO' ? 'JIRA_RECONEXION_NECESARIA' : 'OK',
  };
}
