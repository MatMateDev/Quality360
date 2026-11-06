import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { CONSULTAS, actual, asignarYMarcar, cabecera, consultar, consultarOk, continuar, confirmar, descartar, fila, items, solicitudesJira, todasLasFilas } from "../support/e5c";
import { contratoDetalle, filasDetalleDb, obtenerItem, prepararDetalle, registrosE5D } from "../support/e5d";
import { estadoConfigBase, guardarConfigBase, limpiarE5, sql, tk } from "../support/e5";
import { levantarIntegraciones, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";
import { CAMPO_CRITERIOS } from "../support/jira-falso/servidor";

/** E5-B06 · Detalle de la HDU en la consulta (9 escenarios) y E5-B05#15, E5-B02#5/#6. Solo el Administrador. */
test.describe.configure({ mode: "default" });
const instancias: InstanciaE5[] = [];
test.afterAll(async () => {
  await Promise.all(instancias.map((i) => i.detener()));
  await jiraFalso.reset();
  await limpiarE5();
});
test.afterEach(async () => {
  await jiraFalso.modo("NORMAL");
  await jiraFalso.campoCriterios(true);
});

const BUSQUEDA = "/rest/api/3/search/jql";
const detalleDe = async (request: Parameters<typeof fila>[0], consultaId: string, codigo: string, grupo = "NUEVA") => {
  const f = await fila(request, consultaId, codigo, grupo);
  const r = await obtenerItem(request, consultaId, f.id);
  expect(r.status, `${codigo}: ${JSON.stringify(r.body).slice(0, 300)}`).toBe(200);
  return { fila: f, respuesta: r.body };
};

test.describe("E5-B06 · Detalle de la HDU en la consulta", () => {
  test("[E5-B06#1] T01: una sola llamada: una búsqueda por página, `fields` con los campos de D196 y ni GET /issue/{clave} ni expand", async ({ request }) => {
    await prepararDetalle(request);
    await jiraFalso.limpiarSolicitudes();
    const c = (await consultarOk(request)).consulta;
    const sol = await solicitudesJira();
    const busquedas = sol.filter((s) => s.ruta === BUSQUEDA);
    expect(c.leidas).toBeGreaterThan(11);
    expect(busquedas).toHaveLength(Math.ceil(c.leidas / 50));
    expect(sol.filter((s) => s.ruta !== BUSQUEDA), "solo se llama a search/jql: ni issue/{clave}, ni field, ni project").toEqual([]);
    const campos = busquedas[0].consulta.fields.split(",");
    for (const f of ["summary", "description", "priority", "issuetype", "status", "assignee", "labels", "created", "updated", "duedate", "resolutiondate", "parent", CAMPO_CRITERIOS, "customfield_10020"]) {
      expect(campos, `fields lleva ${f}`).toContain(f);
    }
    for (const b of busquedas) expect(Object.keys(b.consulta), "sin expand ni renderedFields").not.toEqual(expect.arrayContaining(["expand"]));
    expect(JSON.stringify(busquedas.map((b) => b.consulta))).not.toMatch(/renderedFields|expand/);
    // Con BIG (230 → 3 tandas de 100) cada tanda hace 2 páginas: el número de búsquedas sigue siendo una por página.
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    await descartar(request, c.id);
    await jiraFalso.limpiarSolicitudes();
    const big = (await consultarOk(request)).consulta;
    const solBig = await solicitudesJira();
    expect(solBig.every((s) => s.ruta === BUSQUEDA)).toBe(true);
    expect(solBig).toHaveLength(Math.ceil(big.leidas / 50));
  });

  test("[E5-B06#2] T02: mapeo completo de QTY-17: resumen, descripción, criterios, estado, prioridad de Jira y de Quality360, tipo, responsable, 20 de 25 etiquetas, 3 sprints con estado y fechas, épica y fechas", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    const { respuesta, fila: f } = await detalleDe(request, c.id, "QTY-17");
    expect(contratoDetalle(respuesta)).toEqual({ ok: true, errores: [] });
    const d = respuesta.detalle;
    expect(respuesta.item.id).toBe(f.id);
    expect(d).toMatchObject({
      resumen: "Detalle completo con doble factor",
      estadoJira: "En progreso",
      prioridadJira: "Highest",
      prioridadQ360: "CRITICA",
      tipo: "Story",
      responsableJira: "Rosa Pérez",
      etiquetasTotal: 25,
      epica: { clave: "QTY-100", titulo: "Autenticación" },
    });
    expect(d.descripcion.texto).toContain("Como usuario quiero activar un segundo factor.");
    expect(d.descripcion.texto).toContain("• Debe enviar un código");
    expect(d.descripcion).toMatchObject({ truncado: false });
    expect(d.etiquetas).toHaveLength(20);
    expect(d.etiquetas[0]).toEqual({ valor: "etiqueta-1" });
    expect(d.sprints.map((s: any) => [s.nombre, s.estado])).toEqual([["E5 Sprint Pasado", "CERRADO"], ["E5 Sprint 2", "ACTIVO"], ["E5 Sprint 3", "FUTURO"]]);
    expect(d.sprints[0]).toMatchObject({ inicio: "2026-09-01T09:00:00.000Z", fin: "2026-09-15T18:00:00.000Z" });
    expect(d.sprints[2].fin).toBeNull();
    expect(d.fechas).toEqual({ creada: "2026-10-01T13:00:00.000Z", actualizada: "2026-11-04T21:30:00.000Z", vencimiento: "2026-12-15", resolucion: "2026-11-20T15:00:00.000Z" });
    expect(d.urlJira).toBe("http://127.0.0.1:4010/browse/QTY-17");
    expect(respuesta.leidaEn).toBeTruthy();
    expect(respuesta.version).toBe(c.version);
    // Los textos ausentes son null, nunca cadena vacía.
    expect(JSON.stringify(d)).not.toMatch(/":""/);
  });

  test("[E5-B06#3] T03: criterios de aceptación: CAMPO si el sitio tiene el campo, DESCRIPCION si solo hay encabezado, null si ninguno; la descripción conserva todo; sin llamadas nuevas a Jira", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    await jiraFalso.limpiarSolicitudes();
    const q17 = (await detalleDe(request, c.id, "QTY-17")).respuesta.detalle;
    expect(q17.criterios).toMatchObject({ origen: "CAMPO", truncado: false });
    expect(q17.criterios.texto).toContain("Dado un usuario con 2FA activo");
    expect(q17.criterios.texto).toContain("Entonces ve el error y puede pedir otro");
    const q18 = (await detalleDe(request, c.id, "QTY-18")).respuesta.detalle;
    expect(q18.criterios.origen).toBe("DESCRIPCION");
    expect(q18.criterios.texto).toContain("El botón queda deshabilitado sin datos");
    expect(q18.criterios.texto).not.toContain("Nada que ver con los criterios");
    expect(q18.descripcion.texto).toContain("Contexto de la historia.");
    expect(q18.descripcion.texto).toContain("Criterios de aceptación");
    expect(q18.descripcion.texto).toContain("Nada que ver con los criterios.");
    const q16 = (await detalleDe(request, c.id, "QTY-16")).respuesta.detalle;
    expect(q16.criterios).toEqual({ texto: null, origen: null, truncado: false });
    expect((await solicitudesJira()).length, "leer el detalle no llama a Jira").toBe(0);
    // Sitio sin el campo: la detección es la de «probar/guardar» (misma llamada a /field) y deja el campo en NULL.
    await jiraFalso.campoCriterios(false);
    expect((await guardarConfigBase(request)).body.guardado).toBe(true);
    expect((await sql("SELECT campo_criterios FROM integraciones.configuracion_jira"))[0].campo_criterios).toBeNull();
    await descartar(request, c.id);
    const c2 = (await consultarOk(request)).consulta;
    expect((await detalleDe(request, c2.id, "QTY-17")).respuesta.detalle.criterios.origen, "sin campo detectado ya no hay CAMPO").toBeNull();
    expect((await detalleDe(request, c2.id, "QTY-18")).respuesta.detalle.criterios.origen).toBe("DESCRIPCION");
    await jiraFalso.campoCriterios(true);
    expect((await guardarConfigBase(request)).body.guardado).toBe(true);
    expect((await sql("SELECT campo_criterios FROM integraciones.configuracion_jira"))[0].campo_criterios).toBe(CAMPO_CRITERIOS);
  });

  test("[E5-B06#4] T04: QTY-15 (20 KB, HTML, javascript:, media, macro, tabla con =cmd, control): texto plano, sin etiquetas ejecutables, [contenido no mostrable], solo enlaces http(s), recorte con truncado y la fila no se rechaza", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    const { respuesta, fila: f } = await detalleDe(request, c.id, "QTY-15");
    expect(f.grupo, "la fila no pasa a CON_ERROR por contenido raro").toBe("NUEVA");
    const d = respuesta.detalle;
    const t: string = d.descripcion.texto;
    expect(d.descripcion.truncado).toBe(true);
    expect(t.length).toBeLessThanOrEqual(8000);
    expect(t).not.toMatch(/<\s*\/?\s*(script|b|img|a|style|iframe)\b/i);
    expect(t).not.toContain("onerror");
    expect(t, "el bloque <script> completo se descarta").not.toContain("__xss");
    expect(t).not.toContain("javascript:");
    expect(t).toContain("negrita");
    expect(t).toContain("enlace http (https://ejemplo.test/ok)");
    expect(t).toContain("enlace javascript");
    expect(t).toContain("[contenido no mostrable]");
    expect(t).toContain("Campo · Valor");
    expect(t).toContain("=cmd|' /C calc'!A0 · fin");
    expect(t).toContain("1. primero");
    // eslint-disable-next-line no-control-regex
    expect(t).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
    expect(t).toContain("control incluido");
    // Las etiquetas no son ADF: se guardan como texto de una línea y se pintan como texto (React); el HTML no se ejecuta (E5-F06#5, e2e).
    expect(d.etiquetas.map((e: any) => e.valor)).toEqual(["seguridad", "<b>html</b>"]);
    expect(JSON.stringify(d), "el detalle no lleva etiquetas script ni img").not.toMatch(/<\s*\/?\s*(script|img)/i);
    // OBS-D1: la descripción corta de la fila (item.descripcion: lo que se compara y se crea en la HDU) conserva el texto literal, como en E5 certificada; solo el panel la sanea.
    expect(typeof respuesta.item.descripcion).toBe("string");
    const bytes = (await filasDetalleDb(c.id)).find((x) => x.codigo === "QTY-15")?.bytes ?? 0;
    expect(bytes, "el detalle de una fila cabe en el CHECK de 40 KB").toBeLessThanOrEqual(40960);
  });

  test("[E5-B06#5] T05: datos raros (fechas no ISO, padre que no es épica, sprint sin fechas, labels que no es lista, campos ausentes): null o vacío, la issue no pasa a CON_ERROR y la tanda no se corta", async ({ request }) => {
    await prepararDetalle(request);
    await jiraFalso.issue("QTY-20", {
      tipo: "Story", summary: "Datos raros", description: null, priority: "Medium", labels: "no-es-lista" as any,
      created: "ayer por la tarde", updated: "2026-13-45T99:99:99Z", duedate: "31/12/2026", resolutiondate: "",
      parent: { key: "QTY-77", summary: "Padre que no es épica", tipo: "Story", nivel: 0 },
      sprints: [{ name: "Sprint sin fechas", state: "active" }],
    } as any);
    await jiraFalso.issue("QTY-21", { tipo: "Story", summary: "Otra normal", description: null, priority: "Low", criterios: { tipo: "no-adf" } as any, labels: [] });
    const c = (await consultarOk(request)).consulta;
    expect(c.conError).toBe(1); // solo QTY-11 (título vacío): lo raro de QTY-20 y QTY-21 no suma errores
    expect((await fila(request, c.id, "QTY-20")).grupo).toBe("NUEVA");
    expect((await fila(request, c.id, "QTY-21")).grupo).toBe("NUEVA");
    const d = (await detalleDe(request, c.id, "QTY-20")).respuesta.detalle;
    expect(d.fechas).toEqual({ creada: null, actualizada: null, vencimiento: null, resolucion: null });
    expect(d.etiquetas).toEqual([]);
    expect(d.etiquetasTotal).toBe(0);
    expect(d.epica, "un padre que no es épica no se muestra como épica").toBeNull();
    expect(d.sprints).toEqual([{ nombre: "Sprint sin fechas", estado: "ACTIVO", inicio: null, fin: null }]);
    expect(d.descripcion).toEqual({ texto: null, truncado: false });
    expect(d.criterios.origen).toBeNull();
    const d21 = (await detalleDe(request, c.id, "QTY-21")).respuesta.detalle;
    expect(d21.criterios.origen, "un campo de criterios que no es ADF ni texto no rompe la tanda").toBeNull();
  });

  test("[E5-B06#6] T06: leer el detalle: 200 con DetalleHdu sin llamar a Jira; 403 al resto de los roles, 401 sin token; 404 de otra consulta o inexistente; 409 con la consulta cerrada", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    const f = await fila(request, c.id, "QTY-17");
    await jiraFalso.modo("CAIDO");
    await jiraFalso.limpiarSolicitudes();
    const ok = await obtenerItem(request, c.id, f.id);
    expect(ok.status).toBe(200);
    expect(contratoDetalle(ok.body)).toEqual({ ok: true, errores: [] });
    expect(await solicitudesJira(), "con Jira caído y sin llamadas, el detalle se lee de la base propia").toEqual([]);
    await jiraFalso.modo("NORMAL");
    for (const clave of ["qe1", "qe2", "ana1", "lid1", "aud1"] as const) {
      const r = await obtenerItem(request, c.id, f.id, clave);
      expect([r.status, r.body.codigo], clave).toEqual([403, "ACCESO_DENEGADO"]);
      expect(JSON.stringify(r.body), clave).not.toContain("Detalle completo");
    }
    expect((await api.get<any>(request, `${CONSULTAS}/${c.id}/items/${f.id}`)).status).toBe(401);
    const inexistente = await obtenerItem(request, c.id, "00000000-0000-4000-8000-000000000000");
    expect([inexistente.status, inexistente.body.codigo]).toEqual([404, "CONSULTA_NO_ENCONTRADA"]);
    const consultaInexistente = await obtenerItem(request, "00000000-0000-4000-8000-000000000000", f.id);
    expect([consultaInexistente.status, consultaInexistente.body.codigo]).toEqual([404, "CONSULTA_NO_ENCONTRADA"]);
    const malId = await obtenerItem(request, c.id, "no-es-uuid");
    expect(malId.status, JSON.stringify(malId.body)).toBe(400);
    // Fila de otra consulta: se descarta la actual y se hace una nueva; el id de la fila vieja ya no es de esta consulta.
    const d1 = await descartar(request, c.id);
    expect(d1.status).toBe(200);
    const nueva = (await consultarOk(request)).consulta;
    const deOtra = await obtenerItem(request, nueva.id, f.id);
    expect([deOtra.status, deOtra.body.codigo], "el itemId de otra consulta da 404").toEqual([404, "CONSULTA_NO_ENCONTRADA"]);
    // Cerrada: 409 CONSULTA_NO_ABIERTA (la anterior quedó DESCARTADA y sin filas).
    const cerrada = await obtenerItem(request, c.id, f.id);
    expect([cerrada.status, cerrada.body.codigo]).toEqual([409, "CONSULTA_NO_ABIERTA"]);
  });

  test("[E5-B06#6] T07: con la consulta vencida el detalle da 410 CONSULTA_VENCIDA (vigencia de 2 s)", async ({ request }) => {
    await prepararDetalle(request);
    const i6 = await levantarIntegraciones(3140, { INTEGRACIONES_CONSULTA_VIGENCIA_MS: "2000" });
    instancias.push(i6);
    try {
      const c = (await consultarOk(request, {}, i6.url)).consulta;
      const f = await fila(request, c.id, "QTY-17");
      expect((await obtenerItem(request, c.id, f.id, "adm1", i6.url)).status).toBe(200);
      await new Promise((r) => setTimeout(r, 3200));
      const vencida = await obtenerItem(request, c.id, f.id, "adm1", i6.url);
      expect([vencida.status, vencida.body.codigo]).toEqual([410, "CONSULTA_VENCIDA"]);
      expect(JSON.stringify(vencida.body)).not.toContain("Detalle completo");
    } finally {
      await i6.detener();
      instancias.pop();
    }
  });

  test("[E5-B06#7] T08: retención: el detalle (criterios y épica con marca única) desaparece con la consulta (descartar, confirmar) y no queda en ejecuciones, detalle de ejecución, auditoría, respuestas ni registros", async ({ request }) => {
    const marca = `SENTINELA-${Date.now().toString(36)}`;
    await prepararDetalle(request);
    await jiraFalso.issue("QTY-17", { parent: { key: "QTY-100", summary: `Épica ${marca}`, tipo: "Epic", nivel: 1 }, criterios: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: `Criterio ${marca}` }] }] } });
    const c = (await consultarOk(request)).consulta;
    const d = (await detalleDe(request, c.id, "QTY-17")).respuesta;
    expect(JSON.stringify(d.detalle)).toContain(marca);
    // Las demás respuestas de la consulta no llevan el detalle.
    const cuerpos = [JSON.stringify((await cabecera(request, c.id)).body), JSON.stringify((await actual(request)).body)];
    for (const g of ["NUEVA", "CAMBIO", "SIN_CAMBIOS", "CON_ERROR"]) cuerpos.push(JSON.stringify((await items(request, c.id, g)).body));
    for (const cuerpo of cuerpos) expect(cuerpo).not.toContain(marca);
    // Confirmar una fila (ejecución HDU) y luego el lote no copian el detalle a ningún lado.
    const asig = await asignarYMarcar(request, c.id, ["QTY-17"], {}, true);
    expect(asig.status, JSON.stringify(asig.body)).toBe(200);
    const conf = await confirmar(request, c.id, (await cabecera(request, c.id)).body.version);
    expect(conf.status, JSON.stringify(conf.body)).toBe(200);
    expect(JSON.stringify(conf.body)).not.toContain(marca);
    const buscar = async (tabla: string) => (await sql<{ n: number }>(`SELECT count(*)::int n FROM ${tabla} t WHERE to_jsonb(t)::text LIKE $1`, [`%${marca}%`]))[0].n;
    for (const tabla of ["integraciones.ejecucion_integracion", "integraciones.detalle_ejecucion", "integraciones.consulta_jira", "organizacion.auditoria", "organizacion.historia_usuario"]) {
      expect(await buscar(tabla), `${tabla} no guarda el detalle`).toBe(0);
    }
    expect(await buscar("integraciones.consulta_item"), "las filas se purgaron al confirmar la última").toBe(0);
    expect((await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [c.id]))).toHaveLength(0);
    expect(registrosE5D(), "los registros de los servicios no traen el detalle").not.toContain(marca);
    // Reemplazar: la anterior queda REEMPLAZADA y sus filas (con el detalle) se purgan.
    const c1 = (await consultarOk(request)).consulta;
    expect(await buscar("integraciones.consulta_item")).toBeGreaterThan(0);
    const c1b = await consultar(request, { reemplazar: true });
    expect(c1b.status, JSON.stringify(c1b.body).slice(0, 200)).toBe(200);
    expect((await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [c1.id]))).toHaveLength(0);
    expect((await cabecera(request, c1.id)).body.estado).toBe("REEMPLAZADA");
    // Descartar: otra consulta, mismo resultado.
    const c2 = c1b.body.consulta;
    expect(await buscar("integraciones.consulta_item")).toBeGreaterThan(0);
    expect((await descartar(request, c2.id)).status).toBe(200);
    expect(await buscar("integraciones.consulta_item")).toBe(0);
    expect((await sql("SELECT count(*)::int n FROM integraciones.consulta_item WHERE detalle IS NOT NULL"))[0].n).toBe(0);
  });

  test("[E5-B06#8] T09: una tanda de 100 issues de 20 KB con Jira a 1 s por página cabe en el presupuesto; con Jira más lento que el tiempo por petición la tanda termina INCOMPLETA/FALLIDA sin filas a medias", async ({ request }) => {
    await prepararDetalle(request, true);
    expect((await guardarConfigBase(request, { proyecto: "PESADO" })).body.guardado).toBe(true);
    await jiraFalso.modo("RETARDO_1S");
    await jiraFalso.limpiarSolicitudes();
    const t0 = Date.now();
    const r = await consultar(request, {});
    const ms = Date.now() - t0;
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    expect(r.body.consulta.leidas).toBe(100);
    expect(r.body.ejecucion).toMatchObject({ fase: "CONSULTA", leidas: 100, resultado: "EXITOSA" });
    const sol = (await solicitudesJira()).filter((s) => s.ruta === BUSQUEDA);
    const pesos = sol.map((s) => s.bytes ?? 0);
    test.info().annotations.push({ type: "peso-pagina-bytes", description: JSON.stringify(pesos) }, { type: "tiempo-consulta-ms", description: String(ms) });
    expect(pesos.every((b) => b > 500_000), "cada página de 50 issues de 20 KB pesa más de medio megabyte").toBe(true);
    const filas = await filasDetalleDb(r.body.consulta.id);
    expect(filas).toHaveLength(100);
    expect(filas.every((x) => x.con_detalle && (x.bytes ?? 0) <= 40960)).toBe(true);
    // Jira más lento que el tiempo por petición (3 s): FALLIDA sin guardar consulta ni filas a medias (como E5-B02 T09).
    await descartar(request, r.body.consulta.id);
    await jiraFalso.modo("LENTO");
    const lento = await consultar(request, {});
    expect(lento.status, JSON.stringify(lento.body).slice(0, 300)).toBe(200);
    expect(lento.body.ejecucion).toMatchObject({ fase: "CONSULTA", resultado: "FALLIDA", codigoError: "JIRA_TIEMPO_AGOTADO" });
    expect(lento.body.consulta).toBeNull();
    expect(await sql("SELECT 1 FROM integraciones.consulta_item")).toHaveLength(0);
    await jiraFalso.modo("NORMAL");
    // Presupuesto de la tanda agotado en la 2.ª página (1,5 s con Jira a 1 s por página): INCOMPLETA con hayMas, 50 filas completas y «Continuar» termina.
    const corto = await levantarIntegraciones(3144, { INTEGRACIONES_PRESUPUESTO_MS: "1500" });
    instancias.push(corto);
    try {
      await jiraFalso.modo("RETARDO_1S");
      const parcial = await consultar(request, {}, corto.url);
      expect(parcial.status, JSON.stringify(parcial.body).slice(0, 300)).toBe(200);
      expect(parcial.body.ejecucion).toMatchObject({ resultado: "INCOMPLETA", hayMas: true, codigoError: "PRESUPUESTO_DE_TIEMPO" });
      const idParcial = parcial.body.consulta.id;
      const filasParcial = await filasDetalleDb(idParcial);
      expect(filasParcial.length).toBeGreaterThanOrEqual(50);
      expect(filasParcial.length, "una fila no queda a medias").toBeLessThan(100);
      expect(filasParcial.every((x) => x.con_detalle && (x.bytes ?? 0) <= 40960)).toBe(true);
      await jiraFalso.modo("NORMAL");
      const sigue = await continuar(request, idParcial, corto.url);
      expect(sigue.status, JSON.stringify(sigue.body).slice(0, 300)).toBe(200);
      const todas = await filasDetalleDb(idParcial);
      expect(todas).toHaveLength(100);
      expect(todas.every((x) => x.con_detalle)).toBe(true);
    } finally {
      await corto.detener();
      instancias.pop();
    }
  });

  test("[E5-B06#9] T10: consulta anterior al cambio (detalle NULL): GET item da 200 con detalle null y la fila sigue asignable y confirmable", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    await sql("UPDATE integraciones.consulta_item SET detalle = NULL WHERE id_consulta = $1", [c.id]);
    const { respuesta } = await detalleDe(request, c.id, "QTY-1");
    expect(respuesta.detalle).toBeNull();
    expect(contratoDetalle(respuesta)).toEqual({ ok: true, errores: [] });
    expect(respuesta.item).toMatchObject({ codigo: "QTY-1", titulo: "Login con doble factor", prioridad: "ALTA", sprintJira: "E5 Sprint 2" });
    const m = await asignarYMarcar(request, c.id, ["QTY-1"], {}, true);
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    const cf = await confirmar(request, c.id, (await cabecera(request, c.id)).body.version);
    expect(cf.status, JSON.stringify(cf.body)).toBe(200);
    expect(cf.body.ejecucion).toMatchObject({ resultado: "EXITOSA", creadas: 1 });
  });

  test("[E5-B05#15] T11: GET items trae yaAsignada, revision, analistaAuto y aplicada y no trae el detalle; el listado es liviano", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    const r = await items(request, c.id, "NUEVA");
    expect(r.status).toBe(200);
    expect(cumpleContrato("PaginaItemsConsulta", r.body)).toEqual({ ok: true, errores: [] });
    for (const i of r.body.items) {
      expect(i).toHaveProperty("revision");
      expect(i).toHaveProperty("analistaAuto");
      expect(i).toHaveProperty("aplicada");
      expect(i).toHaveProperty("yaAsignada");
      expect(Object.keys(i)).not.toContain("detalle");
    }
    for (const solo of ["etiqueta-5", "Dado un usuario con 2FA activo", "Autenticación", "E5 Sprint Pasado", "2026-12-15"]) expect(JSON.stringify(r.body), solo).not.toContain(solo);
    const filasDb = await filasDetalleDb(c.id);
    const bytesDetalle = filasDb.reduce((s, x) => s + (x.bytes ?? 0), 0);
    expect(Buffer.byteLength(JSON.stringify(r.body))).toBeLessThan(bytesDetalle + 40_000);
    expect(r.body.items.every((i: any) => i.revision === 1 && i.analistaAuto === false && i.aplicada === false && i.yaAsignada === null)).toBe(true);
    expect(await todasLasFilas(request, c.id, "NUEVA")).not.toHaveLength(0);
  });
});

