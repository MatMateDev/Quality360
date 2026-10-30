/** Casos de uso de `/v1/interno/hdu/*` (D12, para Certificaciones e Impedimentos). */
import { Inject, Injectable } from '@nestjs/common';
import { accesoDenegado } from '@quality360/auth-nest';

import { evaluarAccesoHdu, filtroAmbitoHdu } from '../dominio/reglas/ambito.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import { CELULA_LIDER_REPOSITORIO, type CelulaLiderRepositorio } from '../dominio/repositorios/celula-lider.repositorio.js';
import { SUPERVISION_REPOSITORIO, type SupervisionRepositorio } from '../dominio/repositorios/supervision.repositorio.js';
import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { AmbitoAcceso, EstadoHdu, Hdu, RelacionAccesoHdu, Rol, Sprint } from '../dominio/tipos.js';
import { HduAplicacion, type HduResumenRespuesta } from './hdu.servicio.js';

/** Datos de la HDU que Certificaciones necesita para sus reglas y el certificado (E3). */
export interface HduParaCertificacion {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
  readonly celula: string;
  readonly sprint: string;
  /** E4 (D86): ids para filtrar en Impedimentos y fin del sprint vigente (AAAA-MM-DD). */
  readonly celulaId: string;
  readonly sprintId: string;
  readonly sprintFin: string | null;
  readonly qeResponsable: { id: string; nombre: string };
  readonly analista: { id: string; nombre: string } | null;
}

export interface AmbitoLecturaHdu {
  readonly usuarioId: string;
  readonly rol: Rol;
  readonly todas: boolean;
  readonly hduIds: string[];
}

export interface PersonaConRol {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Rol;
}

/** Candidatos a responsable de un impedimento (tabla 3.5 del backlog E4), solo usuarios activos. */
export interface CandidatosResponsable {
  readonly registro: PersonaConRol[];
  readonly escalamiento: PersonaConRol[];
}

export interface AccesoHduRespuesta {
  readonly hduId: string;
  readonly permitido: boolean;
  readonly relacion: RelacionAccesoHdu | null;
  readonly actor?: { id: string; nombre: string; rol: Rol };
  readonly hdu?: HduParaCertificacion;
  readonly candidatosResponsable?: CandidatosResponsable;
}

function paraCertificacion(resumen: HduResumenRespuesta, sprints: ReadonlyMap<string, Sprint>): HduParaCertificacion {
  const fin = sprints.get(resumen.sprint.id)?.fin;
  return {
    id: resumen.id,
    codigo: resumen.codigo,
    titulo: resumen.titulo,
    estado: resumen.estado,
    celula: resumen.celula.nombre,
    sprint: resumen.sprint.nombre,
    celulaId: resumen.celula.id,
    sprintId: resumen.sprint.id,
    sprintFin: fin === undefined ? null : fin.toISOString().slice(0, 10),
    qeResponsable: { id: resumen.qeResponsable.id, nombre: resumen.qeResponsable.nombre },
    analista: resumen.analista === null ? null : { id: resumen.analista.id, nombre: resumen.analista.nombre },
  };
}

@Injectable()
export class AccesoAplicacion {
  constructor(
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
    @Inject(CELULA_LIDER_REPOSITORIO) private readonly celulasLider: CelulaLiderRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    private readonly hduAplicacion: HduAplicacion,
  ) {}

  async accesoHdu(hduId: string, rol: Rol, actorId: string, ambito: AmbitoAcceso, incluirCandidatos = false): Promise<AccesoHduRespuesta> {
    const hdu = await this.hdus.buscarPorId(hduId);
    if (hdu === null) return { hduId, permitido: false, relacion: null };
    const resultado = evaluarAccesoHdu(rol, actorId, ambito, hdu);
    if (!resultado.permitido) return { hduId, permitido: false, relacion: null };

    const [[resumen], [actor], sprints] = await Promise.all([
      this.hduAplicacion.resumir([hdu]),
      this.usuarios.listarResumenPorIds([actorId]),
      this.mapaSprints(),
    ]);
    return {
      hduId,
      permitido: true,
      relacion: resultado.relacion,
      actor: { id: actorId, nombre: actor?.nombre ?? '(usuario no disponible)', rol },
      hdu: paraCertificacion(resumen as HduResumenRespuesta, sprints),
      ...(incluirCandidatos ? { candidatosResponsable: await this.candidatos(hdu) } : {}),
    };
  }

  private async mapaSprints(): Promise<Map<string, Sprint>> {
    return new Map((await this.catalogos.listarSprints()).map((sprint) => [sprint.id, sprint]));
  }

