/**
 * Reglas de las bandejas por rol (E7-B03, D33, D34, D46, D49): filtros, orden,
 * acciones del QE y fecha de actualización. Funciones puras sobre datos que ya
 * trajo la capa de aplicación (Organización y, si respondió, Certificaciones).
 */
import type { EstadoHdu, PrioridadHdu } from '../tipos.js';

export const TAMANO_PAGINA_POR_DEFECTO = 25;
export const TAMANO_PAGINA_MAXIMO = 100;

/** Un tamaño mayor a 100 se recorta sin error (D49, E7-B03-T08). */
export function tamanoEfectivo(pedido: number | undefined): number {
  const valor = pedido ?? TAMANO_PAGINA_POR_DEFECTO;
  return Math.min(Math.max(1, Math.trunc(valor)), TAMANO_PAGINA_MAXIMO);
}

// ------------------------------------------------------------- seguimiento

/** Estado del checklist de una HDU que calcula Certificaciones (comun.v1.yaml#/SeguimientoHdu). */
export interface SeguimientoHdu {
  readonly hduId: string;
  readonly aprobados: number;
  readonly porcentaje: number;
  readonly porAprobar: number;
  readonly observaciones: number;
  readonly siguienteEntregable: { readonly clave: string; readonly orden: number; readonly nombre: string } | null;
  readonly certificado: { readonly folio: string; readonly emitidoEn: string } | null;
  readonly listaParaCertificar: boolean;
  readonly listaParaCerrar: boolean;
  readonly porAprobarDesde: string | null;
  readonly listaDesde: string | null;
  readonly ultimaActividad: string | null;
}

export type MapaSeguimiento = ReadonlyMap<string, SeguimientoHdu>;

// ------------------------------------------------------------------- filas

/** Una HDU con los nombres ya resueltos; es lo que filtran y ordenan las bandejas. */
export interface FilaHdu {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly estado: EstadoHdu;
  readonly prioridad: PrioridadHdu;
  readonly celulaId: string;
  readonly celulaNombre: string;
  readonly sprintId: string;
  readonly sprintNombre: string;
  readonly sprintInicio: Date;
  /** Fin del sprint vigente (AAAA-MM-DD) para el riesgo de Impedimentos (E4, D68). */
  readonly sprintFin?: string | null;
  readonly qeResponsableId: string;
  readonly analistaId: string | null;
  readonly estadoActualizadoEn: Date;
  readonly creadoEn: Date;
  /** Fecha de la última asignación o reasignación (analista o QE), si hubo. */
  readonly ultimoCambioAsignacion: Date | null;
}

const RANGO_PRIORIDAD: Readonly<Record<PrioridadHdu, number>> = { BAJA: 0, MEDIA: 1, ALTA: 2, CRITICA: 3 };
const RANGO_ESTADO: Readonly<Record<EstadoHdu, number>> = {
  PENDIENTE: 0,
  DISENO_PRUEBAS: 1,
  EN_EJECUCION: 2,
  PENDIENTE_CIERRE: 3,
  CERRADA: 4,
};

export function esAbierta(estado: EstadoHdu): boolean {
  return estado !== 'CERRADA';
}

/** El mayor entre el estado, la última asignación y la última actividad del checklist (si se conoce). */
export function actualizadoEn(fila: FilaHdu, seguimiento: SeguimientoHdu | undefined): Date {
  const fechas = [fila.estadoActualizadoEn.getTime()];
  if (fila.ultimoCambioAsignacion !== null) fechas.push(fila.ultimoCambioAsignacion.getTime());
  if (seguimiento?.ultimaActividad !== undefined && seguimiento.ultimaActividad !== null) {
    fechas.push(new Date(seguimiento.ultimaActividad).getTime());
  }
  return new Date(Math.max(...fechas));
}

// ----------------------------------------------------------------- filtros

export interface FiltroFilasHdu {
  readonly estado?: EstadoHdu;
  readonly celulaId?: string;
  readonly sprintId?: string;
  readonly qeId?: string;
  readonly analistaId?: string;
  readonly sinAnalista?: boolean;
  readonly q?: string;
  readonly desde?: Date;
  readonly hasta?: Date;
}

