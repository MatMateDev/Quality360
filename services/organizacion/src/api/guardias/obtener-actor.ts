import { ACTOR_SERVICIO } from '../../aplicacion/actores.js';
import type { UsuariosAplicacion } from '../../aplicacion/usuarios.servicio.js';
import { errorInterno } from '@quality360/auth-nest';
import type { Actor } from '../../dominio/tipos.js';
import type { SolicitudConActor } from './sesion-o-servicio.guard.js';

/** Actor auditado de una solicitud autenticada por sesión o por credencial de servicio. */
export async function actorDeSolicitud(solicitud: SolicitudConActor, usuarios: UsuariosAplicacion): Promise<Actor> {
  if (solicitud.actorServicio === true) return ACTOR_SERVICIO;
  if (solicitud.acceso === undefined) throw errorInterno('solicitud sin acceso resuelto');
  return usuarios.actorDesde(solicitud.acceso.usuarioId);
}
