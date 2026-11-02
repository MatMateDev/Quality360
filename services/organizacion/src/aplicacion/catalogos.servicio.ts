import { Inject, Injectable } from '@nestjs/common';

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
  async personas(filtro: { rol?: Rol; activo?: boolean }): Promise<{ items: PersonaCatalogo[] }> {
    const pagina = await this.usuarios.listar({ rol: filtro.rol, activo: filtro.activo ?? true }, { pagina: 1, tamanoPagina: 1000 });
    return { items: pagina.items.map((usuario) => ({ id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol })) };
  }
}
