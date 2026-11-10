/**
 * Exportación CSV y PDF de las cuatro vistas (E6-B04, D168, D186). Mismo cálculo y ámbito que la vista. Orden:
 * 401 → 403 → 400 (en la capa API) → cálculo → 503 `INDICADORES_NO_DISPONIBLES` si algún bloque de la vista está
 * indisponible → 422 `EXPORTACION_EXCEDE_LIMITE` → registro `EXPORTAR` en Organización → archivo. Si el registro falla:
 * 503 `SERVICIO_NO_DISPONIBLE` y no hay archivo. Nunca se entrega un archivo con datos parciales ni sin rastro.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES, servicioNoDisponible } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIndicadores } from '../configuracion.js';
import { fechaHoraSantiago, fechaSantiago } from '../dominio/fechas.js';
import { motivosDe, soloAbiertos, type MotivoSemaforo } from '../dominio/semaforo.js';
import { SIN_SPRINT, type AmbitoOrganizacion, type FiltrosVista, type Rol } from '../dominio/tipos.js';
import { resolverRango } from './tendencia.servicio.js';
import { TEXTO_SIN_DATOS, type CeldaExportacion, type DocumentoExportacion } from './exportacion.tipos.js';
import { FuenteOrganizacion, Reloj } from './puertos.js';
import { TendenciaAplicacion } from './tendencia.servicio.js';
import { VistasAplicacion, type AutSesion } from './vistas.servicio.js';

export type VistaExportable = 'cumplimiento' | 'semaforo' | 'carga' | 'tendencia';
export type FormatoExportacion = 'csv' | 'pdf';
export const VISTAS: readonly VistaExportable[] = ['cumplimiento', 'semaforo', 'carga', 'tendencia'];
export const FORMATOS: readonly FormatoExportacion[] = ['csv', 'pdf'];

export interface SolicitudExportacion {
  readonly vista: VistaExportable;
  readonly formato: FormatoExportacion;
  readonly celulaId: string | null;
  readonly sprintId: string | null;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly celulasIdsLider: readonly string[];
}

export interface ArchivoExportacion {
  readonly documento: DocumentoExportacion;
  readonly formato: FormatoExportacion;
  readonly nombreArchivo: string;
  readonly filas: number;
}

const COLOR_TEXTO: Readonly<Record<string, string>> = { ROJO: 'Rojo', AMARILLO: 'Amarillo', VERDE: 'Verde' };
const MOTIVO_TEXTO: Readonly<Record<MotivoSemaforo, string>> = {
  RIESGO_ALTO: 'Riesgo alto',
  IMPEDIMENTO_ESCALADO: 'Impedimento escalado',
  RIESGO_MEDIO: 'Riesgo medio',
  IMPEDIMENTO_ABIERTO: 'Impedimento abierto',
};
const RIESGO_TEXTO: Readonly<Record<string, string>> = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto' };
const ROL_TEXTO: Readonly<Record<Rol, string>> = { QE: 'QE', LIDER_QA: 'Líder QA', AUDITOR: 'Auditor', ADMINISTRADOR: 'Administrador', ANALISTA_QA: 'Analista QA' };

function noDisponibles(): ExcepcionQ360 {
  return new ExcepcionQ360(503, 'INDICADORES_NO_DISPONIBLES', { mensaje: MENSAJES.INDICADORES_NO_DISPONIBLES });
}

@Injectable()
export class ExportacionAplicacion {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores,
    private readonly vistas: VistasAplicacion,
    private readonly tendencia: TendenciaAplicacion,
    private readonly organizacion: FuenteOrganizacion,
    private readonly reloj: Reloj,
  ) {}

  async exportar(auth: AutSesion, solicitud: SolicitudExportacion): Promise<ArchivoExportacion> {
    const ahora = this.reloj.ahora();
    const ambito = await this.vistas.ambito(auth);
    const filtros: FiltrosVista = { celulaId: solicitud.celulaId, sprintId: solicitud.vista === 'semaforo' ? null : solicitud.sprintId };
    const hoy = fechaSantiago(ahora);
    const rango = solicitud.vista === 'tendencia' ? resolverRango(solicitud.desde, solicitud.hasta, hoy) : null;

    const { columnas, filas } = await this.tabla(auth, ambito, solicitud, filtros);
    const documento: DocumentoExportacion = {
      encabezado: [
        ['Reporte', 'Quality360 · Indicadores'],
        ['Vista', solicitud.vista],
        ['Filtros', this.textoFiltros(ambito, filtros, rango)],
        ['Rol y ámbito', this.textoAmbito(ambito)],
        ['Generado (hora de Chile)', fechaHoraSantiago(ahora)],
      ],
      columnas,
      filas,
      textoSinDatos: TEXTO_SIN_DATOS,
    };

    const limite = solicitud.formato === 'csv' ? this.configuracion.csvLimiteFilas : this.configuracion.pdfLimiteFilas;
    if (filas.length > limite) {
      const miles = new Intl.NumberFormat('es-CL').format(limite);
      const mensaje = solicitud.formato === 'csv' ? `La exportación supera las ${miles} filas. Acota los filtros.` : `El reporte supera las ${miles} filas de un PDF. Usa CSV.`;
      throw new ExcepcionQ360(422, 'EXPORTACION_EXCEDE_LIMITE', { mensaje });
    }

    try {
      await this.organizacion.registrarExportacion(auth, {
        recurso: 'INDICADORES',
        filtros: { vista: solicitud.vista, formato: solicitud.formato, celulaId: filtros.celulaId, sprintId: filtros.sprintId, desde: rango?.desde ?? null, hasta: rango?.hasta ?? null },
        filas: filas.length,
      });
    } catch (error) {
      throw servicioNoDisponible(`No se pudo registrar la exportación: ${error instanceof Error ? error.message : 'desconocido'}`);
    }
    return { documento, formato: solicitud.formato, nombreArchivo: `quality360-indicadores-${solicitud.vista}-${hoy.replace(/-/g, '')}.${solicitud.formato}`, filas: filas.length };
  }

  private textoFiltros(ambito: AmbitoOrganizacion, filtros: FiltrosVista, rango: { desde: string; hasta: string } | null): string {
    const partes: string[] = [];
    if (filtros.celulaId !== null) partes.push(`Célula ${ambito.celulas.find((c) => c.id === filtros.celulaId)?.nombre ?? filtros.celulaId}`);
    if (filtros.sprintId !== null) {
      const nombre = filtros.sprintId === SIN_SPRINT ? 'sin sprint' : (ambito.hdu.find((h) => h.sprint?.id === filtros.sprintId)?.sprint?.nombre ?? filtros.sprintId);
      partes.push(filtros.sprintId === SIN_SPRINT ? 'Sin sprint' : `Sprint ${nombre}`);
    }
    if (rango !== null) partes.push(`Desde ${rango.desde}`, `Hasta ${rango.hasta}`);
    return partes.length === 0 ? 'Sin filtros' : partes.join('; ');
  }

  private textoAmbito(ambito: AmbitoOrganizacion): string {
    const alcance = ambito.usuario.rol === 'QE' ? 'sus HDU y las de su equipo' : ambito.usuario.rol === 'LIDER_QA' ? 'sus células' : 'todo el sistema';
    return `${ROL_TEXTO[ambito.usuario.rol]} · ${ambito.usuario.nombre} (${alcance})`;
  }

  private async tabla(auth: AutSesion, ambito: AmbitoOrganizacion, solicitud: SolicitudExportacion, filtros: FiltrosVista): Promise<{ columnas: string[]; filas: CeldaExportacion[][] }> {
    switch (solicitud.vista) {
      case 'cumplimiento': {
        const c = await this.vistas.cumplimiento(auth, filtros, ambito);
        const bloques = [c.hduTotales, c.certificadas, c.cerradasConExcepcion, c.enCurso, c.sinIniciar, c.bloqueadas, c.cumplimientoPromedio];
        if (bloques.some((b) => b.estado === 'indisponible')) throw noDisponibles();
        const filas: CeldaExportacion[][] = c.sinDatos
          ? []
          : [
              ['HDU totales', c.hduTotales.valor],
              ['Certificadas', c.certificadas.valor],
              ['Cerradas con excepción', c.cerradasConExcepcion.valor],
              ['En curso', c.enCurso.valor],
              ['Sin iniciar', c.sinIniciar.valor],
              ['Bloqueadas', c.bloqueadas.valor],
              ['Cumplimiento promedio (%)', c.cumplimientoPromedio.valor],
            ];
        return { columnas: ['Indicador', 'Valor'], filas };
      }
      case 'semaforo': {
        const { cuerpo, evaluaciones } = await this.vistas.calcularSemaforo(auth, filtros.celulaId, ambito);
        if (cuerpo.fuentes.certificaciones === 'indisponible' || cuerpo.fuentes.impedimentos === 'indisponible' || cuerpo.celulas.some((t) => t.estado === 'indisponible')) throw noDisponibles();
        const filas: CeldaExportacion[][] = [];
        for (const tarjeta of cuerpo.celulas) {
          const color = tarjeta.estado === 'SIN_HDU' ? 'Sin HDU' : (COLOR_TEXTO[tarjeta.color ?? ''] ?? '');
          const activas = ambito.hdu.filter((h) => h.celula.id === tarjeta.celula.id && h.estado !== 'CERRADA').sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));
          if (activas.length === 0) {
            filas.push([tarjeta.celula.nombre, color, null, null, null, null, null, null]);
            continue;
          }
          for (const hdu of activas) {
            const evaluacion = evaluaciones?.get(hdu.id);
            const motivos = evaluacion === undefined ? [] : motivosDe(evaluacion, tarjeta.color);
            filas.push([
              tarjeta.celula.nombre,
              color,
              hdu.codigo,
              hdu.titulo,
              evaluacion?.riesgo.nivelVigente == null ? 'Sin evaluar' : (RIESGO_TEXTO[evaluacion.riesgo.nivelVigente] ?? ''),
              evaluacion === undefined ? null : soloAbiertos(evaluacion),
              evaluacion?.escalados ?? null,
              motivos.map((m) => MOTIVO_TEXTO[m]).join(', '),
            ]);
          }
        }
        return { columnas: ['Célula', 'Color de la célula', 'HDU', 'Título', 'Riesgo vigente', 'Impedimentos abiertos', 'Escalados', 'Motivos'], filas };
      }
      case 'carga': {
        const c = await this.vistas.carga(auth, filtros, ambito);
        if (c.fuentes.certificaciones === 'indisponible') throw noDisponibles();
        const filas: CeldaExportacion[][] = [];
        for (const grupo of c.grupos) {
          for (const f of grupo.filas) {
            filas.push([
              grupo.umbral.qe?.nombre ?? 'Sin QE supervisor',
              f.analista.nombre,
              f.analista.activo ? 'Activo' : 'Inactivo',
              f.supervisadoPorMi === null ? null : f.supervisadoPorMi ? 'Sí' : 'No',
              f.activas,
              f.porEstado.PENDIENTE,
              f.porEstado.DISENO_PRUEBAS,
              f.porEstado.EN_EJECUCION,
              f.porEstado.PENDIENTE_CIERRE,
              f.porEstado.CERRADA,
              f.cumplimiento.valor,
              f.sobrecargado ? 'Sí' : 'No',
              grupo.umbral.valor,
            ]);
          }
        }
        if (c.sinAnalista !== null) {
          const e = c.sinAnalista.porEstado;
          filas.push([null, 'Sin analista asignado', null, null, c.sinAnalista.activas, e.PENDIENTE, e.DISENO_PRUEBAS, e.EN_EJECUCION, e.PENDIENTE_CIERRE, e.CERRADA, null, null, null]);
        }
        return {
          columnas: ['Grupo (QE)', 'Analista', 'Estado', 'Supervisado por mí', 'Activas', 'Pendiente', 'Diseño de pruebas', 'En ejecución', 'Pendiente de cierre', 'Cerrada', 'Cumplimiento (%)', 'Sobrecargado', 'Umbral'],
          filas,
        };
      }
      case 'tendencia': {
        const t = await this.tendencia.consultar({
          rol: ambito.usuario.rol,
          usuarioId: ambito.usuario.id,
          celulasIds: solicitud.celulasIdsLider,
          celulaId: filtros.celulaId,
          sprintId: filtros.sprintId,
          desde: solicitud.desde,
          hasta: solicitud.hasta,
        });
        const filas = t.series
          .flatMap((serie) => serie.puntos.map((p) => ({ fecha: p.fecha, fila: [p.fecha, serie.celula.nombre, serie.sprint.nombre, p.cumplimiento, p.hduTotal] as CeldaExportacion[] })))
          .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.fila[1]).localeCompare(String(b.fila[1]), 'es') || String(a.fila[2]).localeCompare(String(b.fila[2]), 'es'))
          .map((x) => x.fila);
        return { columnas: ['Fecha', 'Célula', 'Sprint', 'Cumplimiento (%)', 'HDU'], filas };
      }
    }
  }
}
