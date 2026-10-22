/**
 * `ResolutorDeAcceso` (packages/auth-nest) contra la base de Organización:
 * rol vigente, estado activo y ámbito leídos en cada solicitud (D4). Nunca
 * confía en el rol del token.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { ContextoAcceso, Identidad, ResolucionAcceso, ResolutorDeAcceso, Rol as RolAuthNest } from '@quality360/auth-nest';

import { calcularAmbito } from '../../dominio/reglas/ambito.js';
import { CELULA_LIDER_REPOSITORIO, type CelulaLiderRepositorio } from '../../dominio/repositorios/celula-lider.repositorio.js';
import { SUPERVISION_REPOSITORIO, type SupervisionRepositorio } from '../../dominio/repositorios/supervision.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../../dominio/repositorios/usuario.repositorio.js';

@Injectable()
export class ResolutorAccesoOrganizacion implements ResolutorDeAcceso {
  constructor(
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    @Inject(SUPERVISION_REPOSITORIO) private readonly supervision: SupervisionRepositorio,
    @Inject(CELULA_LIDER_REPOSITORIO) private readonly celulasLider: CelulaLiderRepositorio,
  ) {}

  async resolver(identidad: Identidad, _contexto: ContextoAcceso): Promise<ResolucionAcceso | null> {
    const usuario = await this.usuarios.buscarPorId(identidad.id);
    if (usuario === null) return null;

    const analistasSupervisadosIds = usuario.rol === 'QE' ? await this.supervision.listarAnalistasVigentesIds(usuario.id) : [];
    const qeSupervisorId = usuario.rol === 'ANALISTA_QA' ? await this.supervision.buscarQeVigente(usuario.id) : null;
    const celulasIds = usuario.rol === 'LIDER_QA' ? (await this.celulasLider.listarVigentes(usuario.id)).map((fila) => fila.celula.id) : [];
    const ambito = calcularAmbito(usuario.rol, analistasSupervisadosIds, qeSupervisorId, celulasIds);

    return { usuarioId: usuario.id, rol: usuario.rol as RolAuthNest, activo: usuario.activo, ambito };
  }
}
