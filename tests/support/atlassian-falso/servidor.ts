import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORREO_VALIDO, TOKEN_VALIDO } from "../jira-falso/servidor.ts";

/**
 * Atlassian simulado (OAuth 2.0 3LO) para la certificación de E5 OAuth (dueño: q360-qa; ADR 0019, backlog e5-oauth-jira.md §9).
 * Servidor HTTP de Node sin dependencias, en http://127.0.0.1:4011. Imita `auth.atlassian.com` y `api.atlassian.com` en uno solo:
 *
 *   GET  /authorize                              consentimiento automático: 302 a la `redirect_uri` con `code` y `state`
 *   POST /oauth/token                            `authorization_code` y `refresh_token` (el de renovación ROTA: el anterior muere al instante)
 *   GET  /oauth/token/accessible-resources       sitios que ve la cuenta, según el modo
 *   ANY  /ex/jira/{cloudid}/rest/api/3/...       exige Bearer vigente y cloudid conocido; reenvía al Jira falso (:4010) con sus modos de falla
 *
 * Control del arnés (sin autenticación): `POST /__control`, `POST /__reset`, `GET /__solicitudes` y `POST /__fugas`.
 * REGLA: ningún endpoint devuelve ni registra valores de tokens, `code`, `state` ni del secreto. `/__solicitudes` solo trae método, ruta (sin
 * query), estado HTTP, si el Bearer era válido y contadores. `/__fugas` recibe un texto y dice QUÉ CLASES de secreto contiene, sin devolverlos.
 * El Client ID y el secreto se leen de `services/integraciones/.env` (o de ATLASSIAN_FALSO_CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI).
 */
export const ATLASSIAN_FALSO_PUERTO = 4011;

export const SITIO_A = { id: "1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8", nombre: "jseguelh", url: "https://jseguelh.atlassian.net" } as const;
export const SITIO_B = { id: "2c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809", nombre: "laboratorio", url: "https://laboratorio.atlassian.net" } as const;
export const SITIO_C = { id: "3d4e5f60-7182-4c93-8db4-c5d6e7f8091a", nombre: "pruebas", url: "https://pruebas.atlassian.net" } as const;
export const SCOPES_JIRA = ["read:jira-work", "read:jira-user"] as const;

/**
 * Los 12 modos del backlog (§9) más 2 extensiones de QA: `SITIOS_HOSTILES` (la lista trae un id que no es UUID y una URL fuera de
 * `*.atlassian.net`, para B08#5) y `RENOVACION_LIMITE` (429 al renovar, para B08#10).
 */
export type ModoAtlassian =
  | "NORMAL" | "CONSENTIMIENTO_RECHAZADO" | "VARIOS_SITIOS" | "SIN_SITIO" | "SIN_SCOPES_JIRA" | "SCOPES_INSUFICIENTES"
  | "CANJE_RECHAZADO" | "RENOVACION_INVALID_GRANT" | "RENOVACION_CAIDA" | "ACCESO_CORTO" | "ACCESO_REVOCADO" | "SIN_PERMISO_PROYECTO"
  | "SITIOS_HOSTILES" | "RENOVACION_LIMITE";

export const MODOS_ATLASSIAN: readonly ModoAtlassian[] = [
  "NORMAL", "CONSENTIMIENTO_RECHAZADO", "VARIOS_SITIOS", "SIN_SITIO", "SIN_SCOPES_JIRA", "SCOPES_INSUFICIENTES",
  "CANJE_RECHAZADO", "RENOVACION_INVALID_GRANT", "RENOVACION_CAIDA", "ACCESO_CORTO", "ACCESO_REVOCADO", "SIN_PERMISO_PROYECTO",
  "SITIOS_HOSTILES", "RENOVACION_LIMITE",
];

/** `expires_in` que entrega `ACCESO_CORTO`: menor que los 5 minutos de margen de la renovación (D214). */
export const EXPIRES_IN_CORTO = 120;
export const EXPIRES_IN_NORMAL = 3600;

export interface SolicitudAtlassian {
  metodo: string;
  /** Solo el `pathname`: la query puede traer `code`, `state` o `client_id`. */
  ruta: string;
  estado: number;
  /** `true`/`false` si la petición traía Bearer; `null` si el endpoint no lo usa (`/authorize`, `/oauth/token`). */
  bearerValido: boolean | null;
  /** `authorization_code` o `refresh_token` en `/oauth/token`. */
  grant?: string;
  /** Renovaciones exitosas acumuladas al momento de esta solicitud. */
  renovaciones: number;
  fecha: string;
}

