/**
 * Validación de rutas y cuerpos: 400 `VALIDACION` con el campo que falla (todos los campos a la
 * vez). Un texto en blanco donde se exige comentario, motivo o justificación NO se rechaza aquí:
 * pasa en blanco y responde 422 después de comprobar `HDU_CERRADA` (orden de D89).
 */
import { errorValidacion, type CodigoDetalle, type DetalleError } from '@quality360/auth-nest';

import { descripcionMinima } from '../../dominio/impedimento.js';
import { NIVELES_RIESGO, TIPOS_IMPEDIMENTO, type NivelRiesgo, type TipoImpedimento } from '../../dominio/tipos.js';
import type { DatosOperacion, DatosRegistro } from '../../aplicacion/impedimentos.servicio.js';
import type { DatosCambioRiesgo } from '../../aplicacion/riesgo.servicio.js';

export const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function invalido(detalle: DetalleError): never {
  throw errorValidacion([detalle], `${detalle.campo}: ${detalle.mensaje}`);
}

function lanzar(detalles: DetalleError[]): never {
  throw errorValidacion(detalles, detalles.map((detalle) => `${detalle.campo}: ${detalle.mensaje}`).join('; '));
}

export function uuidDeRuta(valor: string, campo: string): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) invalido({ campo: `path.${campo}`, codigo: 'FORMATO_INVALIDO', mensaje: 'El identificador debe ser un UUID.' });
  return valor.toLowerCase();
}

function objeto(cuerpo: unknown): Record<string, unknown> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    return invalido({ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: 'El cuerpo debe ser un objeto JSON.' });
  }
  return cuerpo as Record<string, unknown>;
}

class Acumulador {
  readonly detalles: DetalleError[] = [];

  falla(campo: string, codigo: CodigoDetalle, mensaje: string): void {
    this.detalles.push({ campo, codigo, mensaje });
  }

  /** Texto obligatorio con largo mínimo y máximo (sobre el texto sin espacios en los extremos). */
  texto(datos: Record<string, unknown>, campo: string, minimo: number, maximo: number, etiqueta: string): string | undefined {
    const valor = datos[campo];
    if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim().length === 0)) {
      this.falla(campo, 'REQUERIDO', `${etiqueta} es obligatorio.`);
      return undefined;
    }
    if (typeof valor !== 'string') {
      this.falla(campo, 'FORMATO_INVALIDO', 'Debe ser un texto.');
      return undefined;
    }
    const recortado = valor.trim();
    if (recortado.length < minimo || recortado.length > maximo) {
      this.falla(campo, 'LONGITUD_INVALIDA', `Debe tener entre ${minimo} y ${maximo} caracteres.`);
      return undefined;
    }
    return recortado;
  }

  sinCamposExtra(datos: Record<string, unknown>, permitidos: readonly string[]): void {
    for (const campo of Object.keys(datos)) {
      if (!permitidos.includes(campo)) this.falla(campo, 'NO_PERMITIDO', 'Campo no admitido.');
    }
  }

  /** `responsableId` (UUID) o `responsableNombre` (3 a 150), no ambos. Devuelve lo que corresponda. */
  responsable(datos: Record<string, unknown>): { responsableId?: string; responsableNombre?: string } {
    const id = datos.responsableId;
    const nombre = datos.responsableNombre;
    const conId = id !== undefined && id !== null;
    const conNombre = nombre !== undefined && nombre !== null;
    if (conId && conNombre) {
      this.falla('responsableNombre', 'NO_PERMITIDO', 'Indica un responsable de la lista o un nombre, no ambos.');
      return {};
    }
    if (conId) {
      if (typeof id !== 'string' || !UUID.test(id)) {
        this.falla('responsableId', 'FORMATO_INVALIDO', 'Debe ser un UUID.');
        return {};
      }
      return { responsableId: id.toLowerCase() };
    }
    if (conNombre) {
      const texto = this.texto(datos, 'responsableNombre', 3, 150, 'El nombre del responsable');
      return texto === undefined ? {} : { responsableNombre: texto };
    }
    this.falla('responsableNombre', 'REQUERIDO', 'Elige un responsable o escribe su nombre.');
    return {};
  }
}

