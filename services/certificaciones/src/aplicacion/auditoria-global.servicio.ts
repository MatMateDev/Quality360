/**
 * Lecturas globales de Certificaciones (E7): seguimiento en lote para las bandejas de
 * Organización (D46) y consultas y exportaciones del Auditor (E7-B04, D47, D48).
 * Cada servicio autoriza por sí mismo: el rol lo valida `AccesoGuard` contra Organización
 * y el ámbito de un lote se pide una vez a `GET /v1/interno/hdu/ambito`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, accesoDenegado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionCertificaciones } from '../configuracion.js';
import { NOMBRES_ENTREGABLE } from '../dominio/entregables.js';
import { certificadoEsValido, type SeguimientoHdu } from '../dominio/seguimiento.js';
import {
  ChecklistRepositorio,
  type FiltroBitacoraGlobal,
  type FiltroCertificadosGlobal,
} from '../infraestructura/checklist.repositorio.js';
import { OrganizacionCliente, type ContextoSolicitud, type HduParaCertificacion } from '../infraestructura/organizacion.cliente.js';

type Celda = string | number | Date | null;

export interface ExportacionTabular {
  readonly recurso: 'bitacora' | 'certificados';
  readonly encabezado: string[];
  readonly filas: Celda[][];
}

function excedeLimite(limite: number): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'EXPORTACION_EXCEDE_LIMITE', {
    mensaje: `La exportación supera las ${limite.toLocaleString('es-CL')} filas. Acota los filtros.`,
  });
}

@Injectable()
export class SeguimientoAplicacion {
  constructor(
    private readonly organizacion: OrganizacionCliente,
    private readonly repositorio: ChecklistRepositorio,
  ) {}

  /**
   * Estado del checklist de varias HDU. Si algún id está fuera del ámbito del usuario, 403 completo
   * y sin datos parciales (D12, D47). Administrador y Auditor leen todas: ahí no se puede saber si un
   * id existe en Organización, y una HDU sin ciclo responde con 0 aprobados, que es un dato válido.
   */
  async estados(hduIds: readonly string[], contexto: ContextoSolicitud): Promise<{ items: SeguimientoHdu[] }> {
    const ambito = await this.organizacion.ambito(contexto);
    if (!ambito.todas) {
      const permitidos = new Set(ambito.hduIds);
      if (hduIds.some((id) => !permitidos.has(id))) throw accesoDenegado('lote con una HDU fuera de ámbito');
    }
    return { items: await this.repositorio.seguimientoLote(hduIds) };
  }

  /** Certificados emitidos y eventos de los últimos 7 días, sobre todo el sistema (solo Auditor). */
  resumenAuditoria(): Promise<{ certificados: number; eventosUltimos7Dias: number }> {
    return this.repositorio.resumenAuditoria(new Date());
  }
}

