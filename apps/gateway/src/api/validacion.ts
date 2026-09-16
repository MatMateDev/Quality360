/**
 * Validación de los parámetros de ruta antes de construir la URL del servicio.
 *
 * Es también una defensa: sin esto, un `id` como `..%2Finterno%2Facceso`
 * llegaría a `/v1/interno/*` del servicio interno al normalizar la ruta.
 */
import { errorValidacion } from '@quality360/auth-nest';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Devuelve el UUID codificado para usarlo en la ruta, o lanza 400 `VALIDACION`. */
export function uuidDeRuta(valor: string, campo = 'path.id'): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    throw errorValidacion(
      [{ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'El identificador debe ser un UUID.' }],
      `parámetro ${campo} sin forma de UUID`,
    );
  }
  return encodeURIComponent(valor);
}
