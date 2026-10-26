import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { RAIZ_REPO, env } from "./env";
import { levantarGatewayConFuenteCaida, levantarPortalCaido, type GatewayCaido, type PortalCaido } from "./entornoCaido";

/**
 * Pilas alternativas de la certificación de E4 (dueño: q360-qa). El stack principal (:3000/:5173) nunca se toca;
 * cada pila es una segunda instancia (gateway :3100, portal :5180 y, según el caso, Organización :3101 o
 * Impedimentos :3203) que apunta a una fuente muerta (:3199) o que fija `Q360_FECHA_REFERENCIA`.
 */
function matarArbol(proceso: ChildProcess): void {
  if (proceso.pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(proceso.pid), "/T", "/F"], { stdio: "ignore" });
  else proceso.kill("SIGKILL");
}

async function esperarSalud(url: string, intentos = 120, esperaMs = 250): Promise<void> {
  for (let i = 0; i < intentos; i += 1) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      // sigue esperando
    }
    await new Promise((r) => setTimeout(r, esperaMs));
  }
  throw new Error(`El proceso en ${url} no respondió a tiempo.`);
}

interface ServicioExtra {
  url: string;
  detener: () => Promise<void>;
}

async function levantarServicio(carpeta: "organizacion" | "impedimentos", puerto: number, overrides: Record<string, string>): Promise<ServicioExtra> {
  const proceso = spawn(process.execPath, [`--env-file=services/${carpeta}/.env`, `services/${carpeta}/dist/main.js`], {
    cwd: RAIZ_REPO,
    env: { ...process.env, PORT: String(puerto), ...overrides },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let salida = "";
  proceso.stdout?.on("data", (f) => (salida += String(f)));
  proceso.stderr?.on("data", (f) => (salida += String(f)));
  try {
    await esperarSalud(`http://localhost:${puerto}/health`);
  } catch (error) {
    matarArbol(proceso);
    throw new Error(`No se pudo levantar ${carpeta} en :${puerto}. Salida:\n${salida}\n${String(error)}`);
  }
  return {
    url: `http://localhost:${puerto}`,
    detener: () =>
      new Promise<void>((resolver) => {
        proceso.once("exit", () => resolver());
        matarArbol(proceso);
        setTimeout(resolver, 3000);
      }),
  };
}

export interface PilaE4 {
  gatewayUrl: string;
  portalUrl?: string;
  detener: () => Promise<void>;
}

const MUERTO = () => `http://127.0.0.1:${env.fuenteMuertaPuerto}`;

async function componer(servicios: ServicioExtra[], overridesGateway: Record<string, string>, conPortal: boolean): Promise<PilaE4> {
  let gateway: GatewayCaido | undefined;
  let portal: PortalCaido | undefined;
  try {
    gateway = await levantarGatewayConFuenteCaida(overridesGateway);
    if (conPortal) portal = await levantarPortalCaido(gateway.url);
  } catch (error) {
    await portal?.detener();
    await gateway?.detener();
    for (const s of servicios) await s.detener();
    throw error;
  }
  return {
    gatewayUrl: gateway.url,
    portalUrl: portal?.url,
    detener: async () => {
      await portal?.detener();
      await gateway?.detener();
      for (const s of servicios) await s.detener();
    },
  };
}

/** Impedimentos no responde (la Organización real sigue arriba): el detalle debe decir «No disponible» (E4-F01-T09). */
export function impedimentosCaido(conPortal = false): Promise<PilaE4> {
  return componer([], { IMPEDIMENTOS_URL: MUERTO() }, conPortal);
}

/** Impedimentos no responde para el gateway y para Organización (cierre 503, E4-B02-T13; bloques de bandeja). */
export async function impedimentosCaidoEnOrganizacion(conPortal = false): Promise<PilaE4> {
  const org = await levantarServicio("organizacion", 3101, { IMPEDIMENTOS_URL: MUERTO() });
  return componer([org], { ORGANIZACION_URL: org.url, IMPEDIMENTOS_URL: MUERTO() }, conPortal);
}

/** Certificaciones no responde para Impedimentos (E4-F02-T08, E4-F04-T10, E4-B03-T12). */
export async function certificacionesCaidaEnImpedimentos(conPortal = false): Promise<PilaE4> {
  const imp = await levantarServicio("impedimentos", 3203, { CERTIFICACIONES_URL: MUERTO() });
  return componer([imp], { IMPEDIMENTOS_URL: imp.url }, conPortal);
}

/** Impedimentos con «hoy» fijo (`Q360_FECHA_REFERENCIA`, D68) para E4-B03-T11. */
export async function impedimentosConFecha(fechaReferencia: string): Promise<PilaE4> {
  const imp = await levantarServicio("impedimentos", 3203, { Q360_FECHA_REFERENCIA: fechaReferencia });
  return componer([imp], { IMPEDIMENTOS_URL: imp.url }, false);
}
