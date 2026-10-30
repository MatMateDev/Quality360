import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { env } from "../support/env";
import {
  hallazgosDeSecreto, URL_I4, cadenasSecretas, contieneSecreto, destino, detalleEjecucion, ejecuciones, estadoConfigBase, guardarConfigBase, hduPorCodigo, limpiarE5,
  registroServicios, sincronizar, sincronizarOk, sql, tk, TOKEN_FALSO, SITIO_CERRADO,
} from "../support/e5";
import { levantarIntegraciones, proxyOrganizacion, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";

/** E5-B02 · Consumir la API REST de Jira y mapear issues a HDU (3 escenarios, T01..T13). */
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

const SYNC = "/v1/integraciones/jira/sincronizaciones";
const hduDb = (codigo: string) => sql("SELECT * FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo]);

test.describe("E5-B02 · Sincronización con Jira", () => {
  test("[E5-B02#1] T01: la primera sincronización de QTY lee 11, crea 10 con 1 error y la consulta usa solo el proyecto y los tipos configurados", async ({ request }) => {
    await estadoConfigBase(request);
    const e = await sincronizarOk(request);
    expect(e).toMatchObject({ leidas: 11, creadas: 10, actualizadas: 0, omitidas: 0, conError: 1, conAdvertencias: 5, resultado: "CON_ERRORES", origen: "JIRA" });
    expect(cumpleContrato("Ejecucion", e)).toEqual({ ok: true, errores: [] });
    const busquedas = (await jiraFalso.solicitudes()).filter((s) => s.ruta === "/rest/api/3/search/jql");
    expect(busquedas.length).toBeGreaterThan(0);
    const jql = busquedas[0].consulta.jql;
    expect(jql).toContain("project = QTY");
    expect(jql).toMatch(/issuetype in \("Story", "Historia"\)/);
    expect(jql).toContain("ORDER BY key ASC");
    expect(jql).not.toContain("QTY-7");
    const h = await hduPorCodigo(request, "QTY-1");
    const c = await destino(request);
    expect(h).toMatchObject({ codigo: "QTY-1", titulo: "Login con doble factor", prioridad: "ALTA", estado: "PENDIENTE", origen: "JIRA", descripcion: "Como usuario quiero activar 2FA" });
    expect(h.analista).toBeNull();
    expect(h.celula.nombre).toBe("CEL-C");
    expect(h.qeResponsable.id).toBe(c.qeId);
    expect(h.creadoPor?.nombre ?? h.creadoPor?.id).toBeTruthy();
    expect(JSON.stringify(h)).toContain("E5 Sprint 2");
    const db = (await hduDb("QTY-1"))[0];
    const adm = (await sql("SELECT id_usuario FROM organizacion.usuario WHERE email = 'adm1@quality360.local'"))[0].id_usuario;
    expect(db.creado_por_id ?? db.creado_por).toBe(adm);
  });

  test("[E5-B02#1] T02: el mapeo de prioridad, sprint y truncados de QTY-3, 4, 5, 6, 8, 9, 10 y 12 y sus advertencias", async ({ request }) => {
    await estadoConfigBase(request);
    const e = await sincronizarOk(request);
    const c = await destino(request);
    const prio: Record<string, string> = { "QTY-3": "CRITICA", "QTY-4": "BAJA", "QTY-5": "MEDIA", "QTY-6": "MEDIA", "QTY-10": "BAJA", "QTY-12": "MEDIA" };
    for (const [k, p] of Object.entries(prio)) expect((await hduPorCodigo(request, k)).prioridad, k).toBe(p);
    expect(JSON.stringify(await hduPorCodigo(request, "QTY-3"))).toContain("E5 Sprint 1");
    expect(JSON.stringify(await hduPorCodigo(request, "QTY-12"))).toContain("E5 Sprint 1");
    expect(JSON.stringify(await hduPorCodigo(request, "QTY-2"))).toContain("E5 Sprint 1");
    expect((await hduPorCodigo(request, "QTY-8")).titulo).toHaveLength(200);
    expect((await hduPorCodigo(request, "QTY-9")).descripcion).toHaveLength(1000);
    expect(c.sprint1Id).toBeTruthy();
    const filas = (await detalleEjecucion(request, e.id)).body.items as Array<{ codigo: string; advertencias: string[] }>;
    const adv = (k: string) => filas.find((f) => f.codigo === k)?.advertencias ?? [];
    expect(adv("QTY-3")).toContain("SPRINT_NO_ENCONTRADO");
    expect(adv("QTY-5")).toContain("PRIORIDAD_AUSENTE");
    expect(adv("QTY-6")).toContain("PRIORIDAD_DESCONOCIDA");
    expect(adv("QTY-8")).toContain("TITULO_TRUNCADO");
    expect(adv("QTY-9")).toContain("DESCRIPCION_TRUNCADA");
    expect(filas.filter((f) => f.advertencias.length > 0)).toHaveLength(5);
  });

  test("[E5-B02#1] T03: la descripción ADF se convierte a texto plano (títulos, viñetas, mención, enlace; nodo desconocido ignorado)", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.issue("QTY-13", {
      tipo: "Story", summary: "Historia con ADF rico", priority: "Medium",
      description: {
        type: "doc", version: 1,
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Objetivo" }] },
          { type: "paragraph", content: [{ type: "text", text: "Avisar a " }, { type: "mention", attrs: { id: "42", text: "@Ana Mención" } }, { type: "text", text: " y ver " }, { type: "text", text: "este enlace", marks: [{ type: "link", attrs: { href: "https://example.com/oculto" } }] }] },
          { type: "bulletList", content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Primer punto" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Segundo punto" }] }] },
          ] },
          { type: "widgetDesconocido", content: [{ type: "text", text: "TEXTO-DE-NODO-DESCONOCIDO" }] },
        ],
      },
    });
    await sincronizarOk(request);
    const d: string = (await hduPorCodigo(request, "QTY-13")).descripcion;
    expect(d).toContain("Objetivo");
    expect(d).toContain("\n");
    expect(d).toMatch(/- Primer punto\s*\n- Segundo punto/);
    expect(d).toContain("Ana Mención");
    expect(d).toContain("este enlace");
    expect(d).not.toContain("TEXTO-DE-NODO-DESCONOCIDO");
    expect(d).not.toMatch(/[<>{}]|"type"|paragraph|doc/);
  });

  test("[E5-B02#1] T04 (negativo): QTY-11 sin título es una fila con error y no aborta; el Bug QTY-7 no se lee", async ({ request }) => {
    await estadoConfigBase(request);
    const e = await sincronizarOk(request);
    const filas = (await detalleEjecucion(request, e.id)).body.items as Array<{ codigo: string; resultado: string; motivo: string | null }>;
    expect(filas.find((f) => f.codigo === "QTY-11")).toMatchObject({ resultado: "ERROR", motivo: "TITULO_VACIO" });
    expect(await hduDb("QTY-11")).toHaveLength(0);
    expect(filas.filter((f) => f.resultado === "CREADA")).toHaveLength(10);
    expect(await hduDb("QTY-7")).toHaveLength(0);
    expect(filas.find((f) => f.codigo === "QTY-7")).toBeUndefined();
  });

  test("[E5-B02#2] T05: BIG (230) en 3 ejecuciones con continuarDesde: 100, 100 y 30 sin duplicados y paginación de a 50 con nextPageToken", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    await jiraFalso.limpiarSolicitudes();
    const e1 = await sincronizarOk(request);
    expect(e1).toMatchObject({ leidas: 100, creadas: 100, resultado: "INCOMPLETA", hayMas: true, continuarDesde: "BIG-100" });
    const b1 = (await jiraFalso.solicitudes()).filter((s) => s.ruta === "/rest/api/3/search/jql");
    expect(b1).toHaveLength(2);
    expect(b1[0].consulta.maxResults).toBe("50");
    expect(b1[0].consulta.nextPageToken).toBeUndefined();
    expect(b1[1].consulta.nextPageToken).toBeTruthy();
    const est = await api.get<any>(request, "/v1/integraciones/estado", { token: await tk("adm1") });
    expect(est.body.continuar).toMatchObject({ desde: "BIG-100", ejecucionId: e1.id });
    const e2 = await sincronizarOk(request, { continuarDesde: e1.continuarDesde });
    expect(e2).toMatchObject({ leidas: 100, creadas: 100, resultado: "INCOMPLETA", hayMas: true, continuarDesde: "BIG-200" });
    const busq2 = (await jiraFalso.solicitudes()).filter((s) => s.ruta === "/rest/api/3/search/jql").at(-2)!;
    expect(busq2.consulta.jql).toContain('key > "BIG-100"');
    const e3 = await sincronizarOk(request, { continuarDesde: e2.continuarDesde });
    expect(e3).toMatchObject({ leidas: 30, creadas: 30, resultado: "EXITOSA", hayMas: false });
    expect(e3.continuarDesde).toBeNull();
    expect(await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'")).toEqual([{ n: 230, d: 230 }]);
  });

  test("[E5-B02#2] T06: EXACTO (100) no inventa una continuación y VACIO (0) termina exitosa con todo en 0", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "EXACTO" })).body.guardado).toBe(true);
    const ex = await sincronizarOk(request);
    expect(ex).toMatchObject({ leidas: 100, creadas: 100, resultado: "EXITOSA", hayMas: false });
    expect((await guardarConfigBase(request, { proyecto: "VACIO" })).body.guardado).toBe(true);
    const va = await sincronizarOk(request);
    expect(va).toMatchObject({ leidas: 0, creadas: 0, actualizadas: 0, omitidas: 0, conError: 0, resultado: "EXITOSA", hayMas: false });
  });

  test("[E5-B02#3] T07: con 429 en las 2 primeras búsquedas se reintenta 2 veces con espera de 1 s y se registran los eventos", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.modo("LIMITE");
    const t0 = Date.now();
    const e = await sincronizarOk(request);
    const ms = Date.now() - t0;
    expect(e).toMatchObject({ creadas: 10, reintentos429: 2 });
    expect(e.eventos).toHaveLength(2);
    for (const ev of e.eventos) expect(ev).toMatchObject({ tipo: "JIRA_LIMITE_DE_TASA", esperaMs: 1000 });
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(e.duracionMs).toBeGreaterThanOrEqual(2000);
  });

  test("[E5-B02#3] T08 (negativo): 429 persistente en la página 2 deja INCOMPLETA con lo procesado y al continuar termina sin duplicados", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    await jiraFalso.modo("LIMITE_PAGINA_2");
    const e = await sincronizarOk(request);
    expect(e).toMatchObject({ resultado: "INCOMPLETA", codigoError: "JIRA_LIMITE_DE_TASA", creadas: 50, hayMas: true, continuarDesde: "BIG-50" });
    expect(e.mensajeError).toBe("Jira pidió esperar demasiado. Reintenta en unos minutos.");
    await jiraFalso.modo("NORMAL");
    let ult = e;
    for (let i = 0; i < 4 && ult.hayMas; i += 1) ult = await sincronizarOk(request, { continuarDesde: ult.continuarDesde });
    expect(ult.resultado).toBe("EXITOSA");
    expect(await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'")).toEqual([{ n: 230, d: 230 }]);
  });

  test("[E5-B02#1] T09 (negativo): con Jira LENTO la sincronización es FALLIDA por JIRA_TIEMPO_AGOTADO en menos de 4 s, sin HDU y registrada", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.modo("LENTO");
    const t0 = Date.now();
    const e = await sincronizarOk(request);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(e).toMatchObject({ resultado: "FALLIDA", codigoError: "JIRA_TIEMPO_AGOTADO", leidas: 0 });
    expect(await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE origen <> 'MANUAL'")).toEqual([{ n: 0 }]);
    expect((await ejecuciones(request)).body.items).toHaveLength(1);
  });

  test("[E5-B02#3] T10 (negativo): TOKEN_REVOCADO, SIN_PERMISO, RESPUESTA_INVALIDA, CAIDO y sitio cerrado dejan FALLIDA con el código y el mensaje fijos, sin repetir el token", async ({ request }) => {
    await estadoConfigBase(request);
    const casos: Array<{ modo: Parameters<typeof jiraFalso.modo>[0]; codigo: string; mensaje: string }> = [
      { modo: "TOKEN_REVOCADO", codigo: "JIRA_CREDENCIAL_INVALIDA", mensaje: "Jira rechazó el correo o el API token. Revisa la conexión." },
      { modo: "SIN_PERMISO", codigo: "JIRA_SIN_PERMISO", mensaje: "La cuenta de Jira no tiene permiso para leer este proyecto." },
      { modo: "RESPUESTA_INVALIDA", codigo: "JIRA_RESPUESTA_INVALIDA", mensaje: "Jira respondió algo que no entendimos." },
      { modo: "CAIDO", codigo: "JIRA_NO_DISPONIBLE", mensaje: "Jira no está disponible por ahora." },
    ];
    for (const c of casos) {
      await jiraFalso.modo(c.modo);
      const e = await sincronizarOk(request);
      expect(e, c.codigo).toMatchObject({ resultado: "FALLIDA", codigoError: c.codigo, mensajeError: c.mensaje, leidas: 0 });
      expect(contieneSecreto(JSON.stringify(e)), c.codigo).toBeUndefined();
      expect(cumpleContrato("Ejecucion", e)).toEqual({ ok: true, errores: [] });
    }
    await jiraFalso.modo("NORMAL");
    // Sitio en puerto cerrado: se guarda en la base con el dueño para no pasar por la prueba de conexión.
    await sql("UPDATE integraciones.configuracion_jira SET sitio_url = $1", [SITIO_CERRADO]);
    const e = await sincronizarOk(request);
    expect(e).toMatchObject({ resultado: "FALLIDA", codigoError: "JIRA_SITIO_NO_ENCONTRADO", mensajeError: "No pudimos conectar con ese sitio de Jira. Revisa la dirección." });
    expect((await ejecuciones(request)).body.total).toBe(5);
  });

  test("[E5-B02#1] T11 (negativo): QE1, QE2, ANA1, LID1 y AUD1 reciben 403; sin token 401; sin configuración 409 JIRA_NO_CONFIGURADO; no se registran ejecuciones ni se llama a Jira", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.limpiarSolicitudes();
    for (const clave of ["qe1", "qe2", "ana1", "lid1", "aud1"] as const) {
      const r = await api.post(request, SYNC, { token: await tk(clave), body: {} });
      expect(r.status, clave).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
    const sin = await api.post(request, SYNC, { body: {} });
    expect(sin.status).toBe(401);
    expect(sin.body.codigo).toBe("NO_AUTENTICADO");
    expect(await jiraFalso.solicitudes()).toHaveLength(0);
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
    await limpiarE5();
    const s = await sincronizar(request);
    expect(s.status).toBe(409);
    expect(s.body.codigo).toBe("JIRA_NO_CONFIGURADO");
    expect(s.body.mensaje).toBe("Configura la conexión con Jira antes de sincronizar.");
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
    expect(await jiraFalso.solicitudes()).toHaveLength(0);
  });

  test.describe("instancias del perfil de QA", () => {
    let i4: InstanciaE5 | undefined;
    let i6: InstanciaE5 | undefined;
    let proxy: Awaited<ReturnType<typeof proxyOrganizacion>> | undefined;
    test.afterAll(async () => {
      await Promise.all([i4?.detener(), i6?.detener(), proxy?.cerrar()]);
    });

    test("[E5-B02#2] T12: con presupuesto de 2.500 ms y Jira a 1 s por página, BIG termina INCOMPLETA por PRESUPUESTO_DE_TIEMPO en menos de 3,5 s con lo procesado registrado", async ({ request }) => {
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      i4 = await levantarIntegraciones(3106, { INTEGRACIONES_PRESUPUESTO_MS: "2500" });
      await jiraFalso.modo("RETARDO_1S");
      const r = await sincronizar(request, {}, URL_I4);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ resultado: "INCOMPLETA", codigoError: "PRESUPUESTO_DE_TIEMPO", hayMas: true });
      expect(r.body.duracionMs).toBeLessThanOrEqual(3500);
      expect(r.body.creadas).toBeGreaterThan(0);
      const creadas = await sql<{ n: number }>("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'");
      expect(creadas[0].n).toBe(r.body.creadas);
      const det = await detalleEjecucion(request, r.body.id);
      expect(det.body.total).toBe(r.body.leidas);
      expect(r.body.mensajeError).toBe("Se alcanzó el tiempo máximo. Continúa para procesar el resto.");
    });

    test("[E5-B02#1] T13 (negativo): con Organización caída antes de empezar da 503 SERVICIO_NO_DISPONIBLE sin ejecución ni llamadas a Jira; si cae tras el primer lote queda INCOMPLETA/FALLIDA con ORGANIZACION_NO_DISPONIBLE", async ({ request }) => {
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      // Antes de empezar: la instancia apunta a un puerto sin servicio.
      i6 = await levantarIntegraciones(3108, { ORGANIZACION_URL: "http://127.0.0.1:3199" });
      await jiraFalso.limpiarSolicitudes();
      const antes = await sincronizar(request, {}, "http://localhost:3108");
      expect(antes.status).toBe(503);
      expect(antes.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
      expect(await jiraFalso.solicitudes()).toHaveLength(0);
      expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
      await i6.detener();
      // Durante: un proxy que atiende el primer lote y corta el resto.
      proxy = await proxyOrganizacion(env.organizacionUrl, 3199, 1);
      i6 = await levantarIntegraciones(3108, { ORGANIZACION_URL: proxy.url });
      const r = await sincronizar(request, {}, "http://localhost:3108");
      expect(r.status).toBe(200);
      expect(["INCOMPLETA", "FALLIDA"]).toContain(r.body.resultado);
      expect(r.body.codigoError).toBe("ORGANIZACION_NO_DISPONIBLE");
      expect(r.body.mensajeError).toBe("No pudimos guardar las HDU en este momento.");
      expect(r.body.creadas).toBeGreaterThanOrEqual(25);
      // `sitioHost` es el host de Jira (dato legítimo): se revisan solo el mensaje y las sugerencias.
      expect(`${r.body.mensajeError} ${JSON.stringify(r.body.sugerencias)}`).not.toMatch(/127\.0\.0\.1|localhost|3199|ECONNRESET|socket hang up|\bat \w+/);
      expect(r.body.sugerencias).not.toContain("IMPORTAR_ARCHIVO");
      const registro = registroServicios() + i6.salida();
      expect(hallazgosDeSecreto(registro)).toEqual([]);
    });
  });
});
