/**
 * Reglas del checklist de entregables (E3, D15–D19). Funciones puras: no leen
 * base de datos ni red, para probarlas sin infraestructura.
 */
import { ExcepcionQ360, MENSAJES, accesoDenegado, type DetalleError } from '@quality360/auth-nest';

export const CLAVES_ENTREGABLE = [
  'PLAN_PRUEBAS',
  'DASHBOARD',
  'CASOS_PRUEBA',
  'APROBACION_CASOS',
  'EJECUCION',
  'EVIDENCIAS',
  'DEFECTOS',
  'APROBACION_UAT',
  'CERTIFICADO',
  'CIERRE_PRUEBAS',
] as const;

export type ClaveEntregable = (typeof CLAVES_ENTREGABLE)[number];
export type EstadoEntregable = 'PENDIENTE' | 'POR_APROBAR' | 'APROBADO';
/**
 * Relación del usuario con la HDU (D18, D32). `LECTOR_CELULA` (Líder QA) y `LECTOR_AUDITORIA`
 * (Auditor) solo permiten leer y descargar: ninguna operación del checklist las acepta.
 */
export type RelacionHdu =
  | 'ADMINISTRADOR'
  | 'QE_RESPONSABLE'
  | 'QE_SUPERVISOR_DEL_ANALISTA'
  | 'ANALISTA_ASIGNADO'
  | 'LECTOR_CELULA'
  | 'LECTOR_AUDITORIA';
export type EstadoHdu = 'PENDIENTE' | 'DISENO_PRUEBAS' | 'EN_EJECUCION' | 'PENDIENTE_CIERRE' | 'CERRADA';

export const NOMBRES_ENTREGABLE: Readonly<Record<ClaveEntregable, string>> = Object.freeze({
  PLAN_PRUEBAS: 'Plan de pruebas',
  DASHBOARD: 'Dashboard',
  CASOS_PRUEBA: 'Casos de prueba',
  APROBACION_CASOS: 'Aprobación de casos de prueba',
  EJECUCION: 'Ejecución',
  EVIDENCIAS: 'Evidencias',
  DEFECTOS: 'Defectos gestionados',
  APROBACION_UAT: 'Aprobación UAT',
  CERTIFICADO: 'Certificado',
  CIERRE_PRUEBAS: 'Cierre de pruebas',
});

/** Entregables que exige el certificado: del 1 al 8 (D19). */
export const CLAVES_PREVIAS_AL_CERTIFICADO: readonly ClaveEntregable[] = CLAVES_ENTREGABLE.slice(0, 8);

export const TOTAL_ENTREGABLES = CLAVES_ENTREGABLE.length;

export function esClaveEntregable(valor: unknown): valor is ClaveEntregable {
  return typeof valor === 'string' && (CLAVES_ENTREGABLE as readonly string[]).includes(valor);
}

export function ordenDe(clave: ClaveEntregable): number {
  return CLAVES_ENTREGABLE.indexOf(clave) + 1;
}

/** Estado de cada entregable; los que no tienen registro están PENDIENTE. */
export type EstadosPorClave = ReadonlyMap<ClaveEntregable, EstadoEntregable>;

export function estadoDe(estados: EstadosPorClave, clave: ClaveEntregable): EstadoEntregable {
  return estados.get(clave) ?? 'PENDIENTE';
}

export interface ResumenChecklist {
  readonly totalEntregables: number;
  readonly completados: number;
  readonly porcentajeCumplimiento: number;
  readonly completo: boolean;
}

/** Completado = aprobado; porcentaje sobre los 10 (D16, E3-B02#3). */
export function calcularResumen(estados: EstadosPorClave): ResumenChecklist {
  const completados = CLAVES_ENTREGABLE.filter((clave) => estadoDe(estados, clave) === 'APROBADO').length;
  return {
    totalEntregables: TOTAL_ENTREGABLES,
    completados,
    porcentajeCumplimiento: Math.round((completados / TOTAL_ENTREGABLES) * 100),
    completo: completados === TOTAL_ENTREGABLES,
  };
}

// ------------------------------------------------------------------ errores

const conflicto = (codigo: ConstructorParameters<typeof ExcepcionQ360>[1], mensaje?: string, detalles: DetalleError[] = []): ExcepcionQ360 =>
  new ExcepcionQ360(409, codigo, { mensaje: mensaje ?? MENSAJES[codigo], detalles });

export function errorHduCerrada(): ExcepcionQ360 {
  return conflicto('HDU_CERRADA', 'La HDU está cerrada: su checklist ya no admite cambios.');
}

export function errorMotivoRequerido(mensaje: string): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'MOTIVO_REQUERIDO', { mensaje });
}

export function errorEvidenciaInvalida(motivo: string): ExcepcionQ360 {
  return new ExcepcionQ360(422, 'EVIDENCIA_INVALIDA', { motivo });
}

// ------------------------------------------------------------------ reglas

/** Solo cambia el checklist quien tenga la relación indicada, y nunca en una HDU cerrada (D18, D22). */
export function exigirRelacion(relacion: RelacionHdu | null, esperada: RelacionHdu, estadoHdu: EstadoHdu, accion: string): void {
  if (relacion !== esperada) throw accesoDenegado(`${accion}: requiere ${esperada} y la relación es ${relacion ?? 'ninguna'}`);
  if (estadoHdu === 'CERRADA') throw errorHduCerrada();
}

