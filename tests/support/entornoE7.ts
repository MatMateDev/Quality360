import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { RAIZ_REPO, env } from "./env";
import { levantarGatewayConFuenteCaida, levantarPortalCaido, type GatewayCaido, type PortalCaido } from "./entornoCaido";

/**
 * Pilas alternativas para los escenarios de «fuente caída» de E7 (D34, D46, D48). El stack principal
 * (:3000/:5173) nunca se toca: cada pila es una segunda instancia que apunta a un puerto muerto.
 *
 * - `certificacionesCaida`: Organización :3101 con `CERTIFICACIONES_URL` muerta + gateway :3100 con
 *   Organización :3101 y Certificaciones muerta (las bandejas componen con Certificaciones, D46; las
 *   consultas `/v1/auditor/*` de Certificaciones responden 503).
 * - `organizacionCaida`: gateway :3100 con Organización muerta.
 * - `certificacionesConLimite`: segunda Certificaciones :3202 con `EXPORTACION_LIMITE_FILAS` reducido
 *   (E7-B04-T11) y gateway :3100 apuntando a ella.
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
    await new Promise((resolver) => setTimeout(resolver, esperaMs));
  }
  throw new Error(`El proceso en ${url} no respondió a tiempo.`);
}

interface ServicioExtra {
  url: string;
  detener: () => Promise<void>;
}

async function levantarServicio(carpeta: "organizacion" | "certificaciones", puerto: number, overrides: Record<string, string>): Promise<ServicioExtra> {
  const proceso = spawn(
    process.execPath,
    [`--env-file=services/${carpeta}/.env`, `services/${carpeta}/dist/main.js`],
    { cwd: RAIZ_REPO, env: { ...process.env, PORT: String(puerto), ...overrides }, stdio: ["ignore", "pipe", "pipe"] },
  );
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

export interface PilaCaida {
  gatewayUrl: string;
  portalUrl?: string;
  detener: () => Promise<void>;
}

const MUERTO = () => `http://127.0.0.1:${env.fuenteMuertaPuerto}`;

export async function certificacionesCaida(conPortal = false): Promise<PilaCaida> {
  const org = await levantarServicio("organizacion", 3101, { CERTIFICACIONES_URL: MUERTO() });
  let gateway: GatewayCaido | undefined;
  let portal: PortalCaido | undefined;
  try {
    gateway = await levantarGatewayConFuenteCaida({ ORGANIZACION_URL: org.url, CERTIFICACIONES_URL: MUERTO() });
    if (conPortal) portal = await levantarPortalCaido(gateway.url);
  } catch (error) {
    await portal?.detener();
    await gateway?.detener();
    await org.detener();
    throw error;
  }
  return {
    gatewayUrl: gateway.url,
    portalUrl: portal?.url,
    detener: async () => {
      await portal?.detener();
      await gateway?.detener();
      await org.detener();
    },
  };
}

export async function organizacionCaida(conPortal = false): Promise<PilaCaida> {
  const gateway = await levantarGatewayConFuenteCaida({ ORGANIZACION_URL: MUERTO() });
  let portal: PortalCaido | undefined;
  try {
    if (conPortal) portal = await levantarPortalCaido(gateway.url);
  } catch (error) {
    await gateway.detener();
    throw error;
  }
  return {
    gatewayUrl: gateway.url,
    portalUrl: portal?.url,
    detener: async () => {
      await portal?.detener();
      await gateway.detener();
    },
  };
}

export async function certificacionesConLimite(limiteFilas: number): Promise<PilaCaida> {
  const cert = await levantarServicio("certificaciones", 3202, { EXPORTACION_LIMITE_FILAS: String(limiteFilas) });
  let gateway: GatewayCaido | undefined;
  try {
    gateway = await levantarGatewayConFuenteCaida({ CERTIFICACIONES_URL: cert.url });
  } catch (error) {
    await cert.detener();
    throw error;
  }
  return {
    gatewayUrl: gateway.url,
    detener: async () => {
      await gateway.detener();
      await cert.detener();
    },
  };
}

/**
 * Organización «caída solo para algunas rutas»: un proxy TCP delante de la Organización real que corta la conexión
 * en las rutas indicadas (el gateway lo ve igual que un servicio que no responde) y reenvía el resto. Sirve para
 * E7-F05#2 («el servicio de Organización no responde» sin perder `/v1/me`, que el portal necesita para entrar).
 */
export async function organizacionCaidaEnRutas(rutasCaidas: string[], conPortal = true): Promise<PilaCaida> {
  const { createServer, request: solicitud } = await import("node:http");
  const destino = new URL(env.organizacionUrl);
  const servidor = createServer((entrante, saliente) => {
    const ruta = entrante.url ?? "/";
    if (rutasCaidas.some((r) => ruta.startsWith(r))) {
      entrante.socket.destroy();
      return;
    }
    const reenvio = solicitud(
      { hostname: destino.hostname, port: destino.port, path: ruta, method: entrante.method, headers: entrante.headers },
      (respuesta) => {
        saliente.writeHead(respuesta.statusCode ?? 502, respuesta.headers);
        respuesta.pipe(saliente);
      },
    );
    reenvio.on("error", () => saliente.destroy());
    entrante.pipe(reenvio);
  });
  await new Promise<void>((resolver) => servidor.listen(3103, "127.0.0.1", resolver));
  let gateway: GatewayCaido | undefined;
  let portal: PortalCaido | undefined;
  try {
    gateway = await levantarGatewayConFuenteCaida({ ORGANIZACION_URL: "http://127.0.0.1:3103" });
    if (conPortal) portal = await levantarPortalCaido(gateway.url);
  } catch (error) {
    await portal?.detener();
    await gateway?.detener();
    servidor.close();
    throw error;
  }
  return {
    gatewayUrl: gateway.url,
    portalUrl: portal?.url,
    detener: async () => {
      await portal?.detener();
      await gateway?.detener();
      servidor.closeAllConnections();
      servidor.close();
    },
  };
}
