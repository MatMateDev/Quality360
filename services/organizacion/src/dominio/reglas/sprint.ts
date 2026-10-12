/** Reglas del sprint (modelo de datos: Sprint.estado). Sin dependencias de Nest ni Prisma. */
export type EstadoSprint = 'PLANIFICADO' | 'EN_CURSO' | 'CERRADO';

/** Estado según las fechas, comparando días en UTC: antes del inicio, entre ambas o después del fin. */
export function estadoSprintPorFechas(inicio: Date, fin: Date, hoy: Date): EstadoSprint {
  const dia = (fecha: Date): string => fecha.toISOString().slice(0, 10);
  if (dia(fin) < dia(hoy)) return 'CERRADO';
  if (dia(inicio) > dia(hoy)) return 'PLANIFICADO';
  return 'EN_CURSO';
}