/**
 * Precondiciones para marcar o pedir la subida de evidencia (E3-F02#2, E3-B01#2, E3-B02#1).
 * Orden libre (D130): cualquier entregable pendiente se marca sin esperar a los anteriores.
 */
export function validarMarcable(estados: EstadosPorClave, clave: ClaveEntregable): void {
  if (clave === 'CERTIFICADO') throw conflicto('ENTREGABLE_AUTOMATICO');
  if (estadoDe(estados, clave) !== 'PENDIENTE') throw conflicto('ENTREGABLE_YA_REGISTRADO');
}

/** Desmarcar: solo lo marcado y nunca el certificado (E3-F02#3, D19). Sin orden de retroceso (D130). */
export function validarDesmarcable(estados: EstadosPorClave, clave: ClaveEntregable): void {
  if (clave === 'CERTIFICADO') {
    throw conflicto('ENTREGABLE_AUTOMATICO', 'El certificado emitido es inmutable: no se puede desmarcar.');
  }
  if (estadoDe(estados, clave) === 'PENDIENTE') {
    throw conflicto('ESTADO_ENTREGABLE_INVALIDO', `«${NOMBRES_ENTREGABLE[clave]}» no está marcado.`);
  }
}

/** Aprobar o rechazar: solo lo que está por aprobar (E3-F03#1, E3-F03#2). */
export function validarPorAprobar(estados: EstadosPorClave, clave: ClaveEntregable): void {
  if (estadoDe(estados, clave) !== 'POR_APROBAR') {
    throw conflicto('ESTADO_ENTREGABLE_INVALIDO', `«${NOMBRES_ENTREGABLE[clave]}» no está pendiente de aprobación.`);
  }
}

export interface EstadoCertificacion {
  readonly habilitada: boolean;
  readonly motivo: string | null;
  readonly faltantes: ClaveEntregable[];
}

/** Si hoy se puede generar el certificado y, si no, por qué (E3-F04#2, E3-B03#3). */
export function evaluarCertificacion(estados: EstadosPorClave, tieneCertificado: boolean, estadoHdu: EstadoHdu): EstadoCertificacion {
  const faltantes = CLAVES_PREVIAS_AL_CERTIFICADO.filter((clave) => estadoDe(estados, clave) !== 'APROBADO');
  if (tieneCertificado) return { habilitada: false, motivo: MENSAJES.CERTIFICADO_EXISTENTE, faltantes: [] };
  if (estadoHdu === 'CERRADA') return { habilitada: false, motivo: MENSAJES.HDU_CERRADA, faltantes };
  if (faltantes.length > 0) {
    const nombres = faltantes.map((clave) => NOMBRES_ENTREGABLE[clave]).join(', ');
    return { habilitada: false, motivo: `Faltan entregables por aprobar: ${nombres}.`, faltantes };
  }
  return { habilitada: true, motivo: null, faltantes: [] };
}

export function validarCertificable(estados: EstadosPorClave, tieneCertificado: boolean, estadoHdu: EstadoHdu): void {
  if (estadoHdu === 'CERRADA') throw errorHduCerrada();
  if (tieneCertificado) throw conflicto('CERTIFICADO_EXISTENTE');
  const evaluacion = evaluarCertificacion(estados, false, estadoHdu);
  if (!evaluacion.habilitada) {
    throw conflicto(
      'ENTREGABLES_PENDIENTES',
      evaluacion.motivo ?? undefined,
      evaluacion.faltantes.map((clave) => ({
        campo: clave,
        codigo: 'REQUERIDO' as const,
        mensaje: `${NOMBRES_ENTREGABLE[clave]} debe estar aprobado.`,
      })),
    );
  }
}

// ------------------------------------------------------------------ evidencias

export const TIPOS_CONTENIDO_EVIDENCIA = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export type TipoContenidoEvidencia = (typeof TIPOS_CONTENIDO_EVIDENCIA)[number];
export const TAMANO_MAXIMO_EVIDENCIA = 10 * 1024 * 1024;

export function esTipoContenidoEvidencia(valor: unknown): valor is TipoContenidoEvidencia {
  return typeof valor === 'string' && (TIPOS_CONTENIDO_EVIDENCIA as readonly string[]).includes(valor);
}

/** Nombre seguro para la ruta en Storage: sin separadores ni caracteres raros. */
export function sanearNombreArchivo(nombre: string): string {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const limpio = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return (limpio || 'evidencia').slice(0, 120);
}

/** La ruta de una evidencia siempre queda bajo `<hduId>/<clave>/`. */
export function prefijoEvidencia(hduId: string, clave: ClaveEntregable): string {
  return `${hduId}/${clave}/`;
}

// ------------------------------------------------------------------ folio

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** `Q360-AAAA-XXXXXXXX` con 40 bits aleatorios: difícil de adivinar para la verificación pública (D21). */
export function generarFolio(bytesAleatorios: Uint8Array, fecha: Date): string {
  if (bytesAleatorios.length < 5) throw new Error('se necesitan 5 bytes para el folio');
  let bits = 0n;
  for (let i = 0; i < 5; i++) bits = (bits << 8n) | BigInt(bytesAleatorios[i] ?? 0);
  let sufijo = '';
  for (let i = 0; i < 8; i++) {
    sufijo = BASE32[Number(bits & 31n)] + sufijo;
    bits >>= 5n;
  }
  return `Q360-${fecha.getUTCFullYear()}-${sufijo}`;
}
