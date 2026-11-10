/**
 * Clasificación de una HDU (3.2, D155) y cumplimiento promedio (3.3, D156). Puro.
 *
 * Totales = certificadas + cerradas con excepción + en curso + sin iniciar: las cuatro son excluyentes. «Bloqueada» es
 * transversal y no suma.
 */
import type { AvanceHdu, EvaluacionHdu, HduAmbito } from './tipos.js';

export type ClaseHdu = 'CERRADA_EXCEPCION' | 'CERTIFICADA' | 'SIN_INICIAR' | 'EN_CURSO';

export function clasificarHdu(hdu: Pick<HduAmbito, 'estado' | 'cierreParcial'>, certificado: boolean): ClaseHdu {
  if (hdu.estado === 'CERRADA' && hdu.cierreParcial) return 'CERRADA_EXCEPCION';
  if (hdu.estado === 'CERRADA' || certificado) return 'CERTIFICADA';
  if (hdu.estado === 'PENDIENTE') return 'SIN_INICIAR';
  return 'EN_CURSO';
}

/** Avance en puntos porcentuales (`aprobados × 10`, D16). Una HDU sin ciclo aporta 0. */
export function avanceDe(avance: AvanceHdu | undefined): number {
  return (avance?.aprobados ?? 0) * 10;
}

/**
 * Promedio con 1 decimal, mitad hacia arriba, calculado con enteros para evitar errores de coma flotante
 * (36,666… → 36,7). `null` si no hay HDU: nunca 0 (D156).
 */
export function promedioRedondeado(sumaAvance: number, cantidad: number): number | null {
  if (cantidad <= 0) return null;
  return Math.floor((sumaAvance * 20 + cantidad) / (2 * cantidad)) / 10;
}

/** Cifras que dependen solo de Organización (D169). */
export interface CifrasOrganizacion {
  readonly hduTotales: number;
  readonly cerradasConExcepcion: number;
}

export interface CifrasCertificaciones {
  readonly certificadas: number;
  readonly enCurso: number;
  readonly sinIniciar: number;
  readonly sumaAvance: number;
  readonly cumplimientoPromedio: number | null;
}

export function cifrasOrganizacion(hdus: readonly HduAmbito[]): CifrasOrganizacion {
  return {
    hduTotales: hdus.length,
    cerradasConExcepcion: hdus.filter((hdu) => clasificarHdu(hdu, false) === 'CERRADA_EXCEPCION').length,
  };
}

export function cifrasCertificaciones(hdus: readonly HduAmbito[], avance: ReadonlyMap<string, AvanceHdu>): CifrasCertificaciones {
  let certificadas = 0;
  let enCurso = 0;
  let sinIniciar = 0;
  let suma = 0;
  for (const hdu of hdus) {
    const datos = avance.get(hdu.id);
    suma += avanceDe(datos);
    const clase = clasificarHdu(hdu, datos?.certificado === true);
    if (clase === 'CERTIFICADA') certificadas += 1;
    else if (clase === 'EN_CURSO') enCurso += 1;
    else if (clase === 'SIN_INICIAR') sinIniciar += 1;
  }
  return { certificadas, enCurso, sinIniciar, sumaAvance: suma, cumplimientoPromedio: promedioRedondeado(suma, hdus.length) };
}

/** HDU con al menos un impedimento `ABIERTO` o `ESCALADO` (D59). Una cerrada nunca está bloqueada (D60). */
export function contarBloqueadas(hdus: readonly HduAmbito[], evaluaciones: ReadonlyMap<string, EvaluacionHdu>): number {
  return hdus.filter((hdu) => hdu.estado !== 'CERRADA' && evaluaciones.get(hdu.id)?.bloqueada === true).length;
}
