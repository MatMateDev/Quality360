import { errorValidacion } from '@quality360/auth-nest';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Valida un UUID de ruta o lanza 400 `VALIDACION`. */
export function uuidDeRuta(valor: string, campo = 'path.id'): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    throw errorValidacion([{ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'El identificador debe ser un UUID.' }], `parámetro ${campo} sin forma de UUID`);
  }
  return valor;
}

export function esUuid(valor: string): boolean {
  return UUID.test(valor);
}
