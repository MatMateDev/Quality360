/**
 * Utilidades de validación de rutas, consultas y cuerpos: 400 `VALIDACION` con todos los campos que fallan a la vez
 * (`DetalleError[]`, comun.v1.yaml). Los mensajes nunca repiten el valor recibido.
 */
import { errorValidacion, type CodigoDetalle, type DetalleError } from '@quality360/auth-nest';

export const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class Acumulador {
  readonly detalles: DetalleError[] = [];

  falla(campo: string, codigo: CodigoDetalle, mensaje: string): void {
    this.detalles.push({ campo, codigo, mensaje });
  }

  lanzarSiHay(): void {
    if (this.detalles.length > 0) throw errorValidacion(this.detalles, this.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join('; '));
  }

  sinCamposExtra(datos: Record<string, unknown>, permitidos: readonly string[]): void {
    for (const campo of Object.keys(datos)) {
      if (!permitidos.includes(campo)) this.falla(campo, 'NO_PERMITIDO', 'Campo no admitido.');
    }
  }

  uuid(datos: Record<string, unknown>, campo: string): string {
    const valor = datos[campo];
    if (valor === undefined || valor === null) this.falla(campo, 'REQUERIDO', 'Es obligatorio.');
    else if (typeof valor !== 'string' || !UUID.test(valor)) this.falla(campo, 'FORMATO_INVALIDO', 'Debe ser un UUID.');
    else return valor.toLowerCase();
    return '';
  }

  booleano(datos: Record<string, unknown>, campo: string, porDefecto = false): boolean {
    const valor = datos[campo];
    if (valor === undefined) return porDefecto;
    if (typeof valor !== 'boolean') {
      this.falla(campo, 'FORMATO_INVALIDO', 'Debe ser verdadero o falso.');
      return porDefecto;
    }
    return valor;
  }
}

export function objeto(cuerpo: unknown, opcional = false): Record<string, unknown> {
  if ((cuerpo === undefined || cuerpo === null) && opcional) return {};
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw errorValidacion([{ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: 'El cuerpo debe ser un objeto JSON.' }], 'cuerpo no es un objeto');
  }
  return cuerpo as Record<string, unknown>;
}

export function uuidDeRuta(valor: string, campo: string): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    throw errorValidacion([{ campo: `path.${campo}`, codigo: 'FORMATO_INVALIDO', mensaje: 'El identificador debe ser un UUID.' }], `path.${campo}`);
  }
  return valor.toLowerCase();
}

type Consulta = Record<string, unknown>;

function textoUnico(consulta: Consulta, campo: string): string | undefined {
  const valor = consulta[campo];
  return typeof valor === 'string' ? valor : undefined;
}

/** `pagina` (>= 1) y `tamanoPagina` (>= 1). Con `recortar` un valor mayor al máximo se recorta sin error (D49). */
export function leerPaginacion(consulta: Consulta, porDefecto: number, maximo: number, recortar: boolean, a: Acumulador): { pagina: number; tamanoPagina: number } {
  const entero = (campo: string, minimo: number, valorPorDefecto: number): number => {
    const crudo = consulta[campo];
    if (crudo === undefined) return valorPorDefecto;
    const texto = textoUnico(consulta, campo);
    if (texto === undefined || !/^\d+$/.test(texto) || Number(texto) < minimo) {
      a.falla(`query.${campo}`, 'FORMATO_INVALIDO', `Debe ser un entero mayor o igual a ${minimo}.`);
      return valorPorDefecto;
    }
    return Number(texto);
  };
  const pagina = entero('pagina', 1, 1);
  let tamanoPagina = entero('tamanoPagina', 1, porDefecto);
  if (tamanoPagina > maximo) {
    if (recortar) tamanoPagina = maximo;
    else a.falla('query.tamanoPagina', 'LONGITUD_INVALIDA', `Debe ser como máximo ${maximo}.`);
  }
  return { pagina, tamanoPagina };
}

export function consultaEnumerada<T extends string>(consulta: Consulta, campo: string, validos: readonly T[], a: Acumulador): T | undefined {
  if (consulta[campo] === undefined) return undefined;
  const texto = textoUnico(consulta, campo);
  if (texto === undefined || !(validos as readonly string[]).includes(texto)) {
    a.falla(`query.${campo}`, 'VALOR_NO_PERMITIDO', 'El valor no está en el catálogo.');
    return undefined;
  }
  return texto as T;
}

export function consultaBooleana(consulta: Consulta, campo: string, a: Acumulador): boolean | undefined {
  if (consulta[campo] === undefined) return undefined;
  const texto = textoUnico(consulta, campo);
  if (texto !== 'true' && texto !== 'false') {
    a.falla(`query.${campo}`, 'FORMATO_INVALIDO', 'Debe ser true o false.');
    return undefined;
  }
  return texto === 'true';
}

export function consultaFecha(consulta: Consulta, campo: string, a: Acumulador): string | undefined {
  if (consulta[campo] === undefined) return undefined;
  const texto = textoUnico(consulta, campo);
  if (texto === undefined || !FECHA.test(texto) || new Date(`${texto}T00:00:00Z`).toISOString().slice(0, 10) !== texto) {
    a.falla(`query.${campo}`, 'FORMATO_INVALIDO', 'Debe ser una fecha AAAA-MM-DD.');
    return undefined;
  }
  return texto;
}

export function consultaTexto(consulta: Consulta, campo: string): string | undefined {
  return textoUnico(consulta, campo);
}
