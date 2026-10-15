/**
 * Lectura mínima del payload de un JWT, sin librerías. NO verifica la firma: el token ya viene de Supabase y
 * solo se mira QUÉ método autenticó la sesión (claim `amr`); quien valida de verdad es el gateway.
 */

/** Decodifica el payload (base64url, con o sin relleno, UTF-8). Devuelve `null` si no es un JWT legible. */
export function decodificarPayloadJwt(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3 || !partes[1]) return null;
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const relleno = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(relleno), (caracter) => caracter.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Métodos que autenticaron la sesión (`amr[].method`): `password`, `otp`, `oauth`… Vacío si no hay claim legible. */
export function metodosDeAutenticacion(token: string): string[] {
  const amr = decodificarPayloadJwt(token)?.amr;
  if (!Array.isArray(amr)) return [];
  return amr.flatMap((entrada: unknown) => {
    const metodo = typeof entrada === "object" && entrada !== null ? (entrada as { method?: unknown }).method : undefined;
    return typeof metodo === "string" ? [metodo] : [];
  });
}

/**
 * Verdadero si la sesión se obtuvo con contraseña. Una sesión del enlace de recuperación (método `otp`)
 * no cuenta: solo sirve para cambiar la contraseña, no para entrar al portal.
 */
export function autenticadoConContrasena(token: string): boolean {
  return metodosDeAutenticacion(token).includes("password");
}
