/**
 * Validación de los cuerpos de OAuth (E5-B08): 400 `VALIDACION` con el campo y el código, nunca el valor recibido (el
 * `code` y el `state` son secretos). Esta validación corre antes de cualquier llamada saliente.
 */
import { Acumulador, objeto } from './comunes.js';

export interface EntradaRetornoOauth {
  readonly state: string;
  /** Exactamente uno de `code` y `error`. */
  readonly code?: string;
  readonly error?: string;
}

const CODE = /^[\x21-\x7E]+$/;
const ERROR = /^[a-z_]+$/;

/** `POST /v1/integraciones/jira/oauth/retorno`: `state` y exactamente uno de `code` y `error`. */
export function leerRetornoOauth(cuerpo: unknown): EntradaRetornoOauth {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['state', 'code', 'error']);

  let state = '';
  if (datos.state === undefined || datos.state === null) a.falla('state', 'REQUERIDO', 'Es obligatorio.');
  else if (typeof datos.state !== 'string' || datos.state.length < 1 || datos.state.length > 128) a.falla('state', 'LONGITUD_INVALIDA', 'Debe tener de 1 a 128 caracteres.');
  else state = datos.state;

  const traeCode = datos.code !== undefined && datos.code !== null;
  const traeError = datos.error !== undefined && datos.error !== null;
  let code: string | undefined;
  let error: string | undefined;
  if (traeCode === traeError) {
    a.falla(traeCode ? 'error' : 'code', traeCode ? 'NO_PERMITIDO' : 'REQUERIDO', 'Envía exactamente uno de code y error.');
  } else if (traeCode) {
    if (typeof datos.code !== 'string' || datos.code.length < 1 || datos.code.length > 4096 || !CODE.test(datos.code)) a.falla('code', 'FORMATO_INVALIDO', 'No tiene el formato esperado.');
    else code = datos.code;
  } else if (typeof datos.error !== 'string' || datos.error.length < 1 || datos.error.length > 64 || !ERROR.test(datos.error)) {
    a.falla('error', 'FORMATO_INVALIDO', 'No tiene el formato esperado.');
  } else {
    error = datos.error;
  }
  a.lanzarSiHay();
  return { state, ...(code === undefined ? {} : { code }), ...(error === undefined ? {} : { error }) };
}

/** `POST /v1/integraciones/jira/oauth/sitio`. */
export function leerSitioOauth(cuerpo: unknown): { sitioId: string } {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['sitioId']);
  const sitioId = a.uuid(datos, 'sitioId');
  a.lanzarSiHay();
  return { sitioId };
}