@Injectable()
export class AuditorAplicacion {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionCertificaciones,
    private readonly organizacion: OrganizacionCliente,
    private readonly repositorio: ChecklistRepositorio,
  ) {}

  /** Bitácora de todas las HDU, del evento más reciente al más antiguo, con la HDU de cada evento. */
  async bitacora(filtro: FiltroBitacoraGlobal, paginacion: { pagina: number; tamanoPagina: number }, contexto: ContextoSolicitud) {
    const { items, total } = await this.repositorio.bitacoraGlobal(filtro, (paginacion.pagina - 1) * paginacion.tamanoPagina, paginacion.tamanoPagina);
    const hdus = await this.hduDe(items.map((evento) => evento.hduId), contexto);
    return {
      items: items.map((evento) => this.eventoGlobal(evento, hdus.get(evento.hduId))),
      total,
      pagina: paginacion.pagina,
      tamanoPagina: paginacion.tamanoPagina,
    };
  }

  /** Certificados emitidos, del más reciente al más antiguo. `valido` usa la misma función que la verificación pública (D45). */
  async certificados(filtro: FiltroCertificadosGlobal, paginacion: { pagina: number; tamanoPagina: number }) {
    const { items, total } = await this.repositorio.certificadosGlobal(filtro, (paginacion.pagina - 1) * paginacion.tamanoPagina, paginacion.tamanoPagina);
    return { items: items.map(vistaCertificado), total, pagina: paginacion.pagina, tamanoPagina: paginacion.tamanoPagina };
  }

  /**
   * Exporta la bitácora. Antes de devolver las filas registra la exportación en Organización; si el
   * registro falla, 503 y no hay archivo (D48). Con más filas que el límite, 422 sin registrar nada.
   */
  async exportarBitacora(filtro: FiltroBitacoraGlobal, filtros: Record<string, unknown>, contexto: ContextoSolicitud): Promise<ExportacionTabular> {
    const limite = this.configuracion.exportacionLimiteFilas;
    const total = await this.repositorio.contarBitacora(filtro);
    if (total > limite) throw excedeLimite(limite);
    const { items } = await this.repositorio.bitacoraGlobal(filtro, 0, Math.max(total, 1));
    const hdus = await this.hduDe(items.map((evento) => evento.hduId), contexto);

    await this.organizacion.registrarExportacion({ recurso: 'BITACORA', filtros, filas: items.length }, contexto);
    return {
      recurso: 'bitacora',
      encabezado: ['Fecha', 'HDU', 'Título', 'Entregable', 'Acción', 'Actor', 'Rol', 'Valor anterior', 'Valor nuevo', 'Motivo'],
      filas: items.map((evento) => {
        const hdu = hdus.get(evento.hduId);
        return [
          evento.fecha,
          hdu?.codigo ?? evento.hduId,
          hdu?.titulo ?? null,
          NOMBRES_ENTREGABLE[evento.clave],
          evento.accion,
          evento.actorNombre,
          evento.actorRol,
          evento.valorAnterior === null ? null : JSON.stringify(evento.valorAnterior),
          evento.valorNuevo === null ? null : JSON.stringify(evento.valorNuevo),
          evento.motivo,
        ];
      }),
    };
  }

  async exportarCertificados(filtro: FiltroCertificadosGlobal, filtros: Record<string, unknown>, contexto: ContextoSolicitud): Promise<ExportacionTabular> {
    const limite = this.configuracion.exportacionLimiteFilas;
    const { items, total } = await this.repositorio.certificadosGlobal(filtro, 0, limite + 1);
    if (total > limite) throw excedeLimite(limite);

    await this.organizacion.registrarExportacion({ recurso: 'CERTIFICADOS', filtros, filas: items.length }, contexto);
    return {
      recurso: 'certificados',
      encabezado: ['Folio', 'HDU', 'Título', 'Fecha de emisión', 'QE emisor', 'Huella SHA-256', 'Válido'],
      filas: items.map((certificado) => [
        certificado.folio,
        certificado.hduCodigo,
        certificado.hduTitulo,
        certificado.emitidoEn,
        certificado.emitidoPorNombre,
        certificado.huellaSha256,
        certificadoEsValido(certificado) ? 'Sí' : 'No',
      ]),
    };
  }

  private async hduDe(hduIds: readonly string[], contexto: ContextoSolicitud): Promise<Map<string, HduParaCertificacion>> {
    const unicos = [...new Set(hduIds)];
    if (unicos.length === 0) return new Map();
    const hdus = await this.organizacion.consultarHdu(unicos, contexto);
    return new Map(hdus.map((hdu) => [hdu.id, hdu]));
  }

  private eventoGlobal(
    evento: Awaited<ReturnType<ChecklistRepositorio['bitacoraGlobal']>>['items'][number],
    hdu: HduParaCertificacion | undefined,
  ) {
    return {
      id: evento.id,
      hdu: { id: evento.hduId, codigo: hdu?.codigo ?? evento.hduId, titulo: hdu?.titulo ?? '', estado: hdu?.estado ?? 'PENDIENTE' },
      accion: evento.accion,
      clave: evento.clave,
      nombreEntregable: NOMBRES_ENTREGABLE[evento.clave],
      actor: { id: evento.actorId, nombre: evento.actorNombre, rol: evento.actorRol },
      fecha: evento.fecha.toISOString(),
      valorAnterior: evento.valorAnterior ?? null,
      valorNuevo: evento.valorNuevo ?? null,
      motivo: evento.motivo,
    };
  }
}

function vistaCertificado(certificado: Awaited<ReturnType<ChecklistRepositorio['certificadosGlobal']>>['items'][number]) {
  return {
    folio: certificado.folio,
    hdu: { id: certificado.hduId, codigo: certificado.hduCodigo, titulo: certificado.hduTitulo },
    emitidoEn: certificado.emitidoEn.toISOString(),
    emitidoPor: { id: certificado.emitidoPorId, nombre: certificado.emitidoPorNombre },
    huellaSha256: certificado.huellaSha256,
    valido: certificadoEsValido(certificado),
  };
}
