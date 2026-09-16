/**
 * Reenvío de una ruta del gateway a la misma ruta del servicio dueño.
 *
 * Propaga `Authorization` y `x-trace-id`, y devuelve la respuesta del servicio
 * tal cual. Si el destino no responde dentro del tiempo límite, 503
 * `SERVICIO_NO_DISPONIBLE` (gateway.v1.yaml).
 */
import { Inject, Injectable } from '@nestjs/common';
import { noAutenticado, obtenerTraceId, servicioNoDisponible, type Identidad } from '@quality360/auth-nest';
import type { Request, Response } from 'express';

import { CONFIGURACION, type ConfiguracionGateway } from '../configuracion.js';
import { solicitarServicio, type RespuestaServicio, type ResultadoServicio } from '../infraestructura/cliente-servicios.js';

export type SolicitudGateway = Request & { identidad?: Identidad; traceId?: string };

const METODOS_CON_CUERPO = new Set(['POST', 'PUT', 'PATCH']);

export interface OpcionesReenvio {
  ruta: string;
  base?: string;
  /** Propagar la query string de la solicitud original. */
  conConsulta?: boolean;
  tiempoLimiteMs?: number;
}

@Injectable()
export class Reenviador {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionGateway) {}

  /** Identidad ya verificada por `IdentidadGuard`. */
  identidadDe(solicitud: SolicitudGateway): Identidad {
    const identidad = solicitud.identidad;
    if (identidad === undefined) throw noAutenticado('la ruta llegó sin identidad verificada');
    return identidad;
  }

  consultaDe(solicitud: SolicitudGateway): string | undefined {
    const posicion = solicitud.originalUrl.indexOf('?');
    return posicion === -1 ? undefined : solicitud.originalUrl.slice(posicion + 1);
  }

  async consultar(solicitud: SolicitudGateway, opciones: OpcionesReenvio): Promise<ResultadoServicio> {
    const cuerpo =
      METODOS_CON_CUERPO.has(solicitud.method) && solicitud.body !== undefined
        ? JSON.stringify(solicitud.body)
        : undefined;

    return solicitarServicio({
      base: opciones.base ?? this.configuracion.organizacionUrl,
      ruta: opciones.ruta,
      metodo: solicitud.method,
      token: this.identidadDe(solicitud).token,
      traceId: obtenerTraceId(solicitud),
      consulta: opciones.conConsulta === false ? undefined : this.consultaDe(solicitud),
      cuerpo,
      tiempoLimiteMs: opciones.tiempoLimiteMs ?? this.configuracion.tiempoLimiteServicioMs,
    });
  }

  /** Reenvía y escribe la respuesta del servicio. */
  async reenviar(solicitud: SolicitudGateway, respuesta: Response, opciones: OpcionesReenvio): Promise<void> {
    const resultado = await this.consultar(solicitud, opciones);
    if (resultado.tipo === 'fallo') {
      throw servicioNoDisponible(`${opciones.ruta}: ${resultado.motivo}`);
    }
    this.escribir(respuesta, resultado.respuesta);
  }

  /** Copia estado, `Location` y cuerpo JSON. Nada más viaja de vuelta. */
  escribir(respuesta: Response, servicio: RespuestaServicio): void {
    if (servicio.json === undefined && servicio.texto.length > 0) {
      throw servicioNoDisponible(`el servicio respondió ${servicio.estado} sin JSON`);
    }
    if (servicio.ubicacion !== null) respuesta.setHeader('location', servicio.ubicacion);
    respuesta.status(servicio.estado);
    if (servicio.json === undefined) {
      respuesta.end();
      return;
    }
    respuesta.json(servicio.json);
  }
}
