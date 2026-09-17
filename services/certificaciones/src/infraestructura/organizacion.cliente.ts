/**
 * Consultas a Organización con el token del usuario propagado (regla no
 * negociable 1: Certificaciones nunca lee el esquema `organizacion`).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA, ExcepcionQ360, accesoDenegado, noAutenticado, servicioNoDisponible } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionCertificaciones } from '../configuracion.js';
import type { EstadoHdu, RelacionHdu } from '../dominio/entregables.js';

export interface Persona {
  readonly id: string;
  readonly nombre: string;
}

export interface HduParaCertificacion {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
  readonly celula: string;
  readonly sprint: string;
  readonly qeResponsable: Persona;
  readonly analista: Persona | null;
}

export interface ActorHdu extends Persona {
  readonly rol: 'ADMINISTRADOR' | 'QE' | 'ANALISTA_QA';
}

/** Acceso permitido a una HDU, con quién consulta y los datos de la HDU. */
export interface AccesoHdu {
  readonly relacion: RelacionHdu;
  readonly actor: ActorHdu;
  readonly hdu: HduParaCertificacion;
}

export interface ContextoSolicitud {
  readonly token: string;
  readonly traceId: string;
}

@Injectable()
export class OrganizacionCliente {
  private readonly registro = new Logger(OrganizacionCliente.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionCertificaciones) {}

  /** Si el usuario no tiene acceso a la HDU (o no existe), 403 sin revelar cuál de los dos (D12). */
  async accesoHdu(hduId: string, contexto: ContextoSolicitud): Promise<AccesoHdu> {
    const cuerpo = await this.consultar(`/v1/interno/hdu/${hduId}/acceso`, contexto);
    const datos = cuerpo as { permitido?: unknown; relacion?: unknown; actor?: ActorHdu; hdu?: HduParaCertificacion };
    if (datos.permitido !== true) throw accesoDenegado(`HDU ${hduId} fuera de ámbito o inexistente`);
    if (typeof datos.relacion !== 'string' || datos.actor === undefined || datos.hdu === undefined) {
      throw servicioNoDisponible('Organización devolvió un acceso a HDU incompleto');
    }
    return { relacion: datos.relacion as RelacionHdu, actor: datos.actor, hdu: datos.hdu };
  }

  /** HDU donde el QE del token es responsable (E3-F03#3). */
  async hduComoResponsable(contexto: ContextoSolicitud): Promise<HduParaCertificacion[]> {
    const cuerpo = (await this.consultar('/v1/interno/hdu/responsable', contexto)) as { items?: unknown };
    if (!Array.isArray(cuerpo.items)) throw servicioNoDisponible('Organización devolvió una lista de HDU ilegible');
    return cuerpo.items as HduParaCertificacion[];
  }

  private async consultar(ruta: string, contexto: ContextoSolicitud): Promise<unknown> {
    const url = new URL(ruta, this.configuracion.organizacionUrl);
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        headers: {
          authorization: `Bearer ${contexto.token}`,
          accept: 'application/json',
          [CABECERA_TRAZA]: contexto.traceId,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(this.configuracion.tiempoLimiteOrganizacionMs),
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'desconocido';
      this.registro.error(`Organización no respondió ${ruta} · traceId=${contexto.traceId} · ${detalle}`);
      throw servicioNoDisponible(`Organización no respondió ${ruta}`);
    }
    if (respuesta.status === 401) throw noAutenticado(`Organización rechazó el token en ${ruta}`);
    if (respuesta.status === 403) throw accesoDenegado(`Organización negó ${ruta}`);
    if (!respuesta.ok) throw servicioNoDisponible(`Organización respondió ${respuesta.status} en ${ruta}`);
    try {
      return await respuesta.json();
    } catch (error) {
      if (error instanceof ExcepcionQ360) throw error;
      throw servicioNoDisponible(`Organización devolvió un cuerpo ilegible en ${ruta}`);
    }
  }
}
