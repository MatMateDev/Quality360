/**
 * Traduce los errores propios de E5 al formato común de `comun.v1.yaml`. El filtro global de `auth-nest` no los
 * conoce (y `ErrorArchivo` agrega `ejecucionId` y `columnasFaltantes`), así que se aplica a nivel de controlador, que
 * tiene prioridad sobre el global. Los mensajes son los fijos del catálogo: nunca el texto de Jira, un token ni una URL.
 */
import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { CABECERA_TRAZA, MENSAJES, obtenerTraceId, type CodigoError, type RespuestaHttp, type SolicitudAutenticada } from '@quality360/auth-nest';

import {
  DestinoInvalido,
  ErrorEstructuraArchivo,
  IntegracionEnCurso,
  JiraNoConfigurado,
  LlaveCifradoNoDisponible,
  OrganizacionDenego,
  OrganizacionNoDisponible,
  TokenNoDescifrable,
} from '../../dominio/errores.js';

@Catch(
  LlaveCifradoNoDisponible,
  TokenNoDescifrable,
  IntegracionEnCurso,
  JiraNoConfigurado,
  DestinoInvalido,
  ErrorEstructuraArchivo,
  OrganizacionNoDisponible,
  OrganizacionDenego,
)
export class FiltroErroresIntegraciones implements ExceptionFilter {
  private readonly registro = new Logger('ErroresQ360');

  catch(error: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const solicitud = contexto.getRequest<SolicitudAutenticada>();
    const respuesta = contexto.getResponse<RespuestaHttp>();
    const traceId = obtenerTraceId(solicitud);

    let estado = 500;
    let codigo: CodigoError = 'ERROR_INTERNO';
    let mensaje: string = MENSAJES.ERROR_INTERNO;
    let detalles: Array<{ campo: string; codigo: string; mensaje: string }> = [];
    let extra: Record<string, unknown> = {};

    if (error instanceof LlaveCifradoNoDisponible) {
      [estado, codigo] = [503, 'LLAVE_CIFRADO_NO_DISPONIBLE'];
    } else if (error instanceof TokenNoDescifrable) {
      [estado, codigo] = [409, 'TOKEN_NO_DESCIFRABLE'];
    } else if (error instanceof IntegracionEnCurso) {
      [estado, codigo] = [409, 'INTEGRACION_EN_CURSO'];
    } else if (error instanceof JiraNoConfigurado) {
      [estado, codigo] = [409, 'JIRA_NO_CONFIGURADO'];
    } else if (error instanceof DestinoInvalido) {
      [estado, codigo, detalles] = [422, error.codigo, error.detalles];
    } else if (error instanceof ErrorEstructuraArchivo) {
      estado = error.codigo === 'ARCHIVO_MUY_GRANDE' ? 413 : 422;
      codigo = error.codigo;
      if (error.codigo === 'COLUMNAS_FALTANTES') mensaje = `Faltan las columnas: ${error.columnasFaltantes.join(', ')}`;
      extra = { ejecucionId: error.ejecucionId, columnasFaltantes: error.columnasFaltantes };
    } else if (error instanceof OrganizacionNoDisponible || error instanceof OrganizacionDenego) {
      // Organización cayó o negó el recurso antes de empezar: 503 sin ejecución (D126). El detalle va solo al registro.
      [estado, codigo] = [503, 'SERVICIO_NO_DISPONIBLE'];
      this.registro.error(`SERVICIO_NO_DISPONIBLE · ${error.motivo} · traceId=${traceId}`);
    }
    if (!(error instanceof ErrorEstructuraArchivo && error.codigo === 'COLUMNAS_FALTANTES')) mensaje = MENSAJES[codigo];

    this.registro.warn(`${codigo} ${estado} · traceId=${traceId}`);
    if (respuesta.headersSent === true) return;
    respuesta.setHeader?.(CABECERA_TRAZA, traceId);
    respuesta.status(estado).json({ codigo, mensaje, traceId, detalles, ...extra });
  }
}
