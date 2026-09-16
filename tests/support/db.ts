import pg from "pg";
import { env } from "./env";

/**
 * Acceso directo a Postgres con el mismo rol de servicio que usa cada
 * backend (`svc_organizacion`, `svc_certificaciones`, `svc_impedimentos`),
 * cada uno restringido a su propio esquema (regla no negociable #1). Se usa
 * solo para:
 *
 * 1. Preparar/restaurar, sin pasar por HTTP, el estado imposible de lograr
 *    de otro modo sin arriesgar la sesión de un usuario de la semilla
 *    (E1-B08#2: reducir a un único administrador activo).
 * 2. Verificar el aislamiento de esquemas (un rol de servicio no puede leer
 *    el esquema de otro).
 */
export async function conConexion<T>(databaseUrl: string, fn: (cliente: pg.Client) => Promise<T>): Promise<T> {
  if (!databaseUrl) throw new Error("Falta la DATABASE_URL para conectar a Postgres.");
  const cliente = new pg.Client({ connectionString: databaseUrl });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

export const conOrganizacion = <T>(fn: (cliente: pg.Client) => Promise<T>) => conConexion(env.databaseUrlOrganizacion, fn);
export const conCertificaciones = <T>(fn: (cliente: pg.Client) => Promise<T>) => conConexion(env.databaseUrlCertificaciones, fn);
export const conImpedimentos = <T>(fn: (cliente: pg.Client) => Promise<T>) => conConexion(env.databaseUrlImpedimentos, fn);
