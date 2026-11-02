// Datos de MSW de E5 (integración con Jira y archivos) según `contracts/integraciones.v1.yaml`. Solo sirven para
// pruebas y revisión visual: no son fuente de datos del portal real.
import type {
  ConfiguracionJira,
  Ejecucion,
  EventoConfiguracionJira,
  FilaEjecucion,
  OrigenHdu,
} from "@/types/dominio";
import { ID } from "./data";

/** Estado de cada fuente de E5, bloque por bloque, para forzar «error» e «indisponible» sin tocar el resto. */
export type EstadoFuente = "ok" | "error" | "indisponible";

export interface ModoE5 {
  configuracion: EstadoFuente | "vacia" | "sin-llave" | "no-descifrable";
  eventos: EstadoFuente | "vacio";
  historial: EstadoFuente | "vacio";
  ultimaEjecucion: EstadoFuente;
  detalle: EstadoFuente;
  catalogos: EstadoFuente;
  /** Retardo de las operaciones de sincronizar e importar (ms): deja ver el estado de espera. */
  demoraMs: number;
  /** Servicio caído al validar un archivo (vista previa). */
  vistaPrevia: EstadoFuente;
  /** Resultado que producirá el próximo `POST …/sincronizaciones`. */
  sincronizacion:
    | "exitosa"
    | "con-errores"
    | "incompleta"
    | "incompleta-tasa"
    | "fallida"
    | "fallida-credencial"
    | "fallida-organizacion"
    | "sin-cambios"
    | "sin-respuesta"
    | "en-curso"
    | "vincular-sugerido";
  /** Resultado de la próxima importación. */
  importacion: "normal" | "incompleta" | "sin-respuesta";
  /** `ok` o el código de error de la prueba de conexión. */
  prueba: "ok" | "JIRA_CREDENCIAL_INVALIDA" | "JIRA_SITIO_NO_ENCONTRADO" | "JIRA_PROYECTO_NO_ENCONTRADO";
}

export const modoE5: ModoE5 = {
  configuracion: "ok",
  eventos: "ok",
  historial: "ok",
  ultimaEjecucion: "ok",
  detalle: "ok",
  catalogos: "ok",
  demoraMs: 150,
  vistaPrevia: "ok",
  sincronizacion: "exitosa",
  importacion: "normal",
  prueba: "ok",
};

export interface FilaMock extends FilaEjecucion {
  /** HDU fuera del ámbito del QE (D106): se oculta y se cuenta en `filasOcultas`. */
  fueraDeAmbito?: boolean;
}

export const MS_DIA = 86_400_000;

export const celulaDeConfig = { id: ID.celClientes, nombre: "Clientes" };
export const sprintDeConfig = { id: "c3000000-0000-4000-8000-0000000000e1", nombre: "E5 Sprint 1" };

/** Sprints por célula (D120). Pagos conserva los del catálogo base; Clientes y Tarjetas tienen los de E5. */
export const sprintsE5 = [
  { id: sprintDeConfig.id, nombre: "E5 Sprint 1", inicio: "2026-10-05", fin: "2026-10-18", celulaId: ID.celClientes },
  { id: "c3000000-0000-4000-8000-0000000000e2", nombre: "E5 Sprint 2", inicio: "2026-10-19", fin: "2026-11-01", celulaId: ID.celClientes },
  { id: "c3000000-0000-4000-8000-0000000000e3", nombre: "E5 Tarjetas 1", inicio: "2026-10-05", fin: "2026-10-18", celulaId: ID.celTarjetas },
];

export const celulaDeSprintBase: Record<string, string> = { [ID.sprint18]: ID.celPagos, [ID.sprint19]: ID.celPagos };

function configuracionInicial(): ConfiguracionJira {
  return {
    configurado: true,
    llaveDisponible: true,
    sitio: "https://su-empresa.atlassian.net",
    correo: "admin@empresa.com",
    proyecto: "QTY",
    tiposIssue: ["Story", "Historia"],
    celula: celulaDeConfig,
    qeResponsable: { id: ID.qe1, nombre: "Jose Seguel" },
    sprintRespaldo: { id: sprintDeConfig.id, nombre: sprintDeConfig.nombre },
    token: { configurado: true, ultimos4: "AB12", descifrable: true },
    estadoConexion: "OK",
    ultimaPruebaEn: "2026-10-29T13:15:00Z",
    ultimaPruebaCodigo: null,
    avisosDestino: [],
    actualizadoEn: "2026-10-29T13:15:00Z",
    actualizadoPor: { id: ID.admin, nombre: "Valentina Rojas" },
  };
}

