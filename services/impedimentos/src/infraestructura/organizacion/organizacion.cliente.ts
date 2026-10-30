/**
 * Consultas a Organización con el token del usuario propagado (regla no negociable 1: este
 * servicio nunca lee el esquema `organizacion`). Implementa el puerto `ProveedorAcceso`.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CABECERA_TRAZA, ExcepcionQ360, accesoDenegado, noAutenticado, servicioNoDisponible } from '@quality360/auth-nest';

import {
  ProveedorAcceso,
  type AccesoHdu,
  type AmbitoLecturaHdu,
  type CandidatosResponsable,
  type ContextoSolicitud,
  type DatosHdu,
  type RegistroExportacion,
} from '../../aplicacion/puertos.js';
import { CONFIGURACION, type ConfiguracionImpedimentos } from '../../configuracion.js';
import type { EstadoHdu, PersonaRol, RelacionHdu, RolUsuario } from '../../dominio/tipos.js';

type Json = Record<string, unknown>;

function ilegible(que: string): never {
  throw servicioNoDisponible(`Organización devolvió ${que} ilegible`);
}

function texto(valor: unknown, que: string): string {
  return typeof valor === 'string' ? valor : ilegible(que);
}

function persona(valor: unknown, que: string): { id: string; nombre: string } {
  const datos = valor as Json | null;
  if (datos === null || typeof datos !== 'object') return ilegible(que);
  return { id: texto(datos.id, que), nombre: texto(datos.nombre, que) };
}

function personaRol(valor: unknown, que: string): PersonaRol {
  const datos = valor as Json | null;
  if (datos === null || typeof datos !== 'object') return ilegible(que);
  return { id: texto(datos.id, que), nombre: texto(datos.nombre, que), rol: texto(datos.rol, que) as RolUsuario };
}

/** `HduParaCertificacion` (Organización) → `DatosHdu`. */
function datosHdu(valor: unknown): DatosHdu {
  const datos = valor as Json | null;
  if (datos === null || typeof datos !== 'object') return ilegible('una HDU');
  const analista = datos.analista;
  return {
    id: texto(datos.id, 'una HDU'),
    codigo: texto(datos.codigo, 'una HDU'),
    titulo: texto(datos.titulo, 'una HDU'),
    estado: texto(datos.estado, 'una HDU') as EstadoHdu,
    celula: { id: texto(datos.celulaId, 'la célula de una HDU'), nombre: texto(datos.celula, 'la célula de una HDU') },
    sprint: { id: texto(datos.sprintId, 'el sprint de una HDU'), nombre: texto(datos.sprint, 'el sprint de una HDU') },
    sprintFin: typeof datos.sprintFin === 'string' ? datos.sprintFin.slice(0, 10) : null,
    qeResponsable: persona(datos.qeResponsable, 'el QE de una HDU'),
    analista: analista === null || analista === undefined ? null : persona(analista, 'el analista de una HDU'),
  };
}

function listaDeHdu(cuerpo: unknown): DatosHdu[] {
  const items = (cuerpo as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return ilegible('una lista de HDU');
  return items.map(datosHdu);
}

function candidatos(valor: unknown): CandidatosResponsable {
  const datos = valor as { registro?: unknown; escalamiento?: unknown } | null;
  if (datos === null || typeof datos !== 'object' || !Array.isArray(datos.registro) || !Array.isArray(datos.escalamiento)) {
    return ilegible('los candidatos a responsable');
  }
  return {
    registro: datos.registro.map((p) => personaRol(p, 'un candidato')),
    escalamiento: datos.escalamiento.map((p) => personaRol(p, 'un candidato')),
  };
}

@Injectable()
export class OrganizacionCliente extends ProveedorAcceso {
  private readonly registro = new Logger(OrganizacionCliente.name);

  constructor(@Inject(CONFIGURACION) private readonly configuracion: ConfiguracionImpedimentos) {
    super();
  }

  async accesoHdu(hduId: string, contexto: ContextoSolicitud, opciones: { incluirCandidatos?: boolean } = {}): Promise<AccesoHdu | null> {
    const consulta = opciones.incluirCandidatos === true ? '?incluirCandidatos=true' : '';
    const cuerpo = (await this.consultar(`/v1/interno/hdu/${encodeURIComponent(hduId)}/acceso${consulta}`, contexto)) as Json;
    if (cuerpo.permitido !== true) return null;
    if (typeof cuerpo.relacion !== 'string') return ilegible('un acceso a HDU');
    return {
      relacion: cuerpo.relacion as RelacionHdu,
      actor: personaRol(cuerpo.actor, 'el actor de un acceso'),
      hdu: datosHdu(cuerpo.hdu),
      candidatos: opciones.incluirCandidatos === true ? candidatos(cuerpo.candidatosResponsable) : null,
    };
  }

  async ambito(contexto: ContextoSolicitud): Promise<AmbitoLecturaHdu> {
    const cuerpo = (await this.consultar('/v1/interno/hdu/ambito', contexto)) as Json;
    if (typeof cuerpo.todas !== 'boolean' || !Array.isArray(cuerpo.hduIds) || typeof cuerpo.usuarioId !== 'string') {
      return ilegible('un ámbito de lectura');
    }
    return {
      usuarioId: cuerpo.usuarioId,
      rol: cuerpo.rol as RolUsuario,
      todas: cuerpo.todas,
      hduIds: cuerpo.hduIds.filter((id): id is string => typeof id === 'string'),
    };
  }

  async ambitoDetalle(contexto: ContextoSolicitud, incluirCerradas: boolean): Promise<DatosHdu[]> {
    const consulta = incluirCerradas ? '?incluirCerradas=true' : '';
    return listaDeHdu(await this.consultar(`/v1/interno/hdu/ambito/detalle${consulta}`, contexto));
  }

  async consultarHdu(hduIds: readonly string[], contexto: ContextoSolicitud): Promise<DatosHdu[]> {
    const items: DatosHdu[] = [];
    for (let desde = 0; desde < hduIds.length; desde += 1000) {
      items.push(...listaDeHdu(await this.consultar('/v1/interno/hdu/consulta', contexto, { hduIds: hduIds.slice(desde, desde + 1000) })));
    }
    return items;
  }

  async registrarExportacion(exportacion: RegistroExportacion, contexto: ContextoSolicitud): Promise<void> {
    try {
      await this.consultar('/v1/interno/auditoria/exportaciones', contexto, exportacion);
    } catch (error) {
      if (error instanceof ExcepcionQ360 && error.getStatus() === 503) throw error;
      const motivo = error instanceof Error ? error.message : 'desconocido';
      throw servicioNoDisponible(`Organización no registró la exportación: ${motivo}`);
    }
  }

  private async consultar(ruta: string, contexto: ContextoSolicitud, cuerpo?: unknown): Promise<unknown> {
    const url = new URL(ruta, this.configuracion.organizacionUrl);
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: cuerpo === undefined ? 'GET' : 'POST',
        headers: {
          authorization: `Bearer ${contexto.token}`,
          accept: 'application/json',
          [CABECERA_TRAZA]: contexto.traceId,
          ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
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
