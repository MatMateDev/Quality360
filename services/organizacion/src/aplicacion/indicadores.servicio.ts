/**
 * Internos para Indicadores (E6, D176, D177). Organización es la única dueña del ámbito (D153): Indicadores nunca lo
 * recalcula. Una consulta por tabla, sin N+1.
 */
import { Inject, Injectable } from '@nestjs/common';
import { accesoDenegado } from '@quality360/auth-nest';

import { filtroAmbitoHdu } from '../dominio/reglas/ambito.js';
import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import { SUPERVISION_REPOSITORIO, type SupervisionRepositorio } from '../dominio/repositorios/supervision.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { AmbitoAcceso, EstadoHdu, Hdu, Rol } from '../dominio/tipos.js';

export interface HduIndicadores {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
  readonly cierreParcial: boolean;
  readonly celula: { id: string; nombre: string };
  readonly sprint: { id: string; nombre: string; inicio: string; fin: string } | null;
  readonly qeResponsable: { id: string; nombre: string };
  readonly analista: { id: string; nombre: string; activo: boolean } | null;
}

export interface AnalistaIndicadores {
  readonly id: string;
  readonly nombre: string;
  readonly activo: boolean;
  readonly supervisor: { id: string; nombre: string } | null;
}

export interface AmbitoIndicadores {
  readonly usuario: { id: string; nombre: string; rol: Rol };
  readonly todas: boolean;
  readonly celulas: Array<{ id: string; nombre: string }>;
  readonly hdu: HduIndicadores[];
  readonly analistas: AnalistaIndicadores[];
  /** QE que quien consulta puede nombrar (umbral y su historial, D176, D183). */
  readonly qes: Array<{ id: string; nombre: string }>;
}

export interface DatosSnapshotOrganizacion {
  readonly total: number;
  readonly hdu: HduIndicadores[];
  readonly ambitosQe: Array<{ qe: { id: string; nombre: string }; hduIds: string[] }>;
}

const ROLES_CON_INDICADORES: readonly Rol[] = ['QE', 'LIDER_QA', 'AUDITOR'];
const porNombre = (a: { nombre: string }, b: { nombre: string }): number => a.nombre.localeCompare(b.nombre, 'es');
const fecha = (valor: Date): string => valor.toISOString().slice(0, 10);

@Injectable()
export class IndicadoresInternoAplicacion {
  constructor(
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
  ) {}

  /** `GET /v1/interno/indicadores/ambito`: el ámbito D153 del usuario del token. Analista y Administrador: 403. */
  async ambito(rol: Rol, usuarioId: string, ambito: AmbitoAcceso): Promise<AmbitoIndicadores> {
    if (!ROLES_CON_INDICADORES.includes(rol)) throw accesoDenegado('el rol no ve indicadores');
    const hdus = await this.hdus.listarTodasPorAmbito(filtroAmbitoHdu(rol, usuarioId, ambito));
    const [filas, celulasCatalogo, yo] = await Promise.all([this.armarHdu(hdus), this.catalogos.listarCelulas(), this.usuarios.buscarPorId(usuarioId)]);

    const idsCelulas = rol === 'LIDER_QA' ? new Set(ambito.celulasIds) : new Set(hdus.map((hdu) => hdu.celulaId));
    const celulas = celulasCatalogo.filter((celula) => idsCelulas.has(celula.id)).map((celula) => ({ id: celula.id, nombre: celula.nombre }));
    celulas.sort(porNombre);

    // Analistas: los de las HDU del ámbito (los inactivos solo con alguna HDU no cerrada) más, según el rol, otros.
    const conAbiertas = new Set(hdus.filter((hdu) => hdu.estado !== 'CERRADA' && hdu.analistaId !== null).map((hdu) => hdu.analistaId as string));
    const idsDeHdu = new Set(hdus.map((hdu) => hdu.analistaId).filter((id): id is string => id !== null));
    const idsExtra = new Set<string>();
    if (rol === 'QE') for (const id of ambito.analistasSupervisadosIds) idsExtra.add(id);
    const auditorActivos = rol === 'AUDITOR' ? await this.usuarios.listarActivosPorRol('ANALISTA_QA') : [];
    for (const analista of auditorActivos) idsExtra.add(analista.id);

    const todosIds = [...new Set([...idsDeHdu, ...idsExtra])];
    const [estados, supervisores] = await Promise.all([this.usuarios.listarEstadoPorIds(todosIds), this.supervision.mapaQeVigentePorAnalistas(todosIds)]);
    const analistas: AnalistaIndicadores[] = estados
      .filter((usuario) => usuario.rol === 'ANALISTA_QA')
      .filter((usuario) => usuario.activo || conAbiertas.has(usuario.id))
      // Un activo solo entra si es de una HDU del ámbito o si el rol lo ve por supervisión / por ser Auditor.
      .filter((usuario) => idsDeHdu.has(usuario.id) || idsExtra.has(usuario.id))
      .map((usuario) => {
        const supervisor = supervisores.get(usuario.id);
        return { id: usuario.id, nombre: usuario.nombre, activo: usuario.activo, supervisor: supervisor === undefined ? null : { id: supervisor.id, nombre: supervisor.nombre } };
      });
    analistas.sort(porNombre);

    // QE: él mismo; Líder: los responsables de sus HDU y los supervisores de sus analistas; Auditor: además, todos los QE
    // activos, aunque no tengan HDU ni equipo (D176), para que pueda leer cualquier umbral y su historial (D161).
    const qes = new Map<string, string>();
    for (const fila of filas) qes.set(fila.qeResponsable.id, fila.qeResponsable.nombre);
    for (const analista of analistas) if (analista.supervisor !== null) qes.set(analista.supervisor.id, analista.supervisor.nombre);
    if (rol === 'QE') qes.set(usuarioId, yo?.nombre ?? '');
    if (rol === 'AUDITOR') for (const qe of await this.usuarios.listarActivosPorRol('QE')) qes.set(qe.id, qe.nombre);
    const listaQes = [...qes.entries()].map(([id, nombre]) => ({ id, nombre })).sort(porNombre);

    return { usuario: { id: usuarioId, nombre: yo?.nombre ?? '', rol }, todas: rol === 'AUDITOR', celulas, hdu: filas, analistas, qes: listaQes };
  }

