import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA_REPOSITORIO, type AuditoriaRepositorio, type FiltroAuditoria } from '../dominio/repositorios/auditoria.repositorio.js';
import type { OpcionesPaginacion, Pagina, RegistroAuditoria } from '../dominio/tipos.js';

@Injectable()
export class AuditoriaAplicacion {
  constructor(@Inject(AUDITORIA_REPOSITORIO) private readonly auditoria: AuditoriaRepositorio) {}

  async listar(filtro: FiltroAuditoria, paginacion: OpcionesPaginacion): Promise<Pagina<RegistroAuditoria>> {
    return this.auditoria.listar(filtro, paginacion);
  }
}
