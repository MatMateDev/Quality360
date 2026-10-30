/**
 * Validación del sitio de Jira (D95, protección SSRF). El servicio llama a una dirección que
 * escribe un usuario: solo `https://<subdominio>.atlassian.net`, sin ruta, puerto ni credenciales.
 * Con la bandera de pruebas también `http://127.0.0.1:<puerto>`; la bandera se IGNORA en producción.
 */
const PATRON_ATLASSIAN = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/;
const PATRON_PRUEBA = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/;

export type ResultadoSitio = { ok: true; sitio: string } | { ok: false };

export function validarSitio(valor: unknown, opciones: { permitirHostPrueba: boolean }): ResultadoSitio {
  if (typeof valor !== 'string') return { ok: false };
  const sitio = valor.trim();
  if (PATRON_ATLASSIAN.test(sitio)) return { ok: true, sitio };
  if (opciones.permitirHostPrueba) {
    const m = PATRON_PRUEBA.exec(sitio);
    if (m && Number(m[1]) <= 65535) return { ok: true, sitio };
  }
  return { ok: false };
}

/** `INTEGRACIONES_PERMITIR_HOST_PRUEBA=true` solo cuenta fuera de producción (D95). */
export function permitirHostPruebaEfectivo(entorno: { NODE_ENV?: string; INTEGRACIONES_PERMITIR_HOST_PRUEBA?: string }): boolean {
  return entorno.NODE_ENV !== 'production' && entorno.INTEGRACIONES_PERMITIR_HOST_PRUEBA === 'true';
}