export function configuracionVacia(): ConfiguracionJira {
  return {
    configurado: false,
    llaveDisponible: true,
    sitio: null,
    correo: null,
    proyecto: null,
    tiposIssue: [],
    celula: null,
    qeResponsable: null,
    sprintRespaldo: null,
    token: { configurado: false, ultimos4: null, descifrable: false },
    estadoConexion: "SIN_PROBAR",
    ultimaPruebaEn: null,
    ultimaPruebaCodigo: null,
    avisosDestino: [],
    actualizadoEn: null,
    actualizadoPor: null,
  };
}

export const estadoConfig: { actual: ConfiguracionJira } = { actual: configuracionInicial() };

/** Último token recibido por el mock: las pruebas verifican que nunca vuelve en una respuesta. */
export const ultimosTokens: string[] = [];

function eventosIniciales(): EventoConfiguracionJira[] {
  const admin = { id: ID.admin, nombre: "Valentina Rojas" };
  return [
    { id: "e5000000-0000-4000-8000-0000000000a1", fecha: "2026-10-29T13:15:00Z", actor: admin, camposCambiados: ["token", "proyecto"], tokenCambiado: true, resultadoPrueba: "OK" },
    { id: "e5000000-0000-4000-8000-0000000000a2", fecha: "2026-10-28T19:02:00Z", actor: admin, camposCambiados: ["sitio", "correo", "token", "celulaId", "qeResponsableId", "sprintRespaldoId"], tokenCambiado: true, resultadoPrueba: "OK" },
  ];
}

export const eventosConfig: EventoConfiguracionJira[] = eventosIniciales();

// ------------------------------------------------------------------ ejecuciones

export const EJ = {
  jiraErrores: "f5000000-0000-4000-8000-000000000001",
  csvOk: "f5000000-0000-4000-8000-000000000002",
  csvErrores: "f5000000-0000-4000-8000-000000000003",
  jiraFallida: "f5000000-0000-4000-8000-000000000004",
} as const;

const adminActor = { id: ID.admin, nombre: "Valentina Rojas", rol: "ADMINISTRADOR" as const };

export function ejecucionBase(parcial: Partial<Ejecucion> & Pick<Ejecucion, "id" | "origen" | "resultado">): Ejecucion {
  return {
    actor: adminActor,
    iniciadaEn: "2026-10-29T13:20:00Z",
    terminadaEn: "2026-10-29T13:20:03Z",
    duracionMs: 3100,
    estricto: false,
    vincularExistentes: false,
    leidas: 0,
    creadas: 0,
    actualizadas: 0,
    omitidas: 0,
    conError: 0,
    conAdvertencias: 0,
    reintentos429: 0,
    eventos: [],
    codigoError: null,
    mensajeError: null,
    sugerencias: [],
    proyecto: null,
    sitioHost: null,
    archivo: null,
    hayMas: false,
    continuarDesde: null,
    ...parcial,
  };
}

function ejecucionesIniciales(): Ejecucion[] {
  return [
    ejecucionBase({
      id: EJ.jiraFallida,
      origen: "JIRA",
      resultado: "FALLIDA",
      iniciadaEn: "2026-10-29T13:40:00Z",
      terminadaEn: "2026-10-29T13:40:02Z",
      duracionMs: 2000,
      codigoError: "JIRA_NO_DISPONIBLE",
      mensajeError: "Jira no está disponible por ahora.",
      sugerencias: ["REINTENTAR", "IMPORTAR_ARCHIVO"],
      proyecto: "QTY",
      sitioHost: "su-empresa.atlassian.net",
    }),
    ejecucionBase({
      id: EJ.csvErrores,
      origen: "CSV",
      resultado: "CON_ERRORES",
      iniciadaEn: "2026-10-29T13:30:00Z",
      terminadaEn: "2026-10-29T13:30:01Z",
      duracionMs: 1200,
      leidas: 9,
      creadas: 2,
      conError: 7,
      archivo: { nombre: "historias-con-errores.csv", tamano: 1434, huella: "3fa9c2e1" + "0".repeat(56) },
    }),
    ejecucionBase({
      id: EJ.csvOk,
      origen: "CSV",
      resultado: "EXITOSA",
      iniciadaEn: "2026-10-29T13:25:00Z",
      terminadaEn: "2026-10-29T13:25:01Z",
      duracionMs: 900,
      leidas: 4,
      creadas: 4,
      conAdvertencias: 1,
      archivo: { nombre: "historias-validas.csv", tamano: 1229, huella: "a1b2c3d4" + "e".repeat(56) },
    }),
    ejecucionBase({
      id: EJ.jiraErrores,
      origen: "JIRA",
      resultado: "CON_ERRORES",
      leidas: 11,
      creadas: 10,
      conError: 1,
      conAdvertencias: 5,
      reintentos429: 2,
      eventos: [
        { tipo: "JIRA_LIMITE_DE_TASA", esperaMs: 1000, fecha: "2026-10-29T13:20:01Z" },
        { tipo: "JIRA_LIMITE_DE_TASA", esperaMs: 1000, fecha: "2026-10-29T13:20:02Z" },
      ],
      proyecto: "QTY",
      sitioHost: "su-empresa.atlassian.net",
    }),
  ];
}

