/**
 * Cliente HTTP hacia los servicios internos.
 *
 * Las cabeceras salientes se arman con una lista blanca: nada que venga del
 * navegador se copia tal cual. En particular, `X-Q360-Servicio-Token` jamás
 * sale del gateway (esa credencial es solo de Integraciones → Organización).
 */
import { CABECERA_TRAZA } from '@quality360/auth-nest';

export interface PeticionServicio {
  /** Base del servicio, por ejemplo `http://localhost:3001`. */
  base: string;
  /** Ruta ya construida y codificada, por ejemplo `/v1/usuarios/<uuid>`. */
  ruta: string;
  metodo: string;
  /** Access token del usuario, que se propaga tal cual. */
  token: string;
  traceId: string;
  /** Query string sin `?`. */
  consulta?: string | undefined;
  /** Cuerpo ya serializado en JSON. */
  cuerpo?: string | undefined;
  tiempoLimiteMs: number;
}

export interface RespuestaServicio {
  estado: number;
  /** Cuerpo interpretado como JSON, o `undefined` si no era JSON. */
  json: unknown;
  texto: string;
  tipoContenido: string | null;
  ubicacion: string | null;
}

export type ResultadoServicio =
  | { tipo: 'respuesta'; respuesta: RespuestaServicio }
  | { tipo: 'fallo'; motivo: string };

/** Nunca lanza: un fallo de red o un tiempo agotado se devuelven como `fallo`. */
export async function solicitarServicio(peticion: PeticionServicio): Promise<ResultadoServicio> {
  const url = new URL(peticion.ruta, `${peticion.base}/`);
  if (peticion.consulta !== undefined && peticion.consulta.length > 0) url.search = peticion.consulta;

  const cabeceras: Record<string, string> = {
    authorization: `Bearer ${peticion.token}`,
    accept: 'application/json',
    [CABECERA_TRAZA]: peticion.traceId,
  };
  if (peticion.cuerpo !== undefined) cabeceras['content-type'] = 'application/json';

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: peticion.metodo,
      headers: cabeceras,
      body: peticion.cuerpo,
      redirect: 'error',
      signal: AbortSignal.timeout(peticion.tiempoLimiteMs),
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'desconocido';
    const agotado = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { tipo: 'fallo', motivo: agotado ? `tiempo agotado tras ${peticion.tiempoLimiteMs} ms` : detalle };
  }

  let texto: string;
  try {
    texto = await respuesta.text();
  } catch (error) {
    return { tipo: 'fallo', motivo: error instanceof Error ? error.message : 'cuerpo ilegible' };
  }

  const tipoContenido = respuesta.headers.get('content-type');
  let json: unknown;
  if (texto.length > 0 && tipoContenido !== null && tipoContenido.includes('application/json')) {
    try {
      json = JSON.parse(texto);
    } catch {
      json = undefined;
    }
  }

  return {
    tipo: 'respuesta',
    respuesta: {
      estado: respuesta.status,
      json,
      texto,
      tipoContenido,
      ubicacion: respuesta.headers.get('location'),
    },
  };
}
