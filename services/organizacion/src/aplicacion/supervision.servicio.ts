/**
 * Casos de uso de supervisión y equipo (E1-B03, B04, B05, B09) y de los
 * resúmenes que consume el gateway en `/v1/inicio/*`.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES, noEncontrado } from '@quality360/auth-nest';

import { decidirCambioSupervision, esAsignacionDeRolesValida, esMotivoValido } from '../dominio/reglas/supervision.js';
import {
  SUPERVISION_REPOSITORIO,
  type ResultadoCambioSupervision,
  type ResumenSupervisionAdmin,
  type SupervisionRepositorio,
} from '../dominio/repositorios/supervision.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { Actor, SupervisionConUsuarios, UsuarioResumen } from '../dominio/tipos.js';

export interface AnalistaEquipo {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly activo: boolean;
  readonly supervisadoDesde: Date;
}

export interface EquipoQeRespuesta {
  readonly qe: UsuarioResumen;
  readonly items: AnalistaEquipo[];
  readonly total: number;
}

export interface HistorialSupervisionRespuesta {
  readonly analista: UsuarioResumen;
  readonly items: SupervisionConUsuarios[];
}

function supervisionInvalida(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'SUPERVISION_INVALIDA', { mensaje: MENSAJES.SUPERVISION_INVALIDA });
}

function motivoRequerido(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'MOTIVO_REQUERIDO', { mensaje: MENSAJES.MOTIVO_REQUERIDO });
}

@Injectable()
export class SupervisionAplicacion {
  constructor(
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
  ) {}

  async asignarSupervisor(
    analistaId: string,
    qeId: string,
    motivoCrudo: string | undefined,
    actor: Actor,
  ): Promise<ResultadoCambioSupervision> {
    const analista = await this.usuarios.buscarPorId(analistaId);
    if (analista === null) throw noEncontrado('analista inexistente');
    const qe = await this.usuarios.buscarPorId(qeId);
    if (qe === null) throw noEncontrado('QE inexistente');
    if (!esAsignacionDeRolesValida(qe, analista)) throw supervisionInvalida();

    const qeVigenteId = await this.supervision.buscarQeVigente(analistaId);
    const decision = decidirCambioSupervision(qeVigenteId === null ? null : { qeId: qeVigenteId }, qeId);

    const motivo = motivoCrudo?.trim() ?? '';
    if (decision.cambio && decision.requiereMotivo && !esMotivoValido(motivo)) throw motivoRequerido();

    return this.supervision.cerrarYCrearVigente({
      analistaId,
      qeId,
      motivo: motivo.length > 0 ? motivo : null,
      actor,
    });
  }

  async historial(analistaId: string): Promise<HistorialSupervisionRespuesta> {
    const analista = await this.usuarios.buscarPorId(analistaId);
    if (analista === null) throw noEncontrado('analista inexistente');
    const items = await this.supervision.listarHistorialPorAnalista(analistaId);
    return { analista: { id: analista.id, nombre: analista.nombre, correo: analista.correo }, items };
  }

  async equipoVigente(qeId: string): Promise<EquipoQeRespuesta> {
    const qe = await this.usuarios.buscarPorId(qeId);
    if (qe === null || qe.rol !== 'QE') throw noEncontrado('QE inexistente');
    const filas = await this.supervision.listarEquipoVigente(qeId);
    return {
      qe: { id: qe.id, nombre: qe.nombre, correo: qe.correo },
      items: filas.map((fila) => ({ ...fila.analista, supervisadoDesde: fila.desde })),
      total: filas.length,
    };
  }

  async analistasAsignables(rol: 'ADMINISTRADOR' | 'QE', actorId: string): Promise<UsuarioResumen[]> {
    if (rol === 'ADMINISTRADOR') return this.usuarios.listarAnalistasActivos();
    const filas = await this.supervision.listarEquipoVigente(actorId);
    return filas.filter((fila) => fila.analista.activo).map((fila) => ({ id: fila.analista.id, nombre: fila.analista.nombre, correo: fila.analista.correo }));
  }

  async resumenAdmin(): Promise<ResumenSupervisionAdmin> {
    return this.supervision.resumenAdmin();
  }

  async resumenEquipoQe(qeId: string): Promise<{ analistasVigentes: number }> {
    const ids = await this.supervision.listarAnalistasVigentesIds(qeId);
    return { analistasVigentes: ids.length };
  }

  async resumenSupervisorQa(analistaId: string): Promise<{ supervisor: UsuarioResumen | null }> {
    const qeId = await this.supervision.buscarQeVigente(analistaId);
    if (qeId === null) return { supervisor: null };
    const [qe] = await this.usuarios.listarResumenPorIds([qeId]);
    return { supervisor: qe ?? null };
  }
}
