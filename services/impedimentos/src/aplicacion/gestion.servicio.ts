/**
 * Historial de gestión y vistas del Auditor (E4-B04). Todo es lectura: el historial lo escriben
 * las operaciones de impedimentos y riesgo en su propia transacción (D70). Las exportaciones
 * registran la acción en Organización antes de entregar el archivo (D48).
 */
import { Inject, Injectable } from '@nestjs/common';
import { ExcepcionQ360 } from '@quality360/auth-nest';

import { CONFIGURACION, type ConfiguracionImpedimentos } from '../configuracion.js';
import { diasAbierto } from '../dominio/dias.js';
import { GestionRepositorio, ImpedimentoRepositorio, type EntradaGestionRegistro, type FiltroAuditorImpedimentos, type FiltroGestion } from '../dominio/repositorios.js';
import { Autorizador, type Solicitante } from './autorizador.js';
import { ProveedorAcceso, type DatosHdu } from './puertos.js';
import { EvaluadorRiesgo } from './evaluador-riesgo.js';
import { referenciaHdu, vistaImpedimento, vistaResponsable } from './vistas.js';

type Celda = string | number | Date | null;

export interface ExportacionTabular {
  readonly recurso: 'impedimentos' | 'gestion-impedimentos';
  readonly encabezado: string[];
  readonly filas: Celda[][];
}

export interface Paginacion {
  readonly pagina: number;
  readonly tamanoPagina: number;
}

const TITULO_NO_DISPONIBLE = 'HDU no disponible en Organización';

/** HDU que Organización no conoce (D55): `HduReferencia` exige los cuatro campos, `estado` es de relleno. */
function hduNoDisponible(id: string) {
  return { id, codigo: '(HDU no disponible)', titulo: TITULO_NO_DISPONIBLE, estado: 'PENDIENTE' as const };
}

function excedeLimite(limite: number): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'EXPORTACION_EXCEDE_LIMITE', {
    mensaje: `La exportación supera las ${limite.toLocaleString('es-CL')} filas. Acota los filtros.`,
  });
}

@Injectable()
export class GestionAplicacion {
  constructor(
    @Inject(CONFIGURACION) private readonly configuracion: ConfiguracionImpedimentos,
    private readonly autorizador: Autorizador,
    private readonly proveedor: ProveedorAcceso,
    private readonly gestion: GestionRepositorio,
    private readonly impedimentos: ImpedimentoRepositorio,
    private readonly evaluador: EvaluadorRiesgo,
  ) {}

  /**
   * Historial de una HDU, cronológico. El Analista asignado recibe solo las entradas de
   * impedimentos (D73, D82): si pide `tipo=RIESGO` la respuesta viene vacía.
   */
  async historialHdu(hduId: string, filtro: { desde?: Date; hasta?: Date; tipo?: 'IMPEDIMENTO' | 'RIESGO'; descendente: boolean }, solicitante: Solicitante) {
    const acceso = await this.autorizador.acceso(hduId, solicitante);
    const soloImpedimentos = acceso.relacion === 'ANALISTA_ASIGNADO';
    const entradas =
      soloImpedimentos && filtro.tipo === 'RIESGO'
        ? []
        : await this.gestion.deHdu(
            hduId,
            { desde: filtro.desde, hasta: filtro.hasta, tipo: soloImpedimentos ? 'IMPEDIMENTO' : filtro.tipo },
            filtro.descendente,
          );
    return {
      hduId,
      orden: filtro.descendente ? ('fecha:desc' as const) : ('fecha:asc' as const),
      items: entradas.map((entrada) => this.vistaEntrada(entrada, referenciaHdu(acceso.hdu))),
    };
  }

  async impedimentosAuditor(filtro: FiltroAuditorImpedimentos, paginacion: Paginacion, solicitante: Solicitante) {
    const completo = await this.conTexto(filtro, solicitante);
    const { items, total } = await this.impedimentos.listarAuditor(completo, (paginacion.pagina - 1) * paginacion.tamanoPagina, paginacion.tamanoPagina);
    const hdus = await this.hduDe(items.map((fila) => fila.hduId), solicitante);
    const ahora = new Date();
    const tiempo = { ahora, hoy: this.evaluador.hoy(ahora) };
    return {
      items: items.map((fila) => ({ ...vistaImpedimento(fila, tiempo, []), hdu: this.referencia(hdus, fila.hduId) })),
      total,
      pagina: paginacion.pagina,
      tamanoPagina: paginacion.tamanoPagina,
    };
  }

  async gestionAuditor(filtro: FiltroGestion, paginacion: Paginacion, solicitante: Solicitante) {
    const { items, total } = await this.gestion.global(filtro, (paginacion.pagina - 1) * paginacion.tamanoPagina, paginacion.tamanoPagina);
    const hdus = await this.hduDe(items.map((entrada) => entrada.hduId), solicitante);
    return {
      items: items.map((entrada) => this.vistaEntrada(entrada, this.referencia(hdus, entrada.hduId))),
      total,
      pagina: paginacion.pagina,
      tamanoPagina: paginacion.tamanoPagina,
    };
  }

