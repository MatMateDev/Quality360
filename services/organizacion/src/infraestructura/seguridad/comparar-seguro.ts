import { timingSafeEqual } from 'node:crypto';

/** Compara dos cadenas en tiempo constante (evita medir la credencial por temporización). */
export function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
