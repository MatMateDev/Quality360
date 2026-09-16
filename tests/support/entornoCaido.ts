import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { RAIZ_REPO, env } from "./env";

/**
 * Termina el árbol de procesos completo. En Windows, `ChildProcess.kill()`
 * con `shell: true` (necesario para invocar `npx`/`vite`) solo mata el
 * proceso de la shell, no sus hijos, y deja el puerto ocupado: se usa
 * `taskkill /T /F` para matar todo el árbol.
 */
function matarArbolDeProcesos(proceso: ChildProcess): void {
  if (proceso.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(proceso.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    proceso.kill("SIGKILL");
  }
}

/**
 * Segunda instancia del gateway (y, cuando hace falta, del portal) para los
 * escenarios de fuente caída (E1-F03#3, E1-F06#3, E1-F08#2, E1-B03#3): nunca
 * se toca el gateway ni el portal principal, que otros escenarios necesitan
 * sanos.
 */

async function esperarSalud(url: string, intentos = 40, esperaMs = 250): Promise<void> {
  for (let intento = 0; intento < intentos; intento += 1) {
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (respuesta.ok) return;
    } catch {
      // sigue esperando
    }
    await new Promise((resolver) => setTimeout(resolver, esperaMs));
  }
  throw new Error(`El proceso en ${url} no respondió a tiempo.`);
}

export interface GatewayCaido {
  proceso: ChildProcess;
  url: string;
  detener: () => Promise<void>;
}

/**
 * Levanta un gateway adicional apuntando a las mismas Organización/
 * Certificaciones reales, pero con una fuente de composición forzada a un
 * puerto muerto (`FUENTE_RESUMEN_HDU_URL`, `FUENTE_RESUMEN_SUPERVISION_URL`,
 * etc.), para que ese bloque responda `indisponible` sin afectar el resto.
 */
export async function levantarGatewayConFuenteCaida(overridesFuente: Record<string, string>): Promise<GatewayCaido> {
  const directorioGateway = path.join(RAIZ_REPO, "apps", "gateway");
  const puerto = env.gatewayCaidoPuerto;

  const proceso = spawn(
    process.execPath,
    ["--env-file=.env", "dist/main.js"],
    {
      cwd: directorioGateway,
      env: {
        ...process.env,
        PORT: String(puerto),
        PORTAL_ORIGENES: `${env.portalUrl},${env.portalCaidoUrl}`,
        ...overridesFuente,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let salida = "";
  proceso.stdout?.on("data", (fragmento) => {
    salida += String(fragmento);
  });
  proceso.stderr?.on("data", (fragmento) => {
    salida += String(fragmento);
  });

  try {
    await esperarSalud(`http://localhost:${puerto}/health`);
  } catch (error) {
    matarArbolDeProcesos(proceso);
    throw new Error(`No fue posible levantar el gateway de prueba (fuente caída). Salida:\n${salida}\n${String(error)}`);
  }

  return {
    proceso,
    url: `http://localhost:${puerto}`,
    detener: () =>
      new Promise<void>((resolver) => {
        proceso.once("exit", () => resolver());
        matarArbolDeProcesos(proceso);
        setTimeout(resolver, 3000);
      }),
  };
}

export interface PortalCaido {
  proceso: ChildProcess;
  url: string;
  detener: () => Promise<void>;
}

/** Segunda instancia del portal (Vite), apuntando al gateway con la fuente caída. */
export async function levantarPortalCaido(gatewayUrl: string): Promise<PortalCaido> {
  const directorioWeb = path.join(RAIZ_REPO, "apps", "web");
  const puerto = env.portalCaidoPuerto;

  const proceso = spawn(
    "npx",
    ["--yes", "vite", "--port", String(puerto), "--strictPort"],
    {
      cwd: directorioWeb,
      env: {
        ...process.env,
        VITE_USAR_MOCKS: "false",
        VITE_SUPABASE_URL: env.supabaseUrl,
        VITE_SUPABASE_ANON_KEY: env.supabaseAnonKey,
        VITE_GATEWAY_URL: gatewayUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    },
  );

  let salida = "";
  proceso.stdout?.on("data", (fragmento) => {
    salida += String(fragmento);
  });
  proceso.stderr?.on("data", (fragmento) => {
    salida += String(fragmento);
  });

  try {
    await esperarSalud(`http://localhost:${puerto}/`);
  } catch (error) {
    matarArbolDeProcesos(proceso);
    throw new Error(`No fue posible levantar el portal de prueba (fuente caída). Salida:\n${salida}\n${String(error)}`);
  }

  return {
    proceso,
    url: `http://localhost:${puerto}`,
    detener: () =>
      new Promise<void>((resolver) => {
        proceso.once("exit", () => resolver());
        matarArbolDeProcesos(proceso);
        setTimeout(resolver, 3000);
      }),
  };
}
