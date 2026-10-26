/**
 * Listados de la épica: `GET /v1/impedimentos` (E4-F02) y `GET /v1/riesgo/hdu` (E4-F04#3).
 * El ámbito sale de Organización (una llamada a `ambito`, D47, D89); las filas, de
 * `consulta` o `ambito/detalle`. Una fuente caída nunca se confunde con una lista vacía (D46).
 */
import { Injectable } from '@nestjs/common';
import { accesoDenegado, servicioNoDisponible } from '@quality360/auth-nest';

import { ImpedimentoRepositorio } from '../dominio/repositorios.js';
import { ORDEN_NIVEL } from '../dominio/riesgo/calculo.js';
import { diasAbierto } from '../dominio/dias.js';
import type { EstadoHdu, EstadoImpedimento, ImpedimentoRegistro, NivelRiesgo, TipoImpedimento } from '../dominio/tipos.js';
import type { Solicitante } from './autorizador.js';
import { EvaluadorRiesgo, type EvaluacionHdu } from './evaluador-riesgo.js';
import { ProveedorAcceso, type DatosHdu } from './puertos.js';
import { operacionesDelEstado } from '../dominio/impedimento.js';
import { referenciaHdu, resumenDeNivel, vistaImpedimento } from './vistas.js';

export type SentidoOrden = 'asc' | 'desc';

export interface FiltrosImpedimentos {
  readonly estado?: EstadoImpedimento;
  readonly tipo?: TipoImpedimento;
  readonly celulaId?: string;
  readonly analistaId?: string;
  readonly riesgo?: NivelRiesgo;
  readonly incluirResueltos: boolean;
  readonly q?: string;
  readonly orden?: { columna: 'riesgo' | 'diasAbierto' | 'fechaRegistro'; sentido: SentidoOrden };
  readonly pagina: number;
  readonly tamanoPagina: number;
}

export interface FiltrosRiesgoHdu {
  readonly nivel?: NivelRiesgo;
  readonly celulaId?: string;
  readonly sprintId?: string;
  readonly analistaId?: string;
  readonly estado?: EstadoHdu;
  readonly soloBloqueadas: boolean;
  readonly q?: string;
  readonly orden?: { columna: 'riesgo' | 'impedimentosAbiertos' | 'codigo' | 'avance'; sentido: SentidoOrden };
  readonly pagina: number;
  readonly tamanoPagina: number;
}

const rangoNivel = (nivel: NivelRiesgo | null): number => (nivel === null ? 0 : ORDEN_NIVEL[nivel]);
const contiene = (texto: string, q: string): boolean => texto.toLowerCase().includes(q.toLowerCase());

function agruparPorHdu(filas: readonly ImpedimentoRegistro[]): Map<string, ImpedimentoRegistro[]> {
  const mapa = new Map<string, ImpedimentoRegistro[]>();
  for (const fila of filas) {
    const lista = mapa.get(fila.hduId);
    if (lista === undefined) mapa.set(fila.hduId, [fila]);
    else lista.push(fila);
  }
  return mapa;
}

function paginar<T>(lista: readonly T[], pagina: number, tamano: number): T[] {
  return lista.slice((pagina - 1) * tamano, pagina * tamano);
}

@Injectable()
export class ListadosAplicacion {
  constructor(
    private readonly proveedor: ProveedorAcceso,
    private readonly impedimentos: ImpedimentoRepositorio,
    private readonly evaluador: EvaluadorRiesgo,
  ) {}

  /** Un Líder QA solo filtra por una de sus células vigentes; otra es 403 (E7-B02#1). */
  private validarCelula(celulaId: string | undefined, solicitante: Solicitante): void {
    if (celulaId !== undefined && solicitante.rol === 'LIDER_QA' && !solicitante.celulasIds.includes(celulaId)) {
      throw accesoDenegado('célula fuera de las vigentes del Líder');
    }
  }