  async exportarImpedimentos(filtro: FiltroAuditorImpedimentos, filtros: Record<string, unknown>, solicitante: Solicitante): Promise<ExportacionTabular> {
    const limite = this.configuracion.exportacionLimiteFilas;
    const completo = await this.conTexto(filtro, solicitante);
    const total = await this.impedimentos.contarAuditor(completo);
    if (total > limite) throw excedeLimite(limite);
    const { items } = await this.impedimentos.listarAuditor(completo, 0, Math.max(total, 1));
    const hdus = await this.hduDe(items.map((fila) => fila.hduId), solicitante);
    const hoy = this.evaluador.hoy(new Date());

    // El registro en la auditoría va antes de entregar el archivo (D48): si falla, 503 sin archivo.
    await this.proveedor.registrarExportacion({ recurso: 'IMPEDIMENTOS', filtros, filas: items.length }, solicitante.contexto);
    return {
      recurso: 'impedimentos',
      encabezado: ['Fecha de registro', 'HDU', 'Título de la HDU', 'Tipo', 'Título', 'Estado', 'Responsable', 'Registrado por', 'Días abiertos', 'Fecha de resolución'],
      filas: items.map((fila) => {
        const hdu = hdus.get(fila.hduId);
        return [
          fila.fechaRegistro,
          hdu?.codigo ?? `(HDU no disponible: ${fila.hduId})`,
          hdu?.titulo ?? TITULO_NO_DISPONIBLE,
          fila.tipo,
          fila.titulo,
          fila.estado,
          fila.responsable.nombre,
          fila.creadoPor.nombre,
          diasAbierto(fila.abiertoDesde, fila.fechaResolucion, hoy),
          fila.fechaResolucion,
        ];
      }),
    };
  }

  async exportarGestion(filtro: FiltroGestion, filtros: Record<string, unknown>, solicitante: Solicitante): Promise<ExportacionTabular> {
    const limite = this.configuracion.exportacionLimiteFilas;
    const total = await this.gestion.contarGlobal(filtro);
    if (total > limite) throw excedeLimite(limite);
    const { items } = await this.gestion.global(filtro, 0, Math.max(total, 1));
    const hdus = await this.hduDe(items.map((entrada) => entrada.hduId), solicitante);

    await this.proveedor.registrarExportacion({ recurso: 'GESTION_IMPEDIMENTOS', filtros, filas: items.length }, solicitante.contexto);
    return {
      recurso: 'gestion-impedimentos',
      encabezado: ['Fecha', 'HDU', 'Tipo de evento', 'Acción', 'Impedimento', 'Actor', 'Rol', 'Anterior', 'Nuevo', 'Comentario'],
      filas: items.map((entrada) => [
        entrada.fecha,
        hdus.get(entrada.hduId)?.codigo ?? `(HDU no disponible: ${entrada.hduId})`,
        entrada.tipo,
        entrada.accion,
        entrada.impedimento?.titulo ?? null,
        entrada.actor.nombre,
        entrada.actor.rol,
        entrada.anterior,
        entrada.nuevo,
        entrada.comentario,
      ]),
    };
  }

  /** Con `q`, suma las HDU cuyo código o título coincide (el texto de la HDU vive en Organización). */
  private async conTexto(filtro: FiltroAuditorImpedimentos, solicitante: Solicitante): Promise<FiltroAuditorImpedimentos> {
    if (filtro.q === undefined) return filtro;
    const q = filtro.q.toLowerCase();
    const hdus = await this.proveedor.ambitoDetalle(solicitante.contexto, true);
    const coincidentes = hdus.filter((hdu) => hdu.codigo.toLowerCase().includes(q) || hdu.titulo.toLowerCase().includes(q)).map((hdu) => hdu.id);
    return { ...filtro, hduIdsPorTexto: coincidentes };
  }

  private async hduDe(hduIds: readonly string[], solicitante: Solicitante): Promise<Map<string, DatosHdu>> {
    const unicos = [...new Set(hduIds)];
    if (unicos.length === 0) return new Map();
    return new Map((await this.proveedor.consultarHdu(unicos, solicitante.contexto)).map((hdu) => [hdu.id, hdu]));
  }

  private referencia(hdus: ReadonlyMap<string, DatosHdu>, hduId: string) {
    const hdu = hdus.get(hduId);
    return hdu === undefined ? hduNoDisponible(hduId) : referenciaHdu(hdu);
  }

  private vistaEntrada(entrada: EntradaGestionRegistro, hdu: ReturnType<typeof referenciaHdu>) {
    const detalle = entrada.detalle as { responsableAnterior?: { id: string | null; nombre: string }; responsableNuevo?: { id: string | null; nombre: string } } | null;
    return {
      id: entrada.id,
      tipo: entrada.tipo,
      accion: entrada.accion,
      hdu,
      impedimento: entrada.impedimento,
      actor: entrada.actor,
      fecha: entrada.fecha.toISOString(),
      anterior: entrada.anterior,
      nuevo: entrada.nuevo,
      comentario: entrada.comentario,
      sugeridoAlFijar: entrada.sugeridoAlFijar,
      detalle:
        detalle?.responsableAnterior !== undefined && detalle.responsableNuevo !== undefined
          ? { responsableAnterior: vistaResponsable(detalle.responsableAnterior), responsableNuevo: vistaResponsable(detalle.responsableNuevo) }
          : null,
    };
  }
}

