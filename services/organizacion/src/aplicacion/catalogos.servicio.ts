import { Inject, Injectable } from '@nestjs/common';

import { CATALOGO_REPOSITORIO, type CatalogoRepositorio } from '../dominio/repositorios/catalogo.repositorio.js';
import type { Celula, Sprint } from '../dominio/tipos.js';

@Injectable()
export class CatalogosAplicacion {
  constructor(@Inject(CATALOGO_REPOSITORIO) private readonly catalogos: CatalogoRepositorio) {}

  async celulas(): Promise<{ items: Celula[] }> {
    return { items: await this.catalogos.listarCelulas() };
  }

  async sprints(): Promise<{ items: Sprint[] }> {
    return { items: await this.catalogos.listarSprints() };
  }
}