/** Filtros que dependen solo de Organización. `desde`/`hasta` se aplican aparte porque usan `actualizadoEn`. */
export function filtrarFilasOrganizacion(filas: readonly FilaHdu[], filtro: FiltroFilasHdu): FilaHdu[] {
  const texto = filtro.q?.trim().toLowerCase();
  return filas.filter((fila) => {
    if (filtro.estado !== undefined && fila.estado !== filtro.estado) return false;
    if (filtro.celulaId !== undefined && fila.celulaId !== filtro.celulaId) return false;
    if (filtro.sprintId !== undefined && fila.sprintId !== filtro.sprintId) return false;
    if (filtro.qeId !== undefined && fila.qeResponsableId !== filtro.qeId) return false;
    if (filtro.analistaId !== undefined && fila.analistaId !== filtro.analistaId) return false;
    if (filtro.sinAnalista === true && fila.analistaId !== null) return false;
    if (texto !== undefined && texto.length > 0) {
      if (!fila.codigo.toLowerCase().includes(texto) && !fila.titulo.toLowerCase().includes(texto)) return false;
    }
    return true;
  });
}

export function filtrarPorRangoActualizacion(
  filas: readonly FilaHdu[],
  seguimientos: MapaSeguimiento,
  desde: Date | undefined,
  hasta: Date | undefined,
): FilaHdu[] {
  if (desde === undefined && hasta === undefined) return [...filas];
  return filas.filter((fila) => {
    const fecha = actualizadoEn(fila, seguimientos.get(fila.id)).getTime();
    if (desde !== undefined && fecha < desde.getTime()) return false;
    if (hasta !== undefined && fecha > hasta.getTime()) return false;
    return true;
  });
}

// ------------------------------------------------------------------- orden

export const COLUMNAS_ORDEN_HDU = ['codigo', 'celula', 'sprint', 'prioridad', 'estado', 'avance', 'actualizada'] as const;
export type ColumnaOrdenHdu = (typeof COLUMNAS_ORDEN_HDU)[number] | 'observaciones';
export type DireccionOrden = 'asc' | 'desc';

export interface CriterioOrden {
  readonly columna: ColumnaOrdenHdu;
  readonly direccion: DireccionOrden;
}

export type OrdenHdu = readonly CriterioOrden[];

/** Columnas cuyo valor viene de Certificaciones (D46): sin ella el orden cae al de respaldo. */
export function ordenDependeDeCertificaciones(orden: OrdenHdu): boolean {
  return orden.some((criterio) => criterio.columna === 'avance' || criterio.columna === 'observaciones');
}

/** `columna:asc|desc`. Devuelve `null` si la columna o la dirección no son válidas (400). */
export function parsearOrden(texto: string, permitidas: readonly string[] = COLUMNAS_ORDEN_HDU): OrdenHdu | null {
  const coincide = /^([a-z]+):(asc|desc)$/.exec(texto);
  if (coincide === null) return null;
  const columna = coincide[1] as string;
  if (!permitidas.includes(columna)) return null;
  return [{ columna: columna as ColumnaOrdenHdu, direccion: coincide[2] as DireccionOrden }];
}

export function serializarOrden(orden: OrdenHdu): string {
  return orden.map((criterio) => `${criterio.columna}:${criterio.direccion}`).join(',');
}

function comparar(a: number | string, b: number | string): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
  return (a as number) - (b as number);
}

function valorDe(columna: ColumnaOrdenHdu, fila: FilaHdu, seguimiento: SeguimientoHdu | undefined): number | string {
  switch (columna) {
    case 'codigo':
      return fila.codigo;
    case 'celula':
      return fila.celulaNombre;
    case 'sprint':
      return fila.sprintInicio.getTime();
    case 'prioridad':
      return RANGO_PRIORIDAD[fila.prioridad];
    case 'estado':
      return RANGO_ESTADO[fila.estado];
    case 'avance':
      return seguimiento?.aprobados ?? -1;
    case 'observaciones':
      return seguimiento?.observaciones ?? 0;
    case 'actualizada':
      return actualizadoEn(fila, seguimiento).getTime();
  }
}