  async impedimentosDelAmbito(filtros: FiltrosImpedimentos, solicitante: Solicitante) {
    this.validarCelula(filtros.celulaId, solicitante);
    const ahora = new Date();
    const hoy = this.evaluador.hoy(ahora);
    const ambito = await this.proveedor.ambito(solicitante.contexto);

    // Todo el ámbito: de aquí salen los contadores (sin filtros) y los impedimentos de cada HDU.
    const delAmbito = await this.impedimentos.listar({ hduIds: ambito.todas ? null : ambito.hduIds });
    const bloqueantes = delAmbito.filter((fila) => fila.estado !== 'RESUELTO');
    const contadores = {
      abiertos: bloqueantes.length,
      escalados: bloqueantes.filter((fila) => fila.estado === 'ESCALADO').length,
      nuevos: bloqueantes.filter((fila) => ahora.getTime() - fila.fechaRegistro.getTime() < 24 * 60 * 60 * 1000).length,
    };

    // Un `estado` explícito manda sobre `incluirResueltos`.
    let candidatos = delAmbito.filter((fila) => {
      if (filtros.estado !== undefined) return fila.estado === filtros.estado;
      return filtros.incluirResueltos || fila.estado !== 'RESUELTO';
    });
    if (filtros.tipo !== undefined) candidatos = candidatos.filter((fila) => fila.tipo === filtros.tipo);

    const hduIds = [...new Set(candidatos.map((fila) => fila.hduId))];
    const hdus = new Map((hduIds.length === 0 ? [] : await this.proveedor.consultarHdu(hduIds, solicitante.contexto)).map((hdu) => [hdu.id, hdu]));
    candidatos = candidatos.filter((fila) => {
      const hdu = hdus.get(fila.hduId);
      if (hdu === undefined) return false;
      if (filtros.celulaId !== undefined && hdu.celula.id !== filtros.celulaId) return false;
      if (filtros.analistaId !== undefined && hdu.analista?.id !== filtros.analistaId) return false;
      if (filtros.q !== undefined && !contiene(hdu.codigo, filtros.q) && !contiene(hdu.titulo, filtros.q) && !contiene(fila.titulo, filtros.q)) return false;
      return true;
    });

    // Riesgo vigente de cada HDU involucrada, con todos sus impedimentos no resueltos.
    const hdusInvolucradas = [...new Set(candidatos.map((fila) => fila.hduId))].map((id) => hdus.get(id)).filter((hdu): hdu is DatosHdu => hdu !== undefined);
    const bloqueantesPorHdu = agruparPorHdu(bloqueantes);
    const { evaluaciones } = await this.evaluador.evaluarLote(hdusInvolucradas, bloqueantesPorHdu, solicitante.contexto, ahora);
    const riesgoIndisponible = [...evaluaciones.values()].some((evaluacion) => evaluacion.vigente.estado === 'indisponible');

    if (filtros.riesgo !== undefined) {
      if (riesgoIndisponible) throw servicioNoDisponible('Certificaciones no responde: no se puede filtrar por riesgo');
      candidatos = candidatos.filter((fila) => evaluaciones.get(fila.hduId)?.vigente.nivelVigente === filtros.riesgo);
    }

    const pedido = filtros.orden ?? { columna: 'riesgo' as const, sentido: 'desc' as const };
    // Con el riesgo indisponible el orden por riesgo cae a días abiertos (D74) y se informa.
    const aplicado = pedido.columna === 'riesgo' && riesgoIndisponible ? { columna: 'diasAbierto' as const, sentido: 'desc' as const } : pedido;
    const dias = (fila: ImpedimentoRegistro): number => diasAbierto(fila.abiertoDesde, fila.fechaResolucion, hoy);
    const nivelDe = (fila: ImpedimentoRegistro): number => rangoNivel(evaluaciones.get(fila.hduId)?.vigente.nivelVigente ?? null);
    const signo = aplicado.sentido === 'asc' ? 1 : -1;

    const ordenados = [...candidatos].sort((a, b) => {
      let comparacion = 0;
      if (filtros.orden === undefined) {
        // D74: no resueltos primero, luego riesgo vigente y luego días abiertos de mayor a menor.
        comparacion = Number(a.estado === 'RESUELTO') - Number(b.estado === 'RESUELTO');
        if (comparacion === 0 && !riesgoIndisponible) comparacion = nivelDe(b) - nivelDe(a);
        if (comparacion === 0) comparacion = dias(b) - dias(a);
      } else if (aplicado.columna === 'riesgo') {
        comparacion = signo * (nivelDe(a) - nivelDe(b));
        if (comparacion === 0) comparacion = dias(b) - dias(a);
      } else if (aplicado.columna === 'diasAbierto') {
        comparacion = signo * (dias(a) - dias(b));
      } else {
        comparacion = signo * (a.fechaRegistro.getTime() - b.fechaRegistro.getTime());
      }
      return comparacion !== 0 ? comparacion : a.id.localeCompare(b.id);
    });

    const items = paginar(ordenados, filtros.pagina, filtros.tamanoPagina).map((fila) => {
      const hdu = hdus.get(fila.hduId) as DatosHdu;
      const evaluacion = evaluaciones.get(fila.hduId) as EvaluacionHdu;
      const esResponsable = hdu.qeResponsable.id === ambito.usuarioId && solicitante.rol === 'QE';
      return {
        ...vistaImpedimento(fila, { ahora, hoy }, esResponsable && hdu.estado !== 'CERRADA' ? operacionesDelEstado(fila.estado) : []),
        hdu: referenciaHdu(hdu),
        celula: hdu.celula,
        analista: hdu.analista,
        qeResponsable: hdu.qeResponsable,
        riesgo: resumenDeNivel(evaluacion.vigente),
        soloLectura: !esResponsable,
      };
    });

    return {
      items,
      total: ordenados.length,
      pagina: filtros.pagina,
      tamanoPagina: filtros.tamanoPagina,
      orden: `${aplicado.columna}:${aplicado.sentido}`,
      contadores,
    };
  }

