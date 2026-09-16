import type { Actor, Usuario } from '../dominio/tipos.js';

/** Actor de la carga semilla y de las llamadas con `credencialServicio` (ADR 0007). */
export const ACTOR_SERVICIO: Actor = { tipo: 'SERVICIO', id: 'integraciones', nombre: 'integraciones' };

export function actorDeUsuario(usuario: Pick<Usuario, 'id' | 'nombre'>): Actor {
  return { tipo: 'USUARIO', id: usuario.id, nombre: usuario.nombre };
}