/** `POST /v1/hdu/{hduId}/impedimentos`. */
export function leerNuevoImpedimento(cuerpo: unknown): DatosRegistro {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['tipo', 'titulo', 'descripcion', 'responsableId', 'responsableNombre']);

  let tipo: TipoImpedimento | undefined;
  if (datos.tipo === undefined || datos.tipo === null || datos.tipo === '') a.falla('tipo', 'REQUERIDO', 'El tipo es obligatorio.');
  else if (typeof datos.tipo !== 'string' || !(TIPOS_IMPEDIMENTO as readonly string[]).includes(datos.tipo)) {
    a.falla('tipo', 'VALOR_NO_PERMITIDO', 'El tipo no está en el catálogo.');
  } else tipo = datos.tipo as TipoImpedimento;

  const titulo = a.texto(datos, 'titulo', 5, 200, 'El título');
  const minimoDescripcion = tipo === undefined ? 10 : descripcionMinima(tipo);
  const descripcion = a.texto(datos, 'descripcion', minimoDescripcion, 1000, 'La descripción');
  const responsable = a.responsable(datos);

  if (a.detalles.length > 0 || tipo === undefined || titulo === undefined || descripcion === undefined) lanzar(a.detalles);
  return { tipo, titulo, descripcion, ...responsable };
}

const ETIQUETA_TEXTO = { comentario: 'El comentario', motivo: 'El motivo', justificacion: 'La justificación' } as const;

/** Comentario, motivo o justificación de 3 a 500; en blanco pasa como texto vacío (422 después). */
function textoOperacion(datos: Record<string, unknown>, campo: 'comentario' | 'motivo' | 'justificacion', a: Acumulador): string | undefined {
  const valor = datos[campo];
  if (valor === undefined || valor === null) {
    a.falla(campo, 'REQUERIDO', `${ETIQUETA_TEXTO[campo]} es obligatorio.`);
    return undefined;
  }
  if (typeof valor !== 'string') {
    a.falla(campo, 'FORMATO_INVALIDO', 'Debe ser un texto.');
    return undefined;
  }
  const recortado = valor.trim();
  if (recortado.length === 0) return '';
  if (recortado.length < 3 || recortado.length > 500) {
    a.falla(campo, 'LONGITUD_INVALIDA', 'Debe tener entre 3 y 500 caracteres.');
    return undefined;
  }
  return recortado;
}

/** `resolver` y `seguimiento`: `{comentario}`. */
export function leerComentario(cuerpo: unknown): DatosOperacion {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['comentario']);
  const texto = textoOperacion(datos, 'comentario', a);
  if (a.detalles.length > 0 || texto === undefined) lanzar(a.detalles);
  return { texto };
}

/** `reabrir`: `{motivo}`. */
export function leerMotivo(cuerpo: unknown): DatosOperacion {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['motivo']);
  const texto = textoOperacion(datos, 'motivo', a);
  if (a.detalles.length > 0 || texto === undefined) lanzar(a.detalles);
  return { texto };
}

/** `escalar`: destino (`responsableId` o `responsableNombre`) y `{comentario}`. */
export function leerEscalamiento(cuerpo: unknown): DatosOperacion {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['responsableId', 'responsableNombre', 'comentario']);
  const texto = textoOperacion(datos, 'comentario', a);
  const destino = a.responsable(datos);
  if (a.detalles.length > 0 || texto === undefined) lanzar(a.detalles);
  return { texto, ...destino };
}

/** `PUT /v1/hdu/{hduId}/riesgo`. */
export function leerCambioRiesgo(cuerpo: unknown): DatosCambioRiesgo {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['nivel', 'justificacion']);

  let nivel: NivelRiesgo | undefined;
  if (datos.nivel === undefined || datos.nivel === null || datos.nivel === '') a.falla('nivel', 'REQUERIDO', 'El nivel es obligatorio.');
  else if (typeof datos.nivel !== 'string' || !(NIVELES_RIESGO as readonly string[]).includes(datos.nivel)) {
    a.falla('nivel', 'VALOR_NO_PERMITIDO', 'El nivel debe ser BAJO, MEDIO o ALTO.');
  } else nivel = datos.nivel as NivelRiesgo;

  const justificacion = textoOperacion(datos, 'justificacion', a);
  if (a.detalles.length > 0 || nivel === undefined || justificacion === undefined) lanzar(a.detalles);
  return { nivel, justificacion };
}
