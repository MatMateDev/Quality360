import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { env } from "../support/env";
import {
  CONSULTAS, actual, asignarYMarcar, consultar, consultarOk, continuar, editar, items, pares, todasLasFilas,
} from "../support/e5c";
import {
  contieneSecreto, ejecuciones, estadoConfigBase, guardarConfigBase, limpiarE5, registroServicios, hallazgosDeSecreto, sql, tk, SITIO_CERRADO, URL_I4,
} from "../support/e5";
import { levantarIntegraciones, proxyCortaRuta, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";

/** E5-B02 · Consultar Jira y guardar la consulta (reescrita: 4 escenarios, T01..T14). Ninguna prueba debe crear HDU. */
test.describe.configure({ mode: "default" });
test.afterAll(async () => {
  await limpiarE5();
});

const adfTexto = (...t: string[]) => ({ type: "doc", version: 1, content: t.map((x) => ({ type: "paragraph", content: [{ type: "text", text: x }] })) });
const hduDeJira = () => sql<{ n: number }>("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE origen <> 'MANUAL'");

test.describe("E5-B02 · Consultar Jira", () => {
  test("[E5-B02#1] T01: la primera consulta de QTY guarda 11 filas (10 nuevas, 1 con error) con ABIERTA/version 1, usa solo el proyecto y los tipos configurados y no crea HDU", async ({ request }) => {
    await estadoConfigBase(request);
    const totalAntes = (await sql<{ n: number }>("SELECT count(*)::int n FROM organizacion.historia_usuario"))[0].n;
    const auditoriaAntes = (await sql<{ n: number }>("SELECT count(*)::int n FROM organizacion.auditoria WHERE entidad = 'HDU'"))[0].n;
    const r = await consultar(request);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.consulta).toMatchObject({ estado: "ABIERTA", version: 1 });
    expect(r.body.consulta.venceEn).toBeTruthy();
    expect(r.body.ejecucion).toMatchObject({ fase: "CONSULTA", leidas: 11, nuevas: 10, cambiaron: 0, sinCambios: 0, conError: 1, conAdvertencias: 4, resultado: "CON_ERRORES", creadas: 0, actualizadas: 0, omitidas: 0 });
    expect(cumpleContrato("ResultadoConsultaJira", r.body)).toEqual({ ok: true, errores: [] });
    const busquedas = (await jiraFalso.solicitudes()).filter((s) => s.ruta === "/rest/api/3/search/jql");
    expect(busquedas.length).toBeGreaterThan(0);
    const jql = busquedas[0].consulta.jql;
    expect(jql).toContain("project = QTY");
    expect(jql).toMatch(/issuetype in \("Story", "Historia"\)/);
    expect(jql).not.toContain("QTY-7");
    expect(Date.parse(r.body.consulta.venceEn) - Date.parse(r.body.consulta.creadaEn)).toBeGreaterThan(23.9 * 3600_000);
    expect(Date.parse(r.body.consulta.venceEn) - Date.parse(r.body.consulta.creadaEn)).toBeLessThan(24.1 * 3600_000);
    const hdu = await api.get<any>(request, "/v1/hdu?tamanoPagina=1", { token: await tk("adm1") });
    expect(hdu.body.total).toBe(totalAntes);
    expect((await sql<{ n: number }>("SELECT count(*)::int n FROM organizacion.auditoria WHERE entidad = 'HDU'"))[0].n).toBe(auditoriaAntes);
    expect(await hduDeJira()).toEqual([{ n: 0 }]);
  });

  test("[E5-B02#1] T02: el mapeo de QTY-1, 3, 4, 5, 6, 8, 9 y 12 (prioridad, sprint de Jira, referencia y truncados con su advertencia)", async ({ request }) => {
    await estadoConfigBase(request);
    const c = (await consultarOk(request)).consulta;
    const filas = await todasLasFilas(request, c.id, "NUEVA");
    expect(filas).toHaveLength(10);
    const por = (k: string) => filas.find((f) => f.codigo === k);
    expect(por("QTY-1")).toMatchObject({
      titulo: "Login con doble factor", prioridad: "ALTA", sprintJira: "E5 Sprint 2", descripcion: "Como usuario quiero activar 2FA", asignacion: { celula: null, qeResponsable: null, analista: null, sprint: null, sprintOrigen: null }, marcada: false, completa: false, grupo: "NUEVA",
    });
    expect(por("QTY-1").referencia).toMatchObject({ estado: expect.any(String), responsable: expect.any(String) });
    expect(por("QTY-3").prioridad).toBe("CRITICA");
    expect(por("QTY-4").prioridad).toBe("BAJA");
    expect(por("QTY-5").prioridad).toBeNull(); // la fila guarda null: una prioridad ausente no es un cambio (D136); la HDU nace MEDIA (T05 de B05)
    expect(por("QTY-5").advertencias).toContain("PRIORIDAD_AUSENTE");
    expect(por("QTY-6").prioridad).toBeNull();
    expect(por("QTY-6").advertencias).toContain("PRIORIDAD_DESCONOCIDA");
    expect(por("QTY-8").titulo).toHaveLength(200);
    expect(por("QTY-8").advertencias).toContain("TITULO_TRUNCADO");
    expect(por("QTY-9").descripcion).toHaveLength(1000);
    expect(por("QTY-9").advertencias).toContain("DESCRIPCION_TRUNCADA");
    expect(por("QTY-12").sprintJira).toBe("E5 Sprint 1");
    // SPRINT_NO_ENCONTRADO ya no se calcula al consultar (D136): depende de la célula.
    for (const f of filas) expect(f.advertencias, f.codigo).not.toContain("SPRINT_NO_ENCONTRADO");
    expect(cumpleContrato("PaginaItemsConsulta", { items: filas, total: 10, pagina: 1, tamanoPagina: 100, version: 1 })).toEqual({ ok: true, errores: [] });
  });

  test("[E5-B02#1] T03: la descripción ADF (títulos, viñetas, mención, enlace, nodo desconocido) se guarda como texto plano", async ({ request }) => {
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
          { type: "nodoDesconocidoXYZ", content: [{ type: "text", text: "NO DEBE APARECER" }] },
        ],
      },
    });
    const c = (await consultarOk(request)).consulta;
    const d = (await todasLasFilas(request, c.id, "NUEVA")).find((f) => f.codigo === "QTY-13")?.descripcion as string;
    expect(d).toContain("Objetivo");
    expect(d).toContain("Ana Mención");
    expect(d).toContain("este enlace");
    expect(d).toMatch(/^- Primer punto$/m);
    expect(d).toMatch(/^- Segundo punto$/m);
    expect(d).toContain("\n");
    expect(d).not.toContain("NO DEBE APARECER");
    expect(d).not.toContain("<");
    expect(d).not.toContain("example.com/oculto");
  });

  test("[E5-B02#1] T15 (datos borde del diseño §13): QTY-15 con título de 200 caracteres sin espacios, descripción de 1.000 y sprint de 80 caracteres se guarda íntegra, sin truncar ni advertir", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.issue("QTY-15", { tipo: "Story", summary: "T".repeat(200), description: adfTexto("D".repeat(1000)), priority: "High", sprints: [{ name: "S".repeat(80), state: "active", endDate: "2099-01-01T00:00:00.000Z" }] });
    const c = (await consultarOk(request)).consulta;
    const f = (await todasLasFilas(request, c.id, "NUEVA")).find((x) => x.codigo === "QTY-15");
    expect(f.titulo).toBe("T".repeat(200));
    expect(f.descripcion).toBe("D".repeat(1000));
    expect(f.sprintJira).toBe("S".repeat(80));
    expect(f.advertencias).not.toContain("TITULO_TRUNCADO");
    expect(f.advertencias).not.toContain("DESCRIPCION_TRUNCADA");
  });

  test("[E5-B02#1] T04 (negativo): QTY-11 queda en CON_ERROR/TITULO_VACIO sin poder marcarse; las otras 10 se guardaron y QTY-7 (Bug) no figura en ningún grupo", async ({ request }) => {
    await estadoConfigBase(request);
    const c = (await consultarOk(request)).consulta;
    const err = (await items(request, c.id, "CON_ERROR")).body;
    expect(err.items).toHaveLength(1);
    expect(err.items[0]).toMatchObject({ codigo: "QTY-11", grupo: "CON_ERROR", motivo: "TITULO_VACIO", marcable: false, marcada: false });
    for (const g of ["NUEVA", "CAMBIO", "SIN_CAMBIOS", "CON_ERROR"]) {
      const todas = await todasLasFilas(request, c.id, g);
      expect(todas.map((f) => f.codigo), g).not.toContain("QTY-7");
    }
    expect((await items(request, c.id, "NUEVA")).body.total).toBe(10);
    const marca = await editar(request, c.id, { itemIds: [err.items[0].id], marcada: true });
    expect(marca.status).toBe(422);
    expect(marca.body.codigo).toBe("FILA_NO_MARCABLE");
  });

  test("[E5-B02#2] T05: BIG (230) en 3 tandas acumula en la misma consulta sin duplicar (100, 100, 30), con 3 ejecuciones CONSULTA", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    await jiraFalso.limpiarSolicitudes();
    const a = await consultar(request);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.ejecucion).toMatchObject({ fase: "CONSULTA", leidas: 100, resultado: "INCOMPLETA", hayMas: true, continuarDesde: "BIG-100" });
    const peticiones = (await jiraFalso.solicitudes()).filter((s) => s.ruta === "/rest/api/3/search/jql");
    expect(peticiones).toHaveLength(2);
    expect(a.body.consulta.hayMas).toBe(true);
    const id = a.body.consulta.id as string;
    const b = await continuar(request, id);
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(b.body.consulta.id).toBe(id);
    expect(b.body.ejecucion).toMatchObject({ leidas: 100, resultado: "INCOMPLETA", hayMas: true });
    expect(b.body.consulta.leidas).toBe(200);
    const c = await continuar(request, id);
    expect(c.body.ejecucion).toMatchObject({ leidas: 30, resultado: "EXITOSA", hayMas: false });
    expect(c.body.consulta).toMatchObject({ id, leidas: 230, nuevas: 230, hayMas: false, estado: "ABIERTA" });
    const filas = await todasLasFilas(request, id, "NUEVA");
    expect(filas).toHaveLength(230);
    expect(new Set(filas.map((f) => f.codigo)).size).toBe(230);
    const ej = (await ejecuciones(request, "fase=CONSULTA&tamanoPagina=100")).body.items;
    expect(ej).toHaveLength(3);
    expect(await hduDeJira()).toEqual([{ n: 0 }]);
  });

  test("[E5-B02#2] T06: EXACTO (100) termina EXITOSA sin hayMas y VACIO deja una consulta ABIERTA sin filas", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "EXACTO" })).body.guardado).toBe(true);
    const ex = await consultarOk(request);
    expect(ex.ejecucion).toMatchObject({ leidas: 100, resultado: "EXITOSA", hayMas: false });
    expect(ex.consulta).toMatchObject({ estado: "ABIERTA", hayMas: false, leidas: 100 });
    expect((await guardarConfigBase(request, { proyecto: "VACIO" })).body.guardado).toBe(true);
    const va = await consultarOk(request, { reemplazar: true });
    expect(va.ejecucion).toMatchObject({ leidas: 0, nuevas: 0, cambiaron: 0, sinCambios: 0, conError: 0, resultado: "EXITOSA", hayMas: false });
    expect(va.consulta).toMatchObject({ estado: "ABIERTA", leidas: 0 });
    expect((await items(request, va.consulta.id, "NUEVA")).body).toMatchObject({ total: 0, items: [] });
  });

  test("[E5-B02#3] T07: con 429 en las 2 primeras búsquedas se reintenta 2 veces con espera de 1 s y se registran los eventos; la consulta se completa", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.modo("LIMITE");
    const t0 = Date.now();
    const r = await consultarOk(request);
    const ms = Date.now() - t0;
    expect(r.ejecucion).toMatchObject({ nuevas: 10, reintentos429: 2, fase: "CONSULTA" });
    expect(r.ejecucion.eventos).toHaveLength(2);
    for (const ev of r.ejecucion.eventos) expect(ev).toMatchObject({ tipo: "JIRA_LIMITE_DE_TASA", esperaMs: 1000 });
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(r.consulta.nuevas).toBe(10);
  });

  test("[E5-B02#3] T08 (negativo): 429 persistente en la página 2 deja INCOMPLETA con 50 filas guardadas, revisable; al continuar termina sin duplicados", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    await jiraFalso.modo("LIMITE_PAGINA_2");
    const r = await consultarOk(request);
    expect(r.ejecucion).toMatchObject({ resultado: "INCOMPLETA", codigoError: "JIRA_LIMITE_DE_TASA", leidas: 50, hayMas: true, continuarDesde: "BIG-50" });
    expect(r.ejecucion.mensajeError).toBe("Jira pidió esperar demasiado. Reintenta en unos minutos.");
    expect(r.consulta).toMatchObject({ estado: "ABIERTA", leidas: 50, hayMas: true });
    const id = r.consulta.id as string;
    expect((await items(request, id, "NUEVA")).body.total).toBe(50);
    // lo leído se puede revisar y confirmar sin Jira
    const m = await asignarYMarcar(request, id, ["BIG-1", "BIG-2"]);
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    await jiraFalso.modo("NORMAL");
    let ult = (await continuar(request, id)).body;
    for (let i = 0; i < 4 && ult.consulta.hayMas; i += 1) ult = (await continuar(request, id)).body;
    expect(ult.consulta).toMatchObject({ leidas: 230, hayMas: false });
    const filas = await todasLasFilas(request, id, "NUEVA");
    expect(new Set(filas.map((f) => f.codigo)).size).toBe(230);
    // lo asignado antes de continuar se conserva
    expect(filas.find((f) => f.codigo === "BIG-1")).toMatchObject({ marcada: true, completa: true });
  });

  test("[E5-B02#1] T09 (negativo): con Jira LENTO la consulta es FALLIDA por JIRA_TIEMPO_AGOTADO en menos de 4 s, sin guardar consulta y registrada", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.modo("LENTO");
    const t0 = Date.now();
    const r = await consultar(request);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r.status).toBe(200);
    expect(r.body.ejecucion).toMatchObject({ resultado: "FALLIDA", codigoError: "JIRA_TIEMPO_AGOTADO", leidas: 0, fase: "CONSULTA" });
    expect(r.body.consulta).toBeNull();
    expect((await actual(request)).body).toMatchObject({ consulta: null });
    expect(await sql("SELECT 1 FROM integraciones.consulta_jira")).toHaveLength(0);
    expect((await ejecuciones(request)).body.items).toHaveLength(1);
  });

  test("[E5-B02#3] T10 (negativo): TOKEN_REVOCADO, SIN_PERMISO, RESPUESTA_INVALIDA, CAIDO y sitio cerrado dejan FALLIDA con el código y el mensaje fijos, sin repetir el token y sin consulta", async ({ request }) => {
    await estadoConfigBase(request);
    const casos: Array<{ modo: Parameters<typeof jiraFalso.modo>[0]; codigo: string; mensaje: string }> = [
      { modo: "TOKEN_REVOCADO", codigo: "JIRA_CREDENCIAL_INVALIDA", mensaje: "Jira rechazó el correo o el API token. Revisa la conexión." },
      { modo: "SIN_PERMISO", codigo: "JIRA_SIN_PERMISO", mensaje: "La cuenta de Jira no tiene permiso para leer este proyecto." },
      { modo: "RESPUESTA_INVALIDA", codigo: "JIRA_RESPUESTA_INVALIDA", mensaje: "Jira respondió algo que no entendimos." },
      { modo: "CAIDO", codigo: "JIRA_NO_DISPONIBLE", mensaje: "Jira no está disponible por ahora." },
    ];
    for (const c of casos) {
      await jiraFalso.modo(c.modo);
      const r = await consultar(request);
      expect(r.status, c.codigo).toBe(200);
      expect(r.body.ejecucion, c.codigo).toMatchObject({ resultado: "FALLIDA", codigoError: c.codigo, mensajeError: c.mensaje, leidas: 0 });
      expect(r.body.consulta).toBeNull();
      expect(contieneSecreto(JSON.stringify(r.body)), c.codigo).toBeUndefined();
      expect(cumpleContrato("ResultadoConsultaJira", r.body)).toEqual({ ok: true, errores: [] });
    }
    await jiraFalso.modo("NORMAL");
    await sql("UPDATE integraciones.configuracion_jira SET sitio_url = $1", [SITIO_CERRADO]);
    const r = await consultar(request);
    expect(r.body.ejecucion).toMatchObject({ resultado: "FALLIDA", codigoError: "JIRA_SITIO_NO_ENCONTRADO", mensajeError: "No pudimos conectar con ese sitio de Jira. Revisa la dirección." });
    expect((await ejecuciones(request)).body.total).toBe(5);
    expect(await sql("SELECT 1 FROM integraciones.consulta_jira")).toHaveLength(0);
  });

  test("[E5-B02#1] T11 (negativo): QE1, QE2, ANA1, LID1 y AUD1 reciben 403; sin token 401; ADM1 sin configuración 409 JIRA_NO_CONFIGURADO; sin ejecuciones ni llamadas a Jira", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.limpiarSolicitudes();
    for (const clave of ["qe1", "qe2", "ana1", "lid1", "aud1"] as const) {
      const r = await consultar(request, {}, undefined, clave);
      expect(r.status, clave).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
    const sin = await api.post<any>(request, CONSULTAS, { body: {} });
    expect(sin.status).toBe(401);
    expect(sin.body.codigo).toBe("NO_AUTENTICADO");
    expect(await jiraFalso.solicitudes()).toHaveLength(0);
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
    await limpiarE5();
    const s = await consultar(request);
    expect(s.status).toBe(409);
    expect(s.body.codigo).toBe("JIRA_NO_CONFIGURADO");
    expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
    expect(await jiraFalso.solicitudes()).toHaveLength(0);
  });

  test.describe("instancias del perfil de QA", () => {
    let i4: InstanciaE5 | undefined;
    let i6: InstanciaE5 | undefined;
    let proxy: Awaited<ReturnType<typeof proxyCortaRuta>> | undefined;
    test.afterAll(async () => {
      await Promise.all([i4?.detener(), i6?.detener(), proxy?.cerrar()]);
    });

    test("[E5-B02#2] T12: con presupuesto de 1.500 ms (con 2.500 ms la tanda de 2 páginas de 1 s termina por el tope de 100, no por tiempo) y Jira a 1 s por página, BIG termina INCOMPLETA por PRESUPUESTO_DE_TIEMPO en ≤ 3,5 s con las filas leídas guardadas", async ({ request }) => {
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      i4 = await levantarIntegraciones(3106, { INTEGRACIONES_PRESUPUESTO_MS: "1500" });
      await jiraFalso.modo("RETARDO_1S");
      const r = await consultar(request, {}, URL_I4);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.ejecucion).toMatchObject({ resultado: "INCOMPLETA", codigoError: "PRESUPUESTO_DE_TIEMPO", hayMas: true });
      expect(r.body.ejecucion.duracionMs).toBeLessThanOrEqual(3500);
      expect(r.body.ejecucion.leidas).toBeGreaterThan(0);
      expect(r.body.consulta.leidas).toBe(r.body.ejecucion.leidas);
      expect((await items(request, r.body.consulta.id, "NUEVA")).body.total).toBe(r.body.ejecucion.leidas);
      expect(r.body.ejecucion.mensajeError).toBe("Se alcanzó el tiempo máximo. Continúa para procesar el resto.");
    });

    test("[E5-B02#4] T13 (negativo): con Organización detenida 503 SERVICIO_NO_DISPONIBLE sin llamar a Jira ni ejecución; si cae tras leer la primera página, 200 FALLIDA/ORGANIZACION_NO_DISPONIBLE sin consulta a medias", async ({ request }) => {
      await estadoConfigBase(request);
      expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
      i6 = await levantarIntegraciones(3108, { ORGANIZACION_URL: "http://127.0.0.1:3199" });
      await jiraFalso.limpiarSolicitudes();
      const antes = await consultar(request, {}, "http://localhost:3108");
      expect(antes.status).toBe(503);
      expect(antes.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
      expect(await jiraFalso.solicitudes()).toHaveLength(0);
      expect(await sql("SELECT 1 FROM integraciones.ejecucion_integracion")).toHaveLength(0);
      await i6.detener();
      // Organización responde a todo salvo a la clasificación: cae «después de leer la primera página».
      proxy = await proxyCortaRuta(env.organizacionUrl, 3199, "/estado-codigos", 0);
      i6 = await levantarIntegraciones(3108, { ORGANIZACION_URL: proxy.url });
      const r = await consultar(request, {}, "http://localhost:3108");
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.ejecucion).toMatchObject({ resultado: "FALLIDA", codigoError: "ORGANIZACION_NO_DISPONIBLE" });
      expect(r.body.consulta).toBeNull();
      expect((await jiraFalso.solicitudes()).filter((s) => s.ruta.includes("search")).length).toBeGreaterThan(0);
      expect(await sql("SELECT 1 FROM integraciones.consulta_jira")).toHaveLength(0);
      expect(await hduDeJira()).toEqual([{ n: 0 }]);
      expect(`${r.body.ejecucion.mensajeError} ${JSON.stringify(r.body.ejecucion.sugerencias)}`).not.toMatch(/127\.0\.0\.1|localhost|3199|ECONNRESET|socket hang up|\bat \w+/);
      expect(hallazgosDeSecreto(registroServicios() + i6.salida())).toEqual([]);
    });
  });

  test("[E5-B02#4] T14: con la consulta A abierta, consultar con reemplazar y Jira CAIDO deja la ejecución FALLIDA y la consulta A ABIERTA y completa", async ({ request }) => {
    await estadoConfigBase(request);
    const a = (await consultarOk(request)).consulta;
    await asignarYMarcar(request, a.id, ["QTY-1"]);
    const antes = (await actual(request)).body.consulta;
    await jiraFalso.modo("CAIDO");
    const r = await consultar(request, { reemplazar: true });
    expect(r.status).toBe(200);
    expect(r.body.ejecucion).toMatchObject({ resultado: "FALLIDA", codigoError: "JIRA_NO_DISPONIBLE" });
    expect(r.body.consulta).toBeNull();
    const despues = (await actual(request)).body.consulta;
    expect(despues).toMatchObject({ id: a.id, estado: "ABIERTA", version: antes.version, leidas: 11, nuevas: 10, marcadasNuevas: 1 });
    expect((await items(request, a.id, "NUEVA")).body.total).toBe(10);
    await pares(request);
  });
});
