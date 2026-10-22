import type { Rol } from "@/types/dominio";

/**
 * D56: último rol que `GET /v1/me` devolvió para este usuario en esta pestaña. Es solo una pista de
 * experiencia (decidir entre «tu rol cambió» y «acceso denegado»): nunca autoriza nada, la autorización
 * es del backend y el rol vigente sale siempre de `/v1/me` (D4).
 */
const CLAVE = "q360.rol-conocido";

interface RolConocido {
  id: string;
  rol: Rol;
}

function almacen(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function leerRolConocido(id: string): Rol | null {
  try {
    const bruto = almacen()?.getItem(CLAVE);
    if (!bruto) return null;
    const dato = JSON.parse(bruto) as Partial<RolConocido>;
    return dato.id === id && typeof dato.rol === "string" ? (dato.rol as Rol) : null;
  } catch {
    return null;
  }
}

export function guardarRolConocido(id: string, rol: Rol): void {
  try {
    almacen()?.setItem(CLAVE, JSON.stringify({ id, rol }));
  } catch {
    // Sin almacenamiento: se pierde solo la pista, no el acceso.
  }
}

export function olvidarRolConocido(): void {
  try {
    almacen()?.removeItem(CLAVE);
  } catch {
    // Nada que olvidar.
  }
}
