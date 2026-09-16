/**
 * `ResolutorDeAcceso` remoto: consulta `GET /v1/interno/acceso` de
 * Organización con el token del usuario propagado (ADR 0004). Lo usan
 * Certificaciones e Impedimentos; nunca leen el esquema `organizacion`.
 *
 * Sin caché: una desactivación o un cambio de rol se aplican en la solicitud
 * siguiente.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ExcepcionQ360, noAutenticado, servicioNoDisponible } from './errores.js';
import {
  esRol,
  type ContextoAcceso,
  type Identidad,
  type ResolucionAcceso,
  type ResolutorDeAcceso,
} from './tipos.js';
import { CABECERA_TRAZA } from './traza.js';

export const OPCIONES_RESOLUTOR_REMOTO = Symbol.for('quality360.OpcionesResolutorRemoto');

export interface OpcionesResolutorRemoto {
  /** Base de Organización, por ejemplo `http://organizacion:3001`. */
  organizacionUrl: string;
  /** Ruta de resolución; por defecto la del contrato. */
  ruta?: string;
  tiempoLimiteMs?: number;
}

function validarResolucion(cuerpo: unknown): ResolucionAcceso {
  if (typeof cuerpo !== 'object' || cuerpo === null) {
    throw servicioNoDisponible('Organización devolvió una resolución de acceso ilegible');
  }
  const datos = cuerpo as Record<string, unknown>;
  const ambito = (datos.ambito ?? {}) as Record<string, unknown>;
  if (typeof datos.usuarioId !== 'string' || !esRol(datos.rol) || typeof datos.activo !== 'boolean') {
    throw servicioNoDisponible('Organización devolvió una resolución de acceso incompleta');
  }
  const supervisados = Array.isArray(ambito.analistasSupervisadosIds)
    ? ambito.analistasSupervisadosIds.filter((valor): valor is string => typeof valor === 'string')
    : [];
  return {
    usuarioId: datos.usuarioId,
    rol: datos.rol,
    activo: datos.activo,
    ambito: {
      qeSupervisorId: typeof ambito.qeSupervisorId === 'string' ? ambito.qeSupervisorId : null,
      analistasSupervisadosIds: supervisados,
    },
  };
}

@Injectable()
export class ResolutorDeAccesoRemoto implements ResolutorDeAcceso {
  private readonly registro = new Logger(ResolutorDeAccesoRemoto.name);

  constructor(@Inject(OPCIONES_RESOLUTOR_REMOTO) private readonly opciones: OpcionesResolutorRemoto) {}

  async resolver(identidad: Identidad, contexto: ContextoAcceso): Promise<ResolucionAcceso | null> {
    const url = new URL(this.opciones.ruta ?? '/v1/interno/acceso', this.opciones.organizacionUrl);

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${identidad.token}`,
          accept: 'application/json',
          [CABECERA_TRAZA]: contexto.traceId,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(this.opciones.tiempoLimiteMs ?? 2000),
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      this.registro.error(`Organización no respondió la resolución de acceso · traceId=${contexto.traceId} · ${detalle}`);
      throw servicioNoDisponible('Organización no respondió la resolución de acceso');
    }

    if (respuesta.status === 403) return null;
    if (respuesta.status === 401) throw noAutenticado('Organización rechazó el token propagado');
    if (!respuesta.ok) {
      throw servicioNoDisponible(`Organización respondió ${respuesta.status} al resolver el acceso`);
    }

    try {
      return validarResolucion(await respuesta.json());
    } catch (error) {
      if (error instanceof ExcepcionQ360) throw error;
      throw servicioNoDisponible('Organización devolvió una resolución de acceso ilegible');
    }
  }
}