  /**
   * Candidatos activos (tabla 3.5): registro = QE responsable y QE supervisor vigente del analista, sin
   * repetir; escalamiento = Líderes con la célula vigente y Administradores activos (D63, D64).
   */
  private async candidatos(hdu: Hdu): Promise<CandidatosResponsable> {
    const supervisorId = hdu.analistaId === null ? null : await this.supervision.buscarQeVigente(hdu.analistaId);
    const idsRegistro = [...new Set([hdu.qeResponsableId, ...(supervisorId === null ? [] : [supervisorId])])];
    const [lideres, admins, usuariosRegistro] = await Promise.all([
      this.celulasLider.lideresActivosDeCelula(hdu.celulaId),
      this.usuarios.listar({ rol: 'ADMINISTRADOR', activo: true }, { pagina: 1, tamanoPagina: 1000 }),
      Promise.all(idsRegistro.map((id) => this.usuarios.buscarPorId(id))),
    ]);
    const registro: PersonaConRol[] = usuariosRegistro
      .filter((usuario): usuario is NonNullable<typeof usuario> => usuario !== null && usuario.activo)
      .map((usuario) => ({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }));
    const escalamiento: PersonaConRol[] = [
      ...lideres.map((lider) => ({ id: lider.id, nombre: lider.nombre, rol: 'LIDER_QA' as Rol })),
      ...admins.items.filter((usuario) => usuario.activo).map((usuario) => ({ id: usuario.id, nombre: usuario.nombre, rol: usuario.rol })),
    ];
    return { registro, escalamiento };
  }

  /** Todas las HDU del ámbito con sus datos, ordenadas por código (GET /v1/interno/hdu/ambito/detalle, D86). */
  async ambitoDetalle(rol: Rol, actorId: string, ambito: AmbitoAcceso, incluirCerradas: boolean): Promise<{ items: HduParaCertificacion[] }> {
    const hdus = await this.hdus.listarTodasPorAmbito(filtroAmbitoHdu(rol, actorId, ambito));
    const visibles = hdus.filter((hdu) => incluirCerradas || hdu.estado !== 'CERRADA').sort((a, b) => a.codigo.localeCompare(b.codigo));
    const [resumenes, sprints] = await Promise.all([this.hduAplicacion.resumir(visibles), this.mapaSprints()]);
    return { items: resumenes.map((resumen) => paraCertificacion(resumen, sprints)) };
  }

  /**
   * Ámbito de lectura para que Certificaciones autorice lotes con una sola llamada (D47):
   * Administrador y Auditor → `todas`; el resto, la lista explícita de su ámbito.
   */
  async ambitoLectura(rol: Rol, actorId: string, ambito: AmbitoAcceso): Promise<AmbitoLecturaHdu> {
    const filtro = filtroAmbitoHdu(rol, actorId, ambito);
    if (filtro.tipo === 'TODAS') return { usuarioId: actorId, rol, todas: true, hduIds: [] };
    return { usuarioId: actorId, rol, todas: false, hduIds: await this.hdus.listarIdsPorAmbito(filtro) };
  }

  /**
   * Datos de varias HDU del ámbito del usuario (D47). Si algún id está fuera de ámbito o no
   * existe, 403 completo sin datos parciales (D12); Administrador y Auditor, que leen todo,
   * reciben solo las que existen (D55).
   */
  async consultarLote(ids: readonly string[], rol: Rol, actorId: string, ambito: AmbitoAcceso): Promise<{ items: HduParaCertificacion[] }> {
    const encontradas = await this.hdus.buscarPorIds(ids);
    const porId = new Map(encontradas.map((hdu) => [hdu.id, hdu]));
    // Con ámbito total (Administrador y Auditor) un id desconocido no tumba el lote: se omite y quien
    // llama lo muestra como «HDU no disponible» (D55). Con ámbito restringido sigue el 403 completo.
    const ambitoTotal = filtroAmbitoHdu(rol, actorId, ambito).tipo === 'TODAS';
    const presentes: Hdu[] = [];
    for (const id of ids) {
      const hdu = porId.get(id);
      if (hdu === undefined && ambitoTotal) continue;
      if (hdu === undefined || !evaluarAccesoHdu(rol, actorId, ambito, hdu).permitido) {
        throw accesoDenegado('lote con una HDU fuera de ámbito o inexistente');
      }
      presentes.push(hdu);
    }
    const [resumenes, sprints] = await Promise.all([this.hduAplicacion.resumir(presentes), this.mapaSprints()]);
    return { items: resumenes.map((resumen) => paraCertificacion(resumen, sprints)) };
  }

  /** HDU donde el QE es el responsable, para la bandeja de aprobaciones (E3-F03#3). */
  async hduComoResponsable(qeId: string): Promise<{ items: HduParaCertificacion[] }> {
    const pagina = await this.hdus.listarPorAmbito(
      { tipo: 'QE', qeResponsableId: qeId, analistasSupervisadosIds: [] },
      {},
      { pagina: 1, tamanoPagina: 1000 },
    );
    const propias = pagina.items.filter((hdu) => hdu.qeResponsableId === qeId);
    const [resumenes, sprints] = await Promise.all([this.hduAplicacion.resumir(propias), this.mapaSprints()]);
    return { items: resumenes.map((resumen) => paraCertificacion(resumen, sprints)) };
  }
}