test.describe("E5-B06 · Peso de la página de Jira (D196): medición para elegir TAMANO_PAGINA 50 o 25", () => {
  test("[E5-B06#8] T13 (medición): bytes de una página de 50 issues con los campos de antes y de ahora (ligera y pesada) y consulta real con INTEGRACIONES_JIRA_TAMANO_PAGINA=50 y 25", async ({ request }) => {
    test.setTimeout(240_000);
    await prepararDetalle(request, true);
    const auth = "Basic " + Buffer.from("admin@quality360.local:q360-token-valido-AB12").toString("base64");
    const ANTES = "summary,description,priority,issuetype,status,assignee,labels,customfield_10020";
    const AHORA = "summary,description,priority,issuetype,status,assignee,labels,created,updated,duedate,resolutiondate,parent,customfield_10020,customfield_10050";
    const pagina = async (proyecto: string, fields: string, max = 50) => {
      const url = new URL("http://127.0.0.1:4010/rest/api/3/search/jql");
      url.searchParams.set("jql", `project = ${proyecto} AND issuetype in ("Story") ORDER BY key ASC`);
      url.searchParams.set("fields", fields);
      url.searchParams.set("maxResults", String(max));
      const t0 = Date.now();
      const r = await fetch(url, { headers: { Authorization: auth } });
      const texto = await r.text();
      return { bytes: Buffer.byteLength(texto), ms: Date.now() - t0, n: JSON.parse(texto).issues.length };
    };
    const medidas: Record<string, unknown> = {};
    for (const proyecto of ["BIG", "PESADO"]) {
      const antes = await pagina(proyecto, ANTES);
      const ahora = await pagina(proyecto, AHORA);
      medidas[proyecto] = { issues: ahora.n, bytesAntes: antes.bytes, bytesAhora: ahora.bytes, aumento: +(ahora.bytes / antes.bytes).toFixed(2) };
      expect(ahora.n).toBe(50);
    }
    const bytesPesada = (medidas.PESADO as { bytesAhora: number }).bytesAhora;
    // Una consulta real de 100 issues pesadas con 50 y con 25 por página (Jira simulado a 1 s por búsqueda).
    expect((await guardarConfigBase(request, { proyecto: "PESADO" })).body.guardado).toBe(true);
    await jiraFalso.modo("RETARDO_1S");
    const consultas: Record<string, unknown> = {};
    let puerto = 3146;
    for (const tam of ["50", "25"]) {
      const inst = await levantarIntegraciones(puerto++, { INTEGRACIONES_JIRA_TAMANO_PAGINA: tam });
      instancias.push(inst);
      try {
        await jiraFalso.limpiarSolicitudes();
        const t0 = Date.now();
        const r = await consultar(request, {}, inst.url);
        const ms = Date.now() - t0;
        const sol = (await solicitudesJira()).filter((s) => s.ruta === BUSQUEDA);
        expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
        consultas[`tamano${tam}`] = {
          peticiones: sol.length, bytesPorPagina: sol.map((s) => s.bytes), maxResults: sol[0]?.consulta.maxResults, ms, leidas: r.body.consulta?.leidas, resultado: r.body.ejecucion.resultado,
          bytesDetalleEnBase: (await filasDetalleDb(r.body.consulta.id)).reduce((s, x) => s + (x.bytes ?? 0), 0),
        };
        await descartar(request, r.body.consulta.id);
      } finally {
        await inst.detener();
        instancias.pop();
      }
    }
    await jiraFalso.modo("NORMAL");
    test.info().annotations.push({ type: "peso-pagina", description: JSON.stringify({ medidas, consultas }) });
    const c50 = consultas.tamano50 as { peticiones: number; bytesPorPagina: number[] };
    const c25 = consultas.tamano25 as { peticiones: number; bytesPorPagina: number[]; maxResults: string };
    expect(c50.peticiones).toBe(2);
    expect(c25.maxResults).toBe("25");
    expect(c25.peticiones).toBe(4);
    expect(bytesPesada, "página pesada de 50 issues de 20 KB").toBeGreaterThan(700_000);
  });
});

