import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conIntegraciones } from "../support/db";
import { cuerpoSinTrace } from "../support/e7";
import {
  SITIO_CERRADO, SITIO_FALSO, TOKEN_FALSO, URL_I2, URL_I3, URL_I5,
  cadenasSecretas, contieneSecreto, hallazgosDeSecreto, cuerpoConfigBase, cuerpoPrueba, destino, estadoConfigBase, estadoSinConfig, guardarConfigBase, limpiarE5,
  registroServicios, sincronizar, sql, tk,
} from "../support/e5";
import { levantarIntegraciones, llaveAleatoria, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";
import { TOKEN_NUEVO } from "../support/jira-falso/servidor";

/** E5-B01 · Almacenar la configuración de Jira de forma segura (3 escenarios, T01..T12). */
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

const PUT = "/v1/integraciones/jira/configuracion";
const CFG = async () => (await sql("SELECT * FROM integraciones.configuracion_jira"))[0];

test.describe("E5-B01 · Configuración segura de Jira", () => {
  test("[E5-B01#1] T01: el token se guarda cifrado (AES-256-GCM) y nunca vuelve en claro", async ({ request }) => {
    await estadoSinConfig();
    const r = await guardarConfigBase(request);
    expect(r.status).toBe(200);
    expect(r.body.guardado).toBe(true);
    expect(r.body.configuracion.token).toMatchObject({ configurado: true, ultimos4: "AB12" });
    expect(contieneSecreto(JSON.stringify(r.body))).toBeUndefined();
    expect(cumpleContrato("ResultadoGuardadoJira", r.body)).toEqual({ ok: true, errores: [] });
    const fila = await CFG();
    expect(Buffer.from(fila.token_cifrado).toString("utf8")).not.toContain(TOKEN_FALSO);
    expect(Buffer.from(fila.token_cifrado).equals(Buffer.from(TOKEN_FALSO))).toBe(false);
    expect(Buffer.from(fila.token_cifrado).toString("latin1")).not.toContain(TOKEN_FALSO);
    expect(fila.token_iv.length).toBe(12);
    expect(fila.token_tag.length).toBe(16);
    expect(fila.llave_version).toBe(1);
    expect(fila.token_ultimos4).toBe("AB12");
  });

  test("[E5-B01#1] T02: GET no trae token ni cifrado; dos guardados del mismo token producen cifrado e IV distintos", async ({ request }) => {
    await estadoConfigBase(request);
    const g = await api.get(request, PUT, { token: await tk("adm1") });
    expect(g.status).toBe(200);
    expect(cumpleContrato("ConfiguracionJira", g.body)).toEqual({ ok: true, errores: [] });
    const texto = JSON.stringify(g.body);
    expect(texto).not.toMatch(/token_cifrado|tokenCifrado|"iv"|"tag"/);
    expect(contieneSecreto(texto)).toBeUndefined();
    expect(Object.keys(g.body.token).sort()).toEqual(["configurado", "descifrable", "ultimos4"]);
    const a = await CFG();
    expect((await guardarConfigBase(request)).status).toBe(200);
    const b = await CFG();
    expect((await guardarConfigBase(request)).status).toBe(200);
    const c = await CFG();
    expect(Buffer.compare(a.token_cifrado, b.token_cifrado)).not.toBe(0);
    expect(Buffer.compare(b.token_cifrado, c.token_cifrado)).not.toBe(0);
    expect(Buffer.compare(a.token_iv, b.token_iv)).not.toBe(0);
    expect(Buffer.compare(b.token_iv, c.token_iv)).not.toBe(0);
  });

  test.describe("instancias del perfil de QA", () => {
    let i2: InstanciaE5 | undefined;
    let i3: InstanciaE5 | undefined;
    let i5: InstanciaE5 | undefined;
    const llaveB = llaveAleatoria();
    test.afterAll(async () => {
      await Promise.all([i2?.detener(), i3?.detener(), i5?.detener()]);
    });

    test("[E5-B01#1] T03 (negativo): sin INTEGRACIONES_LLAVE_CIFRADO el PUT da 503 LLAVE_CIFRADO_NO_DISPONIBLE, no guarda ni consulta a Jira; /health y las lecturas siguen", async ({ request }) => {
      await estadoSinConfig();
      i2 = await levantarIntegraciones(3104, { INTEGRACIONES_LLAVE_CIFRADO: "" });
      expect((await fetch(`${i2.url}/health`)).status).toBe(200);
      await jiraFalso.limpiarSolicitudes();
      const r = await api.put(request, PUT, { token: await tk("adm1"), body: await cuerpoConfigBase(request), baseURL: URL_I2 });
      expect(r.status).toBe(503);
      expect(r.body.codigo).toBe("LLAVE_CIFRADO_NO_DISPONIBLE");
      expect(r.body.mensaje).toBe("La integración no está habilitada en el servidor.");
      expect(JSON.stringify(r.body)).not.toMatch(/INTEGRACIONES_LLAVE_CIFRADO/);
      expect(await sql("SELECT 1 FROM integraciones.configuracion_jira")).toHaveLength(0);
      expect(await jiraFalso.solicitudes()).toHaveLength(0);
      // Solo cifrar y descifrar fallan: la lectura de la configuración responde 200 e informa que la llave no está.
      const g = await api.get(request, PUT, { token: await tk("adm1"), baseURL: URL_I2 });
      expect(g.status).toBe(200);
      expect(g.body.llaveDisponible).toBe(false);
      expect(g.body.token.descifrable).toBe(false);
      const hist = await api.get(request, "/v1/integraciones/ejecuciones", { token: await tk("adm1"), baseURL: URL_I2 });
      expect(hist.status).toBe(200);
      expect(i2.salida()).not.toContain(TOKEN_FALSO);
    });

    test("[E5-B01#1] T04 (negativo): con otra llave el token no se descifra: 409 TOKEN_NO_DESCIFRABLE en sincronizar y probar, sin llamar a Jira; con la llave A vuelve a funcionar", async ({ request }) => {
      await estadoConfigBase(request);
      i3 = await levantarIntegraciones(3105, { INTEGRACIONES_LLAVE_CIFRADO: llaveB });
      await jiraFalso.limpiarSolicitudes();
      const s = await sincronizar(request, {}, URL_I3);
      const p = await api.post(request, "/v1/integraciones/jira/configuracion/probar", { token: await tk("adm1"), body: {}, baseURL: URL_I3 });
      for (const r of [s, p]) {
        expect(r.status).toBe(409);
        expect(r.body.codigo).toBe("TOKEN_NO_DESCIFRABLE");
        expect(r.body.mensaje).toBe("Vuelve a ingresar el API token.");
        expect(contieneSecreto(JSON.stringify(r.body))).toBeUndefined();
      }
      expect(await jiraFalso.solicitudes()).toHaveLength(0);
      const g = await api.get(request, PUT, { token: await tk("adm1"), baseURL: URL_I3 });
      expect(g.body.token.descifrable).toBe(false);
      const ok = await api.post(request, "/v1/integraciones/jira/configuracion/probar", { token: await tk("adm1"), body: {} });
      expect(ok.status).toBe(200);
      expect(ok.body.ok).toBe(true);
    });

    test("[E5-B01#2] T07 (negativo): el sitio solo puede ser https://<subdominio>.atlassian.net; el host de prueba se acepta en la instancia de pruebas y se rechaza en producción (I5)", async ({ request }) => {
      await estadoSinConfig();
      i5 = await levantarIntegraciones(3107, { NODE_ENV: "production" });
      await jiraFalso.limpiarSolicitudes();
      for (const sitio of ["https://evil.example.com", "http://169.254.169.254", "https://x.atlassian.net.evil.com", "https://usuario@x.atlassian.net"]) {
        const r = await guardarConfigBase(request, { sitio });
        expect(r.status, sitio).toBe(400);
        expect(r.body.codigo).toBe("VALIDACION");
        expect(r.body.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: "sitio", codigo: "VALOR_NO_PERMITIDO" })]));
      }
      expect(await jiraFalso.solicitudes(), "ninguna petición saliente").toHaveLength(0);
      const ok = await guardarConfigBase(request, { sitio: SITIO_FALSO });
      expect(ok.status).toBe(200);
      expect(ok.body.guardado).toBe(true);
      await limpiarE5();
      const prod = await api.put(request, PUT, { token: await tk("adm1"), body: await cuerpoConfigBase(request, { sitio: SITIO_FALSO }), baseURL: URL_I5 });
      expect(prod.status).toBe(400);
      expect(prod.body.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: "sitio", codigo: "VALOR_NO_PERMITIDO" })]));
      expect(await jiraFalso.solicitudes(), "I5 tampoco sale a la red").toHaveLength(0);
    });
  });

  test("[E5-B01#2] T05: probar sin guardar hace exactamente myself y project/QTY con autenticación válida y no cambia la configuración", async ({ request }) => {
    await estadoConfigBase(request);
    const antes = await CFG();
    await jiraFalso.limpiarSolicitudes();
    const r = await api.post(request, "/v1/integraciones/jira/configuracion/probar", { token: await tk("adm1"), body: await cuerpoPrueba(request) });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, usuarioJira: "Admin Jira Falso", proyecto: { clave: "QTY" } });
    expect(cumpleContrato("ResultadoPruebaJira", r.body)).toEqual({ ok: true, errores: [] });
    const llamadas = await jiraFalso.solicitudes();
    expect(llamadas.map((s) => s.ruta)).toEqual(["/rest/api/3/myself", "/rest/api/3/project/QTY"]);
    expect(llamadas.every((s) => s.autenticacionValida)).toBe(true);
    expect(contieneSecreto(JSON.stringify(r.body))).toBeUndefined();
    expect(await CFG()).toEqual(antes);
    expect(await sql("SELECT 1 FROM integraciones.evento_configuracion")).toHaveLength(1); // solo el del guardado base
  });

  test("[E5-B01#2] T06 (negativo): cada falla de Jira se informa con 200 y ok:false con su código fijo, sin credenciales", async ({ request }) => {
    await estadoConfigBase(request);
    const admin = await tk("adm1");
    const base = await cuerpoPrueba(request);
    const casos: Array<{ nombre: string; sobre?: Record<string, unknown>; modo?: Parameters<typeof jiraFalso.modo>[0]; codigo: string; maxMs?: number }> = [
      { nombre: "token malo", sobre: { token: "token-malo-ZZ99" }, codigo: "JIRA_CREDENCIAL_INVALIDA" },
      { nombre: "sitio en puerto cerrado", sobre: { sitio: SITIO_CERRADO }, codigo: "JIRA_SITIO_NO_ENCONTRADO" },
      { nombre: "proyecto inexistente", sobre: { proyecto: "NOEXISTE" }, codigo: "JIRA_PROYECTO_NO_ENCONTRADO" },
      { nombre: "SIN_PERMISO", modo: "SIN_PERMISO", codigo: "JIRA_SIN_PERMISO" },
      { nombre: "429 persistente", modo: "LIMITE_SIEMPRE", codigo: "JIRA_LIMITE_DE_TASA" },
      { nombre: "LENTO", modo: "LENTO", codigo: "JIRA_TIEMPO_AGOTADO", maxMs: 4000 },
      { nombre: "CAIDO", modo: "CAIDO", codigo: "JIRA_NO_DISPONIBLE" },
      { nombre: "RESPUESTA_INVALIDA", modo: "RESPUESTA_INVALIDA", codigo: "JIRA_RESPUESTA_INVALIDA" },
    ];
    const secretos = [...cadenasSecretas("token-malo-ZZ99"), ...cadenasSecretas(), "YWRtaW5"];
    for (const c of casos) {
      await jiraFalso.modo(c.modo ?? "NORMAL");
      const t0 = Date.now();
      const r = await api.post(request, "/v1/integraciones/jira/configuracion/probar", { token: admin, body: { ...base, ...(c.sobre ?? {}) } });
      const ms = Date.now() - t0;
      expect(r.status, c.nombre).toBe(200);
      expect(r.body.ok, c.nombre).toBe(false);
      expect(r.body.error?.codigo, c.nombre).toBe(c.codigo);
      expect(cumpleContrato("ResultadoPruebaJira", r.body), c.nombre).toEqual({ ok: true, errores: [] });
      if (c.maxMs) expect(ms, `${c.nombre} en menos de ${c.maxMs} ms`).toBeLessThan(c.maxMs);
      const texto = JSON.stringify(r.body);
      for (const s of secretos) expect(texto, `${c.nombre} no contiene «${s}»`).not.toContain(s);
    }
    await jiraFalso.modo("NORMAL");
  });

  test("[E5-B01#3] T08 (negativo): QE1, QE2, ANA1, LID1 y AUD1 reciben 403 ACCESO_DENEGADO idéntico en PUT, GET y probar; sin token 401; la configuración no cambia", async ({ request }) => {
    await estadoConfigBase(request);
    const antes = await CFG();
    const cuerpo = await cuerpoConfigBase(request, { proyecto: "BIG" });
    const cuerpoProbar = await cuerpoPrueba(request, { proyecto: "BIG" });
    await jiraFalso.limpiarSolicitudes();
    const cuerpos = new Set<string>();
    for (const clave of ["qe1", "qe2", "ana1", "lid1", "aud1"] as const) {
      const token = await tk(clave);
      const rs = [
        await api.put(request, PUT, { token, body: cuerpo }),
        await api.get(request, PUT, { token }),
        await api.post(request, "/v1/integraciones/jira/configuracion/probar", { token, body: cuerpoProbar }),
      ];
      for (const r of rs) {
        expect(r.status, clave).toBe(403);
        expect(r.body.codigo).toBe("ACCESO_DENEGADO");
        cuerpos.add(cuerpoSinTrace(r));
      }
    }
    expect(cuerpos.size, "cuerpo idéntico en las 15 combinaciones").toBe(1);
    for (const r of [await api.put(request, PUT, { body: cuerpo }), await api.get(request, PUT), await api.post(request, "/v1/integraciones/jira/configuracion/probar", { body: cuerpo })]) {
      expect(r.status).toBe(401);
      expect(r.body.codigo).toBe("NO_AUTENTICADO");
    }
    expect(await CFG()).toEqual(antes);
    expect(await jiraFalso.solicitudes()).toHaveLength(0);
  });

  test("[E5-B01#1] T09 (negativo): validaciones de formato y de destino (400 VALIDACION con campo, 422 CATALOGO_INVALIDO y QE_INVALIDO); el último caso válido usa los tipos por defecto", async ({ request }) => {
    await estadoSinConfig();
    const d = await destino(request);
    const idDe = async (correo: string) => (await sql<{ id_usuario: string }>("SELECT id_usuario FROM organizacion.usuario WHERE email = $1", [correo]))[0].id_usuario;
    const uuidInexistente = "00000000-0000-4000-8000-000000000001";
    const grupos: Array<{ nombre: string; sobre: Record<string, unknown>; status: number; codigo: string; campo?: string }> = [
      { nombre: "célula inexistente", sobre: { celulaId: uuidInexistente }, status: 422, codigo: "CATALOGO_INVALIDO" },
      { nombre: "sprint inexistente", sobre: { sprintRespaldoId: uuidInexistente }, status: 422, codigo: "CATALOGO_INVALIDO" },
      { nombre: "QE que es ANA1", sobre: { qeResponsableId: await idDe("ana1@quality360.local") }, status: 422, codigo: "QE_INVALIDO" },
      { nombre: "QE desactivado (INACT1)", sobre: { qeResponsableId: await idDe("inact1@quality360.local") }, status: 422, codigo: "QE_INVALIDO" },
      { nombre: "correo sin arroba", sobre: { correo: "sin-arroba" }, status: 400, codigo: "VALIDACION", campo: "correo" },
      { nombre: "proyecto en minúsculas", sobre: { proyecto: "qty" }, status: 400, codigo: "VALIDACION", campo: "proyecto" },
      { nombre: "token de 3 caracteres", sobre: { token: "abc" }, status: 400, codigo: "VALIDACION", campo: "token" },
    ];
    for (const g of grupos) {
      const r = await guardarConfigBase(request, g.sobre);
      expect(r.status, g.nombre).toBe(g.status);
      expect(r.body.codigo, g.nombre).toBe(g.codigo);
      if (g.campo) expect(r.body.detalles.map((x: any) => x.campo), g.nombre).toContain(g.campo);
    }
    expect(await sql("SELECT 1 FROM integraciones.configuracion_jira"), "nada se guardó").toHaveLength(0);
    // Sprint de respaldo de otra célula: D120.
    const otroSprint = await sql<{ id_sprint: string }>("SELECT id_sprint FROM organizacion.sprint WHERE id_celula <> $1 LIMIT 1", [d.celulaId]);
    if (otroSprint[0]) {
      const r = await guardarConfigBase(request, { sprintRespaldoId: otroSprint[0].id_sprint });
      expect(r.status).toBe(422);
      expect(r.body.codigo).toBe("CATALOGO_INVALIDO");
    }
    const { tiposIssue: _t, ...sinTipos } = await cuerpoConfigBase(request);
    const ok = await api.put(request, PUT, { token: await tk("adm1"), body: sinTipos });
    expect(ok.status).toBe(200);
    expect(ok.body.configuracion.tiposIssue).toEqual(["Story", "Historia"]);
    expect((await CFG()).tipos_issue).toBe("Story,Historia");
  });

  test("[E5-B01#1] T10: tres eventos de configuración con actor y fecha; tokenCambiado solo en el cambio de token; ningún evento trae el token", async ({ request }) => {
    await estadoSinConfig();
    const d = await destino(request);
    expect((await guardarConfigBase(request)).status).toBe(200);
    const { token: _t, ...sinToken } = await cuerpoConfigBase(request, { celulaId: d.celulaId });
    // Solo cambia un campo (tipos) sin enviar token.
    expect((await api.put(request, PUT, { token: await tk("adm1"), body: { ...sinToken, tiposIssue: ["Story"] } })).status).toBe(200);
    expect((await guardarConfigBase(request, { token: TOKEN_NUEVO })).status).toBe(200);
    const ev = await api.get<any>(request, "/v1/integraciones/jira/configuracion/eventos", { token: await tk("adm1") });
    expect(ev.status).toBe(200);
    expect(cumpleContrato("PaginaEventosConfiguracionJira", ev.body)).toEqual({ ok: true, errores: [] });
    expect(ev.body.items).toHaveLength(3);
    const [nuevo, medio, primero] = ev.body.items;
    for (const e of ev.body.items) {
      expect(e.actor.nombre).toContain("ADM1");
      expect(e.fecha).toBeTruthy();
    }
    expect(primero.tokenCambiado).toBe(true);
    expect(medio.tokenCambiado).toBe(false);
    expect(medio.camposCambiados).toEqual(["tiposIssue"]);
    expect(nuevo.tokenCambiado).toBe(true);
    const texto = JSON.stringify(ev.body);
    expect(texto).not.toContain(TOKEN_FALSO);
    expect(texto).not.toContain(TOKEN_NUEVO);
    expect((await CFG()).token_ultimos4).toBe("CD34");
  });

  test("[E5-B01#1] T11: ni la salida de los servicios ni sus instancias adicionales contienen el token, Authorization, Basic ni el correo codificado", async () => {
    const registro = registroServicios();
    expect(registro.length, "el registro de npm run local existe").toBeGreaterThan(1000);
    // El gateway nombra la cabecera ausente («sin cabecera Authorization Bearer», sin valor): no es un secreto (ver hallazgosDeSecreto).
    expect(hallazgosDeSecreto(registro)).toEqual([]);
  });

  test("[E5-B01#3] T12: con svc_integraciones no hay llaves foráneas a otro esquema, otro esquema es ilegible y evento_configuracion es de solo inserción", async () => {
    await conIntegraciones(async (c) => {
      const fk = await c.query(
        `SELECT conrelid::regclass::text t, confrelid::regclass::text r FROM pg_constraint WHERE contype='f' AND connamespace='integraciones'::regnamespace`,
      );
      for (const f of fk.rows) expect(String(f.r), `FK de ${f.t}`).toMatch(/^(integraciones\.)?(ejecucion_integracion)$/);
      const otras = await c.query(`SELECT 1 FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text LIKE 'integraciones.%' AND confrelid::regclass::text NOT LIKE 'integraciones.%' AND confrelid::regclass::text NOT IN ('ejecucion_integracion')`);
      expect(otras.rows).toHaveLength(0);
      await expect(c.query("SELECT 1 FROM organizacion.historia_usuario LIMIT 1")).rejects.toThrow(/permission denied|permiso denegado/i);
      await expect(c.query("DELETE FROM integraciones.evento_configuracion")).rejects.toThrow(/permission denied|permiso denegado/i);
      await expect(c.query("UPDATE integraciones.evento_configuracion SET actor_nombre = 'x'")).rejects.toThrow(/permission denied|permiso denegado/i);
    });
  });
});
