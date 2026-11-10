/**
 * Base de datos de las pruebas de Indicadores. Corren contra el Postgres local real con el rol `svc_indicadores`.
 * La limpieza entre pruebas usa al dueño de la base (como E4 y E5): `svc_indicadores` no puede borrar ni vaciar y las
 * pruebas nunca limpian por la API (D184).
 */
import './entorno.js';

import { PrismaClient } from '#prisma';

/** Superusuario del Supabase local, solo para limpiar entre pruebas. */
const duenio = new PrismaClient({ datasourceUrl: 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres?schema=indicadores' });
/** Con el rol del servicio, para comprobar privilegios y restricciones. */
export const prismaServicio = new PrismaClient();

export async function limpiarIndicadores(): Promise<void> {
  await duenio.$executeRawUnsafe(
    'TRUNCATE TABLE indicadores.snapshot_indicadores, indicadores.ejecucion_snapshot, indicadores.evento_umbral_carga, indicadores.umbral_carga',
  );
}

export async function consultaDuenio<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await duenio.$queryRawUnsafe(sql)) as T[];
}

export async function ejecutarDuenio(sql: string): Promise<void> {
  await duenio.$executeRawUnsafe(sql);
}

export async function cerrarBases(): Promise<void> {
  await duenio.$disconnect();
  await prismaServicio.$disconnect();
}
