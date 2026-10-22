/**
 * Consultas y exportaciones del Auditor que atiende Organización (E7-B04, D35, D45, D48):
 * auditoría de usuarios y HDU. Cada exportación se registra en la auditoría antes de
 * entregar el archivo (`EXPORTAR`, entidad `EXPORTACION`).
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, errorValidacion, servicioNoDisponible } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionOrganizacion } from '../configuracion.js';
import { actualizadoEn } from '../dominio/reglas/bandejas.js';
import { rangoValido, type RecursoExportacion } from '../dominio/reglas/auditoria-usuarios.js';
import {
  AUDITORIA_REPOSITORIO,
  type AuditoriaRepositorio,
  type FiltroAuditoriaUsuarios,
} from '../dominio/repositorios/auditoria.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { Actor, OpcionesPaginacion, Pagina } from '../dominio/tipos.js';
import { BandejasAplicacion, type ConsultaListaHdu, type ContextoBandeja } from './bandejas.servicio.js';
import { HduAplicacion } from './hdu.servicio.js';

type CeldaExportada = string | number | Date | null;

/** Resultado de una exportación: lo que el controlador convierte en CSV. */
export interface ExportacionTabular {
  readonly recurso: 'hdu' | 'auditoria-usuarios';
  readonly encabezado: string[];
  readonly filas: CeldaExportada[][];
}

export function excedeLimite(limite: number): ExcepcionQ360 {
  const texto = limite.toLocaleString('es-CL');
  return new ExcepcionQ360(422, 'EXPORTACION_EXCEDE_LIMITE', { mensaje: `La exportación supera las ${texto} filas. Acota los filtros.` });
}

@Injectable()
export class AuditorAplicacion {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionOrganizacion,
    @Inject(AUDITORIA_REPOSITORIO) private readonly auditoria: AuditoriaRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    private readonly bandejas: BandejasAplicacion,
    private readonly hduAplicacion: HduAplicacion,
  ) {}

  get limiteFilas(): number {
    return this.configuracion.exportacionLimiteFilas;
  }

  /** `GET /v1/auditor/auditoria-usuarios`: solo campos de la lista blanca, sin contraseñas ni tokens. */
  async auditoriaUsuarios(filtro: FiltroAuditoriaUsuarios, paginacion: OpcionesPaginacion) {
    this.validarRango(filtro.desde, filtro.hasta);
    const pagina = await this.auditoria.listarUsuarios(filtro, paginacion);
    return { ...pagina, items: await this.bandejas.registrosUsuarios(pagina.items) } satisfies Pagina<unknown>;
  }

  /** `GET /v1/auditor/exportaciones/auditoria-usuarios`. */
  async exportarAuditoriaUsuarios(filtro: FiltroAuditoriaUsuarios, filtrosAplicados: Record<string, unknown>, actor: Actor): Promise<ExportacionTabular> {
    this.validarRango(filtro.desde, filtro.hasta);
    const limite = this.limiteFilas;
    const registros = await this.auditoria.listarUsuariosHasta(filtro, limite + 1);
    if (registros.length > limite) throw excedeLimite(limite);

    const filas = await this.bandejas.registrosUsuarios(registros);
    await this.registrarExportacion(actor, 'AUDITORIA_USUARIOS', filtrosAplicados, filas.length);
    return {
      recurso: 'auditoria-usuarios',
      encabezado: ['Fecha', 'Actor', 'Operación', 'Usuario afectado', 'Cambios', 'Motivo'],
      filas: filas.map((fila) => [
        fila.fecha,
        fila.actor.nombre,
        fila.operacion,
        fila.usuarioAfectado === null ? null : `${fila.usuarioAfectado.nombre} <${fila.usuarioAfectado.correo}>`,
        fila.antes === null && fila.despues === null ? null : `${JSON.stringify(fila.antes)} → ${JSON.stringify(fila.despues)}`,
        fila.motivo,
      ]),
    };
  }

  /** `GET /v1/auditor/exportaciones/hdu`: avance y certificado salen de Certificaciones; si no responde, 503 sin archivo (D48). */
  async exportarHdu(ctx: ContextoBandeja, consulta: ConsultaListaHdu, filtrosAplicados: Record<string, unknown>, actor: Actor): Promise<ExportacionTabular> {
    this.validarRango(consulta.desde, consulta.hasta);
    const lista = await this.bandejas.listaCompletaAuditor(ctx, consulta);
    if (!lista.seguimiento.disponible) throw servicioNoDisponible('Certificaciones no respondió: no se exporta un avance vacío');
    const limite = this.limiteFilas;
    if (lista.filas.length > limite) throw excedeLimite(limite);

    const resumenes = await this.hduAplicacion.resumir(lista.filas.map((fila) => lista.hduPorId.get(fila.id)).filter((hdu) => hdu !== undefined));
    const porId = new Map(resumenes.map((resumen) => [resumen.id, resumen]));
    const mapa = lista.seguimiento.mapa;
    await this.registrarExportacion(actor, 'HDU', filtrosAplicados, lista.filas.length);
    return {
      recurso: 'hdu',
      encabezado: ['Código', 'Título', 'Célula', 'Sprint', 'Estado', 'QE', 'Analista', 'Avance', 'Certificado', 'Actualizada'],
      filas: lista.filas.map((fila) => {
        const resumen = porId.get(fila.id);
        const seguimiento = mapa.get(fila.id);
        return [
          fila.codigo,
          fila.titulo,
          fila.celulaNombre,
          fila.sprintNombre,
          fila.estado,
          resumen?.qeResponsable.nombre ?? null,
          resumen?.analista?.nombre ?? null,
          `${seguimiento?.aprobados ?? 0}/10`,
          seguimiento?.certificado?.folio ?? null,
          actualizadoEn(fila, seguimiento),
        ];
      }),
    };
  }

  /** `POST /v1/interno/auditoria/exportaciones`: Certificaciones registra aquí sus exportaciones (D48). */
  async registrarExportacion(actor: Actor, recurso: RecursoExportacion, filtros: Record<string, unknown>, filas: number): Promise<{ id: string }> {
    return this.auditoria.registrarExportacion({ actor, recurso, filtros, filas });
  }

  /** El Auditor autenticado, como actor de auditoría. */
  async actorDe(usuarioId: string): Promise<Actor> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (usuario === null) throw servicioNoDisponible('auditor sin registro local');
    return { tipo: 'USUARIO', id: usuario.id, nombre: usuario.nombre };
  }

  private validarRango(desde: Date | undefined, hasta: Date | undefined): void {
    if (!rangoValido(desde, hasta)) {
      throw errorValidacion([{ campo: 'hasta', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'hasta no puede ser anterior a desde.' }]);
    }
  }
}
