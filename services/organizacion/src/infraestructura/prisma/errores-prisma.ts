import { Prisma } from '@prisma/client';

/** `true` si `error` es una violación de unicidad (`P2002`) del constraint/índice dado. */
export function esErrorUnicidad(error: unknown, nombreConstraint?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (nombreConstraint === undefined) return true;
  const destino = error.meta?.target;
  if (typeof destino === 'string') return destino.includes(nombreConstraint);
  if (Array.isArray(destino)) return destino.some((valor) => String(valor).includes(nombreConstraint));
  return true;
}
