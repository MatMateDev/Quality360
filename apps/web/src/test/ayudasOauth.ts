import { vi } from "vitest";
import { capturarRetornoOauth } from "@/lib/capturaRetornoOauth";
import { navegador } from "@/lib/navegacion";
import { RUTA_RETORNO_OAUTH } from "@/lib/rutasIntegraciones";
import { OAUTH_MOCK } from "@/mocks/dataE5";

export const ADMIN = "admin@quality360.local";
export const QE = "jose.seguel@quality360.local";

/** Simula que el navegador llegó a la ruta de retorno con esa query y que el módulo de captura la leyó y la limpió. */
export function capturarEnTest(search: string) {
  const reemplazos: Array<{ url: string | URL | null | undefined }> = [];
  const historial = { state: { idx: 3 }, replaceState: (_estado: unknown, _titulo: string, url?: string | URL | null) => reemplazos.push({ url }) };
  capturarRetornoOauth({ pathname: RUTA_RETORNO_OAUTH, search, hash: "" }, historial);
  return reemplazos;
}

/** Atlassian devuelve con `code` y `state`. */
export const RETORNO_CON_CODIGO = `?code=${OAUTH_MOCK.codigo}&state=${OAUTH_MOCK.state}`;
/** El Administrador rechaza el consentimiento: Atlassian manda `error`, `error_description` y `state`. */
export const RETORNO_RECHAZADO = `?error=access_denied&error_description=User+denied+access&state=${OAUTH_MOCK.state}`;

/** Sustituye la salida a Atlassian (`location.assign`) para observarla sin navegar. */
export function espiarNavegacion() {
  return vi.spyOn(navegador, "ir").mockImplementation(() => undefined);
}
