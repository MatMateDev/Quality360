/**
 * Envío de un lote (hasta 25 filas) a Organización y reconstrucción del detalle de cada fila (D100). Lo comparten la
 * sincronización con Jira y la importación de archivos. Las filas que el mapeo ya marcó con error no se envían: su
 * detalle sale directo del mapeo.
 */
import { mensajeDeFila } from '../dominio/catalogos.js';
import { recortar, unirAdvertencias } from '../dominio/ejecucion.js';
import type { FilaMapeada } from '../dominio/mapeo/tipos.js';
import type { FilaDetalle, MotivoFila, OrigenEjecucion } from '../dominio/tipos.js';
import type { ContextoSolicitud, DestinoHdu, FilaUpsert, ProveedorOrganizacion, ResultadoFilaUpsert, ResultadoUpsert } from './puertos.js';

export interface OpcionesLote {
  readonly origen: OrigenEjecucion;
  readonly destino: DestinoHdu;
  readonly vincularExistentes: boolean;
  readonly estricto: boolean;
  readonly soloSimular: boolean;
}

export function trocear<T>(elementos: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let desde = 0; desde < elementos.length; desde += tamano) lotes.push(elementos.slice(desde, desde + tamano));
  return lotes;
}

/** La forma de `FilaUpsertHdu`: sin `advertencias`, `referencia` ni `error`, que son del mapeo. */
function aFilaUpsert(fila: FilaMapeada): FilaUpsert {
  return {
    fila: fila.fila,
    codigo: fila.codigo,
    titulo: fila.titulo,
    descripcion: fila.descripcion ?? null,
    prioridad: fila.prioridad ?? null,
    celula: fila.celula ?? null,
    sprint: fila.sprint ?? null,
    qeCorreo: fila.qeCorreo ?? null,
    claveExterna: fila.claveExterna ?? null,
    urlExterna: fila.urlExterna ?? null,
  };
}

/** Fila de detalle para una fila que el mapeo ya rechazó. */
function detalleDeError(fila: FilaMapeada): FilaDetalle {
  const motivo = fila.error as MotivoFila;
  return {
    fila: fila.fila,
    codigo: recortar(fila.codigo, 60),
    titulo: recortar(fila.titulo?.trim() ?? null, 200),
    idHistoria: null,
    resultado: 'ERROR',
    motivo,
    mensaje: mensajeDeFila(motivo),
    advertencias: unirAdvertencias(fila.advertencias),
    cambios: null,
    referencia: fila.referencia,
  };
}

function detalleDeResultado(fila: FilaMapeada, resultado: ResultadoFilaUpsert): FilaDetalle {
  return {
    fila: fila.fila,
    codigo: recortar(fila.codigo, 60),
    titulo: recortar(fila.titulo?.trim() ?? null, 200),
    idHistoria: resultado.idHistoria,
    resultado: resultado.resultado,
    motivo: resultado.motivo,
    mensaje: resultado.motivo === null ? null : mensajeDeFila(resultado.motivo),
    advertencias: unirAdvertencias(fila.advertencias, resultado.advertencias),
    cambios: resultado.cambios,
    referencia: fila.referencia,
  };
}

export interface ResultadoLote {
  readonly detalle: FilaDetalle[];
  /** `true` si Organización no escribió nada (simulación o lote estricto revertido). */
  readonly simulado: boolean;
}

/**
 * Envía las filas válidas del lote y devuelve el detalle de todas, en el orden recibido.
 * @throws OrganizacionNoDisponible si Organización no responde o responde algo ilegible.
 */
export async function procesarLote(
  organizacion: ProveedorOrganizacion,
  contexto: ContextoSolicitud,
  limiteMs: number,
  filas: readonly FilaMapeada[],
  opciones: OpcionesLote,
): Promise<ResultadoLote> {
  const validas = filas.filter((fila) => fila.error === null);
  let resultado: ResultadoUpsert = { simulado: opciones.soloSimular, filas: [] };
  if (validas.length > 0) {
    resultado = await organizacion.upsert(
      {
        origen: opciones.origen,
        soloSimular: opciones.soloSimular,
        vincularExistentes: opciones.vincularExistentes,
        estricto: opciones.estricto,
        destino: opciones.destino,
        // Jira usa el sprint de respaldo con una advertencia; un archivo que nombra un sprint inexistente es error (D120).
        sprintNoEncontrado: opciones.origen === 'JIRA' ? 'RESPALDO' : 'ERROR',
        filas: validas.map(aFilaUpsert),
      },
      contexto,
      limiteMs,
    );
  }
  const porFila = new Map<number, ResultadoFilaUpsert>(resultado.filas.map((r) => [r.fila, r]));
  const detalle = filas.map((fila) => {
    if (fila.error !== null) return detalleDeError(fila);
    const r = porFila.get(fila.fila);
    // Organización contestó otra cosa que lo pedido: se trata como fila con error interno, nunca como éxito.
    return r === undefined ? detalleDeResultado(fila, { fila: fila.fila, codigo: fila.codigo, resultado: 'ERROR', motivo: 'ERROR_INTERNO', idHistoria: null, advertencias: [], cambios: null }) : detalleDeResultado(fila, r);
  });
  return { detalle, simulado: resultado.simulado };
}
