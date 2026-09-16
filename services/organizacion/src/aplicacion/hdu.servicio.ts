/**
 * Casos de uso de HDU (E2-B01 a B04): creación, listado por ámbito, detalle,
 * asignación de analista, cambio de estado (con checklist de Certificaciones,
 * D11) e historial.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES, accesoDenegado, noEncontrado } from '@quality360/auth-nest';

import { ConflictoUnicidad } from '../dominio/errores/conflicto-unicidad.js';
import { evaluarAccesoHdu, filtroAmbitoHdu } from '../dominio/reglas/ambito.js';
import { puedeAsignarAnalistaHdu, puedeCambiarEstadoHdu } from '../dominio/reglas/permisos-hdu.js';
import { transicionesPermitidas, validarTransicion } from '../dominio/reglas/transiciones-hdu.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import {
  HDU_REPOSITORIO,
  type DatosNuevaHdu,
  type FiltroHdu,
  type HduRepositorio,
} from '../dominio/repositorios/hdu.repositorio.js';
import { SUPERVISION_REPOSITORIO, type SupervisionRepositorio } from '../dominio/repositorios/supervision.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type {
  Actor,
  AmbitoAcceso,
  Celula,
  EstadoHdu,
  EventoHistorialHdu,
  Hdu,
  OpcionesPaginacion,
  Pagina,
  PrioridadHdu,
  Rol,
  Sprint,
  UsuarioResumen,
} from '../dominio/tipos.js';
import { ErrorCierreRechazadoHdu, ErrorTransicionInvalidaHdu, type BloqueChecklist } from './errores-extendidos.js';
import { PROVEEDOR_CHECKLIST, type ProveedorChecklist } from './puertos/proveedor-checklist.js';

export interface HduResumenRespuesta {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly celula: { id: string; nombre: string };
  readonly sprint: { id: string; nombre: string };
  readonly prioridad: PrioridadHdu;
  readonly estado: EstadoHdu;
  readonly estadoActualizadoEn: Date;
  readonly qeResponsable: UsuarioResumen;
  readonly analista: UsuarioResumen | null;
  readonly creadoEn: Date;
}

export interface HduDetalleRespuesta extends HduResumenRespuesta {
  readonly creadoPor: Actor;
  readonly transicionesPermitidas: EstadoHdu[];
  readonly permisos: { cambiarEstado: boolean; asignarAnalista: boolean };
}

export interface ContextoActor {
  readonly esServicio: boolean;
  readonly rol: Rol | null;
  readonly actorId: string | null;
  readonly ambito: AmbitoAcceso;
}

function catalogoInvalido(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'CATALOGO_INVALIDO', { mensaje: MENSAJES.CATALOGO_INVALIDO });
}

function codigoDuplicado(): ExcepcionQ360 {
  return new ExcepcionQ360(409, 'CODIGO_HDU_DUPLICADO', { mensaje: MENSAJES.CODIGO_HDU_DUPLICADO });
}

function hduCerrada(): ExcepcionQ360 {
  return new ExcepcionQ360(409, 'HDU_CERRADA', { mensaje: MENSAJES.HDU_CERRADA });
}

function analistaInvalido(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'ANALISTA_INVALIDO', { mensaje: MENSAJES.ANALISTA_INVALIDO });
}

function analistaFueraDeEquipo(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'ANALISTA_FUERA_DE_EQUIPO', { mensaje: MENSAJES.ANALISTA_FUERA_DE_EQUIPO });
}

function motivoRequerido(): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'MOTIVO_REQUERIDO', { mensaje: MENSAJES.MOTIVO_REQUERIDO });
}

@Injectable()
export class HduAplicacion {
  constructor(
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    @Inject(PROVEEDOR_CHECKLIST) private readonly checklist: ProveedorChecklist,
  ) {}

  async crear(datos: Omit<DatosNuevaHdu, 'qeResponsableId'>, qeResponsableId: string, actor: Actor): Promise<HduDetalleRespuesta> {
    const [celula, sprint] = await Promise.all([this.catalogos.buscarCelula(datos.celulaId), this.catalogos.buscarSprint(datos.sprintId)]);
    if (celula === null || sprint === null) throw catalogoInvalido();

    const codigoNormalizado = datos.codigo.trim().toLowerCase();
    const existente = await this.hdus.buscarPorCodigoNormalizado(codigoNormalizado);
    if (existente !== null) throw codigoDuplicado();

    try {
      const creada = await this.hdus.crear({ ...datos, codigo: datos.codigo.trim(), qeResponsableId }, actor);
      return this.aDetalle(creada, { esServicio: false, rol: 'ADMINISTRADOR', actorId: qeResponsableId, ambito: { qeSupervisorId: null, analistasSupervisadosIds: [] } });
    } catch (error) {
      if (error instanceof ConflictoUnicidad) throw codigoDuplicado();
      throw error;
    }
  }

  async obtener(id: string, contexto: ContextoActor): Promise<HduDetalleRespuesta> {
    const hdu = await this.buscarConAmbito(id, contexto);
    return this.aDetalle(hdu, contexto);
  }

  async listar(contexto: ContextoActor, filtro: FiltroHdu, paginacion: OpcionesPaginacion): Promise<Pagina<HduResumenRespuesta>> {
    const rol = contexto.rol ?? 'ADMINISTRADOR';
    const actorId = contexto.actorId ?? '';
    const ambitoFiltro = filtroAmbitoHdu(rol, actorId, contexto.ambito);
    const pagina = await this.hdus.listarPorAmbito(ambitoFiltro, filtro, paginacion);
    return { ...pagina, items: await this.enriquecerResumen(pagina.items) };
  }

  async historial(id: string, contexto: ContextoActor): Promise<{ hduId: string; items: EventoHistorialHdu[] }> {
    await this.buscarConAmbito(id, contexto);
    const items = await this.hdus.historial(id);
    return { hduId: id, items };
  }

  async asignarAnalista(id: string, analistaIdSolicitado: string, motivoCrudo: string | undefined, contexto: ContextoActor, actor: Actor) {
    const hdu = await this.buscarParaEscritura(id, contexto);

    if (!contexto.esServicio) {
      const rol = contexto.rol as Rol;
      const actorId = contexto.actorId as string;
      if (!puedeAsignarAnalistaHdu(rol, actorId, hdu)) throw accesoDenegado('sin permiso para asignar analista en esta HDU');
    }
    if (hdu.estado === 'CERRADA') throw hduCerrada();

    const analista = await this.usuarios.buscarPorId(analistaIdSolicitado);
    if (analista === null || analista.rol !== 'ANALISTA_QA' || !analista.activo) throw analistaInvalido();

    const esAdmin = !contexto.esServicio && contexto.rol === 'ADMINISTRADOR';
    if (!esAdmin) {
      const qeEquipo = contexto.esServicio ? hdu.qeResponsableId : (contexto.actorId as string);
      const equipo = await this.supervision.listarAnalistasVigentesIds(qeEquipo);
      if (!equipo.includes(analistaIdSolicitado)) throw analistaFueraDeEquipo();
    }

    const motivo = motivoCrudo?.trim() ?? '';
    if (hdu.analistaId !== null && hdu.analistaId !== analistaIdSolicitado && motivo.length === 0) throw motivoRequerido();

    const resultado = await this.hdus.asignarAnalista({
      hduId: id,
      analistaId: analistaIdSolicitado,
      motivo: motivo.length > 0 ? motivo : null,
      actor,
    });

    const [analistaNuevo] = await this.usuarios.listarResumenPorIds([analistaIdSolicitado]);
    const analistaAnterior =
      resultado.analistaAnteriorId === null ? null : (await this.usuarios.listarResumenPorIds([resultado.analistaAnteriorId]))[0] ?? null;

    return {
      cambio: resultado.cambio,
      hdu: (await this.enriquecerResumen([resultado.hdu]))[0],
      analistaAnterior,
      analistaNuevo: analistaNuevo as UsuarioResumen,
      motivo: resultado.cambio ? (motivo.length > 0 ? motivo : null) : null,
      fecha: resultado.fecha,
      actor,
    };
  }

  async cambiarEstado(
    id: string,
    estadoSolicitado: EstadoHdu,
    contexto: ContextoActor,
    actor: Actor,
    solicitud: { token: string; traceId: string },
  ) {
    const hdu = await this.buscarParaEscritura(id, contexto);

    if (contexto.esServicio && estadoSolicitado === 'CERRADA') {
      throw accesoDenegado('la credencial de servicio no puede solicitar CERRADA');
    }
    if (!contexto.esServicio) {
      const rol = contexto.rol as Rol;
      const actorId = contexto.actorId as string;
      if (!puedeCambiarEstadoHdu(rol, actorId, contexto.ambito, hdu)) throw accesoDenegado('sin permiso para cambiar el estado de esta HDU');
    }

    const validacion = validarTransicion(hdu.estado, estadoSolicitado);
    if (!validacion.valida) throw new ErrorTransicionInvalidaHdu(hdu.estado, estadoSolicitado, validacion.transicionesPermitidas);

    if (estadoSolicitado === 'CERRADA') {
      const consulta = await this.checklist.consultar(id, solicitud.token, solicitud.traceId);
      const bloque: BloqueChecklist = consulta.disponible
        ? { fuente: 'certificaciones.checklist', estado: 'ok', datos: consulta.datos }
        : { fuente: 'certificaciones.checklist', estado: 'indisponible' };
      if (!consulta.disponible) throw new ErrorCierreRechazadoHdu('CHECKLIST_NO_DISPONIBLE', bloque);
      if (!consulta.datos.completo) throw new ErrorCierreRechazadoHdu('CHECKLIST_INCOMPLETO', bloque);
    }

    const resultado = await this.hdus.cambiarEstado({ hduId: id, estadoNuevo: estadoSolicitado, actor });
    return {
      hdu: (await this.enriquecerResumen([resultado.hdu]))[0],
      estadoAnterior: resultado.estadoAnterior,
      estadoNuevo: estadoSolicitado,
      fecha: resultado.fecha,
      actor,
      transicionesPermitidas: transicionesPermitidas(estadoSolicitado),
    };
  }

  /** Existencia + ámbito de lectura (D12): 404 solo para Administrador; 403 genérico para el resto. */
  private async buscarConAmbito(id: string, contexto: ContextoActor): Promise<Hdu> {
    const hdu = await this.hdus.buscarPorId(id);
    const rol = contexto.rol ?? 'ADMINISTRADOR';
    if (hdu === null) {
      if (rol === 'ADMINISTRADOR' || contexto.esServicio) throw noEncontrado('HDU inexistente');
      throw accesoDenegado('HDU fuera de ámbito');
    }
    if (!contexto.esServicio) {
      const acceso = evaluarAccesoHdu(rol, contexto.actorId as string, contexto.ambito, hdu);
      if (!acceso.permitido) throw accesoDenegado('HDU fuera de ámbito');
    }
    return hdu;
  }

  /** Existencia para escritura: mismas reglas 404/403 que la lectura; el permiso específico lo valida cada caso de uso. */
  private async buscarParaEscritura(id: string, contexto: ContextoActor): Promise<Hdu> {
    const hdu = await this.hdus.buscarPorId(id);
    if (hdu === null) {
      if (contexto.esServicio || contexto.rol === 'ADMINISTRADOR') throw noEncontrado('HDU inexistente');
      throw accesoDenegado('HDU fuera de ámbito');
    }
    return hdu;
  }

  private async aDetalle(hdu: Hdu, contexto: ContextoActor): Promise<HduDetalleRespuesta> {
    const [resumen] = await this.enriquecerResumen([hdu]);
    const rol = contexto.rol ?? 'ADMINISTRADOR';
    const actorId = contexto.actorId ?? '';
    const permisos = contexto.esServicio
      ? { cambiarEstado: false, asignarAnalista: false }
      : {
          cambiarEstado: puedeCambiarEstadoHdu(rol, actorId, contexto.ambito, hdu),
          asignarAnalista: puedeAsignarAnalistaHdu(rol, actorId, hdu),
        };
    return {
      ...(resumen as HduResumenRespuesta),
      creadoPor: hdu.creadoPor,
      transicionesPermitidas: permisos.cambiarEstado ? transicionesPermitidas(hdu.estado) : [],
      permisos,
    };
  }

  private async enriquecerResumen(hdus: Hdu[]): Promise<HduResumenRespuesta[]> {
    if (hdus.length === 0) return [];
    const [celulas, sprints] = await Promise.all([this.catalogos.listarCelulas(), this.catalogos.listarSprints()]);
    const mapaCelulas = new Map<string, Celula>(celulas.map((c) => [c.id, c]));
    const mapaSprints = new Map<string, Sprint>(sprints.map((s) => [s.id, s]));

    const idsUsuarios = new Set<string>();
    for (const hdu of hdus) {
      idsUsuarios.add(hdu.qeResponsableId);
      if (hdu.analistaId !== null) idsUsuarios.add(hdu.analistaId);
    }
    const usuarios = await this.usuarios.listarResumenPorIds([...idsUsuarios]);
    const mapaUsuarios = new Map(usuarios.map((usuario) => [usuario.id, usuario]));
    const resumenUsuario = (id: string): UsuarioResumen => mapaUsuarios.get(id) ?? { id, nombre: '(usuario no disponible)', correo: '' };
    const refCatalogo = (mapa: Map<string, { id: string; nombre: string }>, id: string): { id: string; nombre: string } =>
      mapa.get(id) ?? { id, nombre: '(no disponible)' };

    return hdus.map((hdu) => ({
      id: hdu.id,
      codigo: hdu.codigo,
      titulo: hdu.titulo,
      celula: refCatalogo(mapaCelulas, hdu.celulaId),
      sprint: refCatalogo(mapaSprints, hdu.sprintId),
      prioridad: hdu.prioridad,
      estado: hdu.estado,
      estadoActualizadoEn: hdu.estadoActualizadoEn,
      qeResponsable: resumenUsuario(hdu.qeResponsableId),
      analista: hdu.analistaId === null ? null : resumenUsuario(hdu.analistaId),
      creadoEn: hdu.creadoEn,
    }));
  }
}
