/**
 * Seguimiento del checklist de una HDU para las bandejas (E7-B03, D46) y validez
 * del certificado (D45). Funciones puras: no leen base de datos ni red.
 */
import { CLAVES_ENTREGABLE, NOMBRES_ENTREGABLE, TOTAL_ENTREGABLES, type ClaveEntregable, type EstadoEntregable } from './entregables.js';

/** Un entregable tal como lo necesita el seguimiento (el ciclo activo de la HDU). */
export interface EntregableSeguimiento {
  readonly clave: ClaveEntregable;
  readonly estado: EstadoEntregable;
  /** Cuándo se marcó (entra a `POR_APROBAR`). */
  readonly completadoEn: Date | null;
  /** Cuándo lo aprobó el QE. */
  readonly aprobadoEn: Date | null;
}

export interface EntradaSeguimiento {
  readonly hduId: string;
  /** Entregables del ciclo activo; vacío si la HDU aún no tiene ciclo. */
  readonly entregables: readonly EntregableSeguimiento[];
  /** Acción del último evento de bitácora de cada entregable (solo los que tienen eventos). */
  readonly ultimaAccionPorClave: ReadonlyMap<ClaveEntregable, string>;
  readonly certificado: { readonly folio: string; readonly emitidoEn: Date } | null;
  readonly ultimaActividad: Date | null;
}

/** `SeguimientoHdu` de comun.v1.yaml. */
export interface SeguimientoHdu {
  hduId: string;
  aprobados: number;
  porcentaje: number;
  porAprobar: number;
  observaciones: number;
  siguienteEntregable: { clave: ClaveEntregable; orden: number; nombre: string } | null;
  certificado: { folio: string; emitidoEn: string } | null;
  listaParaCertificar: boolean;
  listaParaCerrar: boolean;
  porAprobarDesde: string | null;
  listaDesde: string | null;
  ultimaActividad: string | null;
}

const ORDEN_CERTIFICAR = CLAVES_ENTREGABLE.indexOf('CERTIFICADO');
const CLAVES_PREVIAS = CLAVES_ENTREGABLE.slice(0, ORDEN_CERTIFICAR);

/**
 * Una HDU sin ciclo de certificación tiene 0 aprobados y su siguiente entregable es el 1:
 * es un dato válido, no una falla.
 */
export function calcularSeguimiento(entrada: EntradaSeguimiento): SeguimientoHdu {
  const porClave = new Map(entrada.entregables.map((entregable) => [entregable.clave, entregable]));
  const estadoDe = (clave: ClaveEntregable): EstadoEntregable => porClave.get(clave)?.estado ?? 'PENDIENTE';

  const aprobados = CLAVES_ENTREGABLE.filter((clave) => estadoDe(clave) === 'APROBADO').length;
  const enPorAprobar = entrada.entregables.filter((entregable) => entregable.estado === 'POR_APROBAR');
  // «Con observaciones»: PENDIENTE cuyo último evento de bitácora es un rechazo.
  const observaciones = CLAVES_ENTREGABLE.filter(
    (clave) => estadoDe(clave) === 'PENDIENTE' && entrada.ultimaAccionPorClave.get(clave) === 'RECHAZAR',
  ).length;

  const claveSiguiente = CLAVES_ENTREGABLE.find((clave) => estadoDe(clave) !== 'APROBADO');
  const listaParaCertificar = CLAVES_PREVIAS.every((clave) => estadoDe(clave) === 'APROBADO') && estadoDe('CERTIFICADO') !== 'APROBADO';
  const listaParaCerrar = aprobados === TOTAL_ENTREGABLES;

  const porAprobarDesde = enPorAprobar
    .map((entregable) => entregable.completadoEn)
    .filter((fecha): fecha is Date => fecha !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  // Lista para certificar: desde que se aprobó el 8.º; lista para cerrar: desde que se aprobó el 10.º.
  const claveReferencia: ClaveEntregable | null = listaParaCerrar ? 'CIERRE_PRUEBAS' : listaParaCertificar ? (CLAVES_PREVIAS[CLAVES_PREVIAS.length - 1] ?? null) : null;
  const listaDesde = claveReferencia === null ? null : (porClave.get(claveReferencia)?.aprobadoEn ?? null);

  return {
    hduId: entrada.hduId,
    aprobados,
    porcentaje: Math.round((aprobados / TOTAL_ENTREGABLES) * 100),
    porAprobar: enPorAprobar.length,
    observaciones,
    siguienteEntregable:
      claveSiguiente === undefined
        ? null
        : { clave: claveSiguiente, orden: CLAVES_ENTREGABLE.indexOf(claveSiguiente) + 1, nombre: NOMBRES_ENTREGABLE[claveSiguiente] },
    certificado: entrada.certificado === null ? null : { folio: entrada.certificado.folio, emitidoEn: entrada.certificado.emitidoEn.toISOString() },
    listaParaCertificar,
    listaParaCerrar,
    porAprobarDesde: porAprobarDesde?.toISOString() ?? null,
    listaDesde: listaDesde?.toISOString() ?? null,
    ultimaActividad: entrada.ultimaActividad?.toISOString() ?? null,
  };
}

/**
 * Validez de un certificado (D45). No hay revocación en el alcance, así que hoy siempre es
 * `true`. La verificación pública del folio (D21) y las consultas del Auditor usan esta misma
 * función, para que ambas digan lo mismo.
 */
export function certificadoEsValido(_certificado: { readonly folio: string }): boolean {
  return true;
}
