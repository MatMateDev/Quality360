/**
 * Llamada HTTP a otra fuente con tiempo límite. Traduce toda falla (red, tiempo, 5xx, cuerpo ilegible) en
 * `FuenteNoDisponible`; 401/403 con la credencial del servicio en `CredencialRechazada`; 401/403 con la sesión en
 * `AccesoRechazadoPorFuente`. El motivo va al registro, sin cabeceras ni cuerpos, y nunca a la respuesta.
 */
import { Logger } from '@nestjs/common';
import { CABECERA_TRAZA } from '@quality360/auth-nest';

import { AccesoRechazadoPorFuente, CredencialRechazada, FuenteNoDisponible, type Autenticacion, type NombreFuente } from '../../aplicacion/puertos.js';

const registro = new Logger('Fuentes');

export function cabecerasDe(auth: Autenticacion): Record<string, string> {
  const base: Record<string, string> = { accept: 'application/json', [CABECERA_TRAZA]: auth.traceId };
  if (auth.tipo === 'sesion') base.authorization = `Bearer ${auth.token}`;
  else base['x-q360-servicio-token'] = auth.credencial;
  return base;
}

export interface OpcionesLlamada {
  readonly fuente: NombreFuente;
  readonly url: string | null;
  readonly ruta: string;
  readonly metodo: 'GET' | 'POST';
  readonly auth: Autenticacion;
  readonly cuerpo?: unknown;
  readonly timeoutMs: number;
  /** Reintentos ante fallo de red, tiempo o 5xx (el snapshot usa 1, D178). */
  readonly reintentos?: number;
}

export async function llamar<T>(opciones: OpcionesLlamada): Promise<T> {
  if (opciones.url === null) throw new FuenteNoDisponible(opciones.fuente, 'URL no configurada');
  const intentos = (opciones.reintentos ?? 0) + 1;
  let ultimo: unknown = null;
  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      return await llamarUnaVez<T>(opciones, opciones.url);
    } catch (error) {
      ultimo = error;
      // Un rechazo de acceso no se reintenta: no cambiará.
      if (error instanceof CredencialRechazada || error instanceof AccesoRechazadoPorFuente) throw error;
    }
  }
  throw ultimo;
}

async function llamarUnaVez<T>(opciones: OpcionesLlamada, base: string): Promise<T> {
  const { fuente, ruta, metodo, auth } = opciones;
  let respuesta: Response;
  try {
    respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { ...cabecerasDe(auth), ...(opciones.cuerpo === undefined ? {} : { 'content-type': 'application/json' }) },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      redirect: 'error',
      signal: AbortSignal.timeout(opciones.timeoutMs),
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'desconocido';
    registro.warn(`${fuente} no respondió ${metodo} ${ruta} · traceId=${auth.traceId} · ${detalle}`);
    throw new FuenteNoDisponible(fuente, 'sin respuesta');
  }
  if (respuesta.status === 401 || respuesta.status === 403) {
    registro.warn(`${fuente} respondió ${respuesta.status} a ${metodo} ${ruta} · traceId=${auth.traceId}`);
    throw auth.tipo === 'servicio' ? new CredencialRechazada(fuente) : new AccesoRechazadoPorFuente(fuente);
  }
  if (!respuesta.ok) {
    registro.warn(`${fuente} respondió ${respuesta.status} a ${metodo} ${ruta} · traceId=${auth.traceId}`);
    throw new FuenteNoDisponible(fuente, `estado ${respuesta.status}`);
  }
  try {
    return (await respuesta.json()) as T;
  } catch {
    throw new FuenteNoDisponible(fuente, 'respuesta ilegible');
  }
}

export function trocear<T>(elementos: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < elementos.length; i += tamano) lotes.push(elementos.slice(i, i + tamano));
  return lotes;
}

export const TAMANO_LOTE = 1000;
