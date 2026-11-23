import { expect, test } from "@playwright/test";
import { crearClienteAtlassianFalso } from "./cliente";
import { EXPIRES_IN_CORTO, iniciarAtlassianFalso, MODOS_ATLASSIAN, SITIO_A, SITIO_B, SITIO_C, type AtlassianFalso } from "./servidor";
import { iniciarJiraFalso, type JiraFalso } from "../jira-falso/servidor";

/**
 * Pruebas propias del Atlassian falso (E5 OAuth, dueño: q360-qa). Levantan su propia instancia (Atlassian :4111, Jira :4110) con credenciales
 * explícitas, así que no necesitan el stack ni el `.env` de Integraciones. Cada prueba parte de `reset`.
 */
const PUERTO = 4111;
const BASE = `http://127.0.0.1:${PUERTO}`;
const CLIENT_ID = "q360-local";
const CLIENT_SECRET = "secreto-de-prueba-del-falso-Z9y8X7";
const REDIRECT = "http://localhost:5173/admin/integraciones/jira/oauth/retorno";
const SCOPES = "read:jira-work read:jira-user offline_access";

let falso: AtlassianFalso;
let jira: JiraFalso;
const ctl = crearClienteAtlassianFalso(BASE);

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  jira = await iniciarJiraFalso(4110);
  falso = await iniciarAtlassianFalso({ puerto: PUERTO, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT, jiraUrl: "http://127.0.0.1:4110" });
});
test.afterAll(async () => {
  await falso?.cerrar();
  await jira?.cerrar();
});
test.beforeEach(async () => {
  await ctl.reset();
  await fetch("http://127.0.0.1:4110/__reset", { method: "POST" });
});

const urlAutorizacion = (extra: Record<string, string> = {}, quitar: string[] = []) => {
  const p = new URLSearchParams({ audience: "api.atlassian.com", client_id: CLIENT_ID, scope: SCOPES, redirect_uri: REDIRECT, state: "estado-de-prueba-123", response_type: "code", prompt: "consent", ...extra });
  for (const q of quitar) p.delete(q);
  return `${BASE}/authorize?${p.toString()}`;
};

