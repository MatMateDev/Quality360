import { Injectable } from '@nestjs/common';

import {
  ConfiguracionRepositorio,
  type DatosEventoConfiguracion,
  type DatosGuardadoConfiguracion,
} from '../../aplicacion/puertos.js';
import type { CodigoErrorIntegracion, ConfiguracionGuardada, EstadoConexion, EventoConfiguracion, Pagina } from '../../dominio/tipos.js';
import { aConfiguracionGuardada, aEventoConfiguracion } from './mapeadores.js';
import { PrismaService } from './prisma.service.js';

const ID_UNICO = 1;

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
      sitioUrl: datos.sitio,
      correo: datos.correo,
      proyectoClave: datos.proyecto,
      tiposIssue: datos.tiposIssue.join(','),
      campoSprint: datos.campoSprint,
      celulaId: datos.celulaId,
      qeResponsableId: datos.qeResponsableId,
      sprintRespaldoId: datos.sprintRespaldoId,
      tokenCifrado: new Uint8Array(datos.token.cifrado),
      tokenIv: new Uint8Array(datos.token.iv),
      tokenTag: new Uint8Array(datos.token.tag),
      llaveVersion: datos.token.llaveVersion,
      tokenUltimos4: datos.token.ultimos4,
      estadoConexion: 'OK',
      ultimaPruebaEn: datos.fecha,
      ultimaPruebaCodigo: null,
      actualizadoPorId: datos.actor.id,
      actualizadoPorNombre: datos.actor.nombre,
      actualizadoEn: datos.fecha,
    } as const;
    await this.prisma.$transaction([
      this.prisma.configuracionJira.upsert({ where: { id: ID_UNICO }, create: { id: ID_UNICO, ...columnas }, update: columnas }),
      this.prisma.eventoConfiguracion.create({
        data: {
          actorId: evento.actor.id,
          actorNombre: evento.actor.nombre,
          fecha: evento.fecha,
          camposCambiados: evento.camposCambiados,
          tokenCambiado: evento.tokenCambiado,
          resultadoPrueba: evento.resultadoPrueba,
        },
      }),
    ]);
  }

  async registrarPrueba(estado: EstadoConexion, codigo: CodigoErrorIntegracion | null, fecha: Date): Promise<void> {
    // `updateMany` y no `update`: sin una fila previa no hay nada que actualizar y tampoco se inserta nada (D112).
    await this.prisma.configuracionJira.updateMany({
      where: { id: ID_UNICO },
      data: { estadoConexion: estado, ultimaPruebaEn: fecha, ultimaPruebaCodigo: codigo },
    });
  }

  async listarEventos(pagina: number, tamanoPagina: number): Promise<Pagina<EventoConfiguracion>> {
    const [total, filas] = await this.prisma.$transaction([
      this.prisma.eventoConfiguracion.count(),
      this.prisma.eventoConfiguracion.findMany({ orderBy: { fecha: 'desc' }, skip: (pagina - 1) * tamanoPagina, take: tamanoPagina }),
    ]);
    return { items: filas.map(aEventoConfiguracion), total, pagina, tamanoPagina };
  }
}
