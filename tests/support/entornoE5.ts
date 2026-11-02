import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { RAIZ_REPO, env } from "./env";
import { levantarGatewayConFuenteCaida, levantarPortalCaido } from "./entornoCaido";

/**
 * Instancias adicionales de la certificación de E5 (dueño: q360-qa), documentadas en GUIA-LOCAL.md («Instancias extra del perfil de QA»).
 * El stack principal (:3000/:3001/:3004/:5173) nunca se toca. Los procesos usan el mismo build y el mismo `.env` con variables sobrescritas.
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

export interface InstanciaE5 {
  url: string;
  /** Salida estándar y de error acumulada (para afirmar que no contiene secretos). */
  salida: () => string;
  detener: () => Promise<void>;
}

async function levantar(carpeta: string, entrada: string, puerto: number, overrides: Record<string, string>, saludRuta = "/health"): Promise<InstanciaE5> {
  const cwd = path.join(RAIZ_REPO, carpeta);
  const proceso = spawn(process.execPath, ["--env-file=.env", entrada], {
    cwd,
    env: { ...process.env, PORT: String(puerto), ...overrides },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let salida = "";
  proceso.stdout?.on("data", (f) => (salida += String(f)));
  proceso.stderr?.on("data", (f) => (salida += String(f)));
  try {
    await esperarSalud(`http://localhost:${puerto}${saludRuta}`);
  } catch (error) {
    matarArbol(proceso);
    throw new Error(`No se pudo levantar ${carpeta} en :${puerto}. Salida:\n${salida}\n${String(error)}`);
  }
  return {
    url: `http://localhost:${puerto}`,
    salida: () => salida,
    detener: () =>
      new Promise<void>((resolver) => {
        proceso.once("exit", () => resolver());
        matarArbol(proceso);
        setTimeout(resolver, 3000);
      }),
  };
}

/** Instancia de Integraciones (I2 a I5 del backlog) con las variables sobrescritas. */
export function levantarIntegraciones(puerto: number, overrides: Record<string, string>): Promise<InstanciaE5> {
  return levantar("services/integraciones", "dist/main.js", puerto, overrides);
}

/** Gateway adicional (p. ej. sin `INTEGRACIONES_URL`, o sin el límite de 30 escrituras/min para la corrida de API). */
export function levantarGateway(puerto: number, overrides: Record<string, string>): Promise<InstanciaE5> {
  return levantar("apps/gateway", "dist/main.js", puerto, overrides);
}

/** Genera una llave de cifrado distinta (32 bytes en Base64) para I3. */
export function llaveAleatoria(): string {
  return Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString("base64");
}

/**
 * Proxy HTTP delante de Organización para simular que se cae en pleno trabajo (E5-B02-T13, E5-B04-T09).
 * Reenvía todo a Organización; tras `cortarEnUpsert` llamadas al upsert, destruye el socket de las siguientes.
 */
export interface ProxyOrganizacion {
  url: string;
  llamadasUpsert: () => number;
  cerrar: () => Promise<void>;
}

export async function proxyOrganizacion(destino: string, puerto: number, cortarEnUpsert: number | null, retardoPorCreadaMs = 0): Promise<ProxyOrganizacion> {
  const { createServer, request } = await import("node:http");
  let upserts = 0;
  const destinoUrl = new URL(destino);
  const servidor = createServer((req, res) => {
    const esUpsert = (req.url ?? "").includes("/v1/interno/integraciones/hdu/upsert");
    if (esUpsert) upserts += 1;
    if (esUpsert && cortarEnUpsert !== null && upserts > cortarEnUpsert) {
      req.socket.destroy();
      return;
    }
    const saliente = request({ host: destinoUrl.hostname, port: destinoUrl.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      if (esUpsert && retardoPorCreadaMs > 0) {
        // Retardo proporcional a lo que se escribe (filas CREADA): simula una Organización lenta sin penalizar las filas «sin cambios».
        const trozos: Buffer[] = [];
        r.on("data", (t) => trozos.push(t));
        r.on("end", () => {
          const cuerpo = Buffer.concat(trozos);
          const creadas = (cuerpo.toString("utf8").match(/"CREADA"/g) ?? []).length;
          const cabeceras = { ...r.headers, "content-length": String(cuerpo.length) };
          setTimeout(() => {
            res.writeHead(r.statusCode ?? 502, cabeceras);
            res.end(cuerpo);
          }, creadas * retardoPorCreadaMs);
        });
        return;
      }
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    saliente.on("error", () => req.socket.destroy());
    req.pipe(saliente);
  });
  await new Promise<void>((ok) => servidor.listen(puerto, "127.0.0.1", () => ok()));
  return {
    url: `http://127.0.0.1:${puerto}`,
    llamadasUpsert: () => upserts,
    cerrar: () => new Promise<void>((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }),
  };
}

/** Pila con Integraciones caída para el gateway (:3100) y su portal (:5180): lo demás sigue arriba (E5-F01-T10, E5-F04-T10). */
export async function integracionesCaida(): Promise<{ gatewayUrl: string; portalUrl: string; detener: () => Promise<void> }> {
  const gateway = await levantarGatewayConFuenteCaida({ INTEGRACIONES_URL: `http://127.0.0.1:${env.fuenteMuertaPuerto}` });
  let portal;
  try {
    portal = await levantarPortalCaido(gateway.url);
  } catch (e) {
    await gateway.detener();
    throw e;
  }
  return {
    gatewayUrl: gateway.url,
    portalUrl: portal.url,
    detener: async () => {
      await portal.detener();
      await gateway.detener();
    },
  };
}
