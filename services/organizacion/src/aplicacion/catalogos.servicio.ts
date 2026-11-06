import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360, MENSAJES, errorValidacion } from '@quality360/auth-nest';

import { esQeResponsableValido } from '../dominio/reglas/alta-hdu.js';
import { SUPERVISION_REPOSITORIO, type SupervisionRepositorio } from '../dominio/repositorios/supervision.repositorio.js';

import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { Celula, Rol, Sprint } from '../dominio/tipos.js';

export interface PersonaCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
}

@Injectable()
export class CatalogosAplicacion {
  constructor(
    @Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
  ) {}

  async celulas(): Promise<{ items: Celula[] }> {
    return { items: await this.catalogos.listarCelulas() };
  }

  async sprints(celulaId?: string): Promise<{ items: Sprint[] }> {
    return { items: await this.catalogos.listarSprints(celulaId) };
  }

  /**
   * Catálogo de personas (D54): usuarios por rol, ordenados por nombre, para elegir al QE de una
   * reasignación. Por defecto solo activos.
   */
  async personas(filtro: { rol?: Rol; activo?: boolean; supervisorId?: string }): Promise<{ items: PersonaCatalogo[] }> {
    if (filtro.supervisorId !== undefined) return this.analistasDelEquipo(filtro.supervisorId, filtro.rol);
    const pagina = await this.usuarios.listar({ rol: filtro.rol, activo: filtro.activo ?? true }, { pagina: 1, tamanoPagina: 1000 });
    return { items: pagina.items.map((usuario) => ({ id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol })) };
  }

  /**
   * Analistas QA activos del equipo vigente de un QE (D147), para el selector de analista de la consulta de Jira.
   * Implica rol=ANALISTA_QA (otro rol: 400) y activo=true. Un QE sin analistas da items vacio; un supervisorId
   * que no es un QE activo, 422 QE_INVALIDO.
   */
  private async analistasDelEquipo(qeId: string, rol: Rol | undefined): Promise<{ items: PersonaCatalogo[] }> {
    if (rol !== undefined && rol !== 'ANALISTA_QA') {
      throw errorValidacion([{ campo: 'rol', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'Con supervisorId solo se listan analistas QA.' }], 'rol incompatible con supervisorId');
    }
    const qe = await this.usuarios.buscarPorId(qeId);
    if (!esQeResponsableValido(qe)) throw new ExcepcionQ360(422, 'QE_INVALIDO', { mensaje: MENSAJES.QE_INVALIDO });
    const equipo = await this.supervision.listarAnalistasActivosDelEquipo(qeId);
    return { items: equipo.map((a) => ({ id: a.id, nombre: a.nombre, correo: a.correo, rol: 'ANALISTA_QA' as Rol })) };
  }
}