  /** `GET /v1/interno/indicadores/snapshot`: todas las HDU (hasta `limite`), el total y el ámbito de cada QE activo con HDU. */
  async snapshot(limite: number): Promise<DatosSnapshotOrganizacion> {
    const todas = await this.hdus.listarTodasPorAmbito({ tipo: 'TODAS' });
    const recortadas = todas.slice(0, limite);

    const analistaIds = [...new Set(todas.map((hdu) => hdu.analistaId).filter((id): id is string => id !== null))];
    const supervisores = await this.supervision.mapaQeVigentePorAnalistas(analistaIds);
    const candidatos = new Set<string>(todas.map((hdu) => hdu.qeResponsableId));
    for (const qe of supervisores.values()) candidatos.add(qe.id);
    const estados = await this.usuarios.listarEstadoPorIds([...candidatos]);
    const qesActivos = new Map(estados.filter((usuario) => usuario.activo && usuario.rol === 'QE').map((usuario) => [usuario.id, usuario.nombre]));

    const porQe = new Map<string, Set<string>>();
    const agregar = (qeId: string, hduId: string): void => {
      if (!qesActivos.has(qeId)) return;
      const ids = porQe.get(qeId) ?? new Set<string>();
      ids.add(hduId);
      porQe.set(qeId, ids);
    };
    for (const hdu of todas) {
      agregar(hdu.qeResponsableId, hdu.id);
      if (hdu.analistaId !== null) {
        const supervisor = supervisores.get(hdu.analistaId);
        if (supervisor !== undefined) agregar(supervisor.id, hdu.id);
      }
    }
    const ambitosQe = [...porQe.entries()]
      .map(([qeId, ids]) => ({ qe: { id: qeId, nombre: qesActivos.get(qeId) as string }, hduIds: [...ids] }))
      .sort((a, b) => porNombre(a.qe, b.qe));

    return { total: todas.length, hdu: await this.armarHdu(recortadas), ambitosQe };
  }

  private async armarHdu(hdus: readonly Hdu[]): Promise<HduIndicadores[]> {
    if (hdus.length === 0) return [];
    const ids = new Set<string>();
    for (const hdu of hdus) {
      ids.add(hdu.qeResponsableId);
      if (hdu.analistaId !== null) ids.add(hdu.analistaId);
    }
    const [celulas, sprints, personas] = await Promise.all([this.catalogos.listarCelulas(), this.catalogos.listarSprints(), this.usuarios.listarEstadoPorIds([...ids])]);
    const mapaCelulas = new Map(celulas.map((celula) => [celula.id, celula]));
    const mapaSprints = new Map(sprints.map((sprint) => [sprint.id, sprint]));
    const mapaPersonas = new Map(personas.map((persona) => [persona.id, persona]));
    return hdus.map((hdu) => {
      const sprint = mapaSprints.get(hdu.sprintId);
      const analista = hdu.analistaId === null ? undefined : mapaPersonas.get(hdu.analistaId);
      return {
        id: hdu.id,
        codigo: hdu.codigo,
        titulo: hdu.titulo,
        estado: hdu.estado,
        cierreParcial: hdu.cierreParcial,
        celula: { id: hdu.celulaId, nombre: mapaCelulas.get(hdu.celulaId)?.nombre ?? '(no disponible)' },
        sprint: sprint === undefined ? null : { id: sprint.id, nombre: sprint.nombre, inicio: fecha(sprint.inicio), fin: fecha(sprint.fin) },
        qeResponsable: { id: hdu.qeResponsableId, nombre: mapaPersonas.get(hdu.qeResponsableId)?.nombre ?? '(usuario no disponible)' },
        analista: hdu.analistaId === null ? null : { id: hdu.analistaId, nombre: analista?.nombre ?? '(usuario no disponible)', activo: analista?.activo ?? false },
      };
    });
  }
}
