/** Armado de las respuestas con la forma de `comun.v1.yaml`. */
import { diasAbierto, esNuevo } from '../dominio/dias.js';
import { operacionesDelEstado } from '../dominio/impedimento.js';
import { puedeGestionarPorRelacion } from '../dominio/permisos.js';
import type { Factor } from '../dominio/riesgo/calculo.js';
import type {
  AccionRegistro,
  EstadoHdu,
  ImpedimentoRegistro,
  NivelRiesgo,
  OperacionImpedimento,
  Responsable,
  RelacionHdu,
  RiesgoFijadoRegistro,
} from '../dominio/tipos.js';
import type { DatosHdu } from './puertos.js';

export interface ReferenciaTemporal {
  /** «Hoy» del cálculo (America/Santiago o `Q360_FECHA_REFERENCIA`). */
  readonly hoy: string;
  /** Reloj real, para `esNuevo` (D90). */
  readonly ahora: Date;
}

export function vistaResponsable(responsable: Responsable) {
  return { id: responsable.id, nombre: responsable.nombre, externo: responsable.id === null };
}

/** Operaciones que quien consulta puede ejecutar ahora: solo el QE responsable, con la HDU abierta (D75). */
export function operacionesPermitidas(relacion: RelacionHdu | null, estadoHdu: EstadoHdu, impedimento: ImpedimentoRegistro): OperacionImpedimento[] {
  if (relacion === null || estadoHdu === 'CERRADA' || !puedeGestionarPorRelacion(relacion)) return [];
  return [...operacionesDelEstado(impedimento.estado)];
}

export function vistaImpedimento(impedimento: ImpedimentoRegistro, tiempo: ReferenciaTemporal, operaciones: readonly OperacionImpedimento[]) {
  const resuelto = impedimento.estado === 'RESUELTO';
  return {
    id: impedimento.id,
    hduId: impedimento.hduId,
    certificacionId: impedimento.certificacionId,
    tipo: impedimento.tipo,
    titulo: impedimento.titulo,
    descripcion: impedimento.descripcion,
    estado: impedimento.estado,
    responsable: vistaResponsable(impedimento.responsable),
    creadoPor: impedimento.creadoPor,
    fechaRegistro: impedimento.fechaRegistro.toISOString(),
    abiertoDesde: impedimento.abiertoDesde.toISOString(),
    fechaResolucion: impedimento.fechaResolucion === null ? null : impedimento.fechaResolucion.toISOString(),
    diasAbierto: diasAbierto(impedimento.abiertoDesde, impedimento.fechaResolucion, tiempo.hoy),
    esNuevo: esNuevo(impedimento.fechaRegistro, resuelto, tiempo.ahora),
    actualizadoEn: impedimento.actualizadoEn.toISOString(),
    operacionesPermitidas: [...operaciones],
  };
}

export function vistaAccion(accion: AccionRegistro) {
  return {
    id: accion.id,
    impedimentoId: accion.impedimentoId,
    tipo: accion.tipo,
    estadoAnterior: accion.estadoAnterior,
    estado: accion.estado,
    actor: accion.actor,
    fecha: accion.fecha.toISOString(),
    comentario: accion.comentario,
    detalle:
      accion.detalle === null
        ? null
        : { responsableAnterior: vistaResponsable(accion.detalle.responsableAnterior), responsableNuevo: vistaResponsable(accion.detalle.responsableNuevo) },
  };
}

export function referenciaHdu(hdu: DatosHdu) {
  return { id: hdu.id, codigo: hdu.codigo, titulo: hdu.titulo, estado: hdu.estado };
}

export function vistaFijado(fijado: RiesgoFijadoRegistro) {
  return {
    nivel: fijado.nivel,
    nivelAnterior: fijado.nivelAnterior,
    justificacion: fijado.justificacion,
    sugeridoAlFijar: fijado.sugeridoAlFijar,
    actor: fijado.actor,
    fecha: fijado.fecha.toISOString(),
  };
}

export function vistaFactor(factor: Factor) {
  return { codigo: factor.codigo, nivel: factor.nivel, detalle: factor.detalle };
}

export function resumenDeNivel(
  vigente: { nivelVigente: NivelRiesgo | null; origen: 'MANUAL' | 'SUGERIDO' | null; estado: 'ok' | 'indisponible'; calculoParcial: boolean },
) {
  return { nivelVigente: vigente.nivelVigente, origen: vigente.origen, estado: vigente.estado, calculoParcial: vigente.calculoParcial };
}
