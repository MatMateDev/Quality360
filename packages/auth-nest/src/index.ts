/**
 * `@quality360/auth-nest`
 *
 * Identidad y autorización para los servicios NestJS de Quality360.
 * Sin lógica de negocio: el rol vigente, el estado activo y el ámbito los
 * entrega Organización a través de `ResolutorDeAcceso` (D4).
 */
import 'reflect-metadata';

export { AccesoGuard } from './acceso.guard.js';
export { AuthNestModule } from './auth-nest.module.js';
export type { OpcionesAuthNest, OpcionesAuthNestAsync, ProveedorResolutor } from './auth-nest.module.js';
export {
  AccesoActual,
  CLAVE_PUBLICO,
  CLAVE_ROLES,
  IdentidadActual,
  Publico,
  Roles,
  esPublico,
  rolesPermitidos,
} from './decoradores.js';
export {
  ExcepcionQ360,
  MENSAJES,
  accesoDenegado,
  capacidadNoDisponible,
  codigoPorEstado,
  demasiadasSolicitudes,
  errorInterno,
  errorValidacion,
  esCodigoError,
  noAutenticado,
  noEncontrado,
  sesionExpirada,
  servicioNoDisponible,
} from './errores.js';
export type { CodigoDetalle, CodigoError, CuerpoError, DetalleError, OpcionesExcepcion } from './errores.js';
export { FiltroErroresQ360 } from './filtro-errores.js';
export { IdentidadGuard, extraerTokenBearer } from './identidad.guard.js';
export { OPCIONES_RESOLUTOR_REMOTO, ResolutorDeAccesoRemoto } from './resolutor-remoto.js';
export type { OpcionesResolutorRemoto } from './resolutor-remoto.js';
export { RESOLUTOR_DE_ACCESO, ROLES, esRol } from './tipos.js';
export type {
  AmbitoAcceso,
  ContextoAcceso,
  Identidad,
  ResolucionAcceso,
  ResolutorDeAcceso,
  RespuestaHttp,
  Rol,
  SolicitudAutenticada,
} from './tipos.js';
export { CABECERA_TRAZA, generarTraceId, middlewareTraza, normalizarTraceId, obtenerTraceId } from './traza.js';
export {
  ALGORITMOS_ASIMETRICOS,
  ALGORITMO_SIMETRICO,
  OPCIONES_VERIFICADOR,
  VerificadorTokenSupabase,
  opcionesDesdeEntorno,
  resolverOpcionesVerificador,
} from './verificador-token.js';
export type { OpcionesVerificador, OpcionesVerificadorParciales } from './verificador-token.js';
