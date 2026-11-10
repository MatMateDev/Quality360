/** Validación de parámetros de las rutas (400 `VALIDACION` con `campo`). Orden del contrato: 401 → 403 → 400. */
import { errorValidacion, noAutenticado, obtenerTraceId, type Identidad, type SolicitudAutenticada } from '@quality360/auth-nest';

import type { AutSesion } from '../aplicacion/vistas.servicio.js';
import { esFechaIso } from '../dominio/fechas.js';
import { SIN_SPRINT, type FiltrosVista } from '../dominio/tipos.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID.test(valor);

function malFormado(campo: string, mensaje: string): never {
  throw errorValidacion([{ campo, codigo: 'FORMATO_INVALIDO', mensaje }]);
}

/** Un parámetro de query debe venir una sola vez como texto. */
export function textoOpcional(valor: unknown, campo: string): string | null {
  if (valor === undefined) return null;
  if (typeof valor !== 'string') return malFormado(campo, 'Debe enviarse una sola vez.');
  return valor;
}

export function uuidOpcional(valor: unknown, campo: string): string | null {
  const texto = textoOpcional(valor, campo);
  if (texto === null) return null;
  if (!esUuid(texto)) return malFormado(campo, 'Debe ser un UUID.');
  return texto.toLowerCase();
}

export function leerFiltros(query: Record<string, unknown>, conSprint = true): FiltrosVista {
  const celulaId = uuidOpcional(query.celulaId, 'celulaId');
  let sprintId: string | null = null;
  if (conSprint) {
    const texto = textoOpcional(query.sprintId, 'sprintId');
    if (texto !== null) {
      if (texto === SIN_SPRINT) sprintId = SIN_SPRINT;
      else if (esUuid(texto)) sprintId = texto.toLowerCase();
      else malFormado('sprintId', 'Debe ser un UUID o SIN_SPRINT.');
    }
  }
  return { celulaId, sprintId };
}

export function fechaOpcional(valor: unknown, campo: string): string | null {
  const texto = textoOpcional(valor, campo);
  if (texto === null) return null;
  if (!esFechaIso(texto)) return malFormado(campo, 'Debe ser una fecha AAAA-MM-DD.');
  return texto;
}

/** `pagina` y `tamanoPagina` enteros positivos; el tamaño por encima de `maximo` se recorta (contrato). */
export function leerPaginacion(query: Record<string, unknown>, tamanoDefecto: number, maximo = 100): { pagina: number; tamanoPagina: number } {
  const entero = (valor: unknown, campo: string, defecto: number): number => {
    const texto = textoOpcional(valor, campo);
    if (texto === null || texto === '') return defecto;
    if (!/^\d+$/.test(texto) || Number(texto) < 1) return malFormado(campo, 'Debe ser un entero positivo.');
    return Number(texto);
  };
  return { pagina: entero(query.pagina, 'pagina', 1), tamanoPagina: Math.min(maximo, entero(query.tamanoPagina, 'tamanoPagina', tamanoDefecto)) };
}

export function autSesion(identidad: Identidad | undefined, solicitud: SolicitudAutenticada): AutSesion {
  if (identidad === undefined) throw noAutenticado('ruta sin identidad verificada');
  return { tipo: 'sesion', token: identidad.token, traceId: obtenerTraceId(solicitud) };
}
