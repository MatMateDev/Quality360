import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { atlassianFalso } from "../support/atlassian-falso/cliente";
import { SITIO_A, SITIO_B, SITIO_C } from "../support/atlassian-falso/servidor";
import { cumpleContrato } from "../support/contrato";
import { conIntegraciones } from "../support/db";
import { CONFIG, OAUTH, RUTAS_OAUTH, conectarOauth, crearEstadoVencido, desconectarOauth, eventosOauth, filaConexion, filasEstado, guardarOauth, iniciarOauth, limpiarOauth, probarOauth, retornoOauth, sha256Hex, sitioOauth, stateDe, textoDeTablasEjecucion, textoDeTablasOauth, tiposEventoOauth, vencerAccesoEnBase } from "../support/e5oauth";
import { URL_I6, guardarConfigBase, registroServicios, sql, tk } from "../support/e5";
import { CONTRASENA, crearUsuarioE7, desactivarUsuario } from "../support/e7";
import { iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { levantarIntegraciones, levantarIntegracionesSinOauth, llaveAleatoria, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";

/**
 * E5-B08 · Conexión OAuth con Jira y renovación de credenciales (14 escenarios, T01..T26). Dueño: q360-qa. Contra el stack real y el Atlassian falso (:4011).
 *
 * PENDIENTE DE BACKEND: estas pruebas se escribieron contra `contracts/*.yaml` antes de que existan JO4 a JO7 (Integraciones) y GO1 (gateway). Mientras
 * esas rutas no existan FALLAN (404 o 503), y eso es lo esperado: no certifican nada hasta pasar. Se identifican por la etiqueta `@pendiente-backend`
 * (`npx playwright test --project=e5-api --grep-invert @pendiente-backend` las excluye; la certificación las corre todas y exige verde).
 */
test.describe.configure({ mode: "default" });
test.setTimeout(240_000);
test.beforeEach(async () => {
  await limpiarOauth();
});
test.afterAll(async () => {
  await limpiarOauth();
});

const sinSecretos = async (nombre: string, texto: string) => expect(await atlassianFalso.fugas(texto), `${nombre} filtra`).toEqual([]);
const ESTADO_INVALIDO = "JIRA_OAUTH_ESTADO_INVALIDO";
const sinNombresDeVariables = (t: string) => expect(t.replace(/"codigo":"[A-Z_]+"/, "")).not.toMatch(/JIRA_OAUTH|CLIENT_ID|CLIENT_SECRET|INTEGRACIONES_|\.env/i);

test.describe("E5-B08 · Conexión OAuth", () => {
  // ------------------------------------------------------------------------------------------------------------- #1
  test("[E5-B08#1] E5-B08-T01: oauth/iniciar devuelve la URL de Atlassian con audience, client_id, scopes de D218, redirect_uri, response_type, prompt y state nuevo; en la base solo el hash, a 10 minutos", async ({ request }) => {
    const antes = Date.now();
    const r = await iniciarOauth(request);
    expect(r.status).toBe(200);
    expect(cumpleContrato("InicioAutorizacionOauthJira", r.body)).toEqual({ ok: true, errores: [] });
    expect(r.traceId).toBeTruthy();
    const u = new URL(r.body.urlAutorizacion);
    const q = u.searchParams;
    expect(q.get("audience")).toBe("api.atlassian.com");
    expect(q.get("client_id")).toBe(env.jiraOauthClientId);
    expect(q.get("response_type")).toBe("code");
    expect(q.get("prompt")).toBe("consent");
    expect((q.get("scope") ?? "").split(" ").sort()).toEqual(["offline_access", "read:jira-user", "read:jira-work"]);
    expect(q.get("scope")).not.toMatch(/write|manage|delete/);
    expect(q.get("redirect_uri")).toBe(env.jiraOauthRedirectUri);
    expect(q.get("redirect_uri")).toMatch(/\/admin\/integraciones\/jira\/oauth\/retorno$/);
    const state = q.get("state") ?? "";
    expect(state.length).toBeGreaterThanOrEqual(43); // 32 bytes en base64url
    // Solo el hash, ligado al Administrador, con 10 minutos de vigencia.
    const filas = await filasEstado();
    expect(filas).toHaveLength(1);
    expect(filas[0].estado_hash).toBe(sha256Hex(state));
    expect(JSON.stringify(filas[0])).not.toContain(state);
    expect(filas[0].usado_en).toBeNull();
    const minutos = (new Date(filas[0].expira_en).getTime() - antes) / 60_000;
    expect(minutos).toBeGreaterThan(9);
    expect(minutos).toBeLessThan(11);
    expect(new Date(r.body.expiraEn).getTime()).toBeCloseTo(new Date(filas[0].expira_en).getTime(), -4);
    // No llama a Atlassian ni cambia la conexión.
    expect((await atlassianFalso.solicitudes()).solicitudes).toEqual([]);
    expect(await filaConexion()).toBeUndefined();
  });

  test("[E5-B08#1] E5-B08-T02: cada iniciar crea un state distinto y purga los de más de 1 día", async ({ request }) => {
    const a = await iniciarOauth(request);
    const b = await iniciarOauth(request);
    expect(stateDe(a.body.urlAutorizacion)).not.toBe(stateDe(b.body.urlAutorizacion));
    const adm = (await sql("SELECT actor_id FROM integraciones.oauth_estado_jira LIMIT 1"))[0].actor_id;
    await sql(
      `INSERT INTO integraciones.oauth_estado_jira (estado_hash, actor_id, creado_en, expira_en) VALUES ($1, $2, now() - interval '2 days', now() - interval '2 days' + interval '10 minutes')`,
      [sha256Hex("viejo"), adm],
    );
    expect(await filasEstado()).toHaveLength(3);
    expect((await iniciarOauth(request)).status).toBe(200);
    const hashes = (await filasEstado()).map((f) => f.estado_hash);
    expect(hashes).not.toContain(sha256Hex("viejo"));
    expect(hashes).toHaveLength(3);
  });

  // ------------------------------------------------------------------------------------------------------------- #2
  test("[E5-B08#2] E5-B08-T03: canje exitoso: 200 CONECTADA, tokens cifrados con IV y etiqueta propios (ni en claro ni en subcadena), cuenta y sitio guardados, state usado y evento CONECTAR_OAUTH", async ({ request }) => {
    const { ini, ret } = await conectarOauth(request);
    expect(ret.status).toBe(200);
    expect(cumpleContrato("ResultadoConexionOauthJira", ret.body)).toEqual({ ok: true, errores: [] });
    expect(ret.body).toMatchObject({ resultado: "CONECTADA", error: null });
    expect(ret.body.oauth).toMatchObject({ estado: "CONECTADA", descifrable: true, sitiosCandidatos: null, cuenta: { nombre: "Admin Jira Falso" }, sitio: { id: SITIO_A.id, nombre: SITIO_A.nombre, url: SITIO_A.url } });
    expect([...ret.body.oauth.permisos].sort()).toEqual(["offline_access", "read:jira-user", "read:jira-work"]);
    // Base: dos tokens cifrados con material propio.
    const f = await filaConexion();
    expect(f).toMatchObject({ estado: "CONECTADA", cloud_id: SITIO_A.id, sitio_url: SITIO_A.url, sitio_nombre: SITIO_A.nombre });
    expect(f.cuenta_nombre).toBe("Admin Jira Falso");
    for (const [c, iv, tag] of [["acceso_cifrado", "acceso_iv", "acceso_tag"], ["renovacion_cifrada", "renovacion_iv", "renovacion_tag"]] as const) {
      expect(f[c].length, c).toBeGreaterThan(0);
      expect(f[iv].length, iv).toBe(12);
      expect(f[tag].length, tag).toBe(16);
    }
    expect(Buffer.compare(f.acceso_iv, f.renovacion_iv)).not.toBe(0);
    expect(f.acceso_expira_en).not.toBeNull();
    // Ningún token, code, state ni secreto en claro ni en subcadena en ninguna tabla (utf8, latin1, hex y base64).
    await sinSecretos("tablas OAuth", await textoDeTablasOauth());
    await sinSecretos("respuesta de retorno", JSON.stringify(ret.body));
    await sinSecretos("respuesta de iniciar (salvo su state)", JSON.stringify(ini.body).replace(stateDe(ini.body.urlAutorizacion), ""));
    // El state quedó usado y el evento registrado.
    const estados = await filasEstado();
    expect(estados[0].usado_en).not.toBeNull();
    const ev = await eventosOauth();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ tipo: "CONECTAR_OAUTH", cuenta_nombre: "Admin Jira Falso", sitio_nombre: SITIO_A.nombre });
    expect(ev[0].codigo).toBeNull();
    await sinSecretos("evento", JSON.stringify(ev));
    const sol = await atlassianFalso.solicitudes();
    expect(sol.canjes).toBe(1);
  });

  test("[E5-B08#2] E5-B08-T04: GET configuracion informa la conexión sin secretos y cumple el contrato; dos conexiones del mismo token producen cifrado e IV distintos", async ({ request }) => {
    await conectarOauth(request);
    const g = await api.get<any>(request, CONFIG, { token: await tk("adm1") });
    expect(g.status).toBe(200);
    expect(cumpleContrato("ConfiguracionJira", g.body)).toEqual({ ok: true, errores: [] });
    expect(g.body.oauthDisponible).toBe(true);
    expect(g.body.oauth).toMatchObject({ estado: "CONECTADA", descifrable: true });
    expect(JSON.stringify(g.body)).not.toMatch(/accesoExpira|acceso_expira|cifrad|"iv"|"tag"/i);
    await sinSecretos("GET configuracion", JSON.stringify(g.body));
    const a = await filaConexion();
    await conectarOauth(request);
    const b = await filaConexion();
    expect(Buffer.compare(a.acceso_cifrado, b.acceso_cifrado)).not.toBe(0);
    expect(Buffer.compare(a.acceso_iv, b.acceso_iv)).not.toBe(0);
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "RECONECTAR"]);
  });

  // ------------------------------------------------------------------------------------------------------------- #3
  test("[E5-B08#3] E5-B08-T05: state desconocido, vencido, ya usado, mal formado o de otro Administrador: 400 con el mismo mensaje, sin llamar a Atlassian y sin guardar nada", async ({ request }) => {
    const mensajes = new Set<string>();
    const rechazo = async (nombre: string, cuerpo: Record<string, unknown>, clave: string = "adm1") => {
      const r = await retornoOauth(request, cuerpo, clave);
      expect(r.status, nombre).toBe(400);
      expect(r.body.codigo, nombre).toBe(ESTADO_INVALIDO);
      expect(cumpleContrato("Error", r.body), nombre).toEqual({ ok: true, errores: [] });
      mensajes.add(r.body.mensaje);
    };
    // 1. desconocido
    await rechazo("desconocido", { code: "codigo-cualquiera", state: "estado-inventado-que-no-existe" });
    // 2. mal formado (caracteres fuera del alfabeto base64url)
    await rechazo("mal formado", { code: "codigo-cualquiera", state: "¡¡ no es base64url !!" });
    // 3. vencido
    await rechazo("vencido", { code: "codigo-cualquiera", state: await crearEstadoVencido(request) });
    // 4. ya usado
    const ok = await conectarOauth(request);
    expect(ok.ret.status).toBe(200);
    await rechazo("ya usado", { code: "otro-codigo", state: ok.state });
    // 5. creado por otro Administrador
    const otro = await crearUsuarioE7(request, await tk("adm1"), "ADMINISTRADOR", { prefijo: "b08-t05", conContrasena: true });
    try {
      const mio = await iniciarOauth(request, "adm1");
      const aut2 = await atlassianFalso.autorizar(mio.body.urlAutorizacion);
      const sesionOtro = await iniciarSesion(otro.correo, CONTRASENA);
      const r = await api.post<any>(request, `${OAUTH}/retorno`, { token: sesionOtro.accessToken, body: { code: aut2.code, state: aut2.state } });
      expect(r.status).toBe(400);
      expect(r.body.codigo).toBe(ESTADO_INVALIDO);
      mensajes.add(r.body.mensaje);
      // El state de adm1 sigue sin usar: el intento ajeno no lo consumió.
      expect((await sql("SELECT usado_en FROM integraciones.oauth_estado_jira WHERE estado_hash = $1", [sha256Hex(aut2.state!)]))[0].usado_en).toBeNull();
    } finally {
      await desactivarUsuario(request, await tk("adm1"), otro.id);
    }
    expect([...mensajes], "el mensaje no revela la causa").toHaveLength(1);
    // Solo el canje del caso 4 llegó a Atlassian.
    expect((await atlassianFalso.solicitudes()).canjes).toBe(1);
  });

  test("[E5-B08#3] E5-B08-T06: dos retornos simultáneos con el mismo state: solo uno canjea", async ({ request }) => {
    const ini = await iniciarOauth(request);
    const aut = await atlassianFalso.autorizar(ini.body.urlAutorizacion);
    const cuerpo = { code: aut.code, state: aut.state };
    const [a, b] = await Promise.all([retornoOauth(request, cuerpo), retornoOauth(request, cuerpo)]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const mala = a.status === 400 ? a : b;
    expect(mala.body.codigo).toBe(ESTADO_INVALIDO);
    expect((await atlassianFalso.solicitudes()).canjes).toBe(1);
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH"]);
  });

  test("[E5-B08#3] E5-B08-T07: el cuerpo del retorno se valida: sin state, con code y error a la vez o sin ninguno es 400 VALIDACION; no consumen el state", async ({ request }) => {
    const ini = await iniciarOauth(request);
    const state = stateDe(ini.body.urlAutorizacion);
    for (const [nombre, cuerpo] of [
      ["sin state", { code: "abc" }],
      ["code y error", { code: "abc", error: "access_denied", state }],
      ["sin code ni error", { state }],
      ["error con mayúsculas", { error: "ACCESS_DENIED", state }],
      ["campo extra", { code: "abc", state, error_description: "x" }],
    ] as const) {
      const r = await retornoOauth(request, cuerpo as Record<string, unknown>);
      expect(r.status, nombre).toBe(400);
      expect(r.body.codigo, nombre).toBe("VALIDACION");
    }
    expect((await filasEstado())[0].usado_en).toBeNull();
    expect((await atlassianFalso.solicitudes()).solicitudes).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------------------------- #4
  test("[E5-B08#4] E5-B08-T08: consentimiento cancelado: 200 JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO, state consumido y la conexión anterior no cambia", async ({ request }) => {
    const previa = await conectarOauth(request);
    expect(previa.ret.status).toBe(200);
    const antes = await filaConexion();
    await atlassianFalso.modo("CONSENTIMIENTO_RECHAZADO");
    const c = await conectarOauth(request);
    expect(c.aut.error).toBe("access_denied");
    expect(c.ret.status).toBe(200);
    expect(cumpleContrato("ResultadoConexionOauthJira", c.ret.body)).toEqual({ ok: true, errores: [] });
    expect(c.ret.body.resultado).toBe("ERROR");
    expect(c.ret.body.error.codigo).toBe("JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO");
    expect(c.ret.body.error.mensaje).toBe("No aceptaste los permisos en Atlassian. No se conectó nada.");
    expect(JSON.stringify(c.ret.body)).not.toContain("User did not authorize");
    // El state quedó consumido y la fila de conexión es la misma.
    expect((await sql("SELECT usado_en FROM integraciones.oauth_estado_jira WHERE estado_hash = $1", [sha256Hex(c.state)]))[0].usado_en).not.toBeNull();
    const despues = await filaConexion();
    expect(Buffer.compare(antes.acceso_cifrado, despues.acceso_cifrado)).toBe(0);
    expect(Buffer.compare(antes.renovacion_cifrada, despues.renovacion_cifrada)).toBe(0);
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH"]);
    // Cualquier otro valor de error es «canje fallido», sin repetirlo.
    const ini = await iniciarOauth(request);
    const r = await retornoOauth(request, { error: "server_error", state: stateDe(ini.body.urlAutorizacion) });
    expect(r.status).toBe(200);
    expect(r.body.error.codigo).toBe("JIRA_OAUTH_CANJE_FALLIDO");
    expect(JSON.stringify(r.body)).not.toContain("server_error");
  });

  test("[E5-B08#4] E5-B08-T09: canje rechazado por Atlassian: 200 JIRA_OAUTH_CANJE_FALLIDO sin texto de Atlassian, state consumido, nada guardado", async ({ request }) => {
    await atlassianFalso.modo("CANJE_RECHAZADO");
    const c = await conectarOauth(request);
    expect(c.ret.status).toBe(200);
    expect(c.ret.body).toMatchObject({ resultado: "ERROR", oauth: null, error: { codigo: "JIRA_OAUTH_CANJE_FALLIDO" } });
    expect(cumpleContrato("ResultadoConexionOauthJira", c.ret.body)).toEqual({ ok: true, errores: [] });
    expect(JSON.stringify(c.ret.body)).not.toMatch(/invalid_grant|Unknown or invalid|refresh token/i);
    expect(await filaConexion()).toBeUndefined();
    expect((await filasEstado())[0].usado_en).not.toBeNull();
    expect(await eventosOauth()).toHaveLength(0);
    // Un segundo retorno con el mismo state ya no llega a Atlassian.
    const antes = (await atlassianFalso.solicitudes()).solicitudes.length;
    expect((await retornoOauth(request, { code: c.aut.code, state: c.state })).status).toBe(400);
    expect((await atlassianFalso.solicitudes()).solicitudes.length).toBe(antes);
  });

  // ------------------------------------------------------------------------------------------------------------- #5
  test("[E5-B08#5] E5-B08-T10: un solo sitio se toma; varios dan ELEGIR_SITIO con la lista, conexión PENDIENTE_SITIO sin sitio y el sitio ya configurado marcado actual", async ({ request }) => {
    // Sitio ya configurado = SITIO_B (API token hacia el falso con esa URL no aplica: el «actual» sale de configuracion_jira.sitio_url).
    await guardarConfigBase(request);
    await sql("UPDATE integraciones.configuracion_jira SET sitio_url = $1", [SITIO_B.url]).catch(() => undefined);
    await atlassianFalso.modo("VARIOS_SITIOS");
    const c = await conectarOauth(request);
    expect(c.ret.status).toBe(200);
    expect(cumpleContrato("ResultadoConexionOauthJira", c.ret.body)).toEqual({ ok: true, errores: [] });
    expect(c.ret.body.resultado).toBe("ELEGIR_SITIO");
    expect(c.ret.body.oauth).toMatchObject({ estado: "PENDIENTE_SITIO", sitio: null, cuenta: null });
    const cand = c.ret.body.oauth.sitiosCandidatos as Array<{ id: string; nombre: string; url: string; actual: boolean }>;
    expect(cand.map((s) => s.id)).toEqual([SITIO_A.id, SITIO_B.id, SITIO_C.id]); // orden por nombre: jseguelh, laboratorio, pruebas
    expect(cand.filter((s) => s.actual).map((s) => s.id)).toEqual([SITIO_B.id]);
    expect(await tiposEventoOauth()).toEqual([]); // aún no está conectada
    const f = await filaConexion();
    expect(f).toMatchObject({ estado: "PENDIENTE_SITIO", cloud_id: null, sitio_url: null });
    expect(f.sitios_candidatos).toHaveLength(3);
    // «Consultar» o probar sin sitio: 409.
    const p = await probarOauth(request);
    expect(p.status).toBe(409);
    expect(p.body.codigo).toBe("JIRA_NO_CONFIGURADO");
    // Un id que no es candidato: 400. Un candidato: conecta.
    const mal = await sitioOauth(request, "99999999-9999-4999-8999-999999999999");
    expect(mal.status).toBe(400);
    expect(mal.body.codigo).toBe("JIRA_OAUTH_SITIO_NO_VALIDO");
    expect((await filaConexion()).estado).toBe("PENDIENTE_SITIO");
    const ok = await sitioOauth(request, SITIO_C.id);
    expect(ok.status).toBe(200);
    expect(cumpleContrato("ResultadoConexionOauthJira", ok.body)).toEqual({ ok: true, errores: [] });
    expect(ok.body).toMatchObject({ resultado: "CONECTADA", oauth: { estado: "CONECTADA", sitio: { id: SITIO_C.id, nombre: SITIO_C.nombre }, sitiosCandidatos: null } });
    expect(await filaConexion()).toMatchObject({ estado: "CONECTADA", cloud_id: SITIO_C.id, sitios_candidatos: null });
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH"]);
  });

  test("[E5-B08#5] E5-B08-T11: sin sitio de Jira (cuenta sin sitios, o solo con otros productos) JIRA_OAUTH_SIN_SITIO y nada guardado; elegir sitio sin conexión pendiente es 409", async ({ request }) => {
    await atlassianFalso.modo("SIN_SITIO");
    const c = await conectarOauth(request);
    expect(c.ret.status).toBe(200);
    expect(c.ret.body).toMatchObject({ resultado: "ERROR", oauth: null, error: { codigo: "JIRA_OAUTH_SIN_SITIO" } });
    expect(await filaConexion()).toBeUndefined();
    // Un sitio sin scopes de Jira (p. ej. Confluence): el backend lo descarta; sin sitios de Jira queda en SIN_SITIO o PERMISOS_INSUFICIENTES (D212).
    await atlassianFalso.modo("SIN_SCOPES_JIRA");
    const d = await conectarOauth(request);
    expect(d.ret.status).toBe(200);
    expect(d.ret.body.resultado).toBe("ERROR");
    expect(["JIRA_OAUTH_SIN_SITIO", "JIRA_OAUTH_PERMISOS_INSUFICIENTES"]).toContain(d.ret.body.error.codigo);
    expect(await filaConexion()).toBeUndefined();
    const s = await sitioOauth(request, SITIO_A.id);
    expect(s.status).toBe(409);
    expect(s.body.codigo).toBe("JIRA_OAUTH_SIN_CONEXION");
  });

  test("[E5-B08#5] E5-B08-T12: un cloudid que no es UUID o una URL fuera de *.atlassian.net: el sitio se descarta y no se llama a ninguna dirección armada con él", async ({ request }) => {
    await atlassianFalso.modo("SITIOS_HOSTILES");
    const c = await conectarOauth(request);
    expect(c.ret.status).toBe(200);
    // Quedó solo el sitio válido: se conecta directo con él.
    expect(c.ret.body.resultado).toBe("CONECTADA");
    expect(c.ret.body.oauth.sitio.id).toBe(SITIO_A.id);
    const rutas = (await atlassianFalso.solicitudes()).solicitudes.map((s) => s.ruta);
    expect(rutas.filter((r) => r.startsWith("/ex/jira/") && !r.startsWith(`/ex/jira/${SITIO_A.id}/`))).toEqual([]);
    expect(rutas.some((r) => r.includes("no-es-uuid") || r.includes("evil"))).toBe(false);
    const f = await filaConexion();
    expect(f.sitio_url).toBe(SITIO_A.url);
  });

  // ------------------------------------------------------------------------------------------------------------- #6
  test("[E5-B08#6] E5-B08-T13: permisos insuficientes: JIRA_OAUTH_PERMISOS_INSUFICIENTES con la lista que falta y nada guardado", async ({ request }) => {
    await atlassianFalso.modo("SCOPES_INSUFICIENTES");
    const c = await conectarOauth(request);
    expect(c.ret.status).toBe(200);
    expect(cumpleContrato("ResultadoConexionOauthJira", c.ret.body)).toEqual({ ok: true, errores: [] });
    expect(c.ret.body).toMatchObject({ resultado: "ERROR", oauth: null, error: { codigo: "JIRA_OAUTH_PERMISOS_INSUFICIENTES", permisosFaltantes: ["read:jira-work"] } });
    expect(c.ret.body.error.mensaje).toContain("read:jira-work");
    expect(await filaConexion()).toBeUndefined();
    expect(await eventosOauth()).toHaveLength(0);
    await sinSecretos("respuesta", JSON.stringify(c.ret.body));
  });

  // ------------------------------------------------------------------------------------------------------------- #7
  test("[E5-B08#7] E5-B08-T14: con el acceso por vencer (menos de 5 min) se renueva una vez, se guarda el refresh nuevo antes de usar el acceso nuevo y la llamada a Jira usa el acceso nuevo", async ({ request }) => {
    await conectarOauth(request);
    const antes = await filaConexion();
    const previas = (await atlassianFalso.solicitudes()).solicitudes.length; // las del propio canje
    await vencerAccesoEnBase();
    const p = await probarOauth(request);
    expect(p.status).toBe(200);
    expect(cumpleContrato("ResultadoPruebaJira", p.body)).toEqual({ ok: true, errores: [] });
    expect(p.body).toMatchObject({ ok: true, usuarioJira: "Admin Jira Falso", error: null });
    const sol = await atlassianFalso.solicitudes();
    expect(sol.renovaciones).toBe(1);
    expect(sol.renovacionesRechazadas).toBe(0);
    // Orden: el canje de renovación va antes que la llamada a Jira, y esa llamada llevó un Bearer válido (el nuevo).
    const orden = sol.solicitudes.slice(previas).filter((s) => s.grant === "refresh_token" || s.ruta.endsWith("/myself"));
    expect(orden[0].grant).toBe("refresh_token");
    expect(orden.filter((s) => s.ruta.endsWith("/myself")).every((s) => s.bearerValido === true)).toBe(true);
    const despues = await filaConexion();
    expect(Buffer.compare(antes.renovacion_cifrada, despues.renovacion_cifrada)).not.toBe(0);
    expect(Buffer.compare(antes.acceso_cifrado, despues.acceso_cifrado)).not.toBe(0);
    expect(new Date(despues.acceso_expira_en).getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);
    expect(despues.renovado_en).not.toBeNull();
    // Un segundo uso inmediato no vuelve a renovar, y una renovación posterior prueba que se guardó el refresh NUEVO (el viejo ya está muerto).
    expect((await probarOauth(request)).body.ok).toBe(true);
    expect(await atlassianFalso.renovaciones()).toBe(1);
    await vencerAccesoEnBase();
    expect((await probarOauth(request)).body.ok).toBe(true);
    const fin = await atlassianFalso.solicitudes();
    expect(fin.renovaciones).toBe(2);
    expect(fin.reutilizacionesRechazadas, "alguien reusó un refresh ya rotado: no guardó el nuevo").toBe(0);
    await sinSecretos("tablas OAuth tras renovar", await textoDeTablasOauth());
  });

  test("[E5-B08#7] E5-B08-T15: un 401 con un acceso que se creía vigente provoca una renovación y un reintento, y la llamada termina bien", async ({ request }) => {
    await conectarOauth(request);
    const previas = (await atlassianFalso.solicitudes()).solicitudes.length;
    await atlassianFalso.control({ avanzarSegundos: 4000 }); // para Atlassian el acceso ya venció; para la base sigue vigente
    const p = await probarOauth(request);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ ok: true, error: null });
    const sol = await atlassianFalso.solicitudes();
    expect(sol.renovaciones).toBe(1);
    const myself = sol.solicitudes.slice(previas).filter((s) => s.ruta.endsWith("/myself"));
    expect(myself.map((s) => s.bearerValido)).toEqual([false, true]); // un 401 y un solo reintento
  });

  test("[E5-B08#7] E5-B08-T16: si la renovación funciona y el reintento vuelve a dar 401 el resultado es JIRA_OAUTH_PERMISOS_INSUFICIENTES con los permisos de esa llamada, sin más reintentos", async ({ request }) => {
    await conectarOauth(request);
    const previas = (await atlassianFalso.solicitudes()).solicitudes.length;
    await atlassianFalso.modo("ACCESO_REVOCADO"); // la API de Jira da 401 siempre; el endpoint de token sigue renovando
    const p = await probarOauth(request);
    expect(p.status).toBe(200);
    expect(cumpleContrato("ResultadoPruebaJira", p.body)).toEqual({ ok: true, errores: [] });
    expect(p.body.ok).toBe(false);
    expect(p.body.error.codigo).toBe("JIRA_OAUTH_PERMISOS_INSUFICIENTES");
    expect(p.body.error.permisosFaltantes).toEqual(["read:jira-user"]); // myself pide read:jira-user (D218)
    const sol = await atlassianFalso.solicitudes();
    expect(sol.renovaciones).toBe(1);
    expect(sol.solicitudes.slice(previas).filter((s) => s.ruta.endsWith("/myself"))).toHaveLength(2);
    expect((await filaConexion()).estado, "no es una reconexión").toBe("CONECTADA");
  });

  // ------------------------------------------------------------------------------------------------------------- #8
  test("[E5-B08#8] E5-B08-T17: cuatro operaciones simultáneas que necesitan renovar: Atlassian cuenta UNA renovación, todas terminan bien y la conexión sigue CONECTADA", async ({ request }) => {
    await conectarOauth(request);
    await vencerAccesoEnBase();
    const resultados = await Promise.all([1, 2, 3, 4].map(() => probarOauth(request)));
    for (const r of resultados) {
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: true, error: null });
    }
    const sol = await atlassianFalso.solicitudes();
    expect(sol.renovaciones).toBe(1);
    expect(sol.renovacionesRechazadas, "una renovación con el refresh ya rotado: falta el candado").toBe(0);
    expect(sol.reutilizacionesRechazadas).toBe(0);
    expect((await filaConexion()).estado).toBe("CONECTADA");
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH"]);
  });

  // ------------------------------------------------------------------------------------------------------------- #9
  test("[E5-B08#9] E5-B08-T18: invalid_grant (90 días, contraseña, revocación): RECONEXION_NECESARIA, tokens borrados, un solo REFRESCO_FALLIDO y 200 JIRA_RECONEXION_NECESARIA; reconectar restablece y deja RECONECTAR", async ({ request }) => {
    await conectarOauth(request);
    await vencerAccesoEnBase();
    await atlassianFalso.modo("RENOVACION_INVALID_GRANT");
    const p = await probarOauth(request);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ ok: false, error: { codigo: "JIRA_RECONEXION_NECESARIA" } });
    expect(p.body.error.mensaje).toBe("La conexión con Jira venció. Vuelve a conectar con Jira.");
    const f = await filaConexion();
    expect(f.estado).toBe("RECONEXION_NECESARIA");
    for (const c of ["acceso_cifrado", "acceso_iv", "acceso_tag", "renovacion_cifrada", "renovacion_iv", "renovacion_tag", "acceso_expira_en"]) expect(f[c], c).toBeNull();
    expect(f.cuenta_nombre, "se conserva la última cuenta").toBe("Admin Jira Falso");
    // Una segunda operación no vuelve a llamar a Atlassian ni a registrar el evento.
    const llamadas = (await atlassianFalso.solicitudes()).solicitudes.length;
    const p2 = await probarOauth(request);
    expect(p2.body.error.codigo).toBe("JIRA_RECONEXION_NECESARIA");
    expect((await atlassianFalso.solicitudes()).solicitudes.length).toBe(llamadas);
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "REFRESCO_FALLIDO"]);
    expect((await eventosOauth())[1].codigo).toMatch(/^[A-Z_]{3,40}$/);
    // GET lo informa y el portal muestra la tarjeta de reconexión.
    const g = await api.get<any>(request, CONFIG, { token: await tk("adm1") });
    expect(cumpleContrato("ConfiguracionJira", g.body)).toEqual({ ok: true, errores: [] });
    expect.soft(g.body.oauth, "contrato: descifrable es false en RECONEXION_NECESARIA (no hay tokens)").toMatchObject({ estado: "RECONEXION_NECESARIA", descifrable: false });
    // Reconectar.
    await atlassianFalso.modo("NORMAL");
    const c = await conectarOauth(request);
    expect(c.ret.body.resultado).toBe("CONECTADA");
    expect((await filaConexion()).estado).toBe("CONECTADA");
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "REFRESCO_FALLIDO", "RECONECTAR"]);
    expect((await probarOauth(request)).body.ok).toBe(true);
  });

  // ------------------------------------------------------------------------------------------------------------- #10
  test("[E5-B08#10] E5-B08-T19: Atlassian caído o con límite al renovar: JIRA_NO_DISPONIBLE / JIRA_LIMITE_DE_TASA, la credencial no se borra ni cambia de estado y la siguiente operación reintenta", async ({ request }) => {
    await conectarOauth(request);
    await vencerAccesoEnBase();
    const antes = await filaConexion();
    for (const [modo, codigo] of [["RENOVACION_CAIDA", "JIRA_NO_DISPONIBLE"], ["RENOVACION_LIMITE", "JIRA_LIMITE_DE_TASA"]] as const) {
      await atlassianFalso.modo(modo);
      const p = await probarOauth(request);
      expect(p.status, modo).toBe(200);
      expect(p.body.ok, modo).toBe(false);
      expect(["JIRA_NO_DISPONIBLE", "JIRA_TIEMPO_AGOTADO", codigo], modo).toContain(p.body.error.codigo);
      const f = await filaConexion();
      expect(f.estado, modo).toBe("CONECTADA");
      expect(Buffer.compare(antes.renovacion_cifrada, f.renovacion_cifrada), modo).toBe(0);
      expect(Buffer.compare(antes.acceso_cifrado, f.acceso_cifrado), modo).toBe(0);
    }
    expect(await tiposEventoOauth(), "una falla pasajera no es REFRESCO_FALLIDO").toEqual(["CONECTAR_OAUTH"]);
    await atlassianFalso.modo("NORMAL");
    const ok = await probarOauth(request);
    expect(ok.body).toMatchObject({ ok: true, error: null });
    expect(await atlassianFalso.renovaciones()).toBe(1);
  });

  // ------------------------------------------------------------------------------------------------------------- #11
  test.describe("sin credenciales de la app o sin llave", () => {
    let sinOauth: InstanciaE5 | undefined;
    let sinLlave: InstanciaE5 | undefined;
    let otraLlave: InstanciaE5 | undefined;
    test.afterAll(async () => {
      await Promise.all([sinOauth?.detener(), sinLlave?.detener(), otraLlave?.detener()]);
    });

    test("[E5-B08#11] E5-B08-T20: sin JIRA_OAUTH_*: iniciar, retorno y sitio dan 503 JIRA_OAUTH_NO_CONFIGURADO sin nombres de variables y sin llamar a Atlassian; el servicio arranca, GET informa oauthDisponible false, el API token funciona y desconectar sigue", async ({ request }) => {
      // Una conexión ya guardada (con el stack principal) debe sobrevivir a todo lo que sigue.
      await conectarOauth(request);
      const antes = await filaConexion();
      await atlassianFalso.reset();
      sinOauth = await levantarIntegracionesSinOauth(3108);
      expect((await fetch(`${sinOauth.url}/health`)).status).toBe(200);
      const base = URL_I6;
      const adm = await tk("adm1");
      const casos: Array<[string, () => Promise<{ status: number; body: any }>]> = [
        ["iniciar", () => iniciarOauth(request, "adm1", base)],
        ["retorno", () => retornoOauth(request, { code: "c", state: "s" }, "adm1", base)],
        ["sitio", () => sitioOauth(request, SITIO_A.id, "adm1", base)],
        ["probar OAUTH", () => probarOauth(request, {}, base)],
        ["guardar OAUTH", () => guardarOauth(request, {}, base)],
        ["consultar con método OAuth", () => api.post<any>(request, "/v1/integraciones/jira/consultas", { token: adm, body: { reemplazar: true }, baseURL: base })],
      ];
      for (const [nombre, llamar] of casos) {
        const r = await llamar();
        if (nombre === "consultar con método OAuth") {
          // Solo aplica si el método activo es OAuth; sin configuración guardada responde 409 JIRA_NO_CONFIGURADO (D215), nunca 200 ni 5xx.
          expect([409, 503], nombre).toContain(r.status);
          continue;
        }
        expect(r.status, nombre).toBe(503);
        expect(r.body.codigo, nombre).toBe("JIRA_OAUTH_NO_CONFIGURADO");
        sinNombresDeVariables(JSON.stringify(r.body));
      }
      expect((await atlassianFalso.solicitudes()).solicitudes, "no llamó a Atlassian").toEqual([]);
      const g = await api.get<any>(request, CONFIG, { token: adm, baseURL: base });
      expect(g.status).toBe(200);
      expect(cumpleContrato("ConfiguracionJira", g.body)).toEqual({ ok: true, errores: [] });
      expect(g.body.oauthDisponible).toBe(false);
      expect(g.body.oauth, "la conexión guardada no se tocó").toMatchObject({ estado: "CONECTADA" });
      expect(Buffer.compare(antes.acceso_cifrado, (await filaConexion()).acceso_cifrado)).toBe(0);
      // El API token sigue funcionando.
      const token = await api.post<any>(request, `${CONFIG}/probar`, { token: adm, body: { sitio: "http://127.0.0.1:4010", correo: "admin@quality360.local", token: "q360-token-valido-AB12", proyecto: "QTY" }, baseURL: base });
      expect(token.status).toBe(200);
      expect(token.body.ok).toBe(true);
      // Desconectar funciona sin las variables ni la llave.
      const d = await desconectarOauth(request, "adm1", base);
      expect(d.status).toBe(204);
      expect(await filaConexion()).toBeUndefined();
    });

    test("[E5-B08#11] E5-B08-T21: sin llave de cifrado iniciar da 503 LLAVE_CIFRADO_NO_DISPONIBLE; con una llave distinta de la que cifró, 409 TOKEN_NO_DESCIFRABLE y oauth.descifrable false", async ({ request }) => {
      await conectarOauth(request);
      sinLlave = await levantarIntegraciones(3109, { INTEGRACIONES_LLAVE_CIFRADO: "" });
      const r = await iniciarOauth(request, "adm1", "http://localhost:3109");
      expect(r.status).toBe(503);
      expect(r.body.codigo).toBe("LLAVE_CIFRADO_NO_DISPONIBLE");
      sinNombresDeVariables(JSON.stringify(r.body));
      otraLlave = await levantarIntegraciones(3110, { INTEGRACIONES_LLAVE_CIFRADO: llaveAleatoria() });
      const base = "http://localhost:3110";
      const g = await api.get<any>(request, CONFIG, { token: await tk("adm1"), baseURL: base });
      expect(g.status).toBe(200);
      expect(g.body.oauth).toMatchObject({ estado: "CONECTADA", descifrable: false });
      const p = await probarOauth(request, {}, base);
      expect(p.status).toBe(409);
      expect(p.body.codigo).toBe("TOKEN_NO_DESCIFRABLE");
      expect((await filaConexion()).estado, "no se borra nada: hay que reconectar").toBe("CONECTADA");
    });
  });

  // ------------------------------------------------------------------------------------------------------------- #12
  test("[E5-B08#12] E5-B08-T22: DELETE oauth: 204 sin cuerpo y con x-trace-id, tokens y sitio borrados, evento DESCONECTAR, sin llamar a Atlassian y sin tocar HDU ni la configuración", async ({ request }) => {
    await guardarConfigBase(request);
    await conectarOauth(request);
    const llamadas = (await atlassianFalso.solicitudes()).solicitudes.length;
    const configuracionAntes = (await sql("SELECT * FROM integraciones.configuracion_jira"))[0];
    const hduAntes = (await sql("SELECT count(*)::int AS n FROM organizacion.historia_usuario"))[0].n;
    const d = await desconectarOauth(request);
    expect(d.status).toBe(204);
    expect(d.body).toBeUndefined();
    expect(d.headers["x-trace-id"]).toBeTruthy();
    expect(await filaConexion()).toBeUndefined();
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "DESCONECTAR"]);
    expect((await atlassianFalso.solicitudes()).solicitudes.length, "no llama a Atlassian").toBe(llamadas);
    expect((await sql("SELECT * FROM integraciones.configuracion_jira"))[0]).toEqual(configuracionAntes);
    expect((await sql("SELECT count(*)::int AS n FROM organizacion.historia_usuario"))[0].n).toBe(hduAntes);
    // GET: «Sin conectar» es oauth null.
    const g = await api.get<any>(request, CONFIG, { token: await tk("adm1") });
    expect(g.body.oauth).toBeNull();
    // Sin conexión que borrar: 409.
    const otra = await desconectarOauth(request);
    expect(otra.status).toBe(409);
    expect(otra.body.codigo).toBe("JIRA_OAUTH_SIN_CONEXION");
    expect(cumpleContrato("Error", otra.body)).toEqual({ ok: true, errores: [] });
    expect(await tiposEventoOauth()).toEqual(["CONECTAR_OAUTH", "DESCONECTAR"]);
  });

  test("[E5-B08#12] E5-B08-T23: la auditoría OAuth es de solo inserción para el servicio (UPDATE, DELETE y TRUNCATE denegados) y no hay llaves foráneas a otro esquema", async ({ request }) => {
    await conectarOauth(request);
    await conIntegraciones(async (c) => {
      for (const sentencia of ["DELETE FROM integraciones.evento_oauth_jira", "UPDATE integraciones.evento_oauth_jira SET actor_nombre = 'x'", "TRUNCATE integraciones.evento_oauth_jira"]) {
        await expect(c.query(sentencia), sentencia).rejects.toThrow(/permission denied|permiso denegado/i);
      }
      await expect(c.query("SELECT 1 FROM organizacion.historia_usuario LIMIT 1")).rejects.toThrow(/permission denied|permiso denegado/i);
      const fk = await c.query(`SELECT conrelid::regclass::text t, confrelid::regclass::text r FROM pg_constraint WHERE contype='f' AND connamespace='integraciones'::regnamespace`);
      for (const f of fk.rows) expect(String(f.r), `FK de ${f.t}`).toMatch(/^(integraciones\.)?(ejecucion_integracion|consulta_jira)$/);
    });
  });

  // ------------------------------------------------------------------------------------------------------------- #13
  test("[E5-B08#13] E5-B08-T24: QE, Analista y Auditor reciben 403 ACCESO_DENEGADO con cuerpo idéntico en las 4 rutas; sin sesión 401; nada cambia", async ({ request }) => {
    for (const { metodo, ruta, cuerpo } of RUTAS_OAUTH) {
      const cuerpos = new Set<string>();
      for (const clave of ["qe1", "ana1", "aud1"] as const) {
        const r: { status: number; body: any } = await api[metodo === "POST" ? "post" : "delete"](request, ruta, { token: await tk(clave), ...(metodo === "POST" ? { body: cuerpo } : {}) } as never);
        expect(r.status, `${clave} ${metodo} ${ruta}`).toBe(403);
        expect(r.body.codigo).toBe("ACCESO_DENEGADO");
        expect(cumpleContrato("Error", r.body)).toEqual({ ok: true, errores: [] });
        cuerpos.add(JSON.stringify({ ...r.body, traceId: "-" }));
      }
      expect(cuerpos.size, `cuerpo idéntico en ${metodo} ${ruta}`).toBe(1);
      const sin = await api[metodo === "POST" ? "post" : "delete"](request, ruta, (metodo === "POST" ? { body: cuerpo } : {}) as never);
      expect(sin.status, `sin sesión ${metodo} ${ruta}`).toBe(401);
      const falso = await api[metodo === "POST" ? "post" : "delete"](request, ruta, { token: "token.inventado.zzz", ...(metodo === "POST" ? { body: cuerpo } : {}) } as never);
      expect(falso.status, `token inventado ${metodo} ${ruta}`).toBe(401);
    }
    expect(await filasEstado(), "ningún state creado").toHaveLength(0);
    expect(await filaConexion()).toBeUndefined();
    expect((await atlassianFalso.solicitudes()).solicitudes).toEqual([]);
    // No existe ninguna ruta de OAuth sin sesión (el retorno llega al portal, no al gateway).
    for (const ruta of [`${OAUTH}/callback`, `${OAUTH}/retorno/publico`, "/v1/integraciones/jira/oauth/code"]) {
      const r = await api.get<any>(request, ruta);
      expect([401, 404], ruta).toContain(r.status);
      expect(r.status).not.toBe(200);
    }
  });

  test("[E5-B08#13] E5-B08-T25: un usuario desactivado con token vigente no usa las rutas de OAuth", async ({ request }) => {
    const adm = await tk("adm1");
    const u = await crearUsuarioE7(request, adm, "ADMINISTRADOR", { prefijo: "b08-t25", conContrasena: true });
    const sesion = await iniciarSesion(u.correo, CONTRASENA);
    expect((await api.post<any>(request, `${OAUTH}/iniciar`, { token: sesion.accessToken })).status).toBe(200);
    await desactivarUsuario(request, adm, u.id);
    for (const { metodo, ruta, cuerpo } of RUTAS_OAUTH) {
      const r: { status: number; body: any } = await api[metodo === "POST" ? "post" : "delete"](request, ruta, { token: sesion.accessToken, ...(metodo === "POST" ? { body: cuerpo } : {}) } as never);
      expect([401, 403], `${metodo} ${ruta}`).toContain(r.status);
    }
  });

  // ------------------------------------------------------------------------------------------------------------- #14
  test("[E5-B08#14] E5-B08-T26: sin fugas: tras conectar, renovar, fallar y desconectar ningún code, state, token ni secreto aparece en respuestas, tablas, eventos ni registros", async ({ request }) => {
    const textos: Array<[string, string]> = [];
    const ini = await iniciarOauth(request);
    textos.push(["iniciar (sin su state)", JSON.stringify(ini.body).replace(stateDe(ini.body.urlAutorizacion), "")]);
    const aut = await atlassianFalso.autorizar(ini.body.urlAutorizacion);
    const ret = await retornoOauth(request, { code: aut.code, state: aut.state });
    textos.push(["retorno", JSON.stringify(ret.body)]);
    // Respuestas de error con el code y el state en el cuerpo: tampoco se repiten.
    const repetido = await retornoOauth(request, { code: aut.code, state: aut.state });
    textos.push(["retorno repetido", JSON.stringify(repetido.body)]);
    await vencerAccesoEnBase();
    textos.push(["probar tras renovar", JSON.stringify((await probarOauth(request)).body)]);
    await atlassianFalso.modo("RENOVACION_INVALID_GRANT");
    await vencerAccesoEnBase();
    textos.push(["probar con invalid_grant", JSON.stringify((await probarOauth(request)).body)]);
    textos.push(["GET configuracion", JSON.stringify((await api.get<any>(request, CONFIG, { token: await tk("adm1") })).body)]);
    await atlassianFalso.modo("NORMAL");
    await conectarOauth(request);
    await atlassianFalso.modo("CANJE_RECHAZADO");
    const c = await conectarOauth(request);
    textos.push(["canje rechazado", JSON.stringify(c.ret.body)]);
    textos.push(["tablas OAuth", await textoDeTablasOauth()]);
    textos.push(["eventos OAuth", JSON.stringify(await eventosOauth())]);
    textos.push(["ejecución y configuración", await textoDeTablasEjecucion()]);
    textos.push(["eventos de configuración", JSON.stringify((await api.get<any>(request, `${CONFIG}/eventos`, { token: await tk("adm1") })).body)]);
    for (const [nombre, texto] of textos) await sinSecretos(nombre, texto);
    // Registros de los servicios (npm run local): la lectura del registro exige que exista, o la afirmación no certifica nada.
    const registro = registroServicios();
    expect(registro.length, "el registro de npm run local existe").toBeGreaterThan(1000);
    await sinSecretos("registros de los servicios", registro);
    expect(registro).not.toMatch(/oauth\/retorno\?|code=[A-Za-z0-9_-]{8,}|"code"\s*:\s*"[^"]{8,}"/);
  });

  test("[E5-B08#14] E5-B08-T27: las únicas llamadas salientes van al Atlassian falso (hosts de prueba) con rutas y cloudid del sitio elegido; ninguna sigue redirecciones ni usa un cloudid sin validar", async ({ request }) => {
    await atlassianFalso.modo("SITIOS_HOSTILES");
    await conectarOauth(request);
    await atlassianFalso.modo("NORMAL");
    await vencerAccesoEnBase();
    await probarOauth(request);
    const sol = (await atlassianFalso.solicitudes()).solicitudes;
    const permitidas = [/^\/oauth\/token$/, /^\/oauth\/token\/accessible-resources$/, new RegExp(`^/ex/jira/${SITIO_A.id}/rest/api/3/(myself|project/[A-Z0-9_]+|field|search/jql)$`)];
    for (const s of sol) {
      if (s.ruta === "/authorize") continue; // lo abre la prueba, no el servicio
      expect(permitidas.some((p) => p.test(s.ruta)), `ruta saliente inesperada: ${s.metodo} ${s.ruta}`).toBe(true);
    }
    // Jira falso: solo recibió peticiones del Atlassian falso (nunca directo del servicio con Bearer).
    expect((await jiraFalso.solicitudes()).every((s) => s.autenticacionValida)).toBe(true);
  });
});
