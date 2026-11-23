// Datos de MSW de E5 (integración con Jira y archivos) según `contracts/integraciones.v1.yaml`. Solo sirven para
// pruebas y revisión visual: no son fuente de datos del portal real.
import type {
  ConexionOauthJira,
  ConfiguracionJira,
  Ejecucion,
  EventoConfiguracionJira,
  FilaEjecucion,
  ItemConsulta,
  Consulta,
  OrigenHdu,
} from "@/types/dominio";
import { ID, hdus } from "./data";

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
  /** Lo que lee el próximo `POST …/consultas` (y sus continuaciones). */
  consulta:
    | "exitosa"
    | "con-errores"
    | "con-cambios"
    | "con-ya-asignada"
    | "incompleta"
    | "incompleta-tasa"
    | "incompleta-tiempo"
    | "tope"
    | "fallida"
    | "fallida-credencial"
    | "fallida-reconexion"
    | "fallida-organizacion"
    | "fallida-tasa"
    | "sin-novedades"
    | "sin-respuesta"
    | "en-curso";
  /** Resultado de la próxima `POST …/confirmaciones`. */
  confirmacion: "normal" | "incompleta" | "asignaciones-invalidas" | "organizacion-caida" | "sin-respuesta";
  /** Resultado de la próxima `POST …/items/{itemId}/confirmaciones` (D202, D204). */
  confirmacionFila: "normal" | "ya-asignada" | "modificada" | "en-curso" | "red";
  /** Respuesta de `GET …/items/{itemId}`: `error` = 500, `antiguo` = `detalle: null`, `largo` = textos de 8.000 caracteres. */
  detalleItem: "ok" | "error" | "antiguo" | "largo";
  /** Fuente de las lecturas `GET …/consultas/*`. */
  lecturaConsulta: EstadoFuente;
  /** Resultado de la próxima importación. */
  importacion: "normal" | "incompleta" | "sin-respuesta";
  /** `ok` o el código de error de la prueba de conexión. */
  prueba:
    | "ok"
    | "JIRA_CREDENCIAL_INVALIDA"
    | "JIRA_SITIO_NO_ENCONTRADO"
    | "JIRA_PROYECTO_NO_ENCONTRADO"
    | "JIRA_SIN_PERMISO"
    | "JIRA_RECONEXION_NECESARIA"
    | "JIRA_OAUTH_PERMISOS_INSUFICIENTES";
  /**
   * Qué responde el Atlassian simulado en el próximo `iniciar`/`retorno` (espejo de los modos de
   * `tests/support/atlassian-falso`): `normal` (un solo sitio), `varios-sitios`, `sin-sitio`, `consentimiento-rechazado`,
   * `permisos-insuficientes`, `canje-rechazado`, `estado-invalido` (state vencido o ya usado), `servidor-caido` (5xx),
   * `sin-respuesta` (504 sin cuerpo JSON), `no-configurado` (el servidor no tiene las credenciales de la app: 503
   * `JIRA_OAUTH_NO_CONFIGURADO` y `oauthDisponible: false`) y `reconexion-necesaria` (la renovación falló: la conexión
   * guardada pasa a `RECONEXION_NECESARIA`).
   */
  oauth:
    | "normal"
    | "varios-sitios"
    | "sin-sitio"
    | "consentimiento-rechazado"
    | "permisos-insuficientes"
    | "canje-rechazado"
    | "estado-invalido"
    | "servidor-caido"
    | "sin-respuesta"
    | "no-configurado"
    | "reconexion-necesaria";
  /** Resultado de `…/oauth/sitio` y de `DELETE …/oauth`: `ok`, `error` (5xx) o `sin-respuesta` (504). */
  oauthSitio: "ok" | "error" | "sin-respuesta" | "reconexion-necesaria";
  oauthDesconexion: "ok" | "error";
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
  consulta: "exitosa",
  confirmacion: "normal",
  confirmacionFila: "normal",
  detalleItem: "ok",
  lecturaConsulta: "ok",
  importacion: "normal",
  prueba: "ok",
  oauth: "normal",
  oauthSitio: "ok",
  oauthDesconexion: "ok",
};

