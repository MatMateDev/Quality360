/**
 * Vistas de respuesta (comun.v1.yaml): `Ejecucion`, `FilaEjecucion`, `EventoConfiguracionJira`. Convierten lo
 * guardado en lo que el contrato publica. Los mensajes y las sugerencias salen de las tablas fijas del servicio.
 */
import { sugerenciasDe } from '../dominio/catalogos.js';
import type { ConexionOauth } from '../dominio/oauth/conexion.js';
import { marcarActual } from '../dominio/oauth/sitios.js';
import type { Ejecucion, EventoConfiguracion, FilaDetalle, SugerenciaIntegracion } from '../dominio/tipos.js';

export function vistaEjecucion(e: Ejecucion) {
  const sugerencias: SugerenciaIntegracion[] = e.codigoError === null ? [] : sugerenciasDe(e.codigoError, e.origen, e.continuarDesde !== null, e.fase);
  return {
    id: e.id,
    origen: e.origen,
    resultado: e.resultado,
    actor: { id: e.actor.id, nombre: e.actor.nombre, rol: e.actor.rol },
    iniciadaEn: e.iniciadaEn,
    terminadaEn: e.terminadaEn,
    duracionMs: e.duracionMs,
    estricto: e.estricto,
    vincularExistentes: e.vincularExistentes,
    leidas: e.leidas,
    creadas: e.creadas,
    actualizadas: e.actualizadas,
    omitidas: e.omitidas,
    conError: e.conError,
    conAdvertencias: e.conAdvertencias,
    reintentos429: e.reintentos429,
    eventos: e.eventos.map((evento) => ({ tipo: evento.tipo, esperaMs: evento.esperaMs, fecha: evento.fecha })),
    codigoError: e.codigoError,
    mensajeError: e.mensajeError,
    sugerencias,
    proyecto: e.proyecto,
    sitioHost: e.sitioHost,
    archivo: e.archivo,
    hayMas: e.hayMas,
    continuarDesde: e.continuarDesde,
    fase: e.fase,
    alcance: e.alcance,
    consultaId: e.consultaId,
    nuevas: e.nuevas,
    cambiaron: e.cambiaron,
    sinCambios: e.sinCambios,
  };
}

export type VistaEjecucion = ReturnType<typeof vistaEjecucion>;

/** `ocultarContenido`: filas con error del QE, sin título ni referencia de Jira (D106, D126). */
export function vistaFila(fila: FilaDetalle, ocultarContenido: boolean) {
  return {
    fila: fila.fila,
    codigo: fila.codigo,
    titulo: ocultarContenido ? null : fila.titulo,
    idHistoria: fila.idHistoria,
    resultado: fila.resultado,
    motivo: fila.motivo,
    advertencias: fila.advertencias,
    cambios: fila.cambios,
    referencia: ocultarContenido ? null : fila.referencia,
    asignacion: fila.asignacion,
  };
}

export function vistaEvento(e: EventoConfiguracion) {
  return {
    id: e.id,
    fecha: e.fecha,
    tipo: e.tipo,
    actor: { id: e.actor.id, nombre: e.actor.nombre },
    camposCambiados: e.camposCambiados,
    tokenCambiado: e.tokenCambiado,
    resultadoPrueba: e.resultadoPrueba,
    oauth: e.oauth === null ? null : { cuenta: e.oauth.cuenta, sitio: e.oauth.sitio },
  };
}

/**
 * `ConexionOauthJira` del contrato (D215): lo único que se informa de la conexión. Nunca los tokens, su cifrado ni su
 * vencimiento exacto. `urlSitioActual` (el de la configuración guardada) marca el candidato `actual`, sin elegirlo.
 */
export function vistaConexionOauth(c: ConexionOauth, descifrable: boolean, urlSitioActual: string | null) {
  return {
    estado: c.estado,
    descifrable,
    cuenta: c.cuentaNombre === null ? null : { nombre: c.cuentaNombre },
    sitio: c.sitio === null ? null : { id: c.sitio.id, nombre: c.sitio.nombre, url: c.sitio.url },
    sitiosCandidatos: c.candidatos === null ? null : marcarActual(c.candidatos, urlSitioActual),
    permisos: c.permisos,
    conectadoEn: c.conectadoEn,
    conectadoPor: { id: c.conectadoPor.id, nombre: c.conectadoPor.nombre },
    renovadoEn: c.renovadoEn,
  };
}

export type VistaConexionOauth = ReturnType<typeof vistaConexionOauth>;
