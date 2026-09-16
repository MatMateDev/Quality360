import { createHmac } from "node:crypto";
import { env } from "./env";

function base64url(entrada: Buffer | string): string {
  return Buffer.from(entrada)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Firma un JWT HS256 con `SUPABASE_JWT_SECRET` (respaldo local de
 * `packages/auth-nest/src/verificador-token.ts`, ver D3). Solo para probar,
 * de caja blanca, la ruta de verificación de sesión (E1-B11); nunca sustituye
 * un login real.
 */
export function forjarTokenHs256(payload: Record<string, unknown>, secreto = env.supabaseJwtSecret): string {
  if (!secreto) throw new Error("Falta SUPABASE_JWT_SECRET para forjar el token de prueba.");
  const encabezado = { alg: "HS256", typ: "JWT" };
  const partes = [base64url(JSON.stringify(encabezado)), base64url(JSON.stringify(payload))];
  const firma = createHmac("sha256", secreto).update(partes.join(".")).digest();
  partes.push(base64url(firma));
  return partes.join(".");
}

/** Token HS256 válidamente firmado pero con `exp` vencido (E1-B11#1, E1-F07#3). */
export function tokenExpirado(userId: string, correo: string): string {
  const ahora = Math.floor(Date.now() / 1000);
  return forjarTokenHs256({
    iss: env.supabaseJwtIssuer,
    sub: userId,
    aud: "authenticated",
    exp: ahora - 3600,
    iat: ahora - 7200,
    email: correo,
    role: "authenticated",
    session_id: "sesion-forjada-prueba-vencida",
  });
}

/** Token con firma alterada (un carácter cambiado): nunca debe validarse. */
export function tokenAlterado(tokenValido: string): string {
  const partes = tokenValido.split(".");
  const ultima = partes[2] ?? "";
  const caracterCambiado = ultima.length > 0 && ultima[0] === "a" ? "b" : "a";
  partes[2] = caracterCambiado + ultima.slice(1);
  return partes.join(".");
}
