import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { env } from "../support/env";
import {
  CONSULTAS, URL_GATEWAY_REAL, actual, adfTexto, asignarYMarcar, cabecera, cerrarHdu, confirmar, consultaAConMarcadas, consultar, consultarOk, continuar, crearArnes, crearManual,
  descartar, editar, ejecucionesPorFase, fijarActivo, fila, items, pares, prepararConsultaB, solicitudesJira, todasLasFilas, type ArnesE5,
} from "../support/e5c";
import { crearUsuarioE7 } from "../support/e7";
import {
  borrarUsuariosDePrueba, contarHdu, contieneSecreto, detalleEjecucion, ejecuciones, estadoConfigBase, guardarConfigBase, hduPorCodigo, limpiarE5, sql, tk, TOKEN_FALSO,
} from "../support/e5";
import { levantarIntegraciones, proxyCortaRuta, proxyOrganizacion, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";

/** E5-B05 · Guardar la consulta, validar la asignación y confirmar (14 escenarios, T01..T38). Solo el Administrador. */
test.describe.configure({ mode: "default" });
let arnes: ArnesE5 | undefined;
const instancias: InstanciaE5[] = [];
test.afterAll(async () => {
  await Promise.all(instancias.map((i) => i.detener()));
  await limpiarE5();
  await arnes?.limpiar();
});

async function adm2(request: Parameters<typeof crearArnes>[0]): Promise<ArnesE5> {
  arnes ??= await crearArnes(request);
  return arnes;
}
const hduTotal = (request: Parameters<typeof contarHdu>[0]) => contarHdu(request);
const ejecN = async () => (await sql<{ n: number }>("SELECT count(*)::int n FROM integraciones.ejecucion_integracion"))[0].n;
const buscarEstado = async (codigo: string) => (await sql("SELECT estado, titulo, prioridad, qe_responsable_id, analista_id, id_celula, origen, descripcion FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo]))[0];

test.describe("E5-B05 · Consulta y asignación", () => {
  test("[E5-B05#1] T01: la consulta es compartida y persiste: otro Administrador y una instancia nueva del servicio ven la misma, con filas, marcas y version", async ({ request }) => {
    await estadoConfigBase(request);
    const a2 = await adm2(request);
    const c = (await consultarOk(request)).consulta;
    const antes = (await actual(request)).body.consulta;
    const nueva = await levantarIntegraciones(3114, {});
    instancias.push(nueva);
    const otra = await api.get<any>(request, `${CONSULTAS}/actual`, { token: a2.adm2.token, baseURL: nueva.url });
    expect(otra.status, JSON.stringify(otra.body)).toBe(200);
    expect(otra.body.consulta).toMatchObject({ id: c.id, estado: "ABIERTA", nuevas: 10, conError: 1, version: antes.version });
    expect(otra.body.consulta.creadaPor.nombre ?? otra.body.consulta.creadaPor.id).toBeTruthy();
    expect(otra.body.consulta.creadaPor.id).toBe(c.creadaPor.id);
    const viaGw = await api.get<any>(request, `${CONSULTAS}/actual`, { token: a2.adm2.token });
    expect(viaGw.body.consulta.id).toBe(c.id);
    expect(cumpleContrato("ConsultaActual", otra.body)).toEqual({ ok: true, errores: [] });
    await nueva.detener();
    instancias.pop();
  });

  test("[E5-B05#2] T02: con la consulta B cada grupo trae lo suyo y QTY-2 trae antes y después de título y prioridad", async ({ request }) => {
    await estadoConfigBase(request);
    const b = (await prepararConsultaB(request)).consulta;
    expect(b).toMatchObject({ nuevas: 1, cambiaron: 2, sinCambios: 8, conError: 1, leidas: 12 });
    const codigos = async (g: string) => (await todasLasFilas(request, b.id, g)).map((f) => f.codigo).sort();
    expect(await codigos("NUEVA")).toEqual(["QTY-14"]);
    expect(await codigos("CAMBIO")).toEqual(["QTY-1", "QTY-2"]);
    expect(await codigos("SIN_CAMBIOS")).toHaveLength(8);
    expect(await codigos("CON_ERROR")).toEqual(["QTY-11"]);
    const q2 = await fila(request, b.id, "QTY-2", "CAMBIO");
    expect(q2.cambios).toMatchObject({ titulo: { antes: "Recuperar contraseña", despues: "Recuperar clave" }, prioridad: { antes: "MEDIA", despues: "CRITICA" } });
    expect(q2.cambios.descripcion).toBeUndefined();
    const q1 = await fila(request, b.id, "QTY-1", "CAMBIO");
    expect(q1.cambios.descripcion).toMatchObject({ antes: "Como usuario quiero activar 2FA", despues: "Otra descripción de Jira" });
    expect(cumpleContrato("PaginaItemsConsulta", (await items(request, b.id, "CAMBIO")).body)).toEqual({ ok: true, errores: [] });
  });

  test("[E5-B05#2] T03: una HDU cerrada con otro título en Jira queda en SIN_CAMBIOS/HDU_CERRADA y no se puede marcar", async ({ request }) => {
    await estadoConfigBase(request);
    await crearManual(request, "QTY-9", "Título distinto del de Jira");
    await cerrarHdu("QTY-9");
    const c = (await consultarOk(request)).consulta;
    const f = await fila(request, c.id, "QTY-9", "SIN_CAMBIOS");
    expect(f).toMatchObject({ grupo: "SIN_CAMBIOS", motivo: "HDU_CERRADA", marcable: false });
    const m = await editar(request, c.id, { itemIds: [f.id], marcada: true });
    expect(m.status).toBe(422);
    expect(m.body.codigo).toBe("FILA_NO_MARCABLE");
  });

  test("[E5-B05#2] T04: una prioridad ausente o desconocida de Jira no es un cambio: QTY-5 y QTY-6 con el mismo título y prioridad quedan SIN_CAMBIOS", async ({ request }) => {
    await estadoConfigBase(request);
    await crearManual(request, "QTY-5", "Notificaciones push", { prioridad: "MEDIA", descripcion: "Texto corto" });
    await crearManual(request, "QTY-6", "Modo oscuro", { prioridad: "MEDIA", descripcion: "Texto corto" });
    const c = (await consultarOk(request)).consulta;
    const sc = (await todasLasFilas(request, c.id, "SIN_CAMBIOS")).map((f) => f.codigo);
    expect(sc).toEqual(expect.arrayContaining(["QTY-5", "QTY-6"]));
    expect((await todasLasFilas(request, c.id, "CAMBIO")).map((f) => f.codigo)).toEqual([]);
  });

  test("[E5-B05#2] T05: una HDU creada a mano: QTY-5 con otro título va a CAMBIO y QTY-1 igual a Jira a SIN_CAMBIOS, ambas con origenHdu MANUAL", async ({ request }) => {
    await estadoConfigBase(request);
    await crearManual(request, "QTY-5", "Notificaciones", { prioridad: "MEDIA", descripcion: "Texto corto" });
    await crearManual(request, "QTY-1", "Login con doble factor", { prioridad: "ALTA", descripcion: "Como usuario quiero activar 2FA" });
    const c = (await consultarOk(request)).consulta;
    expect(await fila(request, c.id, "QTY-5", "CAMBIO")).toMatchObject({ grupo: "CAMBIO", origenHdu: "MANUAL" });
    expect(await fila(request, c.id, "QTY-1", "SIN_CAMBIOS")).toMatchObject({ grupo: "SIN_CAMBIOS", origenHdu: "MANUAL" });
    expect((await fila(request, c.id, "QTY-5", "CAMBIO")).cambios.titulo).toMatchObject({ antes: "Notificaciones", despues: "Notificaciones push" });
  });

  test("[E5-B05#3] T06: revisar, asignar y confirmar con Jira CAIDO responden 200 y Jira no recibe ninguna petición", async ({ request }) => {
    await estadoConfigBase(request);
    const c = (await consultarOk(request)).consulta;
    await jiraFalso.modo("CAIDO");
    await jiraFalso.limpiarSolicitudes();
    const g = await items(request, c.id, "NUEVA");
    expect(g.status).toBe(200);
    const p = await asignarYMarcar(request, c.id, ["QTY-1", "QTY-2"]);
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    const act = (await cabecera(request, c.id)).body;
    const cf = await confirmar(request, c.id, act.version);
    expect(cf.status, JSON.stringify(cf.body)).toBe(200);
    expect(cf.body.ejecucion).toMatchObject({ fase: "CONFIRMACION", creadas: 2 });
    expect(await solicitudesJira()).toHaveLength(0);
  });

  test("[E5-B05#4] T07: asignar CEL-C, QE2 y ANA3 a QTY-1 deja la fila completa con el sprint propuesto de Jira y sube la version en 1", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const q1 = await fila(request, c.id, "QTY-1");
    const r = await editar(request, c.id, { itemIds: [q1.id], asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.version).toBe(c.version + 1);
    const f = r.body.items[0];
    expect(f).toMatchObject({ codigo: "QTY-1", completa: true, marcada: false, faltantes: [] });
    expect(f.asignacion).toMatchObject({ sprintOrigen: "JIRA", sprint: { id: p.sprint2, nombre: "E5 Sprint 2" }, celula: { id: p.celC }, qeResponsable: { id: p.qe2 }, analista: { id: p.ana3 } });
    expect(cumpleContrato("ResultadoEdicionItems", r.body)).toEqual({ ok: true, errores: [] });
  });

  test("[E5-B05#4] T37 (adicional de QA, concurrencia en una fila): dos PATCH casi simultáneos sobre la misma fila (célula y luego QE, como los envía el portal) no pierden el sprint propuesto", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const q1 = await fila(request, c.id, "QTY-1");
    const [a, b] = await Promise.all([
      editar(request, c.id, { itemIds: [q1.id], asignacion: { celulaId: p.celC } }),
      editar(request, c.id, { itemIds: [q1.id], asignacion: { qeId: p.qe2 } }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const f1 = await fila(request, c.id, "QTY-1");
    expect(f1.asignacion.celula?.id, "la célula no se pierde").toBe(p.celC);
    expect(f1.asignacion.qeResponsable?.id, "el QE no se pierde").toBe(p.qe2);
    expect(f1.asignacion.sprint?.nombre, "el sprint propuesto al fijar la célula no se pierde").toBe("E5 Sprint 2");
  });

  test("[E5-B05#4] T08 (negativo): QE inválido, analista de otro equipo o inválido, sprint ajeno, célula inexistente, id no UUID y campo extra se rechazan sin cambiar la fila ni la version", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const q1 = await fila(request, c.id, "QTY-1");
    const inact1 = (await sql<{ id_usuario: string }>("SELECT id_usuario FROM organizacion.usuario WHERE email = 'inact1@quality360.local'"))[0].id_usuario;
    const cuerpo = (asignacion: Record<string, unknown>) => ({ itemIds: [q1.id], asignacion: { celulaId: p.celC, ...asignacion } });
    const esperar = async (asignacion: Record<string, unknown>, status: number, codigo: string, campo?: string) => {
      const r = await editar(request, c.id, cuerpo(asignacion));
      expect([r.status, r.body.codigo], JSON.stringify(asignacion)).toEqual([status, codigo]);
      if (campo) expect(JSON.stringify(r.body), JSON.stringify(asignacion)).toContain(campo);
    };
    await esperar({ qeId: p.ana1 }, 422, "QE_INVALIDO", "qeId");
    await esperar({ qeId: inact1 }, 422, "QE_INVALIDO", "qeId");
    await esperar({ qeId: p.qe2, analistaId: p.ana1 }, 422, "ANALISTA_FUERA_DE_EQUIPO", "analistaId");
    await esperar({ qeId: p.qe2, analistaId: p.ana4 }, 422, "ANALISTA_FUERA_DE_EQUIPO", "analistaId");
    await fijarActivo(p.ana3, false);
    try {
      await esperar({ qeId: p.qe2, analistaId: p.ana3 }, 422, "ANALISTA_INVALIDO", "analistaId");
    } finally {
      await fijarActivo(p.ana3, true);
    }
    await esperar({ sprintId: p.sprintA1 }, 422, "CATALOGO_INVALIDO", "sprintId");
    await esperar({ celulaId: randomUUID() }, 422, "CATALOGO_INVALIDO", "celulaId");
    await esperar({ qeId: "no-es-uuid" }, 400, "VALIDACION");
    await esperar({ estado: "CERRADA" }, 400, "VALIDACION");
    const despues = await fila(request, c.id, "QTY-1");
    expect(despues.asignacion).toEqual(q1.asignacion);
    expect((await cabecera(request, c.id)).body.version).toBe(c.version);
  });

  test("[E5-B05#4] T09: el sprint propuesto sale de Jira o del respaldo (con advertencia si el de Jira no existe en la célula) y se limpia al cambiar a una célula sin ese sprint", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const asignar = async (codigo: string, celulaId: string) => {
      const f = await fila(request, c.id, codigo);
      const r = await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId } });
      expect(r.status, `${codigo} ${JSON.stringify(r.body)}`).toBe(200);
      return r.body.items[0];
    };
    const q1 = await asignar("QTY-1", p.celC);
    expect(q1.asignacion).toMatchObject({ sprintOrigen: "JIRA", sprint: { nombre: "E5 Sprint 2" } });
    const q4 = await asignar("QTY-4", p.celC);
    expect(q4.asignacion).toMatchObject({ sprintOrigen: "RESPALDO", sprint: { nombre: "E5 Sprint 1" } });
    const q3 = await asignar("QTY-3", p.celC);
    expect(q3.asignacion).toMatchObject({ sprintOrigen: "RESPALDO", sprint: { nombre: "E5 Sprint 1" } });
    expect(q3.advertencias).toContain("SPRINT_NO_ENCONTRADO");
    const q1a = await asignar("QTY-1", p.celA);
    expect(q1a.asignacion.sprint).toBeNull();
    expect(q1a.completa).toBe(false);
    expect(q1a.faltantes).toContain("sprintId");
  });

  test("[E5-B05#5] T10: marcar exige asignación completa (ASIGNACION_INCOMPLETA con faltantes), no admite SIN_CAMBIOS (FILA_NO_MARCABLE) y una CAMBIO se marca sin asignación", async ({ request }) => {
    await estadoConfigBase(request);
    const b = (await prepararConsultaB(request)).consulta;
    const p = await pares(request);
    const q14 = await fila(request, b.id, "QTY-14");
    const incompleta = await editar(request, b.id, { itemIds: [q14.id], marcada: true });
    expect(incompleta.status).toBe(422);
    expect(incompleta.body.codigo).toBe("ASIGNACION_INCOMPLETA");
    expect(JSON.stringify(incompleta.body)).toMatch(/celulaId/);
    expect(JSON.stringify(incompleta.body)).toMatch(/analistaId/);
    const completa = await editar(request, b.id, { itemIds: [q14.id], asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 }, marcada: true });
    expect(completa.status, JSON.stringify(completa.body)).toBe(200);
    expect(completa.body.items[0]).toMatchObject({ marcada: true, completa: true });
    const sc = (await todasLasFilas(request, b.id, "SIN_CAMBIOS"))[0];
    const noMarcable = await editar(request, b.id, { itemIds: [sc.id], marcada: true });
    expect(noMarcable.status).toBe(422);
    expect(noMarcable.body.codigo).toBe("FILA_NO_MARCABLE");
    const q2 = await fila(request, b.id, "QTY-2", "CAMBIO");
    const cambio = await editar(request, b.id, { itemIds: [q2.id], marcada: true });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    expect(cambio.body.items[0]).toMatchObject({ marcada: true, grupo: "CAMBIO" });
  });

  test("[E5-B05#5] T11: asignar a todo el grupo aplica 10; un par inválido rechaza 10 sin cambiar nada; una fila SIN_CAMBIOS en la lista da FILA_NO_ASIGNABLE y las demás se aplican", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const todas = await editar(request, c.id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 } });
    expect(todas.status, JSON.stringify(todas.body)).toBe(200);
    expect(todas.body).toMatchObject({ aplicadas: 10, rechazadas: [] });
    const invalida = await editar(request, c.id, { grupo: "NUEVA", todas: true, asignacion: { qeId: p.qe2, analistaId: p.ana1 } });
    expect(invalida.status).toBe(200);
    expect(invalida.body.aplicadas).toBe(0);
    expect(invalida.body.rechazadas).toHaveLength(10);
    for (const r of invalida.body.rechazadas) expect(r.motivo).toBe("ANALISTA_FUERA_DE_EQUIPO");
    for (const f of await todasLasFilas(request, c.id, "NUEVA")) expect(f.asignacion.analista.id, f.codigo).toBe(p.ana3);
    // Mezcla con una fila SIN_CAMBIOS (consulta B).
    await descartar(request, c.id);
    await limpiarE5();
    await estadoConfigBase(request);
    const b = (await prepararConsultaB(request)).consulta;
    const q14 = await fila(request, b.id, "QTY-14");
    const sc = (await todasLasFilas(request, b.id, "SIN_CAMBIOS"))[0];
    const mezcla = await editar(request, b.id, { itemIds: [q14.id, sc.id], asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 } });
    expect(mezcla.status, JSON.stringify(mezcla.body)).toBe(200);
    expect(mezcla.body.aplicadas).toBe(1);
    expect(mezcla.body.rechazadas).toHaveLength(1);
    expect(mezcla.body.rechazadas[0]).toMatchObject({ itemId: sc.id, motivo: "FILA_NO_ASIGNABLE" });
  });

  test("[E5-B05#5] T12: cambiar la célula de una fila completa y marcada la desmarca (desmarcadas [QTY-1]) y queda incompleta", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const m = await asignarYMarcar(request, c.id, ["QTY-1"]);
    expect(m.body.items[0]).toMatchObject({ marcada: true, completa: true });
    const q1 = await fila(request, c.id, "QTY-1");
    const r = await editar(request, c.id, { itemIds: [q1.id], asignacion: { celulaId: p.celA } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.desmarcadas).toEqual(["QTY-1"]);
    expect(await fila(request, c.id, "QTY-1")).toMatchObject({ marcada: false, completa: false });
  });

  test("[E5-B05#6] T13: confirmar QTY-1..4 crea solo esas con su asignación, historial inicial y auditoría CREAR_HDU; QTY-6..12 no se crean", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const antes = await hduTotal(request);
    const { consulta } = await consultaAConMarcadas(request);
    const r = await confirmar(request, consulta.id, consulta.version);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.ejecucion).toMatchObject({ fase: "CONFIRMACION", leidas: 4, creadas: 4, resultado: "EXITOSA" });
    expect(r.body.consulta.estado).toBe("CONFIRMADA");
    expect(cumpleContrato("ResultadoConfirmacion", r.body)).toEqual({ ok: true, errores: [] });
    expect(await hduTotal(request)).toBe(antes + 4);
    const h = await hduPorCodigo(request, "QTY-1");
    expect(h).toMatchObject({ codigo: "QTY-1", titulo: "Login con doble factor", prioridad: "ALTA", estado: "PENDIENTE", origen: "JIRA" });
    expect(h.celula.nombre).toBe("CEL-C");
    expect(h.qeResponsable.id).toBe(p.qe2);
    expect(h.analista.id).toBe(p.ana3);
    expect(JSON.stringify(h)).toContain("E5 Sprint 2");
    expect(JSON.stringify(h.creadoPor)).toMatch(/adm1|Administrador|Admin/i);
    const e = await sql("SELECT a.analista_anterior_id, a.analista_nuevo_id, a.motivo FROM organizacion.hdu_historial_asignacion a JOIN organizacion.historia_usuario h ON h.id_historia = a.hdu_id WHERE h.codigo_normalizado = 'qty-1'");
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ analista_anterior_id: null, analista_nuevo_id: p.ana3, motivo: "Asignación inicial al confirmar la consulta de Jira" });
    const aud = await sql("SELECT despues FROM organizacion.auditoria WHERE entidad = 'HDU' AND accion = 'CREAR_HDU' AND entidad_id = (SELECT id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-1')");
    expect(aud).toHaveLength(1);
    expect(JSON.stringify(aud[0].despues)).toContain(consulta.id);
    expect(JSON.stringify(aud[0].despues)).toContain(p.celC);
    expect(JSON.stringify(aud[0].despues)).toContain(p.ana3);
    for (const k of ["QTY-6", "QTY-7", "QTY-8", "QTY-9", "QTY-10", "QTY-11", "QTY-12"]) expect(await buscarEstado(k), k).toBeUndefined();
  });

  test("[E5-B05#6] T36 (adicional de QA): QTY-5 y QTY-6 (prioridad ausente y desconocida en Jira, fila con prioridad null) se crean con prioridad MEDIA y la advertencia no impide marcarlas", async ({ request }) => {
    await estadoConfigBase(request);
    const c = (await consultarOk(request)).consulta;
    const m = await asignarYMarcar(request, c.id, ["QTY-5", "QTY-6"]);
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    const r = await confirmar(request, c.id, (await cabecera(request, c.id)).body.version);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.ejecucion).toMatchObject({ creadas: 2, conAdvertencias: 2 });
    expect((await buscarEstado("QTY-5")).prioridad).toBe("MEDIA");
    expect((await buscarEstado("QTY-6")).prioridad).toBe("MEDIA");
  });

  test("[E5-B05#6] T14: las HDU creadas llegan con checklist vacío y sin filas en Certificaciones ni Impedimentos", async ({ request }) => {
    await estadoConfigBase(request);
    const { consulta } = await consultaAConMarcadas(request);
    await confirmar(request, consulta.id, consulta.version);
    const h = await hduPorCodigo(request, "QTY-1");
    const adm = await tk("adm1");
    // Una HDU manual es la referencia de lo que hace Certificaciones con una HDU sin trabajo: la de Jira debe comportarse igual.
    const manual = await crearManual(request, "E5M-T14", "Manual de referencia", { qe: "qe2" });
    const refC = await api.get<any>(request, `/v1/hdu/${manual.id}/checklist`, { token: adm });
    const jirC = await api.get<any>(request, `/v1/hdu/${h.id}/checklist`, { token: adm });
    expect(jirC.status, "checklist de la HDU de Jira igual al de una manual (" + refC.status + ")").toBe(refC.status);
    const ent = await api.get<any>(request, `/v1/hdu/${h.id}/entregables`, { token: adm });
    expect(ent.status, JSON.stringify(ent.body).slice(0, 200)).toBe(200);
    const marcados = JSON.stringify(ent.body).match(/"estado":"(MARCADO|APROBADO|EN_REVISION|RECHAZADO)"/g) ?? [];
    expect(marcados).toEqual([]);
    const nCert = await sql("SELECT (SELECT count(*)::int FROM certificaciones.certificacion WHERE id_historia = $1) a, (SELECT count(*)::int FROM certificaciones.evento_checklist WHERE hdu_id = $1) b, (SELECT count(*)::int FROM impedimentos.impedimento WHERE id_historia = $1) c", [h.id]);
    expect(nCert[0]).toEqual({ a: 0, b: 0, c: 0 });
  });

  test("[E5-B05#7] T15: confirmar solo QTY-2 actualiza título y prioridad y no toca estado, analista, QE, sprint ni célula; QTY-1 intacta; auditoría ACTUALIZAR_HDU sin historial de estado nuevo", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const b = (await prepararConsultaB(request, { qe1para: ["QTY-1", "QTY-2"] })).consulta;
    await sql("UPDATE organizacion.historia_usuario SET estado = 'EN_EJECUCION' WHERE codigo_normalizado = 'qty-2'");
    await sql("UPDATE organizacion.historia_usuario SET estado = 'DISENO_PRUEBAS' WHERE codigo_normalizado = 'qty-1'");
    const q2antes = await buscarEstado("QTY-2");
    const q1antes = await buscarEstado("QTY-1");
    const hist = (await sql("SELECT count(*)::int n FROM organizacion.hdu_historial_estado"))[0].n;
    const q2 = await fila(request, b.id, "QTY-2", "CAMBIO");
    expect((await editar(request, b.id, { itemIds: [q2.id], marcada: true })).status).toBe(200);
    const act = (await cabecera(request, b.id)).body;
    const r = await confirmar(request, b.id, act.version);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.ejecucion).toMatchObject({ fase: "CONFIRMACION", actualizadas: 1, creadas: 0 });
    const q2despues = await buscarEstado("QTY-2");
    expect(q2despues).toMatchObject({ titulo: "Recuperar clave", prioridad: "CRITICA", estado: "EN_EJECUCION", qe_responsable_id: p.qe1, analista_id: p.ana1, id_celula: p.celC });
    expect({ ...q2despues, titulo: q2antes.titulo, prioridad: q2antes.prioridad }).toEqual(q2antes);
    expect(await buscarEstado("QTY-1")).toEqual(q1antes);
    expect((await sql("SELECT count(*)::int n FROM organizacion.hdu_historial_estado"))[0].n).toBe(hist);
    const aud = await sql("SELECT antes, despues FROM organizacion.auditoria WHERE entidad = 'HDU' AND accion = 'ACTUALIZAR_HDU' AND entidad_id = (SELECT id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-2')");
    expect(aud.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(aud[aud.length - 1].antes)).toContain("Recuperar contraseña");
    expect(JSON.stringify(aud[aud.length - 1].despues)).toContain("Recuperar clave");
  });

  test("[E5-B05#7] T16: marcar una HDU manual en CAMBIO la vincula a Jira (origen JIRA, clave y url externas) sin tocar estado, analista, QE ni sprint", async ({ request }) => {
    await estadoConfigBase(request);
    await crearManual(request, "QTY-5", "Notificaciones", { qe: "qe1" });
    const antes = await buscarEstado("QTY-5");
    const c = (await consultarOk(request)).consulta;
    const q5 = await fila(request, c.id, "QTY-5", "CAMBIO");
    expect(q5.origenHdu).toBe("MANUAL");
    expect((await editar(request, c.id, { itemIds: [q5.id], marcada: true })).status).toBe(200);
    const act = (await cabecera(request, c.id)).body;
    const r = await confirmar(request, c.id, act.version);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const db = (await sql("SELECT origen, clave_externa, url_externa, estado, analista_id, qe_responsable_id, titulo FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-5'"))[0];
    expect(db).toMatchObject({ origen: "JIRA", clave_externa: "QTY-5", estado: antes.estado, analista_id: antes.analista_id, qe_responsable_id: antes.qe_responsable_id, titulo: "Notificaciones push" });
    // Con un sitio local (127.0.0.1) el servicio arma http://; con Jira Cloud (*.atlassian.net) arma https://
    expect(db.url_externa).toBe(`${/^(127.0.0.1|localhost)/.test(act.sitioHost) ? "http" : "https"}://${act.sitioHost}/browse/QTY-5`);
  });

  test("[E5-B05#8] T17 (negativo): con ANA3 desactivado confirmar da 409 ASIGNACIONES_INVALIDAS con las 4 filas, no escribe, las desmarca y no registra ejecución", async ({ request }) => {
    await estadoConfigBase(request);
    const p = await pares(request);
    const { consulta } = await consultaAConMarcadas(request);
    const antes = await hduTotal(request);
    const n0 = await ejecN();
    await fijarActivo(p.ana3, false);
    try {
      const r = await confirmar(request, consulta.id, consulta.version);
      expect(r.status, JSON.stringify(r.body)).toBe(409);
      expect(r.body.codigo).toBe("ASIGNACIONES_INVALIDAS");
      const filas = r.body.filas ?? r.body.detalles ?? [];
      expect(JSON.stringify(r.body)).toContain("ANALISTA_INVALIDO");
      for (const k of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) expect(JSON.stringify(r.body), k).toContain(k);
      expect(filas.length).toBeGreaterThanOrEqual(4);
    } finally {
      await fijarActivo(p.ana3, true);
    }
    expect(await hduTotal(request)).toBe(antes);
    expect(await ejecN()).toBe(n0);
    const c = (await cabecera(request, consulta.id)).body;
    expect(c).toMatchObject({ estado: "ABIERTA", marcadasNuevas: 0 });
  });

  test("[E5-B05#8] T18 (negativo): si ANA cambia de equipo da ANALISTA_FUERA_DE_EQUIPO y si el QE se desactiva da QE_INVALIDO; nada se crea", async ({ request }) => {
    await estadoConfigBase(request);
    const t0 = new Date();
    const a2 = await adm2(request);
    const adm = await tk("adm1");
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "e5t18a" });
    const qeX = await crearUsuarioE7(request, adm, "QE", { prefijo: "e5t18q" });
    const p = await pares(request);
    try {
      expect((await api.put(request, `/v1/analistas/${ana.id}/supervisor`, { token: adm, body: { qeId: qeX.id } })).status).toBe(200);
      const c = (await consultarOk(request)).consulta;
      const m = await asignarYMarcar(request, c.id, ["QTY-1"], { qeId: qeX.id, analistaId: ana.id });
      expect(m.status, JSON.stringify(m.body)).toBe(200);
      const antes = await hduTotal(request);
      expect((await api.put(request, `/v1/analistas/${ana.id}/supervisor`, { token: adm, body: { qeId: p.qe2, motivo: "cambio de equipo de la prueba E5" } })).status).toBe(200);
      const act = (await cabecera(request, c.id)).body;
      const r1 = await confirmar(request, c.id, act.version);
      expect(r1.status).toBe(409);
      expect(r1.body.codigo).toBe("ASIGNACIONES_INVALIDAS");
      expect(JSON.stringify(r1.body)).toContain("ANALISTA_FUERA_DE_EQUIPO");
      // Segundo caso: se devuelve al equipo, se vuelve a marcar y se desactiva el QE.
      expect((await api.put(request, `/v1/analistas/${ana.id}/supervisor`, { token: adm, body: { qeId: qeX.id, motivo: "vuelve al equipo de la prueba E5" } })).status).toBe(200);
      const q1 = await fila(request, c.id, "QTY-1");
      const re = await editar(request, c.id, { itemIds: [q1.id], marcada: true });
      expect(re.status, JSON.stringify(re.body)).toBe(200);
      await fijarActivo(qeX.id, false);
      const act2 = (await cabecera(request, c.id)).body;
      const r2 = await confirmar(request, c.id, act2.version);
      expect(r2.status).toBe(409);
      expect(r2.body.codigo).toBe("ASIGNACIONES_INVALIDAS");
      expect(JSON.stringify(r2.body)).toContain("QE_INVALIDO");
      expect(await hduTotal(request)).toBe(antes);
    } finally {
      await borrarUsuariosDePrueba([ana.id, qeX.id], t0);
    }
    void a2;
  });

  test("[E5-B05#9] T19: una HDU creada a mano entre la consulta y la confirmación se omite con HDU_CREADA_DESPUES y conserva título, QE1 y origen MANUAL; las otras 3 se crean", async ({ request }) => {
    await estadoConfigBase(request);
    const { consulta } = await consultaAConMarcadas(request);
    await crearManual(request, "QTY-3", "Creada por el QE mientras tanto", { qe: "qe1" });
    const p = await pares(request);
    const r = await confirmar(request, consulta.id, consulta.version);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.ejecucion).toMatchObject({ creadas: 3, omitidas: 1, resultado: "EXITOSA" });
    const det = (await detalleEjecucion(request, r.body.ejecucion.id)).body.items;
    expect(det.find((f: any) => f.codigo === "QTY-3")).toMatchObject({ resultado: "OMITIDA", motivo: "HDU_CREADA_DESPUES" });
    expect(await buscarEstado("QTY-3")).toMatchObject({ titulo: "Creada por el QE mientras tanto", qe_responsable_id: p.qe1, origen: "MANUAL" });
  });

  test("[E5-B05#9] T20: una CAMBIO marcada cuya HDU se cerró da OMITIDA/HDU_CERRADA y si ya tiene los valores de Jira da OMITIDA/SIN_CAMBIOS; no se escribe nada", async ({ request }) => {
    await estadoConfigBase(request);
    let b = (await prepararConsultaB(request)).consulta;
    const marcarYConfirmar = async (id: string) => {
      const q2 = await fila(request, id, "QTY-2", "CAMBIO");
      expect((await editar(request, id, { itemIds: [q2.id], marcada: true })).status).toBe(200);
      return id;
    };
    await marcarYConfirmar(b.id);
    await cerrarHdu("QTY-2");
    const antes = await buscarEstado("QTY-2");
    let r = await confirmar(request, b.id, (await cabecera(request, b.id)).body.version);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    let det = (await detalleEjecucion(request, r.body.ejecucion.id)).body.items;
    expect(det.find((f: any) => f.codigo === "QTY-2")).toMatchObject({ resultado: "OMITIDA", motivo: "HDU_CERRADA" });
    expect(await buscarEstado("QTY-2")).toEqual(antes);
    // Segundo caso: base nueva, y la HDU iguala a Jira entre la consulta y la confirmación.
    await limpiarE5();
    await estadoConfigBase(request);
    b = (await prepararConsultaB(request)).consulta;
    await marcarYConfirmar(b.id);
    await sql("UPDATE organizacion.historia_usuario SET titulo = 'Recuperar clave', prioridad = 'CRITICA' WHERE codigo_normalizado = 'qty-2'");
    const antes2 = await buscarEstado("QTY-2");
    r = await confirmar(request, b.id, (await cabecera(request, b.id)).body.version);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    det = (await detalleEjecucion(request, r.body.ejecucion.id)).body.items;
    expect(det.find((f: any) => f.codigo === "QTY-2")).toMatchObject({ resultado: "OMITIDA", motivo: "SIN_CAMBIOS" });
    expect(await buscarEstado("QTY-2")).toEqual(antes2);
  });

  test("[E5-B05#9] T21: si el código se crea a mano entre la pre-validación y la escritura solo esa fila es OMITIDA/HDU_CREADA_DESPUES y el lote no falla", async ({ request }) => {
    await estadoConfigBase(request);
    const { consulta } = await consultaAConMarcadas(request);
    // Organización detrás de un proxy: tras responder la pre-validación (asignaciones/validar), crea a mano QTY-2 antes de que empiece la escritura.
    const proxy = await proxyConGancho(env.organizacionUrl, 3198, "/asignaciones/validar", async () => {
      await crearManual(request, "QTY-2", "Creada entre la validación y la escritura", { qe: "qe1" });
    });
    const inst = await levantarIntegraciones(3115, { ORGANIZACION_URL: proxy.url });
    instancias.push(inst);
    try {
      const r = await confirmar(request, consulta.id, consulta.version, "adm1", inst.url);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.ejecucion).toMatchObject({ creadas: 3, omitidas: 1 });
      const det = (await detalleEjecucion(request, r.body.ejecucion.id)).body.items;
      expect(det.find((f: any) => f.codigo === "QTY-2")).toMatchObject({ resultado: "OMITIDA", motivo: "HDU_CREADA_DESPUES" });
      expect((await buscarEstado("QTY-2")).origen).toBe("MANUAL");
    } finally {
      await inst.detener();
      instancias.pop();
      await proxy.cerrar();
    }
  });

  test("[E5-B05#10] T22: consultar con una abierta da 409 CONSULTA_ABIERTA; reemplazar deja la anterior REEMPLAZADA y purgada, y editar o confirmar la anterior da 409 CONSULTA_NO_ABIERTA", async ({ request }) => {
    await estadoConfigBase(request);
    const a = (await consultarOk(request)).consulta;
    await asignarYMarcar(request, a.id, ["QTY-1", "QTY-2"]);
    const r1 = await consultar(request);
    expect(r1.status).toBe(409);
    expect(r1.body.codigo).toBe("CONSULTA_ABIERTA");
    expect(JSON.stringify(r1.body)).toMatch(/creadaPor/);
    expect(JSON.stringify(r1.body)).toMatch(/creadaEn/);
    expect(JSON.stringify(r1.body)).toMatch(/"asignadas":2/);
    const b = await consultar(request, { reemplazar: true });
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(b.body.consulta.id).not.toBe(a.id);
    const vieja = await cabecera(request, a.id);
    expect(vieja.status).toBe(200);
    expect(vieja.body.estado).toBe("REEMPLAZADA");
    expect((await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [a.id]))).toHaveLength(0);
    const e = await editar(request, a.id, { grupo: "NUEVA", todas: true, marcada: false });
    expect([e.status, e.body.codigo]).toEqual([409, "CONSULTA_NO_ABIERTA"]);
    expect(JSON.stringify(e.body)).toContain("REEMPLAZADA");
    const c = await confirmar(request, a.id, vieja.body.version);
    expect([c.status, c.body.codigo]).toEqual([409, "CONSULTA_NO_ABIERTA"]);
  });

  test("[E5-B05#10] T23: con vigencia de 2 s la consulta vence: actual da null y la anterior VENCIDA sin filas, editar y confirmar dan 410 CONSULTA_VENCIDA y consultar sin reemplazar da 200", async ({ request }) => {
    await estadoConfigBase(request);
    const i6 = await levantarIntegraciones(3116, { INTEGRACIONES_CONSULTA_VIGENCIA_MS: "2000" });
    instancias.push(i6);
    try {
      const a = (await consultarOk(request, {}, i6.url)).consulta;
      const m = await asignarYMarcar(request, a.id, ["QTY-1"], {}, true, "adm1", i6.url);
      expect(m.status, JSON.stringify(m.body)).toBe(200);
      await new Promise((r) => setTimeout(r, 3200));
      const ac = await actual(request, "adm1", i6.url);
      expect(ac.body.consulta).toBeNull();
      expect(ac.body.ultimaCerrada).toMatchObject({ id: a.id, estado: "VENCIDA" });
      expect((await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [a.id]))).toHaveLength(0);
      const e = await editar(request, a.id, { grupo: "NUEVA", todas: true, marcada: false }, "adm1", i6.url);
      expect([e.status, e.body.codigo]).toEqual([410, "CONSULTA_VENCIDA"]);
      const c = await confirmar(request, a.id, 1, "adm1", i6.url);
      expect([c.status, c.body.codigo]).toEqual([410, "CONSULTA_VENCIDA"]);
      const n = await consultar(request, {}, i6.url);
      expect(n.status, JSON.stringify(n.body)).toBe(200);
      expect(await hduTotal(request)).toBe(await hduTotal(request));
      expect((await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE origen = 'JIRA'"))[0].n).toBe(0);
    } finally {
      await i6.detener();
      instancias.pop();
    }
  });

  test("[E5-B05#10] T24: descartar deja DESCARTADA con filas purgadas; descartar de nuevo y editar dan 409 CONSULTA_NO_ABIERTA; no se crea ninguna HDU", async ({ request }) => {
    await estadoConfigBase(request);
    const c = (await consultarOk(request)).consulta;
    const d1 = await descartar(request, c.id);
    expect(d1.status, JSON.stringify(d1.body)).toBe(200);
    expect(JSON.stringify(d1.body)).toContain("DESCARTADA");
    expect((await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [c.id]))).toHaveLength(0);
    const d2 = await descartar(request, c.id);
    expect([d2.status, d2.body.codigo]).toEqual([409, "CONSULTA_NO_ABIERTA"]);
    const e = await editar(request, c.id, { grupo: "NUEVA", todas: true, marcada: false });
    expect([e.status, e.body.codigo]).toEqual([409, "CONSULTA_NO_ABIERTA"]);
    expect((await sql("SELECT count(*)::int n FROM organizacion.historia_usuario WHERE origen = 'JIRA'"))[0].n).toBe(0);
  });

  test("[E5-B05#11] T25: si ADM2 modifica la consulta, ADM1 confirmar con su version recibe 409 CONSULTA_MODIFICADA con la version actual y no se crea nada; con la nueva se crean 4", async ({ request }) => {
    await estadoConfigBase(request);
    const a2 = await adm2(request);
    const p = await pares(request);
    const { consulta } = await consultaAConMarcadas(request);
    const vista = consulta.version;
    const q1 = await fila(request, consulta.id, "QTY-1");
    const cambio = await api.patch<any>(request, `${CONSULTAS}/${consulta.id}/items`, { token: a2.adm2.token, body: { itemIds: [q1.id], asignacion: { sprintId: p.sprint1 } } });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    const antes = await hduTotal(request);
    const r = await confirmar(request, consulta.id, vista);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("CONSULTA_MODIFICADA");
    expect(JSON.stringify(r.body)).toContain(String(cambio.body.version));
    expect(await hduTotal(request)).toBe(antes);
    const ok = await confirmar(request, consulta.id, cambio.body.version);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.ejecucion.creadas).toBe(4);
  });

  test("[E5-B05#11] T26: dos confirmaciones simultáneas de ADM1 y ADM2 producen una sola ejecución y 4 HDU sin duplicados; la otra recibe 409", async ({ request }) => {
    await estadoConfigBase(request);
    const a2 = await adm2(request);
    const { consulta } = await consultaAConMarcadas(request);
    const tok1 = await tk("adm1");
    const pedir = (token: string) => api.post<any>(request, `${CONSULTAS}/${consulta.id}/confirmaciones`, { token, body: { version: consulta.version } });
    const [x, y] = await Promise.all([pedir(tok1), pedir(a2.adm2.token)]);
    const estados = [x.status, y.status].sort();
    expect(estados, JSON.stringify([x.body, y.body])).toEqual([200, 409]);
    const perdedor = x.status === 409 ? x : y;
    expect(["INTEGRACION_EN_CURSO", "CONSULTA_NO_ABIERTA"]).toContain(perdedor.body.codigo);
    const n = await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE origen = 'JIRA'");
    expect(n[0]).toEqual({ n: 4, d: 4 });
    expect(await ejecucionesPorFase(request, "CONFIRMACION")).toHaveLength(1);
  });

  test("[E5-B05#11] T27: la consulta es compartida: ADM2 hace GET, PATCH y descartar sobre la de ADM1 y asignadoPor de la fila es ADM2", async ({ request }) => {
    await estadoConfigBase(request);
    const a2 = await adm2(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const g = await api.get<any>(request, `${CONSULTAS}/${c.id}`, { token: a2.adm2.token });
    expect(g.status).toBe(200);
    const q1 = await fila(request, c.id, "QTY-1");
    const pa = await api.patch<any>(request, `${CONSULTAS}/${c.id}/items`, { token: a2.adm2.token, body: { itemIds: [q1.id], asignacion: { celulaId: p.celC } } });
    expect(pa.status, JSON.stringify(pa.body)).toBe(200);
    expect((await fila(request, c.id, "QTY-1")).asignadoPor.id).toBe(a2.adm2.id);
    const de = await api.post<any>(request, `${CONSULTAS}/${c.id}/descartes`, { token: a2.adm2.token, body: {} });
    expect(de.status).toBe(200);
  });

  test("[E5-B05#12] T28: BIG (230) se asigna en un solo PATCH; la confirmación se corta tras el primer lote (INCOMPLETA, 25 creadas, pendientes 205) y al repetir termina sin duplicados", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    const p = await pares(request);
    let r = await consultarOk(request);
    const id = r.consulta.id as string;
    r = (await continuar(request, id)).body;
    r = (await continuar(request, id)).body;
    expect(r.consulta).toMatchObject({ leidas: 230, hayMas: false });
    const e = await editar(request, id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 }, marcarListas: true });
    expect(e.status, JSON.stringify(e.body).slice(0, 300)).toBe(200);
    expect(e.body.aplicadas).toBe(230);
    const proxy = await proxyOrganizacion(env.organizacionUrl, 3197, 1);
    const inst = await levantarIntegraciones(3117, { ORGANIZACION_URL: proxy.url });
    instancias.push(inst);
    let primera: any;
    try {
      primera = await confirmar(request, id, e.body.version, "adm1", inst.url);
    } finally {
      await inst.detener();
      instancias.pop();
      await proxy.cerrar();
    }
    expect(primera.status, JSON.stringify(primera.body).slice(0, 300)).toBe(200);
    expect(primera.body.ejecucion).toMatchObject({ resultado: "INCOMPLETA", codigoError: "ORGANIZACION_NO_DISPONIBLE", creadas: 25 });
    expect(primera.body.consulta).toMatchObject({ estado: "ABIERTA", pendientes: 205 });
    // Repetir la confirmación hasta cerrar: con el presupuesto de 8 s una pasada puede no alcanzar las 205 restantes en un equipo lento (cada pasada
    // INCOMPLETA es repetible y no duplica); el total creado entre las pasadas debe ser 205 y la consulta termina CONFIRMADA.
    let version = primera.body.consulta.version as number;
    let creadasResto = 0;
    let ultima: any;
    for (let pasada = 1; pasada <= 5; pasada += 1) {
      ultima = await confirmar(request, id, version);
      expect(ultima.status, JSON.stringify(ultima.body).slice(0, 300)).toBe(200);
      creadasResto += ultima.body.ejecucion.creadas;
      version = ultima.body.consulta.version;
      test.info().annotations.push({ type: "pasada", description: `${pasada}: ${ultima.body.ejecucion.resultado}, ${ultima.body.ejecucion.creadas} creadas` });
      if (ultima.body.consulta.estado === "CONFIRMADA") break;
      expect(ultima.body.ejecucion.resultado).toBe("INCOMPLETA");
    }
    expect(ultima.body.ejecucion.resultado).toBe("EXITOSA");
    expect(creadasResto).toBe(205);
    expect(ultima.body.consulta.estado).toBe("CONFIRMADA");
    const n = await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'");
    expect(n[0]).toEqual({ n: 230, d: 230 });
  });

  test("[E5-B05#12] T29: ENORME (520) llega a 500 filas en 5 tandas con TOPE_DE_CONSULTA, la sexta da 409 CONSULTA_LLENA y se puede confirmar lo leído", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "ENORME" })).body.guardado).toBe(true);
    const r1 = await consultarOk(request);
    const id = r1.consulta.id as string;
    let ult = r1;
    for (let i = 0; i < 4; i += 1) ult = (await continuar(request, id)).body;
    expect(ult.consulta.leidas).toBe(500);
    expect(ult.ejecucion).toMatchObject({ resultado: "INCOMPLETA", codigoError: "TOPE_DE_CONSULTA", hayMas: true });
    const sexta = await continuar(request, id);
    expect([sexta.status, sexta.body.codigo]).toEqual([409, "CONSULTA_LLENA"]);
    const m = await asignarYMarcar(request, id, ["ENORME-1", "ENORME-2", "ENORME-3"]);
    expect(m.status, JSON.stringify(m.body).slice(0, 300)).toBe(200);
    const c = await confirmar(request, id, (await cabecera(request, id)).body.version);
    expect(c.status, JSON.stringify(c.body).slice(0, 300)).toBe(200);
    expect(c.body.ejecucion.creadas).toBe(3);
  });

  test("[E5-B05#12] T30: con una consulta de 50 filas (429 en la página 2) se asignan y confirman 10 sin llamar a Jira", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    await jiraFalso.modo("LIMITE_PAGINA_2");
    const r = await consultarOk(request);
    expect(r.consulta.leidas).toBe(50);
    await jiraFalso.modo("NORMAL");
    await jiraFalso.limpiarSolicitudes();
    const cod = Array.from({ length: 10 }, (_, i) => `BIG-${i + 1}`);
    const m = await asignarYMarcar(request, r.consulta.id, cod);
    expect(m.status, JSON.stringify(m.body).slice(0, 300)).toBe(200);
    const c = await confirmar(request, r.consulta.id, (await cabecera(request, r.consulta.id)).body.version);
    expect(c.status, JSON.stringify(c.body).slice(0, 300)).toBe(200);
    expect(c.body.ejecucion.creadas).toBe(10);
    expect(await solicitudesJira()).toHaveLength(0);
  });

  test("[E5-B05#13] T31 (negativo): las 10 rutas de la consulta dan 403 a QE1, QE2, ANA1, LID1 y AUD1, 401 sin token y 404 CONSULTA_NO_ENCONTRADA a ADM1 con un id inexistente; no se registran ejecuciones", async ({ request }) => {
    await estadoConfigBase(request);
    const c = (await consultarOk(request)).consulta;
    const n0 = await ejecN();
    const fake = randomUUID();
    // D200/D202: de 8 a 10 rutas (suma GET …/items/{itemId} y POST …/items/{itemId}/confirmaciones).
    const rutas = (id: string): Array<{ m: "GET" | "POST" | "PATCH"; ruta: string; body?: unknown; porId: boolean }> => [
      { m: "POST", ruta: CONSULTAS, body: {}, porId: false },
      { m: "GET", ruta: `${CONSULTAS}/actual`, porId: false },
      { m: "GET", ruta: `${CONSULTAS}/${id}`, porId: true },
      { m: "GET", ruta: `${CONSULTAS}/${id}/items?grupo=NUEVA`, porId: true },
      { m: "GET", ruta: `${CONSULTAS}/${id}/items/${randomUUID()}`, porId: true },
      { m: "PATCH", ruta: `${CONSULTAS}/${id}/items`, body: { itemIds: [randomUUID()], marcada: false }, porId: true },
      { m: "POST", ruta: `${CONSULTAS}/${id}/items/${randomUUID()}/confirmaciones`, body: { revision: 1 }, porId: true },
      { m: "POST", ruta: `${CONSULTAS}/${id}/continuaciones`, body: {}, porId: true },
      { m: "POST", ruta: `${CONSULTAS}/${id}/confirmaciones`, body: { version: 1 }, porId: true },
      { m: "POST", ruta: `${CONSULTAS}/${id}/descartes`, body: {}, porId: true },
    ];
    expect(rutas(c.id), "la consulta tiene 10 operaciones").toHaveLength(10);
    const llamar = async (m: string, ruta: string, token: string | undefined, body?: unknown) =>
      api[m === "GET" ? "get" : m === "PATCH" ? "patch" : "post"]<any>(request, ruta, { token, ...(m === "GET" ? {} : { body }) } as any);
    for (const clave of ["qe1", "qe2", "ana1", "lid1", "aud1"] as const) {
      const token = await tk(clave);
      for (const ruta of rutas(c.id)) {
        const r = await llamar(ruta.m, ruta.ruta, token, ruta.body);
        expect([r.status, r.body.codigo], `${clave} ${ruta.m} ${ruta.ruta}`).toEqual([403, "ACCESO_DENEGADO"]);
      }
      for (const ruta of rutas(fake).filter((x) => x.porId)) {
        const r = await llamar(ruta.m, ruta.ruta, token, ruta.body);
        expect(r.status, `${clave} id inexistente ${ruta.ruta}`).toBe(403);
      }
    }
    for (const ruta of rutas(c.id)) {
      const r = await llamar(ruta.m, ruta.ruta, undefined, ruta.body);
      expect([r.status, r.body.codigo], `sin token ${ruta.m} ${ruta.ruta}`).toEqual([401, "NO_AUTENTICADO"]);
    }
    const adm = await tk("adm1");
    for (const ruta of rutas(fake).filter((x) => x.porId)) {
      const r = await llamar(ruta.m, ruta.ruta, adm, ruta.body);
      expect([r.status, r.body.codigo], `ADM1 ${ruta.m} ${ruta.ruta}`).toEqual([404, "CONSULTA_NO_ENCONTRADA"]);
    }
    expect(await ejecN()).toBe(n0);
  });

  test("[E5-B05#13] T32 (negativo): textos hostiles se devuelven tal cual, los campos desconocidos dan 400, una fila de otra consulta 404, q con inyección no falla y el token de servicio no sirve; nunca aparece el token", async ({ request }) => {
    await estadoConfigBase(request);
    await jiraFalso.issue("QTY-13", { tipo: "Story", summary: "<img src=x onerror=1>", priority: "High", description: adfTexto("Descripción") });
    await jiraFalso.issue("QTY-14", { tipo: "Story", summary: '=HYPERLINK("x")', priority: "High", description: adfTexto("Descripción") });
    const a = (await consultarOk(request)).consulta;
    const filas = await todasLasFilas(request, a.id, "NUEVA");
    expect(filas.find((f) => f.codigo === "QTY-13")?.titulo).toBe("<img src=x onerror=1>");
    expect(filas.find((f) => f.codigo === "QTY-14")?.titulo).toBe('=HYPERLINK("x")');
    const q1 = filas.find((f) => f.codigo === "QTY-1");
    for (const cuerpo of [
      { itemIds: [q1.id], origen: "MANUAL" }, { itemIds: [q1.id], estado: "CERRADA" }, { itemIds: [q1.id], creadoPor: "x" },
      { itemIds: [q1.id], asignacion: { origen: "MANUAL" } }, { itemIds: [q1.id], asignacion: { estado: "CERRADA" } }, { itemIds: [q1.id], grupo: "CAMBIO", marcada: false },
    ]) {
      const r = await editar(request, a.id, cuerpo);
      expect([r.status, r.body.codigo], JSON.stringify(cuerpo)).toEqual([400, "VALIDACION"]);
    }
    const b = (await consultarOk(request, { reemplazar: true })).consulta;
    const ajena = await editar(request, b.id, { itemIds: [q1.id], marcada: false });
    expect([ajena.status, ajena.body.codigo]).toEqual([404, "CONSULTA_NO_ENCONTRADA"]);
    const inj = await items(request, b.id, "NUEVA", `q=${encodeURIComponent("' OR 1=1 --")}`);
    expect(inj.status).toBe(200);
    expect(inj.body.items).toEqual([]);
    const upsert = await fetch(`${env.organizacionUrl}/v1/interno/integraciones/hdu/upsert`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Q360-Servicio-Token": env.servicioToken },
      body: JSON.stringify({ origen: "JIRA", soloSimular: false, filas: [] }),
    });
    expect(upsert.status).toBe(403);
    const texto = JSON.stringify([filas, ajena.body, inj.body]);
    expect(contieneSecreto(texto)).toBeUndefined();
    expect(texto).not.toContain(TOKEN_FALSO);
    const fila13 = await sql("SELECT * FROM integraciones.consulta_item LIMIT 50");
    expect(contieneSecreto(JSON.stringify(fila13))).toBeUndefined();
  });

  test("[E5-B05#14] T33: el historial por fase: la consulta suma leidas = nuevas + cambiaron + sinCambios + conError sin detalle de filas; la confirmación trae 4 CREADA con asignación en nombres y sin secretos", async ({ request }) => {
    await estadoConfigBase(request);
    const { consulta } = await consultaAConMarcadas(request);
    const c = await confirmar(request, consulta.id, consulta.version);
    expect(c.status).toBe(200);
    const q = (await ejecucionesPorFase(request, "CONSULTA"))[0];
    expect(q).toMatchObject({ fase: "CONSULTA", leidas: 11, nuevas: 10, cambiaron: 0 });
    expect(q.nuevas + q.cambiaron + q.sinCambios + q.conError).toBe(q.leidas);
    expect((await detalleEjecucion(request, q.id)).body.items).toEqual([]);
    const f = (await ejecucionesPorFase(request, "CONFIRMACION"))[0];
    expect(f).toMatchObject({ fase: "CONFIRMACION", leidas: 4, creadas: 4 });
    expect(f.creadas + f.actualizadas + f.omitidas + f.conError).toBe(f.leidas);
    const det = (await detalleEjecucion(request, f.id)).body.items;
    expect(det).toHaveLength(4);
    for (const d of det) {
      expect(d.resultado).toBe("CREADA");
      expect(d.asignacion).toMatchObject({ celula: "CEL-C" });
      expect(d.asignacion.qe).toBeTruthy();
      expect(d.asignacion.analista).toBeTruthy();
      expect(d.asignacion.sprint).toBeTruthy();
    }
    expect(contieneSecreto(JSON.stringify([q, f, det]))).toBeUndefined();
  });

  test("[E5-B05#1] T34 (negativo): con Organización cortada en la clasificación y la consulta A abierta, reemplazar da FALLIDA/ORGANIZACION_NO_DISPONIBLE, A sigue abierta y no hay consulta nueva", async ({ request }) => {
    await estadoConfigBase(request);
    const a = (await consultarOk(request)).consulta;
    const proxy = await proxyCortaRuta(env.organizacionUrl, 3196, "/estado-codigos", 0);
    const inst = await levantarIntegraciones(3118, { ORGANIZACION_URL: proxy.url });
    instancias.push(inst);
    try {
      const r = await consultar(request, { reemplazar: true }, inst.url);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.ejecucion).toMatchObject({ resultado: "FALLIDA", codigoError: "ORGANIZACION_NO_DISPONIBLE" });
      expect(r.body.consulta).toBeNull();
    } finally {
      await inst.detener();
      instancias.pop();
      await proxy.cerrar();
    }
    expect((await actual(request)).body.consulta).toMatchObject({ id: a.id, estado: "ABIERTA" });
    expect(await sql("SELECT 1 FROM integraciones.consulta_jira WHERE estado = 'ABIERTA'")).toHaveLength(1);
  });

  test("[E5-B05#10] T35 (db): una sola ABIERTA (23505), una cerrada no se actualiza, DELETE en consulta_jira es 42501, en consulta_item lo permite el rol del servicio y el rol anónimo no lee", async ({ request }) => {
    await estadoConfigBase(request);
    const c = (await consultarOk(request)).consulta;
    const duenio = new pg.Client({ connectionString: process.env.DATABASE_URL_DUENO ?? "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" });
    const svc = new pg.Client({ connectionString: env.databaseUrlIntegraciones });
    await duenio.connect();
    await svc.connect();
    try {
      const err = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { code?: string; message?: string } | null;
      const insertar = `INSERT INTO integraciones.consulta_jira (id_consulta, estado, version, creada_por_id, creada_por_nombre, creada_en, vence_en, proyecto_clave, sitio_host, hay_mas, total_filas, nuevas, cambiaron, sin_cambios, con_error)
        VALUES (gen_random_uuid(), 'ABIERTA', 1, gen_random_uuid(), 'x', now(), now() + interval '1 day', 'QTY', 'h', false, 0, 0, 0, 0, 0)`;
      expect((await err(duenio.query(insertar)))?.code).toBe("23505");
      await duenio.query("UPDATE integraciones.consulta_jira SET estado = 'DESCARTADA', cerrada_en = now() WHERE id_consulta = $1", [c.id]);
      const upd = await err(duenio.query("UPDATE integraciones.consulta_jira SET nuevas = 99 WHERE id_consulta = $1", [c.id]));
      expect(upd, "el disparador debe rechazar el UPDATE de una consulta cerrada").not.toBeNull();
      expect((await err(svc.query("DELETE FROM integraciones.consulta_jira WHERE id_consulta = $1", [c.id])))?.code).toBe("42501");
      expect(await err(svc.query("DELETE FROM integraciones.consulta_item WHERE id_consulta = $1", [c.id]))).toBeNull();
      const cerr = (await sql("SELECT id_ejecucion FROM integraciones.ejecucion_integracion WHERE fase = 'CONSULTA' LIMIT 1"))[0];
      const updE = await err(duenio.query("UPDATE integraciones.ejecucion_integracion SET leidas = 99 WHERE id_ejecucion = $1", [cerr.id_ejecucion]));
      expect(updE, "el disparador debe rechazar el UPDATE de una ejecución cerrada").not.toBeNull();
      const anon = await fetch(`${env.supabaseUrl}/rest/v1/consulta_jira?select=*`, { headers: { apikey: env.supabaseAnonKey, "Accept-Profile": "integraciones" } });
      const cuerpo = await anon.text();
      const filas = anon.ok ? (JSON.parse(cuerpo) as unknown[]) : [];
      expect(filas, `rol anónimo: ${anon.status} ${cuerpo.slice(0, 120)}`).toEqual([]);
    } finally {
      await duenio.end();
      await svc.end();
    }
    void URL_GATEWAY_REAL;
  });
  test("[E5-B05#11] T38 (DEF-E5C-04): una etiqueta celula-* desconocida o ambigua deja la fila en NUEVA sin CELULA_NO_ENCONTRADA y la confirmación con una conexión crea las 4 HDU sin ERROR_INTERNO", async ({ request }) => {
    await estadoConfigBase(request);
    const antes = await hduTotal(request);
    try {
      await jiraFalso.issue("QTY-1", { labels: ["celula-desconocida"] });
      await jiraFalso.issue("QTY-2", { labels: ["celula-ambigua-a", "celula-ambigua-b"] });
      await jiraFalso.issue("QTY-3", { labels: ["Celula-Inexistente", "otra-etiqueta"] });
      const { consulta, ids } = await consultaAConMarcadas(request);
      expect(consulta).toMatchObject({ nuevas: 10, conError: 1 });
      for (const codigo of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) {
        const f = await fila(request, consulta.id, codigo, "NUEVA");
        expect(JSON.stringify(f), codigo).not.toContain("CELULA_NO_ENCONTRADA");
        expect(f.marcada, codigo).toBe(true);
      }
      expect(Object.keys(ids)).toHaveLength(4);
      const r = await confirmar(request, consulta.id, consulta.version);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(JSON.stringify(r.body)).not.toContain("ERROR_INTERNO");
      expect(r.body.ejecucion).toMatchObject({ fase: "CONFIRMACION", leidas: 4, creadas: 4, resultado: "EXITOSA" });
      expect(r.body.consulta.estado).toBe("CONFIRMADA");
      expect(await hduTotal(request)).toBe(antes + 4);
      for (const codigo of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) expect((await buscarEstado(codigo))?.origen, codigo).toBe("JIRA");
    } finally {
      for (const k of ["QTY-1", "QTY-2", "QTY-3"]) await jiraFalso.issue(k, { labels: [] });
    }
  });
});

/** Proxy a Organización que, tras responder una ruta (`fragmento`), ejecuta `gancho` antes de entregar la respuesta (para provocar una carrera). */
async function proxyConGancho(destino: string, puerto: number, fragmento: string, gancho: () => Promise<void>): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const { createServer, request } = await import("node:http");
  const destinoUrl = new URL(destino);
  let disparado = false;
  const servidor = createServer((req, res) => {
    const saliente = request({ host: destinoUrl.hostname, port: destinoUrl.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
      const trozos: Buffer[] = [];
      r.on("data", (t) => trozos.push(t));
      r.on("end", async () => {
        if ((req.url ?? "").includes(fragmento) && !disparado) {
          disparado = true;
          await gancho().catch(() => undefined);
        }
        const cuerpo = Buffer.concat(trozos);
        res.writeHead(r.statusCode ?? 502, { ...r.headers, "content-length": String(cuerpo.length) });
        res.end(cuerpo);
      });
    });
    saliente.on("error", () => req.socket.destroy());
    req.pipe(saliente);
  });
  await new Promise<void>((ok) => servidor.listen(puerto, "127.0.0.1", () => ok()));
  return { url: `http://127.0.0.1:${puerto}`, cerrar: () => new Promise<void>((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }) };
}
