/**
 * Casos de uso de administración de usuarios (E1-B06, B07, B08), perfil
 * (E1-B10) y rol y células del Líder QA (E7-B01). El controlador valida el
 * esquema (class-validator); aquí se aplican las reglas de negocio.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES, errorValidacion, noEncontrado } from '@quality360/auth-nest';

import { ConflictoUnicidad } from '../dominio/errores/conflicto-unicidad.js';
import { celulaIdsCompatiblesConRol, decidirCambioRol, relacionesVacias } from '../dominio/reglas/rol-celulas.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import { CELULA_LIDER_REPOSITORIO, type CelulaLiderRepositorio } from '../dominio/repositorios/celula-lider.repositorio.js';
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
import {
  ROLES,
  esRolSoloLectura,
  type Actor,
  type AsignacionCelulaLider,
  type CatalogoRef,
  type OpcionesPaginacion,
  type Pagina,
  type Rol,
  type Usuario,
  type UsuarioResumen,
} from '../dominio/tipos.js';
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
  readonly celulasVigentes: CatalogoRef[];
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

export interface PerfilRespuesta {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
}

export interface CelulasLiderRespuesta {
  readonly usuario: UsuarioResumen;
  readonly vigentes: AsignacionCelulaLider[];
  readonly historial: AsignacionCelulaLider[];
}

export interface RolCatalogo {
  readonly codigo: Rol;
  readonly nombre: string;
  readonly soloLectura: boolean;
}

/** Los 5 roles en el orden del selector (E7-B01-T01). */
const NOMBRES_ROL: Readonly<Record<Rol, string>> = {
  ANALISTA_QA: 'Analista QA',
  QE: 'QE',
  LIDER_QA: 'Líder QA',
  ADMINISTRADOR: 'Administrador',
  AUDITOR: 'Auditor',
};
const ORDEN_SELECTOR: readonly Rol[] = ['ANALISTA_QA', 'QE', 'LIDER_QA', 'ADMINISTRADOR', 'AUDITOR'];

function conflicto(codigo: 'CORREO_DUPLICADO'): ExcepcionQ360 {
  return new ExcepcionQ360(409, codigo, { mensaje: MENSAJES[codigo] });
}

function ultimoAdministrador(): ExcepcionQ360 {
  return new ExcepcionQ360(409, 'ULTIMO_ADMINISTRADOR', { mensaje: MENSAJES.ULTIMO_ADMINISTRADOR });
}

function rolIncompatible(): ExcepcionQ360 {
  return new ExcepcionQ360(409, 'ROL_INCOMPATIBLE', { mensaje: MENSAJES.ROL_INCOMPATIBLE });
}

@Injectable()
export class UsuariosAplicacion {
  constructor(
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    @Inject(CELULA_LIDER_REPOSITORIO) private readonly celulasLider: CelulaLiderRepositorio,
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
    @Inject(PROVEEDOR_IDENTIDAD) private readonly identidad: ProveedorIdentidad,
  ) {}

  roles(): { items: RolCatalogo[] } {
    return {
      items: ORDEN_SELECTOR.filter((rol) => ROLES.includes(rol)).map((codigo) => ({
        codigo,
        nombre: NOMBRES_ROL[codigo],
        soloLectura: esRolSoloLectura(codigo),
      })),
    };
  }

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

