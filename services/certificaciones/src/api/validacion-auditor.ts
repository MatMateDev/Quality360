/**
 * Validación de la query de `/v1/auditor/*` y del cuerpo del lote de seguimiento:
 * 400 `VALIDACION` con el campo que falla. Un parámetro que el contrato no define se rechaza.
 */
import { errorValidacion, type DetalleError } from '@quality360/auth-nest';

import type { FiltroBitacoraGlobal, FiltroCertificadosGlobal } from '../infraestructura/checklist.repositorio.js';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ACCIONES = ['MARCAR', 'DESMARCAR', 'APROBAR', 'RECHAZAR', 'GENERAR_CERTIFICADO'] as const;
const TAMANO_POR_DEFECTO = 25;
const TAMANO_MAXIMO = 100;

type Consulta = Record<string, unknown>;

function invalido(detalle: DetalleError): never {
  throw errorValidacion([detalle], `${detalle.campo}: ${detalle.mensaje}`);
}

function texto(consulta: Consulta, campo: string): string | undefined {
  const valor = consulta[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string') invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe enviarse una sola vez.' });
  return valor;
}

function uuid(consulta: Consulta, campo: string): string | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  if (!UUID.test(valor)) invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un UUID.' });
  return valor.toLowerCase();
}

function fecha(consulta: Consulta, campo: string): Date | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(valor)) {
    invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser una fecha ISO 8601.' });
  }
  return instante;
}

function entero(consulta: Consulta, campo: string): number | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un entero mayor o igual a 1.' });
  return numero;
}

function busqueda(consulta: Consulta): string | undefined {
  const valor = texto(consulta, 'q');
  if (valor === undefined) return undefined;
  if (valor.length < 2 || valor.length > 120) invalido({ campo: 'q', codigo: 'LONGITUD_INVALIDA', mensaje: 'Entre 2 y 120 caracteres.' });
  return valor;
}

function exigirSoloEstos(consulta: Consulta, permitidos: readonly string[]): void {
  for (const campo of Object.keys(consulta)) {
    if (!permitidos.includes(campo)) invalido({ campo, codigo: 'NO_PERMITIDO', mensaje: 'Parámetro no admitido.' });
  }
}

function rango(consulta: Consulta): { desde?: Date; hasta?: Date } {
  const desde = fecha(consulta, 'desde');
  const hasta = fecha(consulta, 'hasta');
  if (desde !== undefined && hasta !== undefined && hasta.getTime() < desde.getTime()) {
    invalido({ campo: 'hasta', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'hasta no puede ser anterior a desde.' });
  }
  return { desde, hasta };
}

function accion(consulta: Consulta): FiltroBitacoraGlobal['accion'] {
  const valor = texto(consulta, 'accion');
  if (valor === undefined) return undefined;
  if (!(ACCIONES as readonly string[]).includes(valor)) invalido({ campo: 'accion', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'Acción no válida.' });
  return valor as FiltroBitacoraGlobal['accion'];
}

/** Página y tamaño (25 por defecto; un tamaño mayor a 100 se recorta sin error, D49). */
export function leerPaginacion(consulta: Consulta): { pagina: number; tamanoPagina: number } {
  return {
    pagina: entero(consulta, 'pagina') ?? 1,
    tamanoPagina: Math.min(entero(consulta, 'tamanoPagina') ?? TAMANO_POR_DEFECTO, TAMANO_MAXIMO),
  };
}

const FILTROS_BITACORA = ['desde', 'hasta', 'hduId', 'actorId', 'accion'] as const;
const FILTROS_CERTIFICADOS = ['desde', 'hasta', 'emitidoPorId', 'q'] as const;

export function leerFiltrosBitacora(consulta: Consulta, conPaginacion: boolean): FiltroBitacoraGlobal {
  exigirSoloEstos(consulta, conPaginacion ? [...FILTROS_BITACORA, 'pagina', 'tamanoPagina'] : FILTROS_BITACORA);
  return { ...rango(consulta), hduId: uuid(consulta, 'hduId'), actorId: uuid(consulta, 'actorId'), accion: accion(consulta) };
}

export function leerFiltrosCertificados(consulta: Consulta, conPaginacion: boolean): FiltroCertificadosGlobal {
  exigirSoloEstos(consulta, conPaginacion ? [...FILTROS_CERTIFICADOS, 'pagina', 'tamanoPagina'] : FILTROS_CERTIFICADOS);
  return { ...rango(consulta), emitidoPorId: uuid(consulta, 'emitidoPorId'), q: busqueda(consulta) };
}

/** Solo los parámetros de filtro que se enviaron, tal como quedan registrados en la auditoría (D35). */
export function filtrosEnviados(consulta: Consulta, nombres: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(nombres.filter((nombre) => consulta[nombre] !== undefined).map((nombre) => [nombre, consulta[nombre]]));
}

export const NOMBRES_FILTROS_BITACORA: readonly string[] = FILTROS_BITACORA;
export const NOMBRES_FILTROS_CERTIFICADOS: readonly string[] = FILTROS_CERTIFICADOS;

/** `{hduIds: [...]}` de 1 a 1000 UUID únicos. */
export function leerLoteHdu(cuerpo: unknown): string[] {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    invalido({ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: 'El cuerpo debe ser un objeto JSON.' });
  }
  const datos = cuerpo as Record<string, unknown>;
  for (const campo of Object.keys(datos)) {
    if (campo !== 'hduIds') invalido({ campo, codigo: 'NO_PERMITIDO', mensaje: 'Campo no admitido.' });
  }
  const ids = datos.hduIds;
  if (!Array.isArray(ids)) invalido({ campo: 'hduIds', codigo: 'REQUERIDO', mensaje: 'Indica la lista de HDU.' });
  const lista = ids as unknown[];
  if (lista.length < 1 || lista.length > 1000) invalido({ campo: 'hduIds', codigo: 'LONGITUD_INVALIDA', mensaje: 'Entre 1 y 1000 HDU.' });
  if (!lista.every((id): id is string => typeof id === 'string' && UUID.test(id))) {
    invalido({ campo: 'hduIds', codigo: 'FORMATO_INVALIDO', mensaje: 'Cada identificador debe ser un UUID.' });
  }
  const normalizados = (lista as string[]).map((id) => id.toLowerCase());
  if (new Set(normalizados).size !== normalizados.length) invalido({ campo: 'hduIds', codigo: 'DUPLICADO', mensaje: 'Hay identificadores repetidos.' });
  return normalizados;
}