/** Ordena sin mutar; el desempate final es siempre el código ascendente, para que el orden sea estable. */
export function ordenarFilasHdu(filas: readonly FilaHdu[], orden: OrdenHdu, seguimientos: MapaSeguimiento): FilaHdu[] {
  return [...filas].sort((a, b) => {
    for (const criterio of orden) {
      const resultado = comparar(
        valorDe(criterio.columna, a, seguimientos.get(a.id)),
        valorDe(criterio.columna, b, seguimientos.get(b.id)),
      );
      if (resultado !== 0) return criterio.direccion === 'asc' ? resultado : -resultado;
    }
    return comparar(a.codigo, b.codigo);
  });
}

// --------------------------------------------------------------- QE: acciones

export type TipoAccionQe = 'APROBAR' | 'ASIGNAR' | 'CERTIFICAR' | 'CERRAR';
export const TIPOS_ACCION_QE: readonly TipoAccionQe[] = ['APROBAR', 'ASIGNAR', 'CERTIFICAR', 'CERRAR'];

export interface AccionPendiente {
  readonly fila: FilaHdu;
  readonly tipo: TipoAccionQe;
  readonly entregablesPorAprobar: number | null;
  readonly esperandoDesde: Date;
  readonly antiguedadDias: number;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function antiguedadEnDias(desde: Date, ahora: Date): number {
  return Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / MS_POR_DIA));
}

/**
 * Acciones pendientes de una HDU de la que el usuario es QE responsable (E7-F03):
 * `ASIGNAR` sale de Organización; las otras tres, del seguimiento. Sin seguimiento
 * (Certificaciones no respondió) solo se calcula `ASIGNAR`. Una HDU cerrada no tiene acciones.
 */
export function accionesPendientesQe(fila: FilaHdu, seguimiento: SeguimientoHdu | undefined, ahora: Date): AccionPendiente[] {
  if (!esAbierta(fila.estado)) return [];
  const acciones: AccionPendiente[] = [];
  const agregar = (tipo: TipoAccionQe, desde: Date, porAprobar: number | null): void => {
    acciones.push({ fila, tipo, entregablesPorAprobar: porAprobar, esperandoDesde: desde, antiguedadDias: antiguedadEnDias(desde, ahora) });
  };

  if (seguimiento !== undefined && seguimiento.porAprobar > 0) {
    agregar('APROBAR', seguimiento.porAprobarDesde !== null ? new Date(seguimiento.porAprobarDesde) : fila.estadoActualizadoEn, seguimiento.porAprobar);
  }
  if (fila.analistaId === null) agregar('ASIGNAR', fila.creadoEn, null);
  if (seguimiento !== undefined && seguimiento.listaParaCertificar) {
    agregar('CERTIFICAR', seguimiento.listaDesde !== null ? new Date(seguimiento.listaDesde) : fila.estadoActualizadoEn, null);
  }
  if (seguimiento !== undefined && seguimiento.listaParaCerrar) {
    agregar('CERRAR', seguimiento.listaDesde !== null ? new Date(seguimiento.listaDesde) : fila.estadoActualizadoEn, null);
  }
  return acciones;
}

/** Más antigua primero; desempate por código y tipo. */
export function ordenarAcciones(acciones: readonly AccionPendiente[]): AccionPendiente[] {
  return [...acciones].sort((a, b) => {
    const porFecha = a.esperandoDesde.getTime() - b.esperandoDesde.getTime();
    if (porFecha !== 0) return porFecha;
    const porCodigo = comparar(a.fila.codigo, b.fila.codigo);
    if (porCodigo !== 0) return porCodigo;
    return TIPOS_ACCION_QE.indexOf(a.tipo) - TIPOS_ACCION_QE.indexOf(b.tipo);
  });
}

// ------------------------------------------------------------- Admin: pendientes

export type TipoPendienteAdmin = 'ANALISTA_SIN_QE' | 'QE_SIN_ANALISTAS' | 'LIDER_SIN_CELULAS' | 'CELULA_SIN_LIDER';
export const TIPOS_PENDIENTE_ADMIN: readonly TipoPendienteAdmin[] = [
  'ANALISTA_SIN_QE',
  'QE_SIN_ANALISTAS',
  'LIDER_SIN_CELULAS',
  'CELULA_SIN_LIDER',
];
