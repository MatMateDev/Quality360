/**
 * Casos de uso de administración de usuarios (E1-B06, B07, B08) y perfil
 * (E1-B10). El controlador valida el esquema (class-validator); aquí se
 * aplican las reglas de negocio.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES, noEncontrado } from '@quality360/auth-nest';

import { ConflictoUnicidad } from '../dominio/errores/conflicto-unicidad.js';
import {
  SUPERVISION_REPOSITORIO,
  type SupervisionRepositorio,
} from '../dominio/repositorios/supervision.repositorio.js';
import {
  USUARIO_REPOSITORIO,
  type FiltroUsuarios,
  type ResumenUsuariosAdmin,
  type UsuarioRepositorio,
} from '../dominio/repositorios/usuario.repositorio.js';
import type { Actor, OpcionesPaginacion, Pagina, Rol, Usuario, UsuarioResumen } from '../dominio/tipos.js';
import { actorDeUsuario } from './actores.js';
import { ErrorRelacionesIncompatibles } from './errores-extendidos.js';
import { PROVEEDOR_IDENTIDAD, type ProveedorIdentidad } from './puertos/proveedor-identidad.js';

export interface UsuarioRespuesta {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
  readonly activo: boolean;
  readonly supervisorVigente: UsuarioResumen | null;
  readonly analistasVigentes: number;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface PerfilRespuesta {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
}

function conflicto(codigo: 'CORREO_DUPLICADO'): ExcepcionQ360 {
  return new ExcepcionQ360(409, codigo, { mensaje: MENSAJES[codigo] });
}

function ultimoAdministrador(): ExcepcionQ360 {
  return new ExcepcionQ360(409, 'ULTIMO_ADMINISTRADOR', { mensaje: MENSAJES.ULTIMO_ADMINISTRADOR });
}

@Injectable()
export class UsuariosAplicacion {
  constructor(
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
  ) {}

  async perfil(usuarioId: string): Promise<PerfilRespuesta> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (usuario === null) throw noEncontrado('perfil sin registro local');
    return { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol };
  }

  async listar(filtro: FiltroUsuarios, paginacion: OpcionesPaginacion): Promise<Pagina<UsuarioRespuesta>> {
    const pagina = await this.usuarios.listar(filtro, paginacion);
    return { ...pagina, items: await this.enriquecer(pagina.items) };
  }

  async obtener(id: string): Promise<UsuarioRespuesta> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (usuario === null) throw noEncontrado('usuario inexistente');
    const [enriquecido] = await this.enriquecer([usuario]);
    return enriquecido as UsuarioRespuesta;
  }

  async resumenAdmin(): Promise<ResumenUsuariosAdmin> {
    return this.usuarios.resumenAdmin();
  }

  async crear(datos: { nombre: string; correo: string; rol: Rol }, actor: Actor): Promise<UsuarioRespuesta> {
    const correo = datos.correo.trim().toLowerCase();
    const nombre = datos.nombre.trim();

    const existente = await this.usuarios.buscarPorCorreo(correo);
    if (existente !== null) throw conflicto('CORREO_DUPLICADO');

    const cuenta = await this.identidad.invitarUsuario({ correo, nombre });
    try {
      const creado = await this.usuarios.crear({ id: cuenta.id, nombre, correo, rol: datos.rol, activo: true }, actor);
      const [enriquecido] = await this.enriquecer([creado]);
      return enriquecido as UsuarioRespuesta;
    } catch (error) {
      await this.identidad.eliminarUsuario(cuenta.id);
      if (error instanceof ConflictoUnicidad) throw conflicto('CORREO_DUPLICADO');
      throw error;
    }
  }

  async actualizar(
    id: string,
    cambios: { nombre?: string; correo?: string; activo?: boolean },
    actor: Actor,
  ): Promise<UsuarioRespuesta> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (usuario === null) throw noEncontrado('usuario inexistente');

    if (usuario.rol === 'ADMINISTRADOR' && cambios.activo === false && usuario.activo) {
      const activos = await this.usuarios.contarAdministradoresActivos();
      if (activos <= 1) throw ultimoAdministrador();
    }

    if (usuario.rol === 'QE' && cambios.activo === false && usuario.activo) {
      const analistasIds = await this.supervision.listarAnalistasVigentesIds(id);
      if (analistasIds.length > 0) {
        const analistas = await this.usuarios.listarResumenPorIds(analistasIds);
        throw new ErrorRelacionesIncompatibles({ analistasVigentes: analistas, supervisorVigente: null });
      }
    }

    const correoNuevo = cambios.correo !== undefined ? cambios.correo.trim().toLowerCase() : undefined;
    if (correoNuevo !== undefined && correoNuevo !== usuario.correo) {
      const existente = await this.usuarios.buscarPorCorreo(correoNuevo);
      if (existente !== null && existente.id !== id) throw conflicto('CORREO_DUPLICADO');
      await this.identidad.actualizarCorreo(id, correoNuevo);
    }

    try {
      const actualizado = await this.usuarios.actualizar(
        id,
        { nombre: cambios.nombre?.trim(), correo: correoNuevo, activo: cambios.activo },
        actor,
      );
      const [enriquecido] = await this.enriquecer([actualizado]);
      return enriquecido as UsuarioRespuesta;
    } catch (error) {
      if (error instanceof ConflictoUnicidad) throw conflicto('CORREO_DUPLICADO');
      throw error;
    }
  }

  async cambiarRol(id: string, rolNuevo: Rol, actor: Actor): Promise<UsuarioRespuesta> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (usuario === null) throw noEncontrado('usuario inexistente');
    if (usuario.rol === rolNuevo) {
      const [enriquecido] = await this.enriquecer([usuario]);
      return enriquecido as UsuarioRespuesta;
    }

    if (usuario.rol === 'ADMINISTRADOR') {
      const activos = await this.usuarios.contarAdministradoresActivos();
      if (activos <= 1) throw ultimoAdministrador();
    }

    if (usuario.rol === 'QE') {
      const analistasIds = await this.supervision.listarAnalistasVigentesIds(id);
      if (analistasIds.length > 0) {
        const analistas = await this.usuarios.listarResumenPorIds(analistasIds);
        throw new ErrorRelacionesIncompatibles({ analistasVigentes: analistas, supervisorVigente: null });
      }
    }

    if (usuario.rol === 'ANALISTA_QA') {
      const qeVigenteId = await this.supervision.buscarQeVigente(id);
      if (qeVigenteId !== null) {
        const [qe] = await this.usuarios.listarResumenPorIds([qeVigenteId]);
        throw new ErrorRelacionesIncompatibles({ analistasVigentes: [], supervisorVigente: qe ?? null });
      }
    }

    const actualizado = await this.usuarios.cambiarRol(id, rolNuevo, actor);
    const [enriquecido] = await this.enriquecer([actualizado]);
    return enriquecido as UsuarioRespuesta;
  }

  /** Actor `{tipo:'USUARIO', ...}` a partir del usuario autenticado (para auditoría). */
  async actorDesde(usuarioId: string): Promise<Actor> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (usuario === null) throw noEncontrado('usuario inexistente');
    return actorDeUsuario(usuario);
  }

  private async enriquecer(usuarios: Usuario[]): Promise<UsuarioRespuesta[]> {
    const analistaIds = usuarios.filter((usuario) => usuario.rol === 'ANALISTA_QA').map((usuario) => usuario.id);
    const qeIds = usuarios.filter((usuario) => usuario.rol === 'QE').map((usuario) => usuario.id);
    const [mapaSupervisor, mapaConteo] = await Promise.all([
      this.supervision.mapaQeVigentePorAnalistas(analistaIds),
      this.supervision.mapaConteoAnalistasPorQe(qeIds),
    ]);
    return usuarios.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      activo: usuario.activo,
      supervisorVigente: usuario.rol === 'ANALISTA_QA' ? (mapaSupervisor.get(usuario.id) ?? null) : null,
      analistasVigentes: usuario.rol === 'QE' ? (mapaConteo.get(usuario.id) ?? 0) : 0,
      creadoEn: usuario.creadoEn,
      actualizadoEn: usuario.actualizadoEn,
    }));
  }
}
