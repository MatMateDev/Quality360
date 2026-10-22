import type { DecisionCambioRol, RelacionesUsuario } from '../reglas/rol-celulas.js';
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
  /** Células iniciales de un Líder QA (D42); se abren en la misma transacción. */
  readonly celulaIds?: readonly string[];
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

/** Lo que el repositorio lee, ya con la fila del usuario bloqueada, para decidir un cambio de rol (D42). */
export interface InstantaneaCambioRol {
  readonly usuario: Usuario;
  readonly administradoresActivos: number;
  readonly relaciones: RelacionesUsuario;
}

export type ResultadoCambioRol =
  | { readonly tipo: 'APLICADO'; readonly usuario: Usuario }
  | { readonly tipo: 'SIN_CAMBIO'; readonly usuario: Usuario }
  | { readonly tipo: 'RECHAZADO'; readonly decision: Exclude<DecisionCambioRol, { tipo: 'CAMBIAR' | 'SIN_CAMBIO' }> };

/** Token de inyección del repositorio de usuarios. */
export const USUARIO_REPOSITORIO = Symbol('USUARIO_REPOSITORIO');

export interface UsuarioRepositorio {
  buscarPorId(id: string): Promise<Usuario | null>;
  buscarPorCorreo(correo: string): Promise<Usuario | null>;
  listar(filtro: FiltroUsuarios, paginacion: OpcionesPaginacion): Promise<Pagina<Usuario>>;
  listarResumenPorIds(ids: readonly string[]): Promise<UsuarioResumen[]>;
  listarAnalistasActivos(): Promise<UsuarioResumen[]>;
  contarAdministradoresActivos(): Promise<number>;
  /** Usuarios activos por rol (los 5 roles vienen siempre). */
  contarActivosPorRol(): Promise<Record<Rol, number>>;

  /** Crea el registro y audita `CREAR_USUARIO` (y `ASIGNAR_CELULAS_LIDER` si trae células) en la misma transacción. */
  crear(datos: DatosNuevoUsuario, actor: Actor): Promise<Usuario>;
  /** Actualiza datos/estado y audita (`ACTUALIZAR_USUARIO`, `ACTIVAR_USUARIO` o `DESACTIVAR_USUARIO`). */
  actualizar(id: string, cambios: CambiosUsuario, actor: Actor): Promise<Usuario>;

  /**
   * Cambio de rol atómico (D42): bloquea la fila del usuario (`SELECT … FOR UPDATE`),
   * lee sus relaciones, deja que `decidir` resuelva (último administrador, relaciones
   * incompatibles) y, si procede, cambia el rol, fija las células del Líder y audita
   * `CAMBIAR_ROL` y `ASIGNAR_CELULAS_LIDER`. O se aplica todo o no se aplica nada.
   */
  cambiarRolAtomico(input: {
    id: string;
    rolNuevo: Rol;
    /** `undefined` = no tocar las células; con `LIDER_QA`, el conjunto que debe quedar vigente. */
    celulaIds: readonly string[] | undefined;
    actor: Actor;
    decidir: (instantanea: InstantaneaCambioRol) => DecisionCambioRol;
  }): Promise<ResultadoCambioRol>;

  resumenAdmin(): Promise<ResumenUsuariosAdmin>;
}