  async riesgoPorHdu(filtros: FiltrosRiesgoHdu, solicitante: Solicitante) {
    this.validarCelula(filtros.celulaId, solicitante);
    const ahora = new Date();
    // Por defecto solo las no cerradas; una HDU cerrada aparece si se pide ese estado.
    let hdus = await this.proveedor.ambitoDetalle(solicitante.contexto, filtros.estado === 'CERRADA');
    hdus = hdus.filter((hdu) => {
      if (filtros.estado !== undefined && hdu.estado !== filtros.estado) return false;
      if (filtros.estado === undefined && hdu.estado === 'CERRADA') return false;
      if (filtros.celulaId !== undefined && hdu.celula.id !== filtros.celulaId) return false;
      if (filtros.sprintId !== undefined && hdu.sprint.id !== filtros.sprintId) return false;
      if (filtros.analistaId !== undefined && hdu.analista?.id !== filtros.analistaId) return false;
      if (filtros.q !== undefined && !contiene(hdu.codigo, filtros.q) && !contiene(hdu.titulo, filtros.q)) return false;
      return true;
    });

    const bloqueantes = hdus.length === 0 ? [] : await this.impedimentos.listar({ hduIds: hdus.map((hdu) => hdu.id), estados: ['ABIERTO', 'ESCALADO'] });
    const porHdu = agruparPorHdu(bloqueantes);
    const { evaluaciones } = await this.evaluador.evaluarLote(hdus, porHdu, solicitante.contexto, ahora, { avanceDeTodas: true });
    const riesgoIndisponible = [...evaluaciones.values()].some((evaluacion) => evaluacion.vigente.estado === 'indisponible');

    if (filtros.nivel !== undefined && riesgoIndisponible) throw servicioNoDisponible('Certificaciones no responde: no se puede filtrar por nivel');

    let filas = hdus.map((hdu) => ({ hdu, evaluacion: evaluaciones.get(hdu.id) as EvaluacionHdu, abiertos: porHdu.get(hdu.id)?.length ?? 0 }));
    if (filtros.soloBloqueadas) filas = filas.filter((fila) => fila.abiertos > 0);
    if (filtros.nivel !== undefined) filas = filas.filter((fila) => fila.evaluacion.vigente.nivelVigente === filtros.nivel);

    const pedido = filtros.orden ?? { columna: 'riesgo' as const, sentido: 'desc' as const };
    const signo = pedido.sentido === 'asc' ? 1 : -1;
    filas.sort((a, b) => {
      const porNivel = signo * (rangoNivel(a.evaluacion.vigente.nivelVigente) - rangoNivel(b.evaluacion.vigente.nivelVigente));
      let comparacion = 0;
      switch (pedido.columna) {
        case 'riesgo':
          comparacion = porNivel !== 0 ? porNivel : b.abiertos - a.abiertos;
          break;
        case 'impedimentosAbiertos':
          comparacion = signo * (a.abiertos - b.abiertos);
          break;
        case 'avance':
          comparacion = signo * ((a.evaluacion.avance ?? -1) - (b.evaluacion.avance ?? -1));
          break;
        case 'codigo':
          comparacion = signo * a.hdu.codigo.localeCompare(b.hdu.codigo);
          break;
      }
      return comparacion !== 0 ? comparacion : a.hdu.codigo.localeCompare(b.hdu.codigo);
    });

    const items = paginar(filas, filtros.pagina, filtros.tamanoPagina).map(({ hdu, evaluacion, abiertos }) => ({
      hdu: referenciaHdu(hdu),
      celula: hdu.celula,
      sprint: hdu.sprint,
      analista: hdu.analista,
      qeResponsable: hdu.qeResponsable,
      avance: evaluacion.avance,
      impedimentosAbiertos: abiertos,
      bloqueada: abiertos > 0,
      riesgo: resumenDeNivel(evaluacion.vigente),
      actualizadoEn: evaluacion.fijado === null ? null : evaluacion.fijado.fecha.toISOString(),
      soloLectura: !(solicitante.rol === 'QE' && hdu.qeResponsable.id === solicitante.usuarioId),
    }));

    return { items, total: filas.length, pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, orden: `${pedido.columna}:${pedido.sentido}` };
  }
}
