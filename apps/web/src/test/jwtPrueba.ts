/** Utilidades de prueba: arman JWT sin firma real (solo importa el payload) sin depender de Buffer. */

/** Base64 (alfabeto estándar, con relleno) de un texto UTF-8. */
export function base64Estandar(texto: string): string {
  let binario = "";
  new TextEncoder().encode(texto).forEach((byte) => {
    binario += String.fromCharCode(byte);
  });
  return btoa(binario);
}

/** Base64url sin relleno, como va en un JWT. */
export function base64Url(texto: string): string {
  return base64Estandar(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function crearJwtConPayload(payload: unknown): string {
  return `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(JSON.stringify(payload))}.firma`;
}
