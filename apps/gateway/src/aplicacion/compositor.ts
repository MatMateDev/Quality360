/**
 * Composición de bloques con tiempo límite por fuente.
 *
 * Reglas de `gateway.v1.yaml`:
 * - Cada fuente tiene su URL propia, para poder tumbar una sola (E1-B03#3).
 * - Si una fuente responde 400, 401, 403 o 404, se devuelve esa respuesta
 *   completa.
 * - Cualquier otro fallo o tiempo agotado deja **ese** bloque en
 *   `estado: indisponible`, sin `datos`, y la respuesta sigue siendo 200.
 *   Nunca se rellena con ceros ni con listas vacías (regla 4 del informe).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { obtenerTraceId } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionGateway } from '../configuracion.js';
import { solicitarServicio } from '../infraestructura/cliente-servicios.js';
import { Reenviador, type SolicitudGateway } from './reenviador.js';

export type FuenteDatos =
  | 'organizacion.usuarios'
  | 'organizacion.supervision'
  | 'organizacion.hdu'
  | 'certificaciones.checklist';

export interface DefinicionBloque {
  /** Nombre del bloque en la respuesta compuesta. */
  clave: string;
  fuente: FuenteDatos;
  /** Base configurable de la fuente. */
  base: string;
  ruta: string;
  /** Propagar la query string (por ejemplo `analistaId`). */
  conConsulta?: boolean;
}

export type Bloque =
  | { fuente: FuenteDatos; estado: 'ok'; datos: unknown }
  | { fuente: FuenteDatos; estado: 'indisponible' };

export type ResultadoBloque =
  | { clase: 'ok'; fuente: FuenteDatos; datos: unknown }
  | { clase: 'indisponible'; fuente: FuenteDatos; motivo: string }
  | { clase: 'directa'; fuente: FuenteDatos; estado: number; cuerpo: unknown };

export interface RespuestaCompuesta {
  estado: number;
  cuerpo: unknown;
}

/** Estados de una fuente que se devuelven completos al portal. */
const ESTADOS_DIRECTOS = [401, 403, 400, 404];

export function bloqueDe(resultado: ResultadoBloque): Bloque {
  if (resultado.clase === 'ok') return { fuente: resultado.fuente, estado: 'ok', datos: resultado.datos };
  return { fuente: resultado.fuente, estado: 'indisponible' };
}

@Injectable()
export class Compositor {
  private readonly registro = new Logger(Compositor.name);

  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionGateway,
    private readonly reenviador: Reenviador,
  ) {}

  /** Consulta una fuente. Nunca lanza por un fallo de la fuente. */
  async consultarBloque(solicitud: SolicitudGateway, definicion: DefinicionBloque): Promise<ResultadoBloque> {
    const traceId = obtenerTraceId(solicitud);
    const resultado = await solicitarServicio({
      base: definicion.base,
      ruta: definicion.ruta,
      metodo: 'GET',
      token: this.reenviador.identidadDe(solicitud).token,
      traceId,
      consulta: definicion.conConsulta === true ? this.reenviador.consultaDe(solicitud) : undefined,
      tiempoLimiteMs: this.configuracion.tiempoLimiteFuenteMs,
    });

    if (resultado.tipo === 'fallo') {
      return this.indisponible(definicion, resultado.motivo, traceId);
    }

    const respuesta = resultado.respuesta;
    if (respuesta.estado === 200) {
      if (typeof respuesta.json === 'object' && respuesta.json !== null && !Array.isArray(respuesta.json)) {
        return { clase: 'ok', fuente: definicion.fuente, datos: respuesta.json };
      }
      return this.indisponible(definicion, 'la fuente respondió 200 sin datos legibles', traceId);
    }

    if (ESTADOS_DIRECTOS.includes(respuesta.estado) && respuesta.json !== undefined) {
      return { clase: 'directa', fuente: definicion.fuente, estado: respuesta.estado, cuerpo: respuesta.json };
    }

    return this.indisponible(definicion, `la fuente respondió ${respuesta.estado}`, traceId);
  }

  /** Compone varios bloques en paralelo. */
  async componer(solicitud: SolicitudGateway, definiciones: DefinicionBloque[]): Promise<RespuestaCompuesta> {
    const resultados = await Promise.all(
      definiciones.map(async (definicion) => this.consultarBloque(solicitud, definicion)),
    );

    const directa = this.primeraDirecta(resultados);
    if (directa !== null) return { estado: directa.estado, cuerpo: directa.cuerpo };

    const cuerpo: Record<string, Bloque> = {};
    definiciones.forEach((definicion, indice) => {
      const resultado = resultados[indice];
      if (resultado !== undefined) cuerpo[definicion.clave] = bloqueDe(resultado);
    });
    return { estado: 200, cuerpo };
  }

  private primeraDirecta(
    resultados: ResultadoBloque[],
  ): { estado: number; cuerpo: unknown } | null {
    for (const estado of ESTADOS_DIRECTOS) {
      const encontrada = resultados.find(
        (resultado): resultado is Extract<ResultadoBloque, { clase: 'directa' }> =>
          resultado.clase === 'directa' && resultado.estado === estado,
      );
      if (encontrada !== undefined) return { estado: encontrada.estado, cuerpo: encontrada.cuerpo };
    }
    return null;
  }

  private indisponible(definicion: DefinicionBloque, motivo: string, traceId: string): ResultadoBloque {
    this.registro.warn(`Bloque ${definicion.clave} (${definicion.fuente}) indisponible · traceId=${traceId} · ${motivo}`);
    return { clase: 'indisponible', fuente: definicion.fuente, motivo };
  }
}