async function token(cuerpo: Record<string, unknown>) {
  const r = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  return { status: r.status, cuerpo: (await r.json()) as any };
}
const canje = (code: string, extra: Record<string, unknown> = {}) => token({ grant_type: "authorization_code", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, redirect_uri: REDIRECT, ...extra });
const renovar = (refresh: string, extra: Record<string, unknown> = {}) => token({ grant_type: "refresh_token", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, ...extra });
const api = (ruta: string, bearer?: string, cloud: string = SITIO_A.id) =>
  fetch(`${BASE}/ex/jira/${cloud}${ruta}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });

/** Flujo completo hasta tener tokens (autoriza y canjea). */
async function conectar() {
  const a = await ctl.autorizar(urlAutorizacion());
  const t = await canje(a.code!);
  return { a, ...t.cuerpo, status: t.status } as { a: typeof a; status: number; access_token: string; refresh_token: string; scope: string; expires_in: number };
}

test.describe("Atlassian falso", () => {
  test("[FALSO-T01] /authorize rechaza sin redirigir un client_id, redirect_uri, response_type, audience, scope o state inválidos", async () => {
    const casos: Array<[string, string]> = [
      ["client_id ajeno", urlAutorizacion({ client_id: "otra-app" })],
      ["redirect_uri no registrada", urlAutorizacion({ redirect_uri: "https://evil.example.com/cb" })],
      ["response_type", urlAutorizacion({ response_type: "token" })],
      ["audience", urlAutorizacion({ audience: "otro" })],
      ["scope ausente", urlAutorizacion({}, ["scope"])],
      ["scope malformado", urlAutorizacion({ scope: "<script>" })],
      ["state ausente", urlAutorizacion({}, ["state"])],
    ];
    for (const [nombre, url] of casos) {
      const r = await fetch(url, { redirect: "manual" });
      expect(r.status, nombre).toBe(400);
      expect(r.headers.get("location"), nombre).toBeNull();
    }
  });

  test("[FALSO-T02] NORMAL: autoriza con consentimiento automático (302 con code y el mismo state), canjea una sola vez y entrega los tokens con sus scopes", async () => {
    const a = await ctl.autorizar(urlAutorizacion());
    expect(a.estado).toBe(302);
    expect(a.state).toBe("estado-de-prueba-123");
    expect(a.error).toBeUndefined();
    expect(a.code).toBeTruthy();
    expect(a.location!.startsWith(REDIRECT)).toBe(true);
    const t = await canje(a.code!);
    expect(t.status).toBe(200);
    expect(t.cuerpo).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: SCOPES });
    expect(t.cuerpo.access_token).toBeTruthy();
    expect(t.cuerpo.refresh_token).toBeTruthy();
    // El code es de un solo uso.
    expect((await canje(a.code!)).status).toBe(403);
    // Otra redirect_uri en el canje: no coincide con la autorizada.
    const b = await ctl.autorizar(urlAutorizacion());
    const malo = await canje(b.code!, { redirect_uri: "http://localhost:5173/otra" });
    expect(malo.status).toBe(403);
    expect(malo.cuerpo.error).toBe("invalid_grant");
  });

  test("[FALSO-T03] valida client_id y client_secret contra los del .env: un secreto o id equivocado es 403 en el canje y en la renovación", async () => {
    const a = await ctl.autorizar(urlAutorizacion());
    for (const sobre of [{ client_secret: "otro" }, { client_id: "otra-app" }, { client_secret: undefined }]) {
      const r = await canje(a.code!, sobre);
      expect(r.status, JSON.stringify(Object.keys(sobre))).toBe(403);
      expect(r.cuerpo.error).toBe("access_denied");
    }
    // El code no se gastó con los intentos fallidos.
    const ok = await canje(a.code!);
    expect(ok.status).toBe(200);
    expect((await renovar(ok.cuerpo.refresh_token, { client_secret: "otro" })).status).toBe(403);
  });

  test("[FALSO-T04] CONSENTIMIENTO_RECHAZADO: redirige con error=access_denied y el mismo state, sin code", async () => {
    await ctl.modo("CONSENTIMIENTO_RECHAZADO");
    const a = await ctl.autorizar(urlAutorizacion());
    expect(a.estado).toBe(302);
    expect(a.error).toBe("access_denied");
    expect(a.state).toBe("estado-de-prueba-123");
    expect(a.code).toBeUndefined();
  });

  test("[FALSO-T05] sitios por modo: uno, VARIOS_SITIOS (3), SIN_SITIO, SIN_SCOPES_JIRA y SITIOS_HOSTILES; exige Bearer", async () => {
    const { access_token } = await conectar();
    const sitios = async (b?: string) => fetch(`${BASE}/oauth/token/accessible-resources`, { headers: b ? { Authorization: `Bearer ${b}` } : {} });
    expect((await sitios()).status).toBe(401);
    expect((await sitios("inventado")).status).toBe(401);

    let lista = (await (await sitios(access_token)).json()) as any[];
    expect(lista.map((s) => s.id)).toEqual([SITIO_A.id]);
    expect(lista[0]).toMatchObject({ name: "jseguelh", url: "https://jseguelh.atlassian.net", scopes: ["read:jira-work", "read:jira-user"] });

    await ctl.modo("VARIOS_SITIOS");
    lista = (await (await sitios(access_token)).json()) as any[];
    expect(lista.map((s) => s.id)).toEqual([SITIO_A.id, SITIO_B.id, SITIO_C.id]);

    await ctl.modo("SIN_SITIO");
    expect(await (await sitios(access_token)).json()).toEqual([]);

    await ctl.modo("SIN_SCOPES_JIRA");
    lista = (await (await sitios(access_token)).json()) as any[];
    expect(lista).toHaveLength(1);
    expect(lista[0].scopes.some((s: string) => s.includes("jira"))).toBe(false);

    await ctl.modo("SITIOS_HOSTILES");
    lista = (await (await sitios(access_token)).json()) as any[];
    expect(lista.some((s) => s.id === "no-es-uuid")).toBe(true);
    expect(lista.some((s) => s.url === "https://evil.example.com")).toBe(true);
    expect(lista.some((s) => s.id === SITIO_A.id)).toBe(true);
  });

  test("[FALSO-T06] SCOPES_INSUFICIENTES: el token no trae read:jira-work; /myself pasa y /project, /field y /search dan 401 «scope does not match»", async () => {
    await ctl.modo("SCOPES_INSUFICIENTES");
    const t = await conectar();
    expect(t.scope).toBe("read:jira-user offline_access");
    expect((await api("/rest/api/3/myself", t.access_token)).status).toBe(200);
    for (const ruta of ["/rest/api/3/project/QTY", "/rest/api/3/field", "/rest/api/3/search/jql?jql=project%3DQTY"]) {
      const r = await api(ruta, t.access_token);
      expect(r.status, ruta).toBe(401);
      expect(JSON.stringify(await r.json())).toContain("scope does not match");
    }
    const sitios = (await (await fetch(`${BASE}/oauth/token/accessible-resources`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as any[];
    expect(sitios[0].scopes).toEqual(["read:jira-user"]);
  });

  test("[FALSO-T07] CANJE_RECHAZADO: el canje del code da 403 invalid_grant", async () => {
    const a = await ctl.autorizar(urlAutorizacion());
    await ctl.modo("CANJE_RECHAZADO");
    const r = await canje(a.code!);
    expect(r.status).toBe(403);
    expect(r.cuerpo.error).toBe("invalid_grant");
  });

  test("[FALSO-T08] rotación: cada renovación invalida de inmediato el refresh y el acceso anteriores; reusar el viejo es 403 y se cuenta", async () => {
    const t0 = await conectar();
    expect((await api("/rest/api/3/myself", t0.access_token)).status).toBe(200);

    const r1 = await renovar(t0.refresh_token);
    expect(r1.status).toBe(200);
    expect(r1.cuerpo.refresh_token).not.toBe(t0.refresh_token);
    expect(r1.cuerpo.access_token).not.toBe(t0.access_token);
    expect(r1.cuerpo.scope).toBe(SCOPES);
    expect(await ctl.renovaciones()).toBe(1);

    // Quien no guardó el token nuevo: el viejo ya no sirve.
    const reuso = await renovar(t0.refresh_token);
    expect(reuso.status).toBe(403);
    expect(reuso.cuerpo.error).toBe("invalid_grant");
    expect((await api("/rest/api/3/myself", t0.access_token)).status).toBe(401);
    expect((await api("/rest/api/3/myself", r1.cuerpo.access_token)).status).toBe(200);

    const r2 = await renovar(r1.cuerpo.refresh_token);
    expect(r2.status).toBe(200);
    expect(await ctl.renovaciones()).toBe(2);
    const resumen = await ctl.solicitudes();
    expect(resumen.renovacionesRechazadas).toBe(1);
    expect(resumen.reutilizacionesRechazadas).toBe(1);
    expect(resumen.canjes).toBe(1);
  });

  test("[FALSO-T09] dos renovaciones simultáneas con el mismo refresh: solo una pasa (detecta a quien renueva sin candado)", async () => {
    const t = await conectar();
    const [a, b] = await Promise.all([renovar(t.refresh_token), renovar(t.refresh_token)]);
    expect([a.status, b.status].sort()).toEqual([200, 403]);
    expect(await ctl.renovaciones()).toBe(1);
  });

  test("[FALSO-T10] fallas de renovación: RENOVACION_INVALID_GRANT 403, RENOVACION_CAIDA 503 y RENOVACION_LIMITE 429; no cuentan como renovación y no rotan nada", async () => {
    const t = await conectar();
    for (const [modo, estado] of [["RENOVACION_INVALID_GRANT", 403], ["RENOVACION_CAIDA", 503], ["RENOVACION_LIMITE", 429]] as const) {
      await ctl.modo(modo);
      const r = await renovar(t.refresh_token);
      expect(r.status, modo).toBe(estado);
    }
    expect(await ctl.renovaciones()).toBe(0);
    // Tras la falla pasajera el refresh sigue vigente.
    await ctl.modo("NORMAL");
    expect((await renovar(t.refresh_token)).status).toBe(200);
  });

  test("[FALSO-T11] ACCESO_CORTO entrega expires_in menor a 5 minutos; `expiresIn` lo fija y `avanzarSegundos` vence el acceso sin esperar", async () => {
    await ctl.modo("ACCESO_CORTO");
    const t = await conectar();
    expect(t.expires_in).toBe(EXPIRES_IN_CORTO);
    expect(EXPIRES_IN_CORTO).toBeLessThan(300);
    expect((await api("/rest/api/3/myself", t.access_token)).status).toBe(200);
    await ctl.control({ avanzarSegundos: EXPIRES_IN_CORTO + 1 });
    expect((await api("/rest/api/3/myself", t.access_token)).status).toBe(401);
    // El refresh no vence con el reloj del acceso.
    await ctl.modo("NORMAL");
    await ctl.control({ expiresIn: 900 });
    const r = await renovar(t.refresh_token);
    expect(r.status).toBe(200);
    expect(r.cuerpo.expires_in).toBe(900);
  });

  test("[FALSO-T12] ACCESO_REVOCADO: la API de Jira da 401 aunque el token sea vigente; al volver a NORMAL el mismo token sirve", async () => {
    const t = await conectar();
    await ctl.modo("ACCESO_REVOCADO");
    expect((await api("/rest/api/3/myself", t.access_token)).status).toBe(401);
    await ctl.modo("NORMAL");
    expect((await api("/rest/api/3/myself", t.access_token)).status).toBe(200);
  });

  test("[FALSO-T13] /ex/jira reutiliza el Jira falso: myself, project, field y search/jql; exige Bearer y cloudid correcto y respeta sus modos de falla", async () => {
    const { access_token } = await conectar();
    expect((await api("/rest/api/3/myself")).status).toBe(401);
    expect((await api("/rest/api/3/myself", "inventado")).status).toBe(401);
    expect((await api("/rest/api/3/myself", access_token, "00000000-0000-4000-8000-000000000000")).status).toBe(404);

    const yo = await api("/rest/api/3/myself", access_token);
    expect(yo.status).toBe(200);
    expect(await yo.json()).toMatchObject({ displayName: "Admin Jira Falso" });
    expect(await (await api("/rest/api/3/project/QTY", access_token)).json()).toMatchObject({ key: "QTY" });
    expect((await api("/rest/api/3/project/NOEXISTE", access_token)).status).toBe(404);
    expect(((await (await api("/rest/api/3/field", access_token)).json()) as any[]).some((c) => c.name === "Sprint")).toBe(true);
    const busqueda = (await (await api("/rest/api/3/search/jql?jql=" + encodeURIComponent('project = QTY AND issuetype in ("Story") ORDER BY key ASC') + "&maxResults=50&fields=summary", access_token)).json()) as any;
    expect(busqueda.issues.length).toBeGreaterThan(0);
    expect(busqueda.issues[0].key).toBe("QTY-1");

    // Los modos de falla del Jira falso pasan tal cual.
    await fetch("http://127.0.0.1:4110/__control", { method: "POST", body: JSON.stringify({ modo: "CAIDO" }) });
    expect((await api("/rest/api/3/myself", access_token)).status).toBe(503);
    await fetch("http://127.0.0.1:4110/__control", { method: "POST", body: JSON.stringify({ modo: "LIMITE_SIEMPRE" }) });
    const limite = await api("/rest/api/3/myself", access_token);
    expect(limite.status).toBe(429);
    expect(limite.headers.get("retry-after")).toBe("1");
  });

  test("[FALSO-T14] SIN_PERMISO_PROYECTO: el proyecto da 404 (o 403 con estadoProyecto) y la búsqueda 403; myself y field siguen", async () => {
    const { access_token } = await conectar();
    await ctl.modo("SIN_PERMISO_PROYECTO");
    expect((await api("/rest/api/3/project/QTY", access_token)).status).toBe(404);
    expect((await api("/rest/api/3/search/jql?jql=project%3DQTY", access_token)).status).toBe(403);
    expect((await api("/rest/api/3/myself", access_token)).status).toBe(200);
    expect((await api("/rest/api/3/field", access_token)).status).toBe(200);
    await ctl.control({ estadoProyecto: 403 });
    expect((await api("/rest/api/3/project/QTY", access_token)).status).toBe(403);
  });

  test("[FALSO-T15] nunca expone secretos: /__solicitudes no trae tokens, code, state ni el secreto, y las rutas van sin query", async () => {
    const t = await conectar();
    await api("/rest/api/3/myself", t.access_token);
    const r = await renovar(t.refresh_token);
    await api("/rest/api/3/myself", r.cuerpo.access_token);
    await api("/rest/api/3/myself", t.access_token); // viejo: Bearer inválido
    const crudo = await (await fetch(`${BASE}/__solicitudes`)).text();
    for (const secreto of [t.access_token, t.refresh_token, r.cuerpo.access_token, r.cuerpo.refresh_token, t.a.code!, "estado-de-prueba-123", CLIENT_SECRET]) {
      expect(crudo, "valor secreto en /__solicitudes").not.toContain(secreto);
    }
    expect(crudo).not.toMatch(/\?|code=|state=|client_secret/);
    const resumen = await ctl.solicitudes();
    const rutas = resumen.solicitudes.map((s) => `${s.metodo} ${s.ruta} ${s.estado} ${s.bearerValido}`);
    expect(rutas).toContain("GET /authorize 302 null");
    expect(rutas).toContain("POST /oauth/token 200 null");
    expect(rutas.filter((x) => x.includes("/myself")).map((x) => x.endsWith("true"))).toEqual([true, true, false]);
    expect(resumen.solicitudes.find((s) => s.grant === "refresh_token")).toBeTruthy();
    expect(resumen.renovaciones).toBe(1);
    // También la salida del control.
    expect(JSON.stringify(await ctl.control({ modo: "NORMAL" }))).not.toContain(CLIENT_SECRET);
  });

  test("[FALSO-T16] /__fugas dice qué clases de secreto contiene un texto sin devolverlas (code, state, acceso, renovación, secreto)", async () => {
    const t = await conectar();
    expect(await ctl.fugas("nada que ver")).toEqual([]);
    expect(await ctl.fugas(`x ${t.access_token} y`)).toEqual(["token-acceso"]);
    expect(await ctl.fugas(t.refresh_token)).toEqual(["token-renovacion"]);
    expect(await ctl.fugas(`code=${t.a.code}`)).toEqual(["code"]);
    expect(await ctl.fugas("state=estado-de-prueba-123")).toEqual(["state"]);
    expect(await ctl.fugas(`pwd ${CLIENT_SECRET}`)).toEqual(["secreto-cliente"]);
    const todo = await ctl.fugas(`${t.access_token} ${t.refresh_token} ${t.a.code} estado-de-prueba-123 ${CLIENT_SECRET}`);
    expect(todo.sort()).toEqual(["code", "secreto-cliente", "state", "token-acceso", "token-renovacion"]);
    // La respuesta jamás contiene los valores.
    const cruda = await (await fetch(`${BASE}/__fugas`, { method: "POST", body: JSON.stringify({ texto: t.access_token }) })).text();
    expect(cruda).not.toContain(t.access_token);
  });

  test("[FALSO-T17] control: acepta los 14 modos, rechaza uno desconocido con 400 y /__reset restablece todo (modo, tokens, contadores, reloj)", async () => {
    expect(MODOS_ATLASSIAN).toHaveLength(14);
    for (const m of MODOS_ATLASSIAN) expect((await ctl.modo(m)).modo).toBe(m);
    const malo = await fetch(`${BASE}/__control`, { method: "POST", body: JSON.stringify({ modo: "INVENTADO" }) });
    expect(malo.status).toBe(400);
    await ctl.modo("NORMAL");
    const t = await conectar();
    await renovar(t.refresh_token);
    await ctl.control({ avanzarSegundos: 5000, expiresIn: 10 });
    await ctl.reset();
    const resumen = await ctl.solicitudes();
    expect(resumen).toMatchObject({ modo: "NORMAL", renovaciones: 0, renovacionesRechazadas: 0, canjes: 0, solicitudes: [] });
    expect((await api("/rest/api/3/myself", t.access_token)).status).toBe(401); // los tokens de antes ya no existen
    const nuevo = await conectar();
    expect(nuevo.expires_in).toBe(3600);
  });

  test("[FALSO-T18] cliente.autorizar rechaza una URL que no es del falso y devuelve el 400 sin redirección si el pedido es inválido", async () => {
    await expect(ctl.autorizar("https://auth.atlassian.com/authorize?x=1")).rejects.toThrow(/no apunta al Atlassian falso/);
    const r = await ctl.autorizar(urlAutorizacion({ client_id: "otra-app" }));
    expect(r.estado).toBe(400);
    expect(r.code).toBeUndefined();
  });
});
