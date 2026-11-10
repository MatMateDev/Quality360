// Datos de referencia de E6 (indicadores, dashboards y cierre con excepción) para MSW, sobre el universo de
// `data.ts`. Son solo el estado de los mocks de pruebas: el portal real recibe todo del servicio Indicadores.
import type { ClaveEntregable, EstadoHdu, MotivoFalloSnapshot, MotivoSemaforo, NivelRiesgo } from "@/types/dominio";
import { ID, eventosHdu, hdus, type HduMock } from "./data";
import { impedimentosMock } from "./dataE4";
import { seguimientoDe } from "./dataE7";

/** Atributos de indicadores por HDU (lo que en el stack real calculan Impedimentos y Certificaciones). */
export interface InfoHduIndicadores {
  riesgo: NivelRiesgo;
  /** Impedimento más grave de la HDU, si lo hay. */
  impedimento: { id: string; titulo: string; estado: "ABIERTO" | "ESCALADO"; diasAbierto: number } | null;
}

const baseInfoHdu: Record<string, InfoHduIndicadores> = {
  [ID.hdu1]: { riesgo: "ALTO", impedimento: { id: "e4000000-0000-4000-8000-000000000002", titulo: "Faltan cuentas de prueba con saldo", estado: "ESCALADO", diasAbierto: 6 } },
  [ID.hdu2]: { riesgo: "MEDIO", impedimento: null },
  [ID.hdu3]: { riesgo: "BAJO", impedimento: { id: "e4000000-0000-4000-8000-000000000001", titulo: "Ambiente de pruebas inestable", estado: "ABIERTO", diasAbierto: 2 } },
  [ID.hdu4]: { riesgo: "BAJO", impedimento: null },
  [ID.hdu5]: { riesgo: "ALTO", impedimento: null },
  [ID.hdu6]: { riesgo: "BAJO", impedimento: null },
};

/**
 * El impedimento de cada HDU sigue el estado del mock de E4: al resolverlo desde el detalle deja de contar y al
 * reabrirlo vuelve (E6-F02-T07/T08). El resto de los atributos es fijo.
 */
export const infoHdu: Record<string, InfoHduIndicadores> = Object.fromEntries(
  Object.entries(baseInfoHdu).map(([id, base]) => [
    id,
    {
      riesgo: base.riesgo,
      get impedimento() {
        if (!base.impedimento) return null;
        return impedimentosMock.find((i) => i.id === base.impedimento!.id)?.estado === "RESUELTO" ? null : base.impedimento;
      },
    } as InfoHduIndicadores,
  ]),
);

export const CELULAS_ABIERTO: ReadonlySet<string> = new Set([ID.sprint19]);

export interface CierreMock {
  aprobados: number;
  pendientes: ClaveEntregable[];
  justificacion: string;
  actorId: string;
  fecha: string;
}

export interface UmbralMock {
  valor: number;
  actualizadoEn: string | null;
  actualizadoPorId: string | null;
}

export interface EventoUmbralMockE6 {
  id: string;
  qeId: string;
  valorAnterior: number;
  valorNuevo: number;
  actorId: string;
  fecha: string;
}

export interface EjecucionMock {
  id: string;
  fecha: string;
  origen: "CRON" | "MANUAL";
  actorId: string | null;
  actorNombre: string;
  inicio: string;
  duracionMs: number | null;
  resultado: "EN_CURSO" | "EXITOSA" | "FALLIDA";
  filasEscritas: number;
  motivo: MotivoFalloSnapshot | null;
}

export const ENTREGABLES: Array<{ clave: ClaveEntregable; nombre: string }> = [
  { clave: "PLAN_PRUEBAS", nombre: "Plan de pruebas" },
  { clave: "DASHBOARD", nombre: "Dashboard de seguimiento" },
  { clave: "CASOS_PRUEBA", nombre: "Casos de prueba" },
  { clave: "APROBACION_CASOS", nombre: "Aprobación de casos" },
  { clave: "EJECUCION", nombre: "Reporte de ejecución" },
  { clave: "EVIDENCIAS", nombre: "Evidencias" },
  { clave: "DEFECTOS", nombre: "Reporte de defectos" },
  { clave: "APROBACION_UAT", nombre: "Aprobación UAT" },
  { clave: "CERTIFICADO", nombre: "Certificado de calidad" },
  { clave: "CIERRE_PRUEBAS", nombre: "Cierre de pruebas" },
];

/** Aprobados de una HDU que simula un checklist incompleto (coincide con el 409 de `handlers.ts`). */
export const APROBADOS_SIMULADOS = 7;

