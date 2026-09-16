/**
 * Traduce cualquier excepción al formato común `{codigo, mensaje, traceId,
 * detalles}` y fija la cabecera `x-trace-id`.
 *
 * Los detalles internos (stack, mensajes de librerías) van al log, nunca a la
 * respuesta.
 */
import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';

import {
  ExcepcionQ360,
  MENSAJES,
  codigoPorEstado,
  esCodigoError,
  type CodigoError,
  type CuerpoError,
  type DetalleError,
} from './errores.js';
import type { RespuestaHttp, SolicitudAutenticada } from './tipos.js';
import { CABECERA_TRAZA, obtenerTraceId } from './traza.js';

interface Traducido {
  estado: number;
  codigo: CodigoError;
  mensaje: string;
  detalles: DetalleError[];
  motivo: string | null;
}

function esCuerpoComun(valor: unknown): valor is Partial<CuerpoError> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    esCodigoError((valor as { codigo?: unknown }).codigo) &&
    typeof (valor as { mensaje?: unknown }).mensaje === 'string'
  );
}

@Catch()
export class FiltroErroresQ360 implements ExceptionFilter {
  private readonly registro = new Logger('ErroresQ360');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw excepcion;

    const contexto = host.switchToHttp();
    const solicitud = contexto.getRequest<SolicitudAutenticada>();
    const respuesta = contexto.getResponse<RespuestaHttp>();
    const traceId = obtenerTraceId(solicitud);
    const traducido = this.traducir(excepcion);

    const ruta = `${solicitud?.method ?? '-'} ${solicitud?.originalUrl ?? solicitud?.url ?? '-'}`;
    const detalle = `${traducido.codigo} ${traducido.estado} en ${ruta} · traceId=${traceId}`;
    if (traducido.estado >= 500) {
      this.registro.error(`${detalle} · motivo=${traducido.motivo ?? '-'}`);
      if (excepcion instanceof Error && excepcion.stack) this.registro.debug(excepcion.stack);
    } else {
      this.registro.warn(`${detalle}${traducido.motivo ? ` · motivo=${traducido.motivo}` : ''}`);
    }

    if (respuesta?.headersSent === true) return;

    const cuerpo: CuerpoError = {
      codigo: traducido.codigo,
      mensaje: traducido.mensaje,
      traceId,
      detalles: traducido.detalles,
    };
    respuesta.setHeader?.(CABECERA_TRAZA, traceId);
    respuesta.status(traducido.estado).json(cuerpo);
  }

  private traducir(excepcion: unknown): Traducido {
    if (excepcion instanceof ExcepcionQ360) {
      return {
        estado: excepcion.getStatus(),
        codigo: excepcion.codigo,
        mensaje: MENSAJES[excepcion.codigo] === undefined ? excepcion.message : this.mensajeDe(excepcion),
        detalles: excepcion.detalles,
        motivo: excepcion.motivo ?? null,
      };
    }

    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      const cuerpo = excepcion.getResponse();
      if (esCuerpoComun(cuerpo)) {
        return {
          estado,
          codigo: cuerpo.codigo as CodigoError,
          mensaje: cuerpo.mensaje as string,
          detalles: Array.isArray(cuerpo.detalles) ? cuerpo.detalles : [],
          motivo: null,
        };
      }
      const codigo = codigoPorEstado(estado);
      return { estado, codigo, mensaje: MENSAJES[codigo], detalles: [], motivo: this.motivoDe(cuerpo) };
    }

    return {
      estado: 500,
      codigo: 'ERROR_INTERNO',
      mensaje: MENSAJES.ERROR_INTERNO,
      detalles: [],
      motivo: excepcion instanceof Error ? excepcion.message : 'excepción desconocida',
    };
  }

  private mensajeDe(excepcion: ExcepcionQ360): string {
    const cuerpo = excepcion.getResponse();
    if (typeof cuerpo === 'object' && cuerpo !== null) {
      const mensaje = (cuerpo as { mensaje?: unknown }).mensaje;
      if (typeof mensaje === 'string') return mensaje;
    }
    return MENSAJES[excepcion.codigo];
  }

  private motivoDe(cuerpo: unknown): string | null {
    if (typeof cuerpo === 'string') return cuerpo;
    if (typeof cuerpo === 'object' && cuerpo !== null) {
      const mensaje = (cuerpo as { message?: unknown }).message;
      if (typeof mensaje === 'string') return mensaje;
      if (Array.isArray(mensaje)) return mensaje.join('; ');
    }
    return null;
  }
}