export interface ResumenSolicitudes {
  modo: ModoAtlassian;
  renovaciones: number;
  renovacionesRechazadas: number;
  canjes: number;
  reutilizacionesRechazadas: number;
  solicitudes: SolicitudAtlassian[];
}

export interface OpcionesAtlassianFalso {
  puerto?: number;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  /** Jira falso al que se reenvía `/ex/jira/...`; por defecto el de :4010. */
  jiraUrl?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(__dirname, "..", "..", "..");

function leerDotEnv(ruta: string): Record<string, string> {
  if (!existsSync(ruta)) return {};
  const salida: Record<string, string> = {};
  for (const cruda of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith("#") || !linea.includes("=")) continue;
    const i = linea.indexOf("=");
    let valor = linea.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    salida[linea.slice(0, i).trim()] = valor;
  }
  return salida;
}

/** Credenciales de la app de Atlassian de la prueba: las mismas que el `.env` local de Integraciones. Se relee en cada uso (el `.env` puede generarse después). */
export function credencialesApp(sobre: OpcionesAtlassianFalso = {}): { clientId?: string; clientSecret?: string; redirectUri?: string } {
  const e = leerDotEnv(path.join(RAIZ_REPO, "services", "integraciones", ".env"));
  return {
    clientId: sobre.clientId ?? process.env.ATLASSIAN_FALSO_CLIENT_ID ?? e.JIRA_OAUTH_CLIENT_ID,
    clientSecret: sobre.clientSecret ?? process.env.ATLASSIAN_FALSO_CLIENT_SECRET ?? e.JIRA_OAUTH_CLIENT_SECRET,
    redirectUri: sobre.redirectUri ?? process.env.ATLASSIAN_FALSO_REDIRECT_URI ?? e.JIRA_OAUTH_REDIRECT_URI,
  };
}

interface Codigo { scopes: string[]; redirectUri: string; usado: boolean }
interface Acceso { scopes: string[]; expiraEn: number; vigente: boolean; familia: string }
interface Refresco { familia: string; scopes: string[]; vigente: boolean }

export interface AtlassianFalso {
  puerto: number;
  cerrar: () => Promise<void>;
}

