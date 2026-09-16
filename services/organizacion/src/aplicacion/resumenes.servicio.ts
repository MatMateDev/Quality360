/**
 * Resúmenes de HDU para `/v1/resumenes/qe/hdu` y `/v1/resumenes/qa/hdu`
 * (fuentes de `/v1/inicio/*` del gateway) y la resolución de `analistaId`
 * compartida por `/v1/resumenes/qa/*` (E1-B05).
 */
import { Inject, Injectable } from '@nestjs/common';
import { accesoDenegado, errorValidacion, noEncontrado } from '@quality360/auth-nest';

import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { ConteoPorEstado, Rol } from '../dominio/tipos.js';

@Injectable()
export class ResumenesAplicacion {
  constructor(
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
  ) {}

  async resumenHduQe(qeId: string, analistasSupervisadosIds: readonly string[]): Promise<{ hduEnAmbito: number; porEstado: ConteoPorEstado }> {
    const { total, porEstado } = await this.hdus.resumenAmbitoQe(qeId, analistasSupervisadosIds);
    return { hduEnAmbito: total, porEstado };
  }

  async resumenHduQa(analistaId: string): Promise<{ hduAsignadas: number; porEstado: ConteoPorEstado }> {
    const { total, porEstado } = await this.hdus.resumenPorAnalista(analistaId);
    return { hduAsignadas: total, porEstado };
  }

  /**
   * Analista QA: solo su propio id (otro → 403). Administrador: `analistaId`
   * obligatorio (400 si falta; 404 si no es Analista QA).
   */
  async resolverAnalistaId(rol: Rol, actorId: string, analistaIdQuery: string | undefined): Promise<string> {
    if (rol === 'ADMINISTRADOR') {
      if (analistaIdQuery === undefined) {
        throw errorValidacion([{ campo: 'query.analistaId', codigo: 'REQUERIDO', mensaje: 'analistaId es obligatorio.' }]);
      }
      const usuario = await this.usuarios.buscarPorId(analistaIdQuery);
      if (usuario === null || usuario.rol !== 'ANALISTA_QA') throw noEncontrado('analista inexistente');
      return analistaIdQuery;
    }

    if (analistaIdQuery !== undefined && analistaIdQuery !== actorId) throw accesoDenegado('analista distinto del autenticado');
    return actorId;
  }
}
