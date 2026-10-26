/**
 * 409 `TRANSICION_INVALIDA` sobre un impedimento: el cuerpo agrega `estadoActual`, `operacion` y
 * `operacionesPermitidas` (`ErrorTransicionImpedimento` de comun.v1.yaml), que el filtro común de
 * `auth-nest` no emite. Se aplica a nivel de controlador, que tiene prioridad sobre el global.
 */
import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { CABECERA_TRAZA, MENSAJES, obtenerTraceId, type RespuestaHttp, type SolicitudAutenticada } from '@quality360/auth-nest';

import { ErrorTransicionImpedimento } from '../../dominio/errores.js';

@Catch(ErrorTransicionImpedimento)
export class FiltroTransicionImpedimento implements ExceptionFilter {
  private readonly registro = new Logger('ErroresQ360');

  catch(error: ErrorTransicionImpedimento, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const solicitud = contexto.getRequest<SolicitudAutenticada>();
    const respuesta = contexto.getResponse<RespuestaHttp>();
    const traceId = obtenerTraceId(solicitud);
    this.registro.warn(`TRANSICION_INVALIDA 409 · ${error.operacion} sobre ${error.estadoActual} · traceId=${traceId}`);
    respuesta.setHeader?.(CABECERA_TRAZA, traceId);
    respuesta.status(409).json({
      codigo: 'TRANSICION_INVALIDA',
      mensaje: error.message.length > 0 ? error.message : MENSAJES.TRANSICION_INVALIDA,
      traceId,
      detalles: [],
      estadoActual: error.estadoActual,
      operacion: error.operacion,
      operacionesPermitidas: error.operacionesPermitidas,
    });
  }
}
