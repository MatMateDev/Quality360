/**
 * Puerto hacia el proveedor de identidad (Supabase Auth Admin API). La
 * aplicación depende solo de esta interfaz; la implementación real
 * (`service_role`, solo en este servicio — D3) vive en infraestructura.
 */

export const PROVEEDOR_IDENTIDAD = Symbol('PROVEEDOR_IDENTIDAD');

/** 503 `PROVEEDOR_IDENTIDAD_NO_DISPONIBLE`: Supabase Auth no confirmó el cambio. */
export class ErrorProveedorIdentidad extends Error {
  constructor(mensaje: string, readonly causa?: unknown) {
    super(mensaje);
    this.name = 'ErrorProveedorIdentidad';
  }
}

export interface ProveedorIdentidad {
  /** Alta con invitación por correo (E1-B07#1, D3). Devuelve el `id` (sub) creado. */
  invitarUsuario(input: { correo: string; nombre: string }): Promise<{ id: string }>;
  /** Alta con contraseña inicial y correo confirmado, solo para la carga semilla. */
  crearUsuarioConContrasena(input: { correo: string; nombre: string; contrasena: string }): Promise<{ id: string }>;
  /**
   * Invita por correo; si la cuenta ya existe en Supabase Auth (semilla
   * cargada parcialmente antes, o cuenta creada por otra vía), la vincula en
   * vez de fallar. Solo para `/v1/interno/carga/usuarios`.
   */
  invitarOVincularUsuario(input: { correo: string; nombre: string }): Promise<{ id: string }>;
  /** Coordina el cambio de correo con el proveedor (E1-B07#2). */
  actualizarCorreo(id: string, correo: string): Promise<void>;
  /** Compensación: si el alta local falla tras crear la cuenta, se elimina. */
  eliminarUsuario(id: string): Promise<void>;
}