export async function iniciarAtlassianFalso(opciones: OpcionesAtlassianFalso = {}): Promise<AtlassianFalso> {
  const puerto = opciones.puerto ?? Number(process.env.ATLASSIAN_FALSO_PUERTO ?? ATLASSIAN_FALSO_PUERTO);
  const jiraUrl = opciones.jiraUrl ?? process.env.JIRA_FALSO_URL ?? "http://127.0.0.1:4010";

  let modo: ModoAtlassian = "NORMAL";
  let expiresIn: number | null = null;
  let desfaseMs = 0;
  let estadoProyecto = 404;
  let solicitudes: SolicitudAtlassian[] = [];
  let codigos = new Map<string, Codigo>();
  let accesos = new Map<string, Acceso>();
  let refrescos = new Map<string, Refresco>();
  let estadosVistos = new Set<string>();
  const emitidos = { codes: new Set<string>(), accesos: new Set<string>(), refrescos: new Set<string>() };
  let renovaciones = 0;
  let renovacionesRechazadas = 0;
  let canjes = 0;
  let reutilizaciones = 0;

  const ahora = () => Date.now() + desfaseMs;
  const aleatorio = (prefijo: string) => `${prefijo}-${randomBytes(24).toString("base64url")}`;

  function json(res: ServerResponse, estado: number, cuerpo: unknown, cab: Record<string, string> = {}): void {
    res.writeHead(estado, { "Content-Type": "application/json", ...cab });
    res.end(JSON.stringify(cuerpo));
  }

  function registrar(req: IncomingMessage, ruta: string, res: ServerResponse, bearerValido: boolean | null, grant?: string): void {
    const entrada: SolicitudAtlassian = { metodo: req.method ?? "GET", ruta, estado: 0, bearerValido, ...(grant ? { grant } : {}), renovaciones, fecha: new Date().toISOString() };
    solicitudes.push(entrada);
    res.once("finish", () => { entrada.estado = res.statusCode; entrada.renovaciones = renovaciones; });
  }

  function sitiosDelModo(scopesConcedidos: string[]): Array<{ id: string; name: string; url: string; scopes: string[]; avatarUrl: string }> {
    const deJira = scopesConcedidos.filter((s) => s.startsWith("read:jira") || s.startsWith("write:jira"));
    const ficha = (s: { id: string; nombre: string; url: string }, scopes = deJira) => ({ id: s.id, name: s.nombre, url: s.url, scopes, avatarUrl: `${s.url}/avatar.png` });
    switch (modo) {
      case "SIN_SITIO": return [];
      case "SIN_SCOPES_JIRA": return [ficha(SITIO_A, ["read:confluence-content.all"])];
      case "VARIOS_SITIOS": return [ficha(SITIO_A), ficha(SITIO_B), ficha(SITIO_C)];
      case "SITIOS_HOSTILES": return [
        ficha(SITIO_A),
        { id: "no-es-uuid", name: "id inválido", url: "https://invalido.atlassian.net", scopes: deJira, avatarUrl: "" },
        { id: randomUUID(), name: "fuera de atlassian.net", url: "https://evil.example.com", scopes: deJira, avatarUrl: "" },
      ];
      default: return [ficha(SITIO_A)];
    }
  }

  function emitir(familia: string, scopes: string[]): { access_token: string; expires_in: number; scope: string; token_type: "Bearer"; refresh_token?: string } {
    const segundos = expiresIn ?? (modo === "ACCESO_CORTO" ? EXPIRES_IN_CORTO : EXPIRES_IN_NORMAL);
    const acceso = aleatorio("acc");
    accesos.set(acceso, { scopes, expiraEn: ahora() + segundos * 1000, vigente: true, familia });
    emitidos.accesos.add(acceso);
    const cuerpo: { access_token: string; expires_in: number; scope: string; token_type: "Bearer"; refresh_token?: string } = {
      access_token: acceso, expires_in: segundos, scope: scopes.join(" "), token_type: "Bearer",
    };
    if (scopes.includes("offline_access")) {
      const refresco = aleatorio("ref");
      refrescos.set(refresco, { familia, scopes, vigente: true });
      emitidos.refrescos.add(refresco);
      cuerpo.refresh_token = refresco;
    }
    return cuerpo;
  }

  /** Bearer válido = emitido, no invalidado por una renovación, no vencido (reloj del falso) y el modo no lo revoca. */
  function bearerDe(req: IncomingMessage): { valido: boolean; acceso?: Acceso } {
    const cab = req.headers.authorization ?? "";
    if (!cab.startsWith("Bearer ")) return { valido: false };
    const acceso = accesos.get(cab.slice(7).trim());
    if (!acceso || !acceso.vigente || acceso.expiraEn <= ahora() || modo === "ACCESO_REVOCADO") return { valido: false };
    return { valido: true, acceso };
  }

  function appValida(cuerpo: Record<string, unknown>): { ok: boolean; sinConfigurar: boolean } {
    const c = credencialesApp(opciones);
    if (!c.clientId || !c.clientSecret) return { ok: false, sinConfigurar: true };
    return { ok: cuerpo.client_id === c.clientId && cuerpo.client_secret === c.clientSecret, sinConfigurar: false };
  }

  function redirigirOk(uri: string): boolean {
    const c = credencialesApp(opciones);
    if (c.redirectUri) return uri === c.redirectUri;
    try {
      const u = new URL(uri);
      return ["localhost", "127.0.0.1"].includes(u.hostname) && u.pathname.endsWith("/oauth/retorno") && !u.search && !u.hash;
    } catch {
      return false;
    }
  }

  async function leerCuerpo(req: IncomingMessage): Promise<string> {
    return new Promise<string>((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); });
  }

  const servidor: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${puerto}`);
    const ruta = url.pathname;
    const crudo = await leerCuerpo(req);
    const parse = (): Record<string, any> | undefined => { try { return JSON.parse(crudo || "{}") as Record<string, any>; } catch { return undefined; } };

    // ---- Control del arnés
    if (ruta.startsWith("/__")) {
      if (ruta === "/__control" && req.method === "POST") {
        const d = parse();
        if (!d) return json(res, 400, { error: "JSON inválido" });
        if (d.modo !== undefined) {
          if (!MODOS_ATLASSIAN.includes(d.modo)) return json(res, 400, { error: `Modo desconocido: ${String(d.modo).slice(0, 40)}` });
          modo = d.modo;
        }
        if (d.expiresIn !== undefined) expiresIn = d.expiresIn === null ? null : Number(d.expiresIn);
        if (d.avanzarSegundos !== undefined) desfaseMs += Number(d.avanzarSegundos) * 1000;
        if (d.estadoProyecto !== undefined) estadoProyecto = Number(d.estadoProyecto);
        return json(res, 200, { modo, expiresIn, desfaseSegundos: desfaseMs / 1000, estadoProyecto });
      }
      if (ruta === "/__reset" && req.method === "POST") {
        modo = "NORMAL"; expiresIn = null; desfaseMs = 0; estadoProyecto = 404;
        solicitudes = []; codigos = new Map(); accesos = new Map(); refrescos = new Map(); estadosVistos = new Set();
        emitidos.codes.clear(); emitidos.accesos.clear(); emitidos.refrescos.clear();
        renovaciones = 0; renovacionesRechazadas = 0; canjes = 0; reutilizaciones = 0;
        return json(res, 200, { ok: true });
      }
      if (ruta === "/__solicitudes" && req.method === "GET") {
        const resumen: ResumenSolicitudes = { modo, renovaciones, renovacionesRechazadas, canjes, reutilizacionesRechazadas: reutilizaciones, solicitudes };
        return json(res, 200, resumen);
      }
      // Pregunta «¿este texto filtra algún secreto que emití?» sin revelar ninguno: devuelve solo las CLASES encontradas.
      if (ruta === "/__fugas" && req.method === "POST") {
        const d = parse();
        const texto = typeof d?.texto === "string" ? d.texto : "";
        const fugas: string[] = [];
        const hay = (conjunto: Iterable<string>) => [...conjunto].some((v) => texto.includes(v));
        if (hay(emitidos.codes)) fugas.push("code");
        if (hay(emitidos.accesos)) fugas.push("token-acceso");
        if (hay(emitidos.refrescos)) fugas.push("token-renovacion");
        if (hay(estadosVistos)) fugas.push("state");
        const secreto = credencialesApp(opciones).clientSecret;
        if (secreto && texto.includes(secreto)) fugas.push("secreto-cliente");
        return json(res, 200, { fugas });
      }
      return json(res, 404, { error: "control desconocido" });
    }

    // ---- GET /authorize
    if (ruta === "/authorize" && req.method === "GET") {
      registrar(req, ruta, res, null);
      const q = url.searchParams;
      const app = credencialesApp(opciones);
      const pagina = (estado: number, texto: string) => { res.writeHead(estado, { "Content-Type": "text/plain; charset=utf-8" }); res.end(texto); };
      if (!app.clientId) return pagina(500, "Atlassian falso sin credenciales de la app: falta JIRA_OAUTH_CLIENT_ID en el .env de Integraciones.");
      const scopes = (q.get("scope") ?? "").split(/\s+/).filter(Boolean);
      const redirectUri = q.get("redirect_uri") ?? "";
      // Como Atlassian: ante un pedido inválido NO redirige (mostraría el error en su página).
      if (q.get("client_id") !== app.clientId) return pagina(400, "client_id desconocido");
      if (!redirigirOk(redirectUri)) return pagina(400, "redirect_uri no registrada");
      if (q.get("response_type") !== "code") return pagina(400, "response_type debe ser code");
      if (q.get("audience") !== "api.atlassian.com") return pagina(400, "audience debe ser api.atlassian.com");
      if (scopes.length === 0 || !scopes.every((s) => /^[a-z]+:[a-z-]+$|^offline_access$/.test(s))) return pagina(400, "scope inválido");
      const estado = q.get("state") ?? "";
      if (!estado) return pagina(400, "falta state");
      estadosVistos.add(estado);
      const destino = new URL(redirectUri);
      if (modo === "CONSENTIMIENTO_RECHAZADO") {
        destino.searchParams.set("error", "access_denied");
        destino.searchParams.set("error_description", "User did not authorize the request");
      } else {
        const code = aleatorio("code");
        codigos.set(code, { scopes, redirectUri, usado: false });
        emitidos.codes.add(code);
        destino.searchParams.set("code", code);
      }
      destino.searchParams.set("state", estado);
      res.writeHead(302, { Location: destino.toString() });
      return res.end();
    }

    // ---- POST /oauth/token
    if (ruta === "/oauth/token" && req.method === "POST") {
      const d = parse();
      registrar(req, ruta, res, null, typeof d?.grant_type === "string" ? String(d.grant_type).slice(0, 30) : undefined);
      if (!d) return json(res, 400, { error: "invalid_request" });
      const app = appValida(d);
      if (app.sinConfigurar) return json(res, 500, { error: "falso_sin_credenciales" });
      if (!app.ok) return json(res, 403, { error: "access_denied", error_description: "Unauthorized" });

      if (d.grant_type === "authorization_code") {
        if (modo === "CANJE_RECHAZADO") return json(res, 403, { error: "invalid_grant", error_description: "Unknown or invalid refresh token." });
        const c = typeof d.code === "string" ? codigos.get(d.code) : undefined;
        if (!c || c.usado || d.redirect_uri !== c.redirectUri) return json(res, 403, { error: "invalid_grant", error_description: "Unknown or invalid refresh token." });
        c.usado = true;
        canjes += 1;
        let scopes = c.scopes;
        if (modo === "SCOPES_INSUFICIENTES") scopes = scopes.filter((s) => s !== "read:jira-work");
        return json(res, 200, emitir(randomUUID(), scopes));
      }

      if (d.grant_type === "refresh_token") {
        if (modo === "RENOVACION_CAIDA") { renovacionesRechazadas += 1; return json(res, 503, { error: "temporarily_unavailable" }); }
        if (modo === "RENOVACION_LIMITE") { renovacionesRechazadas += 1; return json(res, 429, { error: "rate_limited" }, { "Retry-After": "1" }); }
        if (modo === "RENOVACION_INVALID_GRANT") { renovacionesRechazadas += 1; return json(res, 403, { error: "invalid_grant", error_description: "Unknown or invalid refresh token." }); }
        const r = typeof d.refresh_token === "string" ? refrescos.get(d.refresh_token) : undefined;
        if (!r || !r.vigente) {
          renovacionesRechazadas += 1;
          if (r) reutilizaciones += 1; // un refresh que YA se rotó: quien lo manda no guardó el nuevo
          return json(res, 403, { error: "invalid_grant", error_description: "Unknown or invalid refresh token." });
        }
        // Rotación: el refresh usado y todos los accesos de su familia mueren de inmediato.
        r.vigente = false;
        for (const a of accesos.values()) if (a.familia === r.familia) a.vigente = false;
        renovaciones += 1;
        return json(res, 200, emitir(r.familia, r.scopes));
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }

    // ---- GET /oauth/token/accessible-resources
    if (ruta === "/oauth/token/accessible-resources" && req.method === "GET") {
      const b = bearerDe(req);
      registrar(req, ruta, res, b.valido);
      if (!b.valido) return json(res, 401, { code: 401, message: "Unauthorized" });
      return json(res, 200, sitiosDelModo(b.acceso?.scopes ?? []));
    }

    // ---- ANY /ex/jira/{cloudid}/rest/api/3/...
    const m = /^\/ex\/jira\/([^/]+)(\/rest\/api\/3\/.*)$/.exec(ruta);
    if (m) {
      const b = bearerDe(req);
      registrar(req, ruta, res, b.valido);
      if (!b.valido) return json(res, 401, { code: 401, message: "Unauthorized" });
      if (![SITIO_A.id, SITIO_B.id, SITIO_C.id].includes(m[1] as never)) return json(res, 404, { code: 404, message: "No site found" });
      const subruta = m[2];
      const requerido = subruta.startsWith("/rest/api/3/myself") ? "read:jira-user" : "read:jira-work";
      // Como Atlassian: un token sin el scope del endpoint recibe 401 «scope does not match».
      if (!b.acceso?.scopes.includes(requerido)) return json(res, 401, { code: 401, message: "Unauthorized; scope does not match" });
      if (modo === "SIN_PERMISO_PROYECTO") {
        if (/^\/rest\/api\/3\/project\//.test(subruta)) return json(res, estadoProyecto, { message: "No tienes permiso en el proyecto" });
        if (subruta.startsWith("/rest/api/3/search/jql")) return json(res, 403, { message: "No tienes permiso en el proyecto" });
      }
      // Se reutilizan los manejadores del Jira falso (:4010), con sus modos de falla, presentándole una credencial que él acepta.
      try {
        const reenviado = await fetch(`${jiraUrl}${subruta}${url.search}`, {
          method: req.method,
          headers: {
            Authorization: `Basic ${Buffer.from(`${CORREO_VALIDO}:${TOKEN_VALIDO}`, "utf8").toString("base64")}`,
            ...(crudo ? { "Content-Type": req.headers["content-type"] ?? "application/json" } : {}),
          },
          body: crudo || undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        const texto = await reenviado.text();
        const cab: Record<string, string> = { "Content-Type": reenviado.headers.get("content-type") ?? "application/json" };
        const espera = reenviado.headers.get("retry-after");
        if (espera) cab["Retry-After"] = espera;
        res.writeHead(reenviado.status, cab);
        return res.end(texto);
      } catch {
        return json(res, 502, { message: "El Jira falso (:4010) no responde: ¿corre el globalSetup de E5?" });
      }
    }

    registrar(req, ruta, res, null);
    return json(res, 404, { error: "no simulado" });
  });

  await new Promise<void>((ok, fallo) => {
    servidor.once("error", fallo);
    servidor.listen(puerto, "127.0.0.1", () => ok());
  });
  return { puerto, cerrar: () => new Promise<void>((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }) };
}
