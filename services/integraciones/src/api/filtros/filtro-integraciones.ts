/**
 * Traduce los errores propios de E5 al formato común de `comun.v1.yaml`. El filtro global de `auth-nest` no los
 * conoce (y `ErrorArchivo` agrega `ejecucionId` y `columnasFaltantes`), así que se aplica a nivel de controlador, que
 * tiene prioridad sobre el global. Los mensajes son los fijos del catálogo: nunca el texto de Jira, un token ni una URL.
 */
import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { CABECERA_TRAZA, MENSAJES, obtenerTraceId, type CodigoError, type RespuestaHttp, type SolicitudAutenticada } from '@quality360/auth-nest';

import {
  AsignacionesInvalidas,
  ConsultaAbierta,
  ConsultaAbiertaDuplicada,
  ConsultaNoEncontrada,
  ErrorDeConsulta,
  FilaEnCurso,
  FilaModificada,
  FilaRechazadaUnica,
  HduYaAsignada,
  SinSeleccion,
  type FilaRechazadaDto,
} from '../../dominio/consulta/errores.js';
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
  ErrorDeConsulta,
  ConsultaNoEncontrada,
  ConsultaAbierta,
  ConsultaAbiertaDuplicada,
  SinSeleccion,
  AsignacionesInvalidas,
  FilaRechazadaUnica,
  HduYaAsignada,
  FilaModificada,
  FilaEnCurso,
)
export class FiltroErroresIntegraciones implements ExceptionFilter {
  private readonly registro = new Logger('ErroresQ360');

  catch(error: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const solicitud = contexto.getRequest<SolicitudAutenticada>();
    const respuesta = contexto.getResponse<RespuestaHttp>();
    const traceId = obtenerTraceId(solicitud);

    let estado = 500;
    // `string` y no `CodigoError`: HDU_YA_ASIGNADA, FILA_MODIFICADA y FILA_EN_CURSO (comun.v1.yaml) aún no están en el
    // catálogo de `@quality360/auth-nest`; sus mensajes viven aquí (MENSAJES_DETALLE) hasta que el catálogo común los sume.
    let codigo: string = 'ERROR_INTERNO';
    let mensaje: string = MENSAJES.ERROR_INTERNO;
    let detalles: Array<{ campo: string; codigo: string; mensaje: string }> = [];
    let extra: Record<string, unknown> = {};
    let mensajeDirecto: string | null = null;

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
    } else if (error instanceof ErrorDeConsulta) {
      [estado, codigo] = [error.codigo === 'CONSULTA_VENCIDA' ? 410 : 409, error.codigo];
      extra = { consultaId: error.consulta.id, estado: error.consulta.estado, version: error.consulta.version, cerradaPor: error.consulta.cerradaPor };
    } else if (error instanceof ConsultaNoEncontrada) {
      [estado, codigo] = [404, 'CONSULTA_NO_ENCONTRADA'];
    } else if (error instanceof ConsultaAbierta) {
      [estado, codigo] = [409, 'CONSULTA_ABIERTA'];
      extra = { consultaId: error.consultaId, creadaPor: error.creadaPor, creadaEn: error.creadaEn, asignadas: error.asignadas };
    } else if (error instanceof ConsultaAbiertaDuplicada) {
      [estado, codigo] = [409, 'CONSULTA_ABIERTA'];
    } else if (error instanceof SinSeleccion) {
      [estado, codigo] = [422, 'SIN_SELECCION'];
    } else if (error instanceof AsignacionesInvalidas) {
      [estado, codigo] = [409, 'ASIGNACIONES_INVALIDAS'];
      extra = { filas: error.filas.map(filaRechazada), version: error.version };
    } else if (error instanceof FilaRechazadaUnica) {
      [estado, codigo] = [422, error.fila.motivo];
      detalles = detallesDeRechazo(error.fila);
      if (error.yaAsignada !== undefined) {
        mensajeDirecto = mensajeYaAsignada(error.yaAsignada.datos);
        extra = { yaAsignada: error.yaAsignada.datos, item: error.yaAsignada.item };
      }
    } else if (error instanceof HduYaAsignada) {
      [estado, codigo] = [409, 'HDU_YA_ASIGNADA'];
      mensajeDirecto = mensajeYaAsignada(error.yaAsignada);
      extra = { yaAsignada: error.yaAsignada, item: error.item };
    } else if (error instanceof FilaModificada) {
      [estado, codigo] = [409, 'FILA_MODIFICADA'];
      extra = { item: error.item };
    } else if (error instanceof FilaEnCurso) {
      [estado, codigo] = [409, 'FILA_EN_CURSO'];
    } else if (error instanceof OrganizacionNoDisponible || error instanceof OrganizacionDenego) {
      // Organización cayó o negó el recurso antes de empezar: 503 sin ejecución (D126). El detalle va solo al registro.
      [estado, codigo] = [503, 'SERVICIO_NO_DISPONIBLE'];
      this.registro.error(`SERVICIO_NO_DISPONIBLE · ${error.motivo} · traceId=${traceId}`);
    }
    if (mensajeDirecto !== null) mensaje = mensajeDirecto;
    else if (!(error instanceof ErrorEstructuraArchivo && error.codigo === 'COLUMNAS_FALTANTES')) mensaje = mensajeDe(codigo);

    this.registro.warn(`${codigo} ${estado} · traceId=${traceId}`);
    if (respuesta.headersSent === true) return;
    respuesta.setHeader?.(CABECERA_TRAZA, traceId);
    respuesta.status(estado).json({ codigo, mensaje, traceId, detalles, ...extra });
  }
}

/** Mensajes de los códigos de D202 y D204 (`comun.v1.yaml`). `HDU_YA_ASIGNADA` se arma con los nombres actuales. */
const MENSAJES_DETALLE: Record<string, string> = {
  HDU_YA_ASIGNADA: 'Esta HDU ya fue asignada.',
  FILA_MODIFICADA: 'Otra persona modificó esta HDU. Revisa los datos actuales y confirma de nuevo.',
  FILA_EN_CURSO: 'Otra persona está confirmando esta HDU ahora. Espera unos segundos y revisa.',
};

function mensajeDe(codigo: string): string {
  return MENSAJES_DETALLE[codigo] ?? MENSAJES[codigo as CodigoError] ?? MENSAJES.ERROR_INTERNO;
}

function mensajeYaAsignada(ya: { qe: string; analista: string | null }): string {
  return `Esta HDU ya fue asignada a ${ya.qe} / ${ya.analista ?? 'sin Analista'}`;
}

/** `FilaRechazada` del contrato: sin `faltantes` si el motivo no es `ASIGNACION_INCOMPLETA`. */
function filaRechazada(fila: FilaRechazadaDto) {
  return { itemId: fila.itemId, codigo: fila.codigo, campo: fila.campo, motivo: fila.motivo, ...(fila.faltantes === undefined ? {} : { faltantes: fila.faltantes }) };
}

/** Detalle del 422 de una sola fila: el campo de la asignación (o `itemId`); con `ASIGNACION_INCOMPLETA`, uno por campo faltante. */
function detallesDeRechazo(fila: FilaRechazadaDto): Array<{ campo: string; codigo: string; mensaje: string }> {
  if (fila.motivo === 'ASIGNACION_INCOMPLETA') {
    return (fila.faltantes ?? []).map((campo) => ({ campo, codigo: 'REQUERIDO', mensaje: 'Es obligatorio.' }));
  }
  return [{ campo: fila.campo ?? 'itemId', codigo: 'NO_PERMITIDO', mensaje: mensajeDe(fila.motivo) }];
}
