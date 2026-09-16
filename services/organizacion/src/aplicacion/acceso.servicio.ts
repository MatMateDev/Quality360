/** Caso de uso de `/v1/interno/hdu/{id}/acceso` (D12, para Certificaciones e Impedimentos). */
import { Inject, Injectable } from '@nestjs/common';

import { evaluarAccesoHdu } from '../dominio/reglas/ambito.js';
import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import type { AmbitoAcceso, RelacionAccesoHdu, Rol } from '../dominio/tipos.js';

export interface AccesoHduRespuesta {
  readonly hduId: string;
  readonly permitido: boolean;
  readonly relacion: RelacionAccesoHdu | null;
}

@Injectable()
export class AccesoAplicacion {
  constructor(@Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio) {}

  async accesoHdu(hduId: string, rol: Rol, actorId: string, ambito: AmbitoAcceso): Promise<AccesoHduRespuesta> {
    const hdu = await this.hdus.buscarPorId(hduId);
    if (hdu === null) return { hduId, permitido: false, relacion: null };
    const resultado = evaluarAccesoHdu(rol, actorId, ambito, hdu);
    return { hduId, permitido: resultado.permitido, relacion: resultado.relacion };
  }
}
