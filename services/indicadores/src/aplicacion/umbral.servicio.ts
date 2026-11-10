/**
 * Umbral de sobrecarga de cada QE y su historial (E6-B02#3, D159, D161, D183). Lo fija solo el QE dueño; el Líder y el
 * Auditor lo leen. Cada cambio inserta un evento (solo inserción); el mismo valor no cambia nada.
 */
import { Inject, Injectable } from '@nestjs/common';
import { accesoDenegado, errorValidacion, noEncontrado } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionIndicadores } from '../configuracion.js';
import { UmbralRepositorio } from '../dominio/repositorios.js';
import type { AmbitoOrganizacion, Ref, Rol } from '../dominio/tipos.js';
import { VistasAplicacion, type AutSesion } from './vistas.servicio.js';

/** QE visibles para quien mira: los que nombra Organización (D176), los responsables de las HDU y los supervisores. */
function qesDelAmbito(ambito: AmbitoOrganizacion): Map<string, Ref> {
  const qes = new Map<string, Ref>(ambito.qes.map((qe) => [qe.id, qe]));
  for (const hdu of ambito.hdu) qes.set(hdu.qeResponsable.id, hdu.qeResponsable);
  for (const analista of ambito.analistas) if (analista.supervisor !== null) qes.set(analista.supervisor.id, analista.supervisor);
  return qes;
}

@Injectable()
export class UmbralAplicacion {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionIndicadores,
    private readonly vistas: VistasAplicacion,
    private readonly umbrales: UmbralRepositorio,
  ) {}

  /**
   * Resuelve el QE al que se refiere la consulta y si el rol puede verlo (D183). QE: solo el propio. Líder: un QE de su
   * ámbito (otro, 403). Auditor: cualquier QE conocido (si no, 404). Sin `qeId` solo el QE tiene un valor propio.
   */
  private async resolverQe(ambito: AmbitoOrganizacion, qeId: string | null, soloAuditorYQe: boolean): Promise<Ref> {
    const rol: Rol = ambito.usuario.rol;
    if (rol === 'QE') {
      if (qeId !== null && qeId !== ambito.usuario.id) throw accesoDenegado('umbral de otro QE');
      return { id: ambito.usuario.id, nombre: ambito.usuario.nombre };
    }
    if (rol === 'LIDER_QA' && soloAuditorYQe) throw accesoDenegado('el Líder QA no lee el historial del umbral');
    if (qeId === null) throw errorValidacion([{ campo: 'qeId', codigo: 'REQUERIDO', mensaje: 'Indica el QE.' }]);
    const conocido = qesDelAmbito(ambito).get(qeId);
    if (rol === 'LIDER_QA') {
      if (conocido === undefined) throw accesoDenegado('QE fuera del ámbito del Líder');
      return conocido;
    }
    if (conocido === undefined) throw noEncontrado('QE inexistente');
    return conocido;
  }

  async obtener(auth: AutSesion, qeId: string | null) {
    const ambito = await this.vistas.ambito(auth);
    const qe = await this.resolverQe(ambito, qeId, false);
    return this.vista(qe);
  }

  private async vista(qe: Ref) {
    const guardado = await this.umbrales.obtener(qe.id);
    if (guardado === null) return { qe, valor: this.configuracion.umbralDefecto, porDefecto: true, actualizadoEn: null, actualizadoPor: null };
    const ultimo = (await this.umbrales.historial(qe.id, 1, 1)).items[0];
    return {
      qe,
      valor: guardado.valor,
      porDefecto: false,
      actualizadoEn: guardado.actualizadoEn.toISOString(),
      actualizadoPor: { id: guardado.actualizadoPor, nombre: ultimo?.actorId === guardado.actualizadoPor ? ultimo.actorNombre : qe.nombre },
    };
  }

  /** Solo el QE, sobre su propio umbral. El valor ya llega validado (entero de 1 a 50). */
  async fijar(auth: AutSesion, valor: number) {
    const ambito = await this.vistas.ambito(auth);
    if (ambito.usuario.rol !== 'QE') throw accesoDenegado('solo el QE fija su umbral');
    const qe: Ref = { id: ambito.usuario.id, nombre: ambito.usuario.nombre };
    const { cambio } = await this.umbrales.fijar({ idQe: qe.id, valor, defecto: this.configuracion.umbralDefecto, actorId: qe.id, actorNombre: qe.nombre });
    return { umbral: await this.vista(qe), cambio };
  }

  async historial(auth: AutSesion, qeId: string | null, pagina: number, tamanoPagina: number) {
    const ambito = await this.vistas.ambito(auth);
    const qe = await this.resolverQe(ambito, qeId, true);
    const { items, total } = await this.umbrales.historial(qe.id, pagina, tamanoPagina);
    return {
      items: items.map((evento) => ({
        id: evento.id,
        qe,
        valorAnterior: evento.valorAnterior,
        valorNuevo: evento.valorNuevo,
        actor: { id: evento.actorId, nombre: evento.actorNombre },
        fecha: evento.fecha.toISOString(),
      })),
      total,
      pagina,
      tamanoPagina,
    };
  }
}