  async crear(datos: { nombre: string; correo: string; rol: Rol; celulaIds?: string[] }, actor: Actor): Promise<UsuarioRespuesta> {
    const correo = datos.correo.trim().toLowerCase();
    const nombre = datos.nombre.trim();

    this.exigirCelulasSoloConLider(datos.rol, datos.celulaIds);
    await this.exigirCelulasExistentes(datos.celulaIds);

    const existente = await this.usuarios.buscarPorCorreo(correo);
    if (existente !== null) throw conflicto('CORREO_DUPLICADO');

    const cuenta = await this.identidad.invitarUsuario({ correo, nombre });
    try {
      const creado = await this.usuarios.crear(
        { id: cuenta.id, nombre, correo, rol: datos.rol, activo: true, celulaIds: datos.rol === 'LIDER_QA' ? datos.celulaIds : undefined },
        actor,
      );
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

    // Desactivar conserva la regla de E1-B07: solo un QE con analistas vigentes lo impide (D43).
    if (usuario.rol === 'QE' && cambios.activo === false && usuario.activo) {
      const analistasIds = await this.supervision.listarAnalistasVigentesIds(id);
      if (analistasIds.length > 0) {
        const analistas = await this.usuarios.listarResumenPorIds(analistasIds);
        throw new ErrorRelacionesIncompatibles({ ...relacionesVacias(), analistasVigentes: analistas });
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

  /**
   * Cambio de rol atómico (D42). Orden de validación (D43): esquema y rol del
   * catálogo (400, en el controlador) → `celulaIds` solo con Líder (400) → células
   * existentes (422) → último administrador (409) → relaciones incompatibles (409).
   */
  async cambiarRol(id: string, rolNuevo: Rol, celulaIds: string[] | undefined, actor: Actor): Promise<UsuarioRespuesta> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (usuario === null) throw noEncontrado('usuario inexistente');

    this.exigirCelulasSoloConLider(rolNuevo, celulaIds);
    await this.exigirCelulasExistentes(celulaIds);

    const resultado = await this.usuarios.cambiarRolAtomico({
      id,
      rolNuevo,
      celulaIds: rolNuevo === 'LIDER_QA' ? celulaIds : undefined,
      actor,
      decidir: (instantanea) =>
        decidirCambioRol({
          rolActual: instantanea.usuario.rol,
          rolNuevo,
          administradoresActivos: instantanea.administradoresActivos,
          relaciones: instantanea.relaciones,
        }),
    });

    if (resultado.tipo === 'RECHAZADO') {
      if (resultado.decision.tipo === 'ULTIMO_ADMINISTRADOR') throw ultimoAdministrador();
      throw new ErrorRelacionesIncompatibles(resultado.decision.relaciones);
    }
    const [enriquecido] = await this.enriquecer([resultado.usuario]);
    return enriquecido as UsuarioRespuesta;
  }

  async celulasDeLider(id: string): Promise<CelulasLiderRespuesta> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (usuario === null) throw noEncontrado('usuario inexistente');
    const [vigentes, historial] = await Promise.all([this.celulasLider.listarVigentes(id), this.celulasLider.listarHistorial(id)]);
    return {
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo },
      vigentes: vigentes.filter((fila) => fila.hasta === null),
      historial,
    };
  }

  /** `PUT /v1/usuarios/{id}/celulas-lider`: el usuario debe ser Líder QA (409 `ROL_INCOMPATIBLE`). */
  async reemplazarCelulasDeLider(id: string, celulaIds: string[], actor: Actor): Promise<CelulasLiderRespuesta> {
    const usuario = await this.usuarios.buscarPorId(id);
    if (usuario === null) throw noEncontrado('usuario inexistente');
    await this.exigirCelulasExistentes(celulaIds);

    const resultado = await this.celulasLider.reemplazar({ usuarioId: id, celulaIds, actor });
    if (resultado.tipo === 'ROL_INCOMPATIBLE') throw rolIncompatible();
    return this.celulasDeLider(id);
  }

  /** Actor `{tipo:'USUARIO', ...}` a partir del usuario autenticado (para auditoría). */
  async actorDesde(usuarioId: string): Promise<Actor> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (usuario === null) throw noEncontrado('usuario inexistente');
    return actorDeUsuario(usuario);
  }

  /** 400 `NO_PERMITIDO`: `celulaIds` no vacío solo se acepta con `rol: LIDER_QA` (D42). */
  private exigirCelulasSoloConLider(rol: Rol, celulaIds: readonly string[] | undefined): void {
    if (celulaIdsCompatiblesConRol(rol, celulaIds)) return;
    throw errorValidacion(
      [{ campo: 'celulaIds', codigo: 'NO_PERMITIDO', mensaje: 'Solo un Líder QA puede tener células a cargo.' }],
      'celulaIds con un rol distinto de LIDER_QA',
    );
  }

  /** 422 `CATALOGO_INVALIDO` con `{campo: celulaIds[i], codigo: NO_EXISTE}` (D42). */
  private async exigirCelulasExistentes(celulaIds: readonly string[] | undefined): Promise<void> {
    if (celulaIds === undefined || celulaIds.length === 0) return;
    const existentes = new Set((await this.catalogos.buscarCelulas(celulaIds)).map((celula) => celula.id));
    const detalles = celulaIds
      .map((celulaId, indice) => ({ celulaId, indice }))
      .filter(({ celulaId }) => !existentes.has(celulaId))
      .map(({ indice }) => ({ campo: `celulaIds[${indice}]`, codigo: 'NO_EXISTE' as const, mensaje: 'La célula indicada no existe.' }));
    if (detalles.length > 0) throw new ExcepcionQ360(422, 'CATALOGO_INVALIDO', { mensaje: MENSAJES.CATALOGO_INVALIDO, detalles });
  }

  private async enriquecer(usuarios: Usuario[]): Promise<UsuarioRespuesta[]> {
    const analistaIds = usuarios.filter((usuario) => usuario.rol === 'ANALISTA_QA').map((usuario) => usuario.id);
    const qeIds = usuarios.filter((usuario) => usuario.rol === 'QE').map((usuario) => usuario.id);
    const liderIds = usuarios.filter((usuario) => usuario.rol === 'LIDER_QA').map((usuario) => usuario.id);
    const [mapaSupervisor, mapaConteo, mapaCelulas] = await Promise.all([
      this.supervision.mapaQeVigentePorAnalistas(analistaIds),
      this.supervision.mapaConteoAnalistasPorQe(qeIds),
      this.celulasLider.mapaCelulasVigentes(liderIds),
    ]);
    return usuarios.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      activo: usuario.activo,
      supervisorVigente: usuario.rol === 'ANALISTA_QA' ? (mapaSupervisor.get(usuario.id) ?? null) : null,
      analistasVigentes: usuario.rol === 'QE' ? (mapaConteo.get(usuario.id) ?? 0) : 0,
      celulasVigentes: usuario.rol === 'LIDER_QA' ? (mapaCelulas.get(usuario.id) ?? []) : [],
      creadoEn: usuario.creadoEn,
      actualizadoEn: usuario.actualizadoEn,
    }));
  }
}
