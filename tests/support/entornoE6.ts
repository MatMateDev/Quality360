import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createServer, request as httpRequest, type Server } from "node:http";
import { RAIZ_REPO, env } from "./env";
import { levantarGatewayConFuenteCaida, levantarPortalCaido, type GatewayCaido, type PortalCaido } from "./entornoCaido";

/**
 * Pilas alternas de la certificación de E6 (dueño: q360-qa). El stack principal (:3000, :5173, :3001..:3005) nunca se detiene:
 * cada pila es una segunda instancia del mismo build (Organización :3101, Indicadores :3205, gateway :3100, portal :5180)
 * con la URL de una fuente apuntando a un puerto muerto (:3199), o con límites o «hoy» distintos.
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

interface Servicio {
  url: string;
  detener: () => Promise<void>;
}

async function levantar(carpeta: "organizacion" | "indicadores", puerto: number, overrides: Record<string, string>): Promise<Servicio> {
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

export const MUERTO = () => `http://127.0.0.1:${env.fuenteMuertaPuerto}`;
export const PUERTO_ORG_ALT = 3101;
export const PUERTO_IND_ALT = 3205;

export interface PilaE6 {
  gatewayUrl: string;
  portalUrl?: string;
  indicadoresUrl?: string;
  organizacionUrl?: string;
  detener: () => Promise<void>;
}

export interface OpcionesPila {
  /** Variables de entorno de la instancia alterna de Indicadores (`{ CERTIFICACIONES_URL: MUERTO() }`…). Si falta, Indicadores es el real. */
  indicadores?: Record<string, string>;
  /** Variables de la instancia alterna de Organización. */
  organizacion?: Record<string, string>;
  /** Variables extra del gateway alterno (:3100). */
  gateway?: Record<string, string>;
  portal?: boolean;
}

/** Levanta lo pedido y apunta el gateway alterno a las instancias alternas. Siempre `detener()` en `afterAll`. */
export async function pilaE6(o: OpcionesPila): Promise<PilaE6> {
  const abiertos: Array<() => Promise<void>> = [];
  const limpiar = async () => {
    for (const d of abiertos.reverse()) await d().catch(() => undefined);
  };
  try {
    const gw: Record<string, string> = { ...(o.gateway ?? {}) };
    let ind: Servicio | undefined;
    let org: Servicio | undefined;
    if (o.organizacion) {
      org = await levantar("organizacion", PUERTO_ORG_ALT, o.organizacion);
      abiertos.push(org.detener);
      gw.ORGANIZACION_URL = org.url;
    }
    if (o.indicadores) {
      ind = await levantar("indicadores", PUERTO_IND_ALT, o.indicadores);
      abiertos.push(ind.detener);
      gw.INDICADORES_URL = ind.url;
    }
    const gateway: GatewayCaido = await levantarGatewayConFuenteCaida(gw);
    abiertos.push(gateway.detener);
    let portal: PortalCaido | undefined;
    if (o.portal) {
      portal = await levantarPortalCaido(gateway.url);
      abiertos.push(portal.detener);
    }
    return { gatewayUrl: gateway.url, portalUrl: portal?.url, indicadoresUrl: ind?.url, organizacionUrl: org?.url, detener: limpiar };
  } catch (e) {
    await limpiar();
    throw e;
  }
}

/** Certificaciones no responde para Indicadores (E6-B01-T08, B02-T10, F01-T09, F02-T10, F03-T11). */
export const certificacionesCaidaEnIndicadores = (portal = false) => pilaE6({ indicadores: { CERTIFICACIONES_URL: MUERTO() }, portal });
/** Impedimentos no responde para Indicadores (E6-B01-T10, B02 snapshot T08, F02-T09, F04-T08, B04-T05). */
export const impedimentosCaidoEnIndicadores = (portal = false) => pilaE6({ indicadores: { IMPEDIMENTOS_URL: MUERTO() }, portal });
/** Organización no responde para Indicadores (E6-B01-T09). */
export const organizacionCaidaEnIndicadores = () => pilaE6({ indicadores: { ORGANIZACION_URL: MUERTO() } });
/** Certificaciones no responde para Organización: el cierre da 409 CHECKLIST_NO_DISPONIBLE (E6-B05-T06b, F05-T09). */
export const certificacionesCaidaEnOrganizacion = (portal = false) => pilaE6({ organizacion: { CERTIFICACIONES_URL: MUERTO() }, gateway: { CERTIFICACIONES_URL: MUERTO() }, portal });

/** Proxy hacia `destino` que responde 503 solo a `GET`/`POST` de las rutas cuyo prefijo se indica (la auditoría de exportaciones, B04-T07). */
export async function proxyQueCorta(destino: string, prefijos: string[], puerto = 3299): Promise<{ url: string; detener: () => Promise<void> }> {
  const servidor: Server = createServer((req, res) => {
    if (prefijos.some((p) => (req.url ?? "").startsWith(p))) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "Corte de prueba." }));
      req.resume();
      return;
    }
    const u = new URL(destino);
    const salida = httpRequest({ host: u.hostname, port: u.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    salida.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(salida);
  });
  await new Promise<void>((resolver) => servidor.listen(puerto, "127.0.0.1", resolver));
  return { url: `http://127.0.0.1:${puerto}`, detener: () => new Promise<void>((r) => servidor.close(() => r())) };
}