export const ejecuciones: Ejecucion[] = ejecucionesIniciales();

export function filasCreadas(prefijo: string, n: number, desde = 1): FilaMock[] {
  return Array.from({ length: n }, (_, i) => ({
    fila: desde + i,
    codigo: `${prefijo}-${i + 1}`,
    titulo: `Historia ${prefijo}-${i + 1}`,
    idHistoria: `d5000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    resultado: "CREADA" as const,
    motivo: null,
    advertencias: i === 2 ? ["SPRINT_NO_ENCONTRADO" as const] : [],
    cambios: { prioridad: { antes: null, despues: i % 2 === 0 ? "ALTA" : "CRITICA" } },
    referencia: { estado: "En curso", responsable: "Ana" },
  }));
}

export const detalles = new Map<string, FilaMock[]>();

function detallesIniciales(): void {
  detalles.clear();
  detalles.set(EJ.jiraErrores, [
    ...filasCreadas("QTY", 10),
    { fila: 11, codigo: "QTY-11", titulo: null, idHistoria: null, resultado: "ERROR", motivo: "TITULO_VACIO", advertencias: [], cambios: null, referencia: { estado: "Por hacer", responsable: null } },
  ]);
  detalles.set(EJ.csvOk, filasCreadas("ARC", 4, 2));
  detalles.set(EJ.csvErrores, [
    ...filasCreadas("ARC", 2, 2).map((f, i) => ({ ...f, codigo: `ARC-${10 + i}`, fueraDeAmbito: i === 1 })),
    ...Array.from({ length: 7 }, (_, i): FilaMock => ({
      fila: 4 + i,
      codigo: i === 1 ? null : `ARC-${20 + i}`,
      titulo: i === 1 ? null : `Fila inválida ${i}`,
      idHistoria: null,
      resultado: "ERROR",
      motivo: i === 1 ? "CODIGO_INVALIDO" : "PRIORIDAD_INVALIDA",
      advertencias: [],
      cambios: null,
      referencia: null,
    })),
  ]);
  detalles.set(EJ.jiraFallida, []);
}
detallesIniciales();

// ----------------------------------------------------------------- descripción y origen

export interface OrigenHduMock {
  descripcion: string | null;
  origen: OrigenHdu;
  claveExterna: string | null;
  urlExterna: string | null;
}

/** Detalle de HDU (D108): solo estas HDU traen los campos; el resto simula un servidor sin ellos (sección oculta). */
export const origenesHdu = new Map<string, OrigenHduMock>();

function origenesIniciales(): void {
  origenesHdu.clear();
  origenesHdu.set(ID.hdu1, {
    descripcion: "Como usuario quiero activar la verificación en dos pasos.\nSegunda línea con <b>etiquetas</b> y https://ejemplo.com sin enlazar.",
    origen: "JIRA",
    claveExterna: "PAGOS-1042",
    urlExterna: "https://su-empresa.atlassian.net/browse/PAGOS-1042",
  });
  origenesHdu.set(ID.hdu2, { descripcion: null, origen: "MANUAL", claveExterna: null, urlExterna: null });
  origenesHdu.set(ID.hdu3, { descripcion: "Importada desde un archivo.", origen: "CSV", claveExterna: null, urlExterna: null });
}
origenesIniciales();

/** Restaura todo entre pruebas. */
export function reiniciarE5(): void {
  Object.assign(modoE5, {
    configuracion: "ok",
    eventos: "ok",
    historial: "ok",
    ultimaEjecucion: "ok",
    detalle: "ok",
    catalogos: "ok",
    demoraMs: 150,
    vistaPrevia: "ok",
    sincronizacion: "exitosa",
    importacion: "normal",
    prueba: "ok",
  } satisfies ModoE5);
  estadoConfig.actual = configuracionInicial();
  eventosConfig.splice(0, eventosConfig.length, ...eventosIniciales());
  ejecuciones.splice(0, ejecuciones.length, ...ejecucionesIniciales());
  detallesIniciales();
  origenesIniciales();
  ultimosTokens.length = 0;
}