export interface FilaMock extends Omit<FilaEjecucion, "asignacion"> {
  /** Asignación en nombres de una fila confirmada; ausente = `null`. */
  asignacion?: FilaEjecucion["asignacion"];
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
    metodo: "API_TOKEN",
    oauthDisponible: true,
    oauth: null,
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
    metodo: null,
    oauthDisponible: true,
    oauth: null,
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

// ------------------------------------------------------------------ OAuth 2.0 (3LO)

/** Identificadores del Atlassian simulado. El `state` solo sirve una vez y solo para el Administrador que inició. */
export const OAUTH_MOCK = {
  codigo: "codigo-de-prueba-oauth",
  state: "estado-de-prueba-oauth",
  sitios: [
    { id: "1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8", nombre: "empresa", url: "https://empresa.atlassian.net" },
    { id: "2c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809", nombre: "laboratorio", url: "https://laboratorio.atlassian.net" },
    { id: "3d4e5f60-7182-4c93-8db4-c5d6e7f8091a", nombre: "pruebas-qa", url: "https://pruebas-qa.atlassian.net" },
  ],
  cuenta: "Ana Pérez",
  permisos: ["read:jira-work", "read:jira-user", "offline_access"],
} as const;

/** La conexión OAuth guardada (`null` = nunca se conectó, se desconectó o se pasó a API token). */
export const estadoOauth: { actual: ConexionOauthJira | null; estadosUsados: Set<string>; ultimosRetornos: Array<{ state?: string; code?: string; error?: string }> } = {
  actual: null,
  estadosUsados: new Set(),
  ultimosRetornos: [],
};

export function oauthConectada(parcial: Partial<ConexionOauthJira> = {}): ConexionOauthJira {
  return {
    estado: "CONECTADA",
    descifrable: true,
    cuenta: { nombre: OAUTH_MOCK.cuenta },
    sitio: { ...OAUTH_MOCK.sitios[0] },
    sitiosCandidatos: null,
    permisos: [...OAUTH_MOCK.permisos],
    conectadoEn: "2026-11-22T13:15:00Z",
    conectadoPor: { id: ID.admin, nombre: "Valentina Rojas" },
    renovadoEn: null,
    ...parcial,
  };
}

/** Conexión que espera el sitio: los candidatos son los 3 de prueba (el actual, si hay, va marcado). */
export function oauthPendienteSitio(actualUrl: string | null = null): ConexionOauthJira {
  return oauthConectada({
    estado: "PENDIENTE_SITIO",
    cuenta: null,
    sitio: null,
    sitiosCandidatos: OAUTH_MOCK.sitios.map((s) => ({ ...s, actual: actualUrl === s.url })),
  });
}

export function oauthReconexion(): ConexionOauthJira {
  return oauthConectada({ estado: "RECONEXION_NECESARIA", descifrable: false, permisos: [] });
}

/** Prepara la configuración de prueba: método activo y conexión OAuth guardada. */
export function prepararOauth(metodo: "API_TOKEN" | "OAUTH" | null, oauth: ConexionOauthJira | null): void {
  estadoOauth.actual = oauth;
  const base = estadoConfig.actual;
  if (metodo === "OAUTH") {
    estadoConfig.actual = { ...base, metodo, correo: null, token: { configurado: false, ultimos4: null, descifrable: false }, sitio: oauth?.sitio?.url ?? base.sitio };
  } else if (metodo === null) {
    estadoConfig.actual = { ...configuracionVacia() };
  } else {
    estadoConfig.actual = { ...base, metodo };
  }
}

function eventosIniciales(): EventoConfiguracionJira[] {
  const admin = { id: ID.admin, nombre: "Valentina Rojas" };
  return [
    { id: "e5000000-0000-4000-8000-0000000000a1", fecha: "2026-10-29T13:15:00Z", tipo: "CONFIGURACION", actor: admin, camposCambiados: ["token", "proyecto"], tokenCambiado: true, resultadoPrueba: "OK", oauth: null },
    { id: "e5000000-0000-4000-8000-0000000000a2", fecha: "2026-10-28T19:02:00Z", tipo: "CONFIGURACION", actor: admin, camposCambiados: ["sitio", "correo", "token", "celulaId", "qeResponsableId", "sprintRespaldoId"], tokenCambiado: true, resultadoPrueba: "OK", oauth: null },
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
    fase: "DIRECTA",
    alcance: "LOTE",
    consultaId: null,
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
    nuevas: 0,
    cambiaron: 0,
    sinCambios: 0,
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
    consulta: "exitosa",
    confirmacion: "normal",
    confirmacionFila: "normal",
    detalleItem: "ok",
    lecturaConsulta: "ok",
    importacion: "normal",
    prueba: "ok",
    oauth: "normal",
    oauthSitio: "ok",
    oauthDesconexion: "ok",
  } satisfies ModoE5);
  reiniciarConsulta();
  estadoOauth.actual = null;
  estadoOauth.estadosUsados.clear();
  estadoOauth.ultimosRetornos.length = 0;
  estadoConfig.actual = configuracionInicial();
  eventosConfig.splice(0, eventosConfig.length, ...eventosIniciales());
  ejecuciones.splice(0, ejecuciones.length, ...ejecucionesIniciales());
  detallesIniciales();
  origenesIniciales();
  ultimosTokens.length = 0;
}

// ------------------------------------------------------------ consulta de Jira (D132–D152)

/** Estado en memoria de la consulta compartida entre Administradores (D134). */
export interface EstadoConsultaMock {
  consulta: Consulta | null;
  ultimaCerrada: Consulta | null;
  items: ItemConsulta[];
  /** Issues del universo ya leídas (el `continuarDesde` del servidor). */
  leidas: number;
  /** Tandas ya leídas desde que se creó la consulta. */
  tandas: number;
  /** Veces que el mock "llamó a Jira": cancelar un diálogo no debe sumar. */
  llamadasJira: number;
}

export const estadoConsulta: EstadoConsultaMock = { consulta: null, ultimaCerrada: null, items: [], leidas: 0, tandas: 0, llamadasJira: 0 };

/** Ids de las HDU que creó una confirmación simulada (se quitan de `hdus` al reiniciar). */
export const hduCreadasPorConsulta: string[] = [];

export function reiniciarConsulta(): void {
  for (const id of hduCreadasPorConsulta.splice(0)) {
    const i = hdus.findIndex((h) => h.id === id);
    if (i >= 0) hdus.splice(i, 1);
  }
  Object.assign(estadoConsulta, { consulta: null, ultimaCerrada: null, items: [], leidas: 0, tandas: 0, llamadasJira: 0 });
}
