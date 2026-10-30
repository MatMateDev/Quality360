/**
 * Autorización por relación con la HDU (D57, D89). Cada operación sobre una HDU consulta a
 * Organización; aquí solo se traduce el resultado a 403 o 404 sin revelar existencia (D12, D50).
 */
import { Injectable } from '@nestjs/common';
import { ExcepcionQ360, accesoDenegado, noEncontrado } from '@quality360/auth-nest';

import type { RelacionHdu, RolUsuario } from '../dominio/tipos.js';
import { ProveedorAcceso, type AccesoHdu, type ContextoSolicitud } from './puertos.js';

/** Quién pide: el rol vigente sale de Organización (nunca del token), con el contexto para propagar. */
export interface Solicitante {
  readonly usuarioId: string;
  readonly rol: RolUsuario;
  /** Células vigentes del Líder QA (vacío en los demás roles). */
  readonly celulasIds: readonly string[];
  readonly contexto: ContextoSolicitud;
}

export function hduCerrada(): ExcepcionQ360 {
  return new ExcepcionQ360(409, 'HDU_CERRADA');
}

@Injectable()
export class Autorizador {
  constructor(private readonly proveedor: ProveedorAcceso) {}

  /** Administrador y Auditor leen todo: para ellos un recurso inexistente es 404; para el resto, 403. */
  noAccesible(solicitante: Solicitante): ExcepcionQ360 {
    return solicitante.rol === 'ADMINISTRADOR' || solicitante.rol === 'AUDITOR'
      ? noEncontrado('recurso inexistente')
      : accesoDenegado('HDU fuera de ámbito o inexistente');
  }

  /** Acceso a una HDU con cualquier relación. */
  async acceso(hduId: string, solicitante: Solicitante, opciones: { incluirCandidatos?: boolean } = {}): Promise<AccesoHdu> {
    const acceso = await this.proveedor.accesoHdu(hduId, solicitante.contexto, opciones);
    if (acceso === null) throw this.noAccesible(solicitante);
    return acceso;
  }

  /** Acceso exigiendo que la relación esté entre las permitidas; si no, 403 genérico. */
  async accesoCon(
    hduId: string,
    solicitante: Solicitante,
    permitida: (relacion: RelacionHdu) => boolean,
    opciones: { incluirCandidatos?: boolean } = {},
  ): Promise<AccesoHdu> {
    const acceso = await this.acceso(hduId, solicitante, opciones);
    if (!permitida(acceso.relacion)) throw accesoDenegado(`relación ${acceso.relacion} sin permiso`);
    return acceso;
  }
}