export interface EstadoE6 {
  umbrales: Map<string, UmbralMock>;
  eventosUmbral: EventoUmbralMockE6[];
  ejecuciones: EjecucionMock[];
  cierres: Map<string, CierreMock>;
  /** Pruebas: el snapshot manual responde 409 `EJECUCION_EN_CURSO`. */
  snapshotEnCurso: boolean;
  /** Pruebas: el snapshot manual termina `FALLIDA` con este motivo. */
  snapshotFalla: MotivoFalloSnapshot | null;
  /** Pruebas: la exportación responde 422 `EXPORTACION_EXCEDE_LIMITE`. */
  exportacionExcede: boolean;
  /** Pruebas: HDU sin sprint del ámbito (D180). */
  hduSinSprint: number;
  /** Pruebas: Indicadores o el filtro caen entero (5xx). */
  indicadoresCaido: boolean;
  /** Pruebas: el servicio responde 503 `SERVICIO_NO_DISPONIBLE` (Organización caída). */
  organizacionCaida: boolean;
}

const AHORA = Date.parse("2026-11-04T15:20:00Z");

function ejecucionesIniciales(): EjecucionMock[] {
  return [
    { id: "ee000000-0000-4000-8000-000000000001", fecha: "2026-11-04", origen: "CRON", actorId: null, actorNombre: "Sistema", inicio: new Date(AHORA - 12 * 3_600_000).toISOString(), duracionMs: 4000, resultado: "EXITOSA", filasEscritas: 24, motivo: null },
    { id: "ee000000-0000-4000-8000-000000000002", fecha: "2026-11-03", origen: "MANUAL", actorId: ID.admin, actorNombre: "Valentina Rojas", inicio: new Date(AHORA - 36 * 3_600_000).toISOString(), duracionMs: 3000, resultado: "FALLIDA", filasEscritas: 0, motivo: "IMPEDIMENTOS_NO_DISPONIBLE" },
  ];
}

export const estadoE6: EstadoE6 = {
  umbrales: new Map(),
  eventosUmbral: [],
  ejecuciones: ejecucionesIniciales(),
  cierres: new Map(),
  snapshotEnCurso: false,
  snapshotFalla: null,
  exportacionExcede: false,
  hduSinSprint: 0,
  indicadoresCaido: false,
  organizacionCaida: false,
};

/** Restaura el estado de E6 entre pruebas. */
export function reiniciarE6(): void {
  estadoE6.umbrales.clear();
  estadoE6.eventosUmbral = [];
  estadoE6.ejecuciones = ejecucionesIniciales();
  estadoE6.cierres.clear();
  estadoE6.snapshotEnCurso = false;
  estadoE6.snapshotFalla = null;
  estadoE6.exportacionExcede = false;
  estadoE6.hduSinSprint = 0;
  estadoE6.indicadoresCaido = false;
  estadoE6.organizacionCaida = false;
  for (const h of hdus) {
    delete h.simularChecklistIncompleto;
    const inicial = estadosIniciales.get(h.id);
    if (inicial) {
      h.estado = inicial.estado;
      h.estadoActualizadoEn = inicial.estadoActualizadoEn;
    }
  }
  eventosHdu.splice(cantidadEventosInicial);
}

const estadosIniciales = new Map(hdus.map((h) => [h.id, { estado: h.estado, estadoActualizadoEn: h.estadoActualizadoEn }]));
const cantidadEventosInicial = eventosHdu.length;

/** Aprobados de una HDU: el cierre con excepción congela los del momento. */
export function aprobadosDe(hdu: HduMock): number {
  return estadoE6.cierres.get(hdu.id)?.aprobados ?? seguimientoDe(hdu.id).aprobados;
}

export type ClaseHdu = "CERTIFICADA" | "CERRADA_EXCEPCION" | "EN_CURSO" | "SIN_INICIAR";

/** Clasificación excluyente de 3.2: certificada, cerrada con excepción, en curso o sin iniciar. */
export function claseDe(hdu: HduMock): ClaseHdu {
  if (hdu.estado === "CERRADA") return estadoE6.cierres.has(hdu.id) ? "CERRADA_EXCEPCION" : "CERTIFICADA";
  return aprobadosDe(hdu) > 0 ? "EN_CURSO" : "SIN_INICIAR";
}

export function esActiva(estado: EstadoHdu): boolean {
  return estado !== "CERRADA";
}

export function motivosDe(hdu: HduMock): MotivoSemaforo[] {
  const info = infoHdu[hdu.id];
  if (!info || hdu.estado === "CERRADA") return [];
  const motivos: MotivoSemaforo[] = [];
  if (info.impedimento?.estado === "ESCALADO") motivos.push("IMPEDIMENTO_ESCALADO");
  if (info.riesgo === "ALTO") motivos.push("RIESGO_ALTO");
  if (info.riesgo === "MEDIO") motivos.push("RIESGO_MEDIO");
  if (info.impedimento?.estado === "ABIERTO") motivos.push("IMPEDIMENTO_ABIERTO");
  return motivos;
}