test.describe("E5-B06 · Modelo de datos del detalle (db)", () => {
  test("[E5-B06#7] T12 (db): CHECK de 40 KB y de tipo en detalle, analista_auto exige analista, aplicada exige alcance, alcance HDU solo en fase CONFIRMACION, y `alcance` no cambia en una ejecución cerrada", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    const err = async (consulta: string, params: unknown[] = []) => {
      try {
        await sql(consulta, params);
        return null;
      } catch (e) {
        return (e as { code?: string; message?: string }).code ?? String(e);
      }
    };
    const grande = JSON.stringify({ x: "y".repeat(41_000) });
    expect(await err("UPDATE integraciones.consulta_item SET detalle = $2::jsonb WHERE id_consulta = $1 AND codigo = 'QTY-1'", [c.id, grande]), "40 KB").toBe("23514");
    expect(await err("UPDATE integraciones.consulta_item SET detalle = '[1,2]'::jsonb WHERE id_consulta = $1 AND codigo = 'QTY-1'", [c.id]), "jsonb que no es objeto").toBe("23514");
    expect(await err("UPDATE integraciones.consulta_item SET detalle = '{\"ok\":true}'::jsonb WHERE id_consulta = $1 AND codigo = 'QTY-1'", [c.id]), "objeto pequeño").toBeNull();
    expect(await err("UPDATE integraciones.consulta_item SET analista_auto = true WHERE id_consulta = $1 AND codigo = 'QTY-2'", [c.id]), "analista_auto sin analista").toBe("23514");
    expect(await err("UPDATE integraciones.consulta_item SET aplicada = true, marcada = true WHERE id_consulta = $1 AND codigo = 'QTY-2'", [c.id]), "aplicada sin alcance_aplicacion").toBe("23514");
    expect(await err("UPDATE integraciones.consulta_item SET revision = 0 WHERE id_consulta = $1 AND codigo = 'QTY-2'", [c.id]), "revision >= 1").toBe("23514");
    expect(await err("UPDATE integraciones.consulta_item SET ya_asignada = '[]'::jsonb WHERE id_consulta = $1 AND codigo = 'QTY-2'", [c.id]), "ya_asignada objeto").toBe("23514");
    expect(await err("UPDATE integraciones.consulta_jira SET creadas = -1 WHERE id_consulta = $1", [c.id]), "creadas >= 0").toBe("23514");
    expect(await err("UPDATE integraciones.configuracion_jira SET campo_criterios = repeat('x', 31)"), "campo_criterios varchar(30)").toBe("22001");
    const e = await sql<{ id_ejecucion: string }>("SELECT id_ejecucion FROM integraciones.ejecucion_integracion WHERE consulta_id = $1 AND fase = 'CONSULTA' LIMIT 1", [c.id]);
    expect(await err("UPDATE integraciones.ejecucion_integracion SET alcance = 'HDU' WHERE id_ejecucion = $1", [e[0].id_ejecucion]), "alcance HDU solo en CONFIRMACION / ejecución cerrada").not.toBeNull();
    // El detalle sólo vive en consulta_item: ninguna otra tabla de integraciones tiene una columna `detalle` con el objeto de Jira.
    const columnas = await sql<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'integraciones' AND column_name = 'detalle'");
    expect(columnas.map((x) => x.table_name)).toEqual(["consulta_item"]);
    // Y el rol del servicio no se salta el CHECK ni alcanza otro esquema (B05 T35 cubre los permisos).
    const cfg = await sql<{ campo_criterios: string | null }>("SELECT campo_criterios FROM integraciones.configuracion_jira");
    expect(cfg[0].campo_criterios).toBe(CAMPO_CRITERIOS);
    await descartar(request, c.id);
  });
});

