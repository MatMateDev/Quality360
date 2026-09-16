import type { Actor, OpcionesPaginacion, Pagina, Rol, Usuario, UsuarioResumen } from '../tipos.js';

export interface FiltroUsuarios {
  readonly q?: string;
  readonly rol?: Rol;
  readonly activo?: boolean;
}

export interface DatosNuevoUsuario {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
  readonly activo: boolean;
}

export interface CambiosUsuario {
  readonly nombre?: string;
  readonly correo?: string;
  readonly activo?: boolean;
}

export interface ResumenUsuariosAdmin {
  readonly total: number;
  readonly activos: number;
  readonly inactivos: number;
  readonly porRol: Record<Rol, number>;
}

/** Token de inyección del repositorio de usuarios. */
export const USUARIO_REPOSITORIO = Symbol('USUARIO_REPOSITORIO');

export interface UsuarioRepositorio {
  buscarPorId(id: string): Promise<Usuario | null>;
  buscarPorCorreo(correo: string): Promise<Usuario | null>;
  listar(filtro: FiltroUsuarios, paginacion: OpcionesPaginacion): Promise<Pagina<Usuario>>;
  listarResumenPorIds(ids: readonly string[]): Promise<UsuarioResumen[]>;
  listarAnalistasActivos(): Promise<UsuarioResumen[]>;
  contarAdministradoresActivos(): Promise<number>;

  /** Crea el registro y audita `CREAR_USUARIO` en la misma transacción. */
  crear(datos: DatosNuevoUsuario, actor: Actor): Promise<Usuario>;
  /** Actualiza datos/estado y audita (`ACTUALIZAR_USUARIO`, `ACTIVAR_USUARIO` o `DESACTIVAR_USUARIO`). */
  actualizar(id: string, cambios: CambiosUsuario, actor: Actor): Promise<Usuario>;
  /** Cambia el rol y audita `CAMBIAR_ROL` en la misma transacción. */
  cambiarRol(id: string, rol: Rol, actor: Actor): Promise<Usuario>;

  resumenAdmin(): Promise<ResumenUsuariosAdmin>;
}
