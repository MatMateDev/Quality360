/**
 * Auditoría de usuarios (E7-B04, D45): qué entradas la forman y qué campos se
 * muestran. Nunca contraseñas, tokens ni secretos (E1-B12#3).
 */
import type { AccionAuditoria, EntidadAuditoria } from '../tipos.js';

/** Entidades de la auditoría de usuarios (D45). */
export const ENTIDADES_AUDITORIA_USUARIOS: readonly EntidadAuditoria[] = ['USUARIO', 'SUPERVISION', 'EXPORTACION'];

/** `OperacionAuditoriaUsuarios` de comun.v1.yaml. */
export const OPERACIONES_AUDITORIA_USUARIOS: readonly AccionAuditoria[] = [
  'CREAR_USUARIO',
  'ACTUALIZAR_USUARIO',
  'ACTIVAR_USUARIO',
  'DESACTIVAR_USUARIO',
  'CAMBIAR_ROL',
  'ASIGNAR_SUPERVISOR',
  'CAMBIAR_SUPERVISOR',
  'ASIGNAR_CELULAS_LIDER',
  'EXPORTAR',
];

/** Campos de `antes`/`despues` que la API puede mostrar (lista blanca). */
export const CAMPOS_VISIBLES: readonly string[] = [
  'rol',
  'nombre',
  'correo',
  'activo',
  'supervisor',
  'qeId',
  'celulas',
  'recurso',
  'filtros',
  'filas',
];

const CLAVE_SENSIBLE = /password|token|secret/i;

function limpiarValor(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpiarValor);
  if (typeof valor === 'object' && valor !== null) {
    const limpio: Record<string, unknown> = {};
    for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
      if (CLAVE_SENSIBLE.test(clave)) continue;
      limpio[clave] = limpiarValor(contenido);
    }
    return limpio;
  }
  return valor;
}

/**
 * Deja solo los campos de la lista blanca y descarta, a cualquier profundidad,
 * las claves que contengan `password`, `token` o `secret` (E7-B04-T06).
 */
export function sanitizarCambios(cambios: Record<string, unknown> | null): Record<string, unknown> | null {
  if (cambios === null) return null;
  const visible: Record<string, unknown> = {};
  for (const campo of CAMPOS_VISIBLES) {
    if (Object.prototype.hasOwnProperty.call(cambios, campo)) visible[campo] = limpiarValor(cambios[campo]);
  }
  return visible;
}

export type RecursoExportacion = 'HDU' | 'AUDITORIA_USUARIOS' | 'BITACORA' | 'CERTIFICADOS' | 'IMPEDIMENTOS' | 'GESTION_IMPEDIMENTOS';
export const RECURSOS_EXPORTACION: readonly RecursoExportacion[] = [
  'HDU',
  'AUDITORIA_USUARIOS',
  'BITACORA',
  'CERTIFICADOS',
  'IMPEDIMENTOS',
  'GESTION_IMPEDIMENTOS',
];

/** Un rango con `hasta` anterior a `desde` es inválido (400). */
export function rangoValido(desde: Date | undefined, hasta: Date | undefined): boolean {
  return desde === undefined || hasta === undefined || hasta.getTime() >= desde.getTime();
}
