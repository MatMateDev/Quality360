/** Filas de Prisma → registros del dominio. */
import type { AccionImpedimento, Impedimento, RiesgoHdu } from '#prisma';

import type {
  AccionRegistro,
  EstadoImpedimento,
  ImpedimentoRegistro,
  NivelRiesgo,
  PersonaRol,
  Responsable,
  RiesgoFijadoRegistro,
  RolUsuario,
  TipoAccion,
  TipoImpedimento,
} from '../../dominio/tipos.js';

export function aImpedimento(fila: Impedimento): ImpedimentoRegistro {
  return {
    id: fila.id,
    hduId: fila.historiaId,
    certificacionId: fila.certificacionId,
    tipo: fila.tipo as TipoImpedimento,
    titulo: fila.titulo,
    descripcion: fila.descripcion ?? '',
    estado: fila.estado as EstadoImpedimento,
    responsable: { id: fila.responsableId, nombre: fila.responsableNombre },
    creadoPor: { id: fila.creadoPorId, nombre: fila.creadoPorNombre, rol: fila.creadoPorRol as RolUsuario },
    fechaRegistro: fila.fechaRegistro,
    abiertoDesde: fila.abiertoDesde,
    fechaResolucion: fila.fechaResolucion,
    actualizadoEn: fila.actualizadoEn,
  };
}

/** `externo` se guarda en el detalle de `ESCALAR` para que el historial coincida con el contrato. */
export function responsableAJson(responsable: Responsable): { id: string | null; nombre: string; externo: boolean } {
  return { id: responsable.id, nombre: responsable.nombre, externo: responsable.id === null };
}

function responsableDeJson(valor: unknown): Responsable {
  const datos = valor as { id?: unknown; nombre?: unknown };
  return { id: typeof datos.id === 'string' ? datos.id : null, nombre: typeof datos.nombre === 'string' ? datos.nombre : '' };
}

export function aAccion(fila: AccionImpedimento): AccionRegistro {
  const detalle = fila.detalle as { responsableAnterior?: unknown; responsableNuevo?: unknown } | null;
  return {
    id: fila.id,
    impedimentoId: fila.impedimentoId,
    tipo: fila.tipoAccion as TipoAccion,
    estadoAnterior: fila.estadoAnterior as EstadoImpedimento | null,
    estado: fila.estado as EstadoImpedimento,
    actor: { id: fila.actorId, nombre: fila.actorNombre, rol: fila.actorRol as RolUsuario },
    fecha: fila.fechaAccion,
    comentario: fila.descripcion,
    detalle:
      detalle !== null && typeof detalle === 'object' && detalle.responsableAnterior !== undefined && detalle.responsableNuevo !== undefined
        ? { responsableAnterior: responsableDeJson(detalle.responsableAnterior), responsableNuevo: responsableDeJson(detalle.responsableNuevo) }
        : null,
  };
}

export function aRiesgo(fila: RiesgoHdu): RiesgoFijadoRegistro {
  const actor: PersonaRol = { id: fila.actorId, nombre: fila.actorNombre, rol: fila.actorRol as RolUsuario };
  return {
    id: fila.id,
    hduId: fila.historiaId,
    nivel: fila.nivel as NivelRiesgo,
    nivelAnterior: fila.nivelAnterior as NivelRiesgo | null,
    justificacion: fila.justificacion,
    sugeridoAlFijar: fila.sugeridoAlFijar as NivelRiesgo | null,
    actor,
    fecha: fila.fecha,
  };
}