test.describe("E5-B02 · Consultar Jira (ajustes de detalle)", () => {
  test("[E5-B02#5] T16: presupuesto: más campos pero no más llamadas ni otra política: 429 con reintento, 3 s por petición y una sola búsqueda por página", async ({ request }) => {
    await prepararDetalle(request);
    await jiraFalso.modo("LIMITE");
    await jiraFalso.limpiarSolicitudes();
    const r = await consultar(request, {});
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
    const sol = await solicitudesJira();
    expect(sol.every((s) => s.ruta === BUSQUEDA)).toBe(true);
    expect(sol, "dos 429 y la tercera pasa: 3 peticiones para 1 página").toHaveLength(3);
    expect(r.body.ejecucion.resultado).not.toBe("FALLIDA");
    expect(r.body.ejecucion.reintentos429).toBe(2);
    expect(sol.every((s) => s.consulta.fields.includes("parent"))).toBe(true);
    await descartar(request, r.body.consulta.id);
    await jiraFalso.modo("LIMITE_SIEMPRE");
    const sinCupo = await consultar(request, {});
    expect(sinCupo.body.ejecucion).toMatchObject({ resultado: "FALLIDA", codigoError: "JIRA_LIMITE_DE_TASA" });
    expect((await solicitudesJira()).filter((s) => s.ruta === BUSQUEDA).length, "hasta 2 reintentos por página").toBeLessThanOrEqual(6);
  });

  test("[E5-B02#6] T17: clasificación y HDU existente: estado-codigos devuelve el analista y la fila guarda yaAsignada para CAMBIO y SIN_CAMBIOS", async ({ request }) => {
    await estadoConfigBase(request);
    const { crearManual } = await import("../support/e5c");
    const { destino } = await import("../support/e5");
    await destino(request);
    await crearManual(request, "QTY-4", "Filtrar por fecha", { prioridad: "BAJA", descripcion: "Texto corto" });
    await crearManual(request, "QTY-5", "Un título distinto", { prioridad: "MEDIA" });
    const c = (await consultarOk(request)).consulta;
    const q4 = await fila(request, c.id, "QTY-4", "SIN_CAMBIOS");
    expect(q4.yaAsignada).toMatchObject({ analista: null });
    expect(q4.yaAsignada.qe).toBeTruthy();
    expect(q4.yaAsignada.idHistoria).toBe(q4.idHistoria);
    const q5 = await fila(request, c.id, "QTY-5", "CAMBIO");
    expect(q5.yaAsignada).toMatchObject({ analista: null });
    expect(q5.yaAsignada.idHistoria).toBe(q5.idHistoria);
    expect(cumpleContrato("PaginaItemsConsulta", (await items(request, c.id, "SIN_CAMBIOS")).body)).toEqual({ ok: true, errores: [] });
    // Con analista asignado (por el flujo normal de E2) la fila lo nombra al consultar de nuevo.
    const { pares } = await import("../support/e5c");
    const p = await pares(request);
    const hdu = (await sql<{ id_historia: string }>("SELECT id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-4'"))[0].id_historia;
    const as = await api.put<any>(request, `/v1/hdu/${hdu}/analista`, { token: await tk("qe1"), body: { analistaId: p.ana1 } });
    expect(as.status, JSON.stringify(as.body)).toBe(200);
    await descartar(request, c.id);
    const c2 = (await consultarOk(request)).consulta;
    const q4b = await fila(request, c2.id, "QTY-4", "SIN_CAMBIOS");
    expect(q4b.yaAsignada.analista).toBeTruthy();
  });
});
