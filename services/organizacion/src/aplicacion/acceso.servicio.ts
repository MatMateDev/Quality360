/** Casos de uso de `/v1/interno/hdu/*` (D12, para Certificaciones e Impedimentos). */
import { Inject, Injectable } from '@nestjs/common';

import { evaluarAccesoHdu } from '../dominio/reglas/ambito.js';
import { HDU_REPOSITORIO, type HduRepositorio } from '../dominio/repositorios/hdu.repositorio.js';
import { USUARIO_REPOSITORIO, type UsuarioRepositorio } from '../dominio/repositorios/usuario.repositorio.js';
import type { AmbitoAcceso, EstadoHdu, RelacionAccesoHdu, Rol } from '../dominio/tipos.js';
import { HduAplicacion, type HduResumenRespuesta } from './hdu.servicio.js';

/** Datos de la HDU que Certificaciones necesita para sus reglas y el certificado (E3). */
export interface HduParaCertificacion {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
  readonly celula: string;
  readonly sprint: string;
  readonly qeResponsable: { id: string; nombre: string };
  readonly analista: { id: string; nombre: string } | null;
}

export interface AccesoHduRespuesta {
  readonly hduId: string;
  readonly permitido: boolean;
  readonly relacion: RelacionAccesoHdu | null;
  readonly actor?: { id: string; nombre: string; rol: Rol };
  readonly hdu?: HduParaCertificacion;
}

function paraCertificacion(resumen: HduResumenRespuesta): HduParaCertificacion {
  return {
    id: resumen.id,
    codigo: resumen.codigo,
    titulo: resumen.titulo,
    estado: resumen.estado,
    celula: resumen.celula.nombre,
    sprint: resumen.sprint.nombre,
    qeResponsable: { id: resumen.qeResponsable.id, nombre: resumen.qeResponsable.nombre },
    analista: resumen.analista === null ? null : { id: resumen.analista.id, nombre: resumen.analista.nombre },
  };
}

@Injectable()
export class AccesoAplicacion {
  constructor(
    @Inject(HDU_REPOSITORIO) private readonly hdus: HduRepositorio,
    @Inject(USUARIO_REPOSITORIO) private readonly usuarios: UsuarioRepositorio,
    private readonly hduAplicacion: HduAplicacion,
  ) {}

  async accesoHdu(hduId: string, rol: Rol, actorId: string, ambito: AmbitoAcceso): Promise<AccesoHduRespuesta> {
    const hdu = await this.hdus.buscarPorId(hduId);
    if (hdu === null) return { hduId, permitido: false, relacion: null };
    const resultado = evaluarAccesoHdu(rol, actorId, ambito, hdu);
    if (!resultado.permitido) return { hduId, permitido: false, relacion: null };

    const [[resumen], [actor]] = await Promise.all([
      this.hduAplicacion.resumir([hdu]),
      this.usuarios.listarResumenPorIds([actorId]),
    ]);
    return {
      hduId,
      permitido: true,
      relacion: resultado.relacion,
      actor: { id: actorId, nombre: actor?.nombre ?? '(usuario no disponible)', rol },
      hdu: paraCertificacion(resumen as HduResumenRespuesta),
    };
  }

  /** HDU donde el QE es el responsable, para la bandeja de aprobaciones (E3-F03#3). */
  async hduComoResponsable(qeId: string): Promise<{ items: HduParaCertificacion[] }> {
    const pagina = await this.hdus.listarPorAmbito(
      { tipo: 'QE', qeResponsableId: qeId, analistasSupervisadosIds: [] },
      {},
      { pagina: 1, tamanoPagina: 1000 },
    );
    const propias = pagina.items.filter((hdu) => hdu.qeResponsableId === qeId);
    const resumenes = await this.hduAplicacion.resumir(propias);
    return { items: resumenes.map(paraCertificacion) };
  }
}
