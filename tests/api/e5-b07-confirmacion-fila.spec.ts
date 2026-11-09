import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { env } from "../support/env";
import {
  CONSULTAS, actual, asignarYMarcar, cabecera, confirmar, consultar, consultarOk, crearManual, descartar, editar, ejecucionesPorFase, fijarActivo, fila, items, pares, solicitudesJira, todasLasFilas,
} from "../support/e5c";
import { crearArnesDetalle, crearEquipo, confirmarFila, filasDetalleDb, obtenerItem, prepararDetalle, proxyCortaRespuesta, registrosE5D, type ArnesDetalle } from "../support/e5d";
import { contarHdu, detalleEjecucion, ejecuciones, estadoConfigBase, guardarConfigBase, hduPorCodigo, limpiarE5, sql, tk } from "../support/e5";
import { levantarGateway, levantarIntegraciones, proxyOrganizacion, type InstanciaE5 } from "../support/entornoE5";
import { jiraFalso } from "../support/jira-falso/cliente";

/** E5-B07 · Asignación por HDU y HDU ya asignada (15 escenarios) y los ajustes de E5-B05 / E5-B04. Solo el Administrador. */
test.describe.configure({ mode: "default" });
let arnes: ArnesDetalle | undefined;
const extras: Array<() => Promise<void>> = [];
const instancias: InstanciaE5[] = [];
const cierres: Array<() => Promise<void>> = [];
test.afterAll(async () => {
  await Promise.all(instancias.map((i) => i.detener()));
  for (const c of cierres) await c().catch(() => undefined);
  await jiraFalso.reset();
  await limpiarE5();
  for (const l of extras) await l().catch(() => undefined);
  await arnes?.limpiar();
});
test.afterEach(async () => {
  await jiraFalso.modo("NORMAL");
});

const GATEWAY_REAL = process.env.GATEWAY_REAL_URL ?? "http://localhost:3000";
async function A(request: Parameters<typeof crearArnesDetalle>[0]): Promise<ArnesDetalle> {
  arnes ??= await crearArnesDetalle(request);
  return arnes;
}
const hduEn = async (codigo: string) => (await sql("SELECT id_historia, titulo, qe_responsable_id, analista_id, id_celula, origen, estado FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo]))[0];
const auditoriasCrear = async (codigo: string) => sql("SELECT actor_id, despues FROM organizacion.auditoria WHERE entidad = 'HDU' AND accion = 'CREAR_HDU' AND entidad_id = (SELECT id_historia FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1))", [codigo]);
const nombreDe = async (id: string) => (await sql<{ nombre: string }>("SELECT nombre FROM organizacion.usuario WHERE id_usuario = $1", [id]))[0].nombre;
const dbItem = async (consultaId: string, codigo: string) => (await sql("SELECT * FROM integraciones.consulta_item WHERE id_consulta = $1 AND codigo_normalizado = upper($2)", [consultaId, codigo]))[0];

/** Consulta de QTY con la fila lista (célula + QE + Analista explícitos o automáticos). Devuelve la fila. */
async function filaLista(request: Parameters<typeof fila>[0], consultaId: string, codigo: string, qeId: string, analistaId?: string) {
  const p = await pares(request);
  const f = await fila(request, consultaId, codigo);
  const r = await editar(request, consultaId, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId, ...(analistaId ? { analistaId } : {}) } });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.items.find((i: any) => i.id === f.id);
}

test.describe("E5-B07 · Asignación por HDU", () => {
  test("[E5-B07#1] T01: QE con un solo Analista activo: PATCH con qeId sin analistaId lo asigna solo (analistaAuto true) y subir version y revision; también en el PATCH en grupo; al cambiar de QE se recalcula", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const a = await A(request);
    const c = (await consultarOk(request)).consulta;
    const antes = await fila(request, c.id, "QTY-1");
    const r = await editar(request, c.id, { itemIds: [antes.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const f = r.body.items[0];
    expect(f.asignacion.analista.id).toBe(p.ana3);
    expect(f).toMatchObject({ analistaAuto: true, completa: true, faltantes: [] }); // célula, QE, analista automático y el sprint propuesto desde Jira
    expect(f.revision).toBeGreaterThan(antes.revision);
    expect(r.body.version).toBeGreaterThan(c.version);
    expect(cumpleContrato("ItemConsulta", f)).toEqual({ ok: true, errores: [] });
    expect((await dbItem(c.id, "QTY-1")).analista_auto).toBe(true);
    // PATCH en grupo: todas las NUEVA quedan con ANA3 automático.
    const g = await editar(request, c.id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2 } });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    const nuevas = await todasLasFilas(request, c.id, "NUEVA");
    expect(nuevas.length).toBeGreaterThan(5);
    expect(nuevas.every((x) => x.asignacion.analista?.id === p.ana3 && x.analistaAuto === true)).toBe(true);
    // Cambiar de QE recalcula: QE1 tiene dos analistas → se limpia y deja de ser automático; QE6 tiene uno activo → ANA6.
    const aQe1 = await editar(request, c.id, { itemIds: [antes.id], asignacion: { qeId: p.qe1 } });
    expect(aQe1.status).toBe(200);
    expect(aQe1.body.items[0]).toMatchObject({ analistaAuto: false });
    expect(aQe1.body.items[0].asignacion.analista).toBeNull();
    const aQe6 = await editar(request, c.id, { itemIds: [antes.id], asignacion: { qeId: a.qe6.id } });
    expect(aQe6.body.items[0].asignacion.analista.id).toBe(a.qe6.ana6);
    expect(aQe6.body.items[0].analistaAuto).toBe(true);
  });

  test("[E5-B07#2] T02: 0, 2 o más, o un activo con inactivos: 0 y 2+ dejan analistaId null sin error; 1 activo + inactivos asigna el activo; una supervisión cerrada no cuenta", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const a = await A(request);
    const c = (await consultarOk(request)).consulta;
    const f = await fila(request, c.id, "QTY-2");
    const probar = async (qeId: string) => (await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId } })).body.items[0];
    const sin = await probar(a.qe5.id);
    expect([sin.asignacion.analista, sin.analistaAuto, sin.asignacion.qeResponsable.id]).toEqual([null, false, a.qe5.id]);
    const dos = await probar(p.qe1);
    expect([dos.asignacion.analista, dos.analistaAuto]).toEqual([null, false]);
    const mixto = await probar(a.qe6.id);
    expect([mixto.asignacion.analista.id, mixto.analistaAuto]).toEqual([a.qe6.ana6, true]);
    // Supervisión cerrada: el analista pasó de QE8 a QE9. QE8 queda sin analistas; QE9 tiene uno.
    const qe8 = await crearEquipo(request, 1, "e5qe8");
    const qe9 = await crearEquipo(request, 0, "e5qe9");
    extras.push(qe8.limpiar, qe9.limpiar);
    const mover = await api.put<any>(request, `/v1/analistas/${qe8.analistas[0].id}/supervisor`, { token: await tk("adm1"), body: { qeId: qe9.qeId, motivo: "QA: la supervisión anterior queda cerrada" } });
    expect(mover.status, JSON.stringify(mover.body)).toBe(200);
    const cerrada = await probar(qe8.qeId);
    expect([cerrada.asignacion.analista, cerrada.analistaAuto]).toEqual([null, false]);
    const nuevaRel = await probar(qe9.qeId);
    expect([nuevaRel.asignacion.analista.id, nuevaRel.analistaAuto]).toEqual([qe8.analistas[0].id, true]);
    // PATCH en grupo con QE sin analistas: sin error y sin analista.
    const g = await editar(request, c.id, { grupo: "NUEVA", todas: true, asignacion: { celulaId: p.celC, qeId: a.qe5.id } });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    expect((await todasLasFilas(request, c.id, "NUEVA")).every((x) => x.asignacion.analista === null && x.analistaAuto === false)).toBe(true);
  });

  test("[E5-B07#3] T03: analista explícito: se respeta y se valida (ANALISTA_FUERA_DE_EQUIPO, ANALISTA_INVALIDO) y analistaAuto queda false", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const f = await fila(request, c.id, "QTY-3");
    const ok = await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe1, analistaId: p.ana1 } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.items[0]).toMatchObject({ analistaAuto: false });
    expect(ok.body.items[0].asignacion.analista.id).toBe(p.ana1);
    // QE2 supervisa solo a ANA3, pero si el Administrador manda a ANA3 explícito no es «automático».
    const explicito = await editar(request, c.id, { itemIds: [f.id], asignacion: { qeId: p.qe2, analistaId: p.ana3 } });
    expect(explicito.status).toBe(200);
    expect(explicito.body.items[0]).toMatchObject({ analistaAuto: false });
    const fuera = await editar(request, c.id, { itemIds: [f.id], asignacion: { qeId: p.qe2, analistaId: p.ana1 } });
    expect([fuera.status, fuera.body.codigo]).toEqual([422, "ANALISTA_FUERA_DE_EQUIPO"]);
    const invalido = await editar(request, c.id, { itemIds: [f.id], asignacion: { qeId: p.qe2, analistaId: p.qe1 } });
    expect([invalido.status, invalido.body.codigo]).toEqual([422, "ANALISTA_INVALIDO"]);
    const fila2 = await fila(request, c.id, "QTY-3");
    expect(fila2.asignacion.analista.id, "un rechazo no cambia la fila").toBe(p.ana3);
  });

  test("[E5-B07#4] T04: confirmar una HDU crea la HDU con célula, QE, Analista y sprint, historial inicial, auditoría CREAR_HDU con consultaId, fila aplicada, version sube y no llama a Jira (la consulta sigue ABIERTA)", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const antesHdu = await contarHdu(request);
    const f0 = await filaLista(request, c.id, "QTY-1", p.qe2);
    expect(f0).toMatchObject({ completa: true, analistaAuto: true, marcada: false, aplicada: false });
    await jiraFalso.modo("CAIDO");
    await jiraFalso.limpiarSolicitudes();
    const r = await confirmarFila(request, c.id, f0.id, f0.revision);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await solicitudesJira(), "confirmar una fila no llama a Jira").toEqual([]);
    await jiraFalso.modo("NORMAL");
    expect(cumpleContrato("ResultadoConfirmacionFila", r.body)).toEqual({ ok: true, errores: [] });
    expect(r.body).toMatchObject({ resultado: "CREADA", repetida: false });
    expect(r.body.hdu).toMatchObject({ codigo: "QTY-1" });
    expect(r.body.item).toMatchObject({ codigo: "QTY-1", aplicada: true, marcada: true, aplicando: false });
    expect(r.body.item.aplicacion).toMatchObject({ alcance: "HDU" });
    expect(r.body.item.revision).toBeGreaterThan(f0.revision);
    expect(r.body.consulta).toMatchObject({ estado: "ABIERTA", creadas: 1 });
    expect(r.body.consulta.version).toBeGreaterThan(c.version);
    expect(Date.parse(r.body.consulta.venceEn), "la vigencia no se renueva (D205)").toBe(Date.parse(c.venceEn));
    expect(await contarHdu(request)).toBe(antesHdu + 1);
    const h = await hduPorCodigo(request, "QTY-1");
    expect(h).toMatchObject({ codigo: "QTY-1", titulo: "Login con doble factor", prioridad: "ALTA", estado: "PENDIENTE", origen: "JIRA" });
    expect([h.celula.nombre, h.qeResponsable.id, h.analista.id]).toEqual(["CEL-C", p.qe2, p.ana3]);
    expect(JSON.stringify(h)).toContain("E5 Sprint 2");
    const hist = await sql("SELECT a.analista_anterior_id, a.analista_nuevo_id, a.motivo FROM organizacion.hdu_historial_asignacion a JOIN organizacion.historia_usuario h ON h.id_historia = a.hdu_id WHERE h.codigo_normalizado = 'qty-1'");
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ analista_anterior_id: null, analista_nuevo_id: p.ana3 });
    const aud = await auditoriasCrear("QTY-1");
    expect(aud).toHaveLength(1);
    expect(JSON.stringify(aud[0].despues)).toContain(c.id);
    expect((await dbItem(c.id, "QTY-1"))).toMatchObject({ aplicada: true, marcada: true, alcance_aplicacion: "HDU" });
    // Las otras filas siguen como estaban y la consulta sigue en el panel (actual).
    expect((await actual(request)).body.consulta).toMatchObject({ id: c.id, estado: "ABIERTA", creadas: 1 });
  });

  test("[E5-B07#5] T05: fila incompleta o no nueva: 422 ASIGNACION_INCOMPLETA (con faltantes) o 422 FILA_NO_ASIGNABLE; nada se crea; el cuerpo mal formado da 400", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    await crearManual(request, "QTY-4", "Filtrar por fecha", { prioridad: "BAJA", descripcion: "Texto corto" }); // SIN_CAMBIOS
    await crearManual(request, "QTY-3", "Título distinto en Quality360", { prioridad: "MEDIA" }); // CAMBIO
    const c = (await consultarOk(request)).consulta;
    const antes = await contarHdu(request);
    const incompleta = await fila(request, c.id, "QTY-2");
    const r1 = await confirmarFila(request, c.id, incompleta.id, incompleta.revision);
    expect([r1.status, r1.body.codigo]).toEqual([422, "ASIGNACION_INCOMPLETA"]);
    expect(JSON.stringify(r1.body)).toMatch(/celula|qe|analista|sprint/);
    expect(JSON.stringify(r1.body)).toContain("detalles");
    // Con QE1 (dos analistas) y sin analista queda «falta: analista».
    const f2 = await filaLista(request, c.id, "QTY-2", p.qe1);
    const r2 = await confirmarFila(request, c.id, f2.id, f2.revision);
    expect([r2.status, r2.body.codigo]).toEqual([422, "ASIGNACION_INCOMPLETA"]);
    expect(JSON.stringify(r2.body)).toContain("analista");
    for (const [codigo, grupo] of [["QTY-4", "SIN_CAMBIOS"], ["QTY-3", "CAMBIO"], ["QTY-11", "CON_ERROR"]] as const) {
      const f = await fila(request, c.id, codigo, grupo);
      const r = await confirmarFila(request, c.id, f.id, f.revision);
      expect([r.status, r.body.codigo], `${codigo} en ${grupo}`).toEqual([422, "FILA_NO_ASIGNABLE"]);
    }
    expect(await contarHdu(request)).toBe(antes);
    expect(await hduEn("QTY-2")).toBeUndefined();
    // Cuerpo: campos desconocidos, revision no entera o ausente → 400.
    const f = await filaLista(request, c.id, "QTY-1", p.qe2);
    for (const body of [{ revision: f.revision, extra: 1 }, { revision: "1" }, { revision: 0 }, { revision: 1.5 }, {}, []]) {
      const r = await confirmarFila(request, c.id, f.id, null, { body: body as any });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(await hduEn("QTY-1")).toBeUndefined();
  });

  test("[E5-B07#6] T06: una HDU creada a mano antes de consultar aparece con yaAsignada (SIN_CAMBIOS y CAMBIO); el PATCH de asignación y el POST sobre esas filas dan 422 FILA_NO_ASIGNABLE (contrato) y un PATCH con marcada sobre CAMBIO sigue igual", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    await crearManual(request, "QTY-4", "Filtrar por fecha", { prioridad: "BAJA", descripcion: "Texto corto" });
    await crearManual(request, "QTY-3", "Otro título de Quality360", { prioridad: "MEDIA" });
    const c = (await consultarOk(request)).consulta;
    const qe1Nombre = await nombreDe(p.qe1);
    const sc = await fila(request, c.id, "QTY-4", "SIN_CAMBIOS");
    expect(sc.yaAsignada).toMatchObject({ qe: qe1Nombre, analista: null, idHistoria: (await hduEn("QTY-4")).id_historia });
    expect(cumpleContrato("ItemConsulta", sc)).toEqual({ ok: true, errores: [] });
    const cam = await fila(request, c.id, "QTY-3", "CAMBIO");
    expect(cam.yaAsignada).toMatchObject({ qe: qe1Nombre, analista: null });
    const patch = await editar(request, c.id, { itemIds: [sc.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } });
    expect(patch.status, JSON.stringify(patch.body)).toBeGreaterThanOrEqual(400);
    expect(patch.body.codigo).toBe("FILA_NO_ASIGNABLE");
    // Decisión contra el contrato: el orden documentado es 422 FILA_NO_ASIGNABLE (no es NUEVA) → 409 HDU_YA_ASIGNADA; el backlog #6 dice 409 para el POST.
    const post = await confirmarFila(request, c.id, sc.id, sc.revision);
    expect([post.status, post.body.codigo]).toEqual([422, "FILA_NO_ASIGNABLE"]);
    const postCambio = await confirmarFila(request, c.id, cam.id, cam.revision);
    expect([postCambio.status, postCambio.body.codigo]).toEqual([422, "FILA_NO_ASIGNABLE"]);
    // Marcar una CAMBIO sigue permitido y conserva yaAsignada.
    const marcar = await editar(request, c.id, { itemIds: [cam.id], marcada: true });
    expect(marcar.status, JSON.stringify(marcar.body)).toBe(200);
    expect(marcar.body.items[0]).toMatchObject({ marcada: true });
    expect(marcar.body.items[0].yaAsignada).toMatchObject({ qe: qe1Nombre });
    // Con Analista: la fila lo nombra al consultar de nuevo.
    const hduId = (await hduEn("QTY-4")).id_historia;
    const as = await api.put<any>(request, `/v1/hdu/${hduId}/analista`, { token: await tk("qe1"), body: { analistaId: p.ana1 } });
    expect(as.status, JSON.stringify(as.body)).toBe(200);
    await descartar(request, c.id);
    const c2 = (await consultarOk(request)).consulta;
    expect((await fila(request, c2.id, "QTY-4", "SIN_CAMBIOS")).yaAsignada).toMatchObject({ qe: qe1Nombre, analista: await nombreDe(p.ana1) });
  });

  test("[E5-B07#7] T07: se asignó durante la revisión: POST da 409 HDU_YA_ASIGNADA con los nombres actuales, la HDU existente no cambia, la fila queda yaAsignada/desmarcada y el PATCH es 422 HDU_YA_ASIGNADA", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const f0 = await filaLista(request, c.id, "QTY-1", p.qe2);
    // QE1 la crea a mano mientras el Administrador revisa, y luego le asigna a ANA2.
    const manual = await crearManual(request, "QTY-1", "QTY-1 creada a mano por el QE", { prioridad: "BAJA" });
    const idHdu = manual.id ?? manual.idHistoria ?? (await hduEn("QTY-1")).id_historia;
    const as = await api.put<any>(request, `/v1/hdu/${idHdu}/analista`, { token: await tk("qe1"), body: { analistaId: p.ana2 } });
    expect(as.status, JSON.stringify(as.body)).toBe(200);
    const antes = await hduEn("QTY-1");
    const total = await contarHdu(request);
    const r = await confirmarFila(request, c.id, f0.id, f0.revision);
    expect([r.status, r.body.codigo], JSON.stringify(r.body)).toEqual([409, "HDU_YA_ASIGNADA"]);
    expect(cumpleContrato("ErrorHduYaAsignada", r.body)).toEqual({ ok: true, errores: [] });
    expect(r.body.yaAsignada).toEqual({ idHistoria: idHdu, qe: await nombreDe(p.qe1), analista: await nombreDe(p.ana2) });
    expect(r.body.item).toMatchObject({ codigo: "QTY-1", marcada: false, aplicada: false });
    expect(r.body.item.yaAsignada).toEqual(r.body.yaAsignada);
    expect(await hduEn("QTY-1"), "la HDU existente no cambia").toEqual(antes);
    expect(await contarHdu(request)).toBe(total);
    expect((await auditoriasCrear("QTY-1")).length, "la creación manual es la única CREAR_HDU").toBe(1);
    const enLista = await fila(request, c.id, "QTY-1");
    expect(enLista.yaAsignada).toEqual(r.body.yaAsignada);
    // Solo lectura: PATCH → 422 HDU_YA_ASIGNADA con el mismo cuerpo; POST de nuevo → 409 HDU_YA_ASIGNADA.
    const patch = await editar(request, c.id, { itemIds: [f0.id], asignacion: { qeId: p.qe1 } });
    expect([patch.status, patch.body.codigo]).toEqual([422, "HDU_YA_ASIGNADA"]);
    expect(patch.body.yaAsignada).toEqual(r.body.yaAsignada);
    const otra = await confirmarFila(request, c.id, f0.id, enLista.revision);
    expect([otra.status, otra.body.codigo]).toEqual([409, "HDU_YA_ASIGNADA"]);
    const marcar = await editar(request, c.id, { itemIds: [f0.id], marcada: true });
    expect(marcar.status, "una fila ya asignada no se puede marcar").toBeGreaterThanOrEqual(400);
    // El GET detalle trae la misma fila para pintar la alerta en el panel.
    expect((await obtenerItem(request, c.id, f0.id)).body.item.yaAsignada).toEqual(r.body.yaAsignada);
    // El lote la ignora: nada que confirmar.
    const lote = await confirmar(request, c.id, (await cabecera(request, c.id)).body.version);
    expect([lote.status, lote.body.codigo]).toEqual([422, "SIN_SELECCION"]);
  });

  test("[E5-B07#8] T08: dos Administradores confirman la misma fila a la vez (4 rondas): exactamente uno recibe 200, el otro 409 HDU_YA_ASIGNADA o FILA_EN_CURSO, una sola HDU y una sola auditoría; el reintento de ADM1 es 200 repetida y el de ADM2 sigue en 409", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const a = await A(request);
    const c = (await consultarOk(request)).consulta;
    const resultados: Array<{ codigo: string; s1: number; s2: number; c1?: string; c2?: string }> = [];
    for (const codigo of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) {
      const f = await filaLista(request, c.id, codigo, p.qe2);
      const [r1, r2] = await Promise.all([
        confirmarFila(request, c.id, f.id, f.revision),
        confirmarFila(request, c.id, f.id, f.revision, { token: a.adm2.token }),
      ]);
      resultados.push({ codigo, s1: r1.status, s2: r2.status, c1: r1.body.codigo, c2: r2.body.codigo });
      const estados = [r1.status, r2.status].sort();
      expect(estados, `${codigo}: ${JSON.stringify([r1.body, r2.body]).slice(0, 400)}`).toEqual([200, 409]);
      const perdedor = r1.status === 409 ? r1 : r2;
      expect(["HDU_YA_ASIGNADA", "FILA_EN_CURSO"], codigo).toContain(perdedor.body.codigo);
      expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo_normalizado = lower($1)", [codigo])).toHaveLength(1);
      expect(await auditoriasCrear(codigo)).toHaveLength(1);
      const ganador = r1.status === 200 ? "adm1" : "adm2";
      // Reintentos: el ganador recibe lo mismo con repetida; el otro sigue en 409.
      const ganadorToken = ganador === "adm1" ? undefined : a.adm2.token;
      const perdedorToken = ganador === "adm1" ? a.adm2.token : undefined;
      const rev = (await fila(request, c.id, codigo)).revision;
      const reintentoGanador = await confirmarFila(request, c.id, f.id, rev, { token: ganadorToken });
      expect(reintentoGanador.status, JSON.stringify(reintentoGanador.body)).toBe(200);
      expect(reintentoGanador.body.repetida).toBe(true);
      const reintentoOtro = await confirmarFila(request, c.id, f.id, rev, { token: perdedorToken });
      expect([reintentoOtro.status, reintentoOtro.body.codigo], codigo).toEqual([409, "HDU_YA_ASIGNADA"]);
      expect(await auditoriasCrear(codigo)).toHaveLength(1);
    }
    test.info().annotations.push({ type: "carreras", description: JSON.stringify(resultados) });
    expect((await actual(request)).body.consulta.creadas).toBe(4);
  });

  test("[E5-B07#9] T09: ADM2 cambia el Analista después de que ADM1 vio la fila: el POST de ADM1 con la revision vieja da 409 FILA_MODIFICADA con la fila actual y no crea nada; con la revision nueva crea", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const a = await A(request);
    const c = (await consultarOk(request)).consulta;
    const vista = await filaLista(request, c.id, "QTY-1", p.qe1, p.ana1);
    const cambio = await editar(request, c.id, { itemIds: [vista.id], asignacion: { analistaId: p.ana2 } }, "adm1");
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    const r = await confirmarFila(request, c.id, vista.id, vista.revision, { token: a.adm2.token });
    expect([r.status, r.body.codigo], JSON.stringify(r.body)).toEqual([409, "FILA_MODIFICADA"]);
    expect(cumpleContrato("ErrorFilaModificada", r.body)).toEqual({ ok: true, errores: [] });
    expect(r.body.item.asignacion.analista.id).toBe(p.ana2);
    expect(r.body.item.revision).toBeGreaterThan(vista.revision);
    expect(await hduEn("QTY-1")).toBeUndefined();
    expect((await dbItem(c.id, "QTY-1")).aplicando_desde).toBeNull();
    const buena = await confirmarFila(request, c.id, vista.id, r.body.item.revision, { token: a.adm2.token });
    expect(buena.status, JSON.stringify(buena.body)).toBe(200);
    expect((await hduEn("QTY-1")).analista_id).toBe(p.ana2);
  });

  test("[E5-B07#10] T10: la asignación dejó de ser válida (Analista desactivado, Analista fuera del equipo, QE desactivado): 409 ASIGNACIONES_INVALIDAS con una fila y el motivo, nada se escribe y la fila queda desmarcada con el campo limpio", async ({ request }) => {
    await prepararDetalle(request);
    const c = (await consultarOk(request)).consulta;
    const eq = await crearEquipo(request, 2, "e5inv");
    extras.push(eq.limpiar);
    const [aA, aB] = eq.analistas;
    const destinoOtro = await crearEquipo(request, 0, "e5dst"); // otro QE (no los de la semilla): así QE1 y QE2 conservan sus equipos
    extras.push(destinoOtro.limpiar);
    const p = await pares(request);
    const total = await contarHdu(request);
    // (a) Analista desactivado.
    const f1 = await filaLista(request, c.id, "QTY-1", eq.qeId, aA.id);
    expect((await editar(request, c.id, { itemIds: [f1.id], marcada: true })).status).toBe(200);
    await fijarActivo(aA.id, false);
    const r1 = await confirmarFila(request, c.id, f1.id, (await fila(request, c.id, "QTY-1")).revision);
    expect([r1.status, r1.body.codigo], JSON.stringify(r1.body)).toEqual([409, "ASIGNACIONES_INVALIDAS"]);
    expect(cumpleContrato("ErrorAsignacionesInvalidas", r1.body)).toEqual({ ok: true, errores: [] });
    expect(JSON.stringify(r1.body)).toContain("ANALISTA_INVALIDO");
    const tras1 = await fila(request, c.id, "QTY-1");
    expect(tras1).toMatchObject({ marcada: false, aplicada: false });
    expect(tras1.asignacion.analista).toBeNull();
    expect(tras1.faltantes).toContain("analistaId");
    expect(await hduEn("QTY-1")).toBeUndefined();
    expect((await dbItem(c.id, "QTY-1")).aplicando_desde, "la toma se libera").toBeNull();
    await fijarActivo(aA.id, true);
    // (b) Analista cambió de equipo.
    const f2 = await filaLista(request, c.id, "QTY-2", eq.qeId, aB.id);
    const mover = await api.put<any>(request, `/v1/analistas/${aB.id}/supervisor`, { token: await tk("adm1"), body: { qeId: destinoOtro.qeId, motivo: "QA: cambia de equipo" } });
    expect(mover.status, JSON.stringify(mover.body)).toBe(200);
    const r2 = await confirmarFila(request, c.id, f2.id, f2.revision);
    expect([r2.status, r2.body.codigo], JSON.stringify(r2.body)).toEqual([409, "ASIGNACIONES_INVALIDAS"]);
    expect(JSON.stringify(r2.body)).toContain("ANALISTA_FUERA_DE_EQUIPO");
    expect((await fila(request, c.id, "QTY-2")).asignacion.analista).toBeNull();
    // (c) QE desactivado.
    const f3 = await filaLista(request, c.id, "QTY-3", eq.qeId, aA.id);
    await fijarActivo(eq.qeId, false);
    const r3 = await confirmarFila(request, c.id, f3.id, f3.revision);
    expect([r3.status, r3.body.codigo], JSON.stringify(r3.body)).toEqual([409, "ASIGNACIONES_INVALIDAS"]);
    expect(JSON.stringify(r3.body)).toContain("QE_INVALIDO");
    await fijarActivo(eq.qeId, true);
    expect(await contarHdu(request)).toBe(total);
    expect(await hduEn("QTY-3")).toBeUndefined();
  });

  test("[E5-B07#11] T11: reintento y falla parcial: (a) Organización crea la HDU pero la respuesta se pierde: el reintento da 200 repetida sin duplicar; (b) Organización no responde: 503 y la fila no queda aplicando", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    // (a)
    const proxyA = await proxyCortaRespuesta(env.organizacionUrl, 3196, "/hdu/upsert", 1);
    cierres.push(proxyA.cerrar);
    const instA = await levantarIntegraciones(3141, { ORGANIZACION_URL: proxyA.url });
    instancias.push(instA);
    try {
      const f = await filaLista(request, c.id, "QTY-1", p.qe2);
      const r1 = await confirmarFila(request, c.id, f.id, f.revision, { baseURL: instA.url });
      expect(r1.status, JSON.stringify(r1.body)).toBe(503);
      expect(["SERVICIO_NO_DISPONIBLE", "ORGANIZACION_NO_DISPONIBLE"], "contrato: SERVICIO_NO_DISPONIBLE; backlog B07#11: ORGANIZACION_NO_DISPONIBLE").toContain(r1.body.codigo);
      test.info().annotations.push({ type: "codigo-503-confirmar-fila", description: String(r1.body.codigo) });
      expect(proxyA.cortadas()).toBe(1);
      expect(await hduEn("QTY-1"), "Organización sí la creó").toBeDefined();
      expect((await dbItem(c.id, "QTY-1")).aplicando_desde, "la toma se libera").toBeNull();
      expect((await dbItem(c.id, "QTY-1")).aplicada).toBe(false);
      const rev = (await fila(request, c.id, "QTY-1")).revision;
      const r2 = await confirmarFila(request, c.id, f.id, rev, { baseURL: instA.url });
      expect(r2.status, JSON.stringify(r2.body)).toBe(200);
      expect(r2.body).toMatchObject({ resultado: "CREADA", repetida: true });
      expect(r2.body.item).toMatchObject({ aplicada: true });
      expect(r2.body.consulta.creadas).toBe(1);
      expect(await sql("SELECT 1 FROM organizacion.historia_usuario WHERE codigo_normalizado = 'qty-1'")).toHaveLength(1);
      expect(await auditoriasCrear("QTY-1")).toHaveLength(1);
      const ej = (await ejecucionesPorFase(request, "CONFIRMACION")).filter((e) => e.alcance === "HDU");
      expect(ej.filter((e) => e.consultaId === c.id), "una sola ejecución por la HDU").toHaveLength(1);
    } finally {
      await instA.detener();
      instancias.pop();
      await proxyA.cerrar();
      cierres.pop();
    }
    // (b)
    const proxyB = await proxyOrganizacion(env.organizacionUrl, 3197, 0);
    const instB = await levantarIntegraciones(3142, { ORGANIZACION_URL: proxyB.url });
    instancias.push(instB);
    try {
      const f = await filaLista(request, c.id, "QTY-2", p.qe2);
      const t0 = Date.now();
      const r = await confirmarFila(request, c.id, f.id, f.revision, { baseURL: instB.url });
      expect(r.status, JSON.stringify(r.body)).toBe(503);
      expect(Date.now() - t0).toBeLessThan(15_000);
      expect(await hduEn("QTY-2")).toBeUndefined();
      expect((await dbItem(c.id, "QTY-2")).aplicando_desde, "no queda aplicando más de 30 s: se libera de inmediato").toBeNull();
      expect(JSON.stringify(r.body)).not.toMatch(/stack|at .*\(.*:\d+:\d+\)/);
    } finally {
      await instB.detener();
      instancias.pop();
      await proxyB.cerrar();
    }
    const ok = await confirmarFila(request, c.id, (await fila(request, c.id, "QTY-2")).id, (await fila(request, c.id, "QTY-2")).revision);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  test("[E5-B07#12] T12: coexistencia con el lote: el lote omite lo aplicado una a una, no lo cuenta, crea solo las marcadas pendientes y, con cero pendientes, da 422 SIN_SELECCION", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const antes = await contarHdu(request);
    const f1 = await filaLista(request, c.id, "QTY-1", p.qe2);
    const f2 = await filaLista(request, c.id, "QTY-2", p.qe2);
    for (const f of [f1, f2]) expect((await confirmarFila(request, c.id, f.id, f.revision)).status).toBe(200);
    const asig = await asignarYMarcar(request, c.id, ["QTY-3", "QTY-4"]);
    expect(asig.status, JSON.stringify(asig.body)).toBe(200);
    // QTY-5 queda sin marcar. Las dos ya creadas no se pueden marcar de nuevo (ya aplicadas) y no entran al lote.
    const version = (await cabecera(request, c.id)).body.version;
    const lote = await confirmar(request, c.id, version);
    expect(lote.status, JSON.stringify(lote.body)).toBe(200);
    expect(cumpleContrato("ResultadoConfirmacion", lote.body)).toEqual({ ok: true, errores: [] });
    expect(lote.body.ejecucion).toMatchObject({ fase: "CONFIRMACION", alcance: "LOTE", leidas: 2, creadas: 2, resultado: "EXITOSA" });
    expect(lote.body.consulta).toMatchObject({ estado: "CONFIRMADA", creadas: 4 });
    expect(await contarHdu(request)).toBe(antes + 4);
    for (const k of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) expect(await auditoriasCrear(k), k).toHaveLength(1);
    expect(await hduEn("QTY-5")).toBeUndefined();
    // Sin marcadas pendientes: 422 SIN_SELECCION (nueva consulta; una sola ya creada una a una y ninguna marcada).
    const c2 = (await consultarOk(request)).consulta;
    const g = await filaLista(request, c2.id, "QTY-6", p.qe2);
    expect((await confirmarFila(request, c2.id, g.id, g.revision)).status).toBe(200);
    const sin = await confirmar(request, c2.id, (await cabecera(request, c2.id)).body.version);
    expect([sin.status, sin.body.codigo]).toEqual([422, "SIN_SELECCION"]);
    expect((await cabecera(request, c2.id)).body.estado, "la consulta sigue abierta").toBe("ABIERTA");
  });

  test("[E5-B07#13] T13: vida de la consulta: las HDU creadas una a una no cierran ni renuevan la consulta y permanecen al descartar o reemplazar; los contadores informan creadas y perdidas", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const f1 = await filaLista(request, c.id, "QTY-1", p.qe2);
    const f2 = await filaLista(request, c.id, "QTY-2", p.qe2);
    const r1 = await confirmarFila(request, c.id, f1.id, f1.revision);
    const r2 = await confirmarFila(request, c.id, f2.id, f2.revision);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const cab = (await cabecera(request, c.id)).body;
    expect(cab).toMatchObject({ estado: "ABIERTA", creadas: 2 });
    expect(Date.parse(cab.venceEn)).toBe(Date.parse(c.venceEn));
    expect(cab.version).toBeGreaterThan(c.version);
    // Reemplazar: las dos HDU permanecen, las demás filas se purgan, la anterior queda REEMPLAZADA con creadas = 2.
    const conflicto = await consultar(request, {});
    expect(conflicto.status).toBe(409);
    // El diálogo de reemplazo (F02#4) toma «N creadas» de la consulta actual: el cuerpo del 409 no lo trae (contrato ErrorConsultaAbierta).
    expect(conflicto.body.codigo).toBe("CONSULTA_ABIERTA");
    expect(JSON.stringify(conflicto.body)).toMatch(/"asignadas":/);
    expect((await actual(request)).body.consulta).toMatchObject({ id: c.id, creadas: 2 });
    const nueva = await consultar(request, { reemplazar: true });
    expect(nueva.status, JSON.stringify(nueva.body)).toBe(200);
    const vieja = (await cabecera(request, c.id)).body;
    expect(vieja).toMatchObject({ estado: "REEMPLAZADA", creadas: 2 });
    expect(await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [c.id])).toHaveLength(0);
    expect(await hduEn("QTY-1")).toBeDefined();
    expect(await hduEn("QTY-2")).toBeDefined();
    // En la consulta nueva esas dos son «sin cambios» con yaAsignada (nombres actuales).
    const q1 = await fila(request, nueva.body.consulta.id, "QTY-1", "SIN_CAMBIOS");
    expect(q1.yaAsignada).toMatchObject({ qe: await nombreDe(p.qe2), analista: await nombreDe(p.ana3) });
    // Descartar: las HDU siguen, la consulta DESCARTADA conserva creadas.
    const f3 = await filaLista(request, nueva.body.consulta.id, "QTY-3", p.qe2);
    expect((await confirmarFila(request, nueva.body.consulta.id, f3.id, f3.revision)).status).toBe(200);
    expect((await descartar(request, nueva.body.consulta.id)).status).toBe(200);
    const desc = (await cabecera(request, nueva.body.consulta.id)).body;
    expect(desc).toMatchObject({ estado: "DESCARTADA", creadas: 1 });
    expect(await hduEn("QTY-3")).toBeDefined();
    expect(await sql("SELECT 1 FROM integraciones.consulta_item WHERE id_consulta = $1", [nueva.body.consulta.id])).toHaveLength(0);
  });

  test("[E5-B07#12] T18 (supuestos del portal): con 1 HDU creada una a una y un lote cortado a mitad, `creadas` cuenta fila y lote, `marcadasNuevas` incluye lo aplicado, `marcadasNuevas - creadas` = pendientes y repetir el lote termina sin duplicar", async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const f1 = await fila(request, c.id, "BIG-1");
    const e1 = await editar(request, c.id, { itemIds: [f1.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } });
    expect(e1.status, JSON.stringify(e1.body).slice(0, 200)).toBe(200);
    const uno = await confirmarFila(request, c.id, f1.id, e1.body.items[0].revision);
    expect(uno.status, JSON.stringify(uno.body).slice(0, 300)).toBe(200);
    expect(uno.body.consulta).toMatchObject({ creadas: 1, aplicadas: 1, pendientes: 0, marcadasNuevas: 1 });
    // 60 filas marcadas para el lote (BIG-2 a BIG-61).
    const ids: string[] = [];
    for (let n = 2; n <= 61; n += 1) ids.push((await fila(request, c.id, `BIG-${n}`)).id);
    const e = await editar(request, c.id, { itemIds: ids, asignacion: { celulaId: p.celC, qeId: p.qe2 }, marcada: true });
    expect(e.status, JSON.stringify(e.body).slice(0, 300)).toBe(200);
    expect(e.body.marcadasNuevas ?? (await cabecera(request, c.id)).body.marcadasNuevas).toBe(61);
    const antes = (await cabecera(request, c.id)).body;
    expect(antes).toMatchObject({ creadas: 1, aplicadas: 1, pendientes: 60, marcadasNuevas: 61 });
    expect(antes.marcadasNuevas - antes.creadas, "N de «Confirmar marcadas (N)» antes del lote").toBe(60);
    const proxy = await proxyOrganizacion(env.organizacionUrl, 3199, 1);
    const inst = await levantarIntegraciones(3145, { ORGANIZACION_URL: proxy.url });
    instancias.push(inst);
    let primera: any;
    try {
      primera = await confirmar(request, c.id, antes.version, "adm1", inst.url);
    } finally {
      await inst.detener();
      instancias.pop();
      await proxy.cerrar();
    }
    expect(primera.status, JSON.stringify(primera.body).slice(0, 300)).toBe(200);
    expect(primera.body.ejecucion).toMatchObject({ resultado: "INCOMPLETA", creadas: 25 });
    const k = (await cabecera(request, c.id)).body;
    test.info().annotations.push({ type: "contadores-tras-lote-incompleto", description: JSON.stringify({ creadas: k.creadas, aplicadas: k.aplicadas, pendientes: k.pendientes, marcadasNuevas: k.marcadasNuevas }) });
    expect(k).toMatchObject({ estado: "ABIERTA", marcadasNuevas: 61, aplicadas: 26, pendientes: 35 });
    expect(k.creadas, "creadas suma la fila y las 25 del lote").toBe(26);
    expect(k.marcadasNuevas - k.creadas, "N de «Confirmar marcadas (N)» = pendientes del lote").toBe(k.pendientes);
    // Repetir el lote crea solo las 35 restantes (omite lo aplicado) y la consulta se confirma con creadas = 61.
    let version = k.version;
    let ultima: any;
    let creadasResto = 0;
    for (let pasada = 1; pasada <= 4; pasada += 1) {
      ultima = await confirmar(request, c.id, version);
      expect(ultima.status, JSON.stringify(ultima.body).slice(0, 300)).toBe(200);
      creadasResto += ultima.body.ejecucion.creadas;
      version = ultima.body.consulta.version;
      if (ultima.body.consulta.estado === "CONFIRMADA") break;
    }
    expect(creadasResto).toBe(35);
    expect(ultima.body.consulta).toMatchObject({ estado: "CONFIRMADA", creadas: 61 });
    expect((await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'"))[0]).toEqual({ n: 61, d: 61 });
    expect((await auditoriasCrear("BIG-1")).length).toBe(1);
  });

  test("[E5-B07#8] T19: la toma atómica de la fila: con la fila tomada por otra petición el POST da 409 FILA_EN_CURSO, el lote la omite sin contarla, y la toma vence a los 2 s (INTEGRACIONES_TOMA_FILA_MS=2000)", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const inst = await levantarIntegraciones(3147, { INTEGRACIONES_TOMA_FILA_MS: "2000" });
    instancias.push(inst);
    try {
      const c = (await consultarOk(request, {}, inst.url)).consulta;
      const f1 = await filaLista(request, c.id, "QTY-1", p.qe2);
      const f2 = await filaLista(request, c.id, "QTY-2", p.qe2);
      const f3 = await filaLista(request, c.id, "QTY-3", p.qe2);
      expect((await editar(request, c.id, { itemIds: [f2.id, f3.id], marcada: true }, "adm1", inst.url)).status).toBe(200);
      // «Otra petición» tiene tomada QTY-1: simulado con el dueño de la base.
      await sql("UPDATE integraciones.consulta_item SET aplicando_desde = now() WHERE id_item = $1", [f1.id]);
      const enCurso = await confirmarFila(request, c.id, f1.id, f1.revision, { baseURL: inst.url });
      expect([enCurso.status, enCurso.body.codigo], JSON.stringify(enCurso.body).slice(0, 300)).toEqual([409, "FILA_EN_CURSO"]);
      expect(await hduEn("QTY-1")).toBeUndefined();
      expect(await auditoriasCrear("QTY-1")).toHaveLength(0);
      expect((await dbItem(c.id, "QTY-1")).aplicando_desde, "perder la carrera no borra la toma ajena").not.toBeNull();
      // La toma vence sola (2 s): el POST vuelve a funcionar.
      await new Promise((r) => setTimeout(r, 2600));
      const ok = await confirmarFila(request, c.id, f1.id, f1.revision, { baseURL: inst.url });
      expect(ok.status, JSON.stringify(ok.body).slice(0, 300)).toBe(200);
      expect(ok.body.repetida).toBe(false);
      // El lote omite una fila marcada que otra petición tiene tomada ahora: crea solo QTY-2, no cuenta QTY-3 y la consulta sigue abierta.
      await sql("UPDATE integraciones.consulta_item SET aplicando_desde = now() WHERE id_item = $1", [f3.id]);
      const lote = await confirmar(request, c.id, (await cabecera(request, c.id)).body.version, "adm1", inst.url);
      expect(lote.status, JSON.stringify(lote.body).slice(0, 300)).toBe(200);
      test.info().annotations.push({ type: "lote-con-fila-tomada", description: JSON.stringify({ ejecucion: lote.body.ejecucion, consulta: { estado: lote.body.consulta.estado, pendientes: lote.body.consulta.pendientes, creadas: lote.body.consulta.creadas } }) });
      expect(lote.body.ejecucion).toMatchObject({ alcance: "LOTE", creadas: 1 });
      expect(await hduEn("QTY-2")).toBeDefined();
      expect(await hduEn("QTY-3"), "la fila tomada por otra petición no entra al lote").toBeUndefined();
      // OBS-D2: sin otras marcadas pendientes el lote cierra la consulta (CONFIRMADA) y la fila tomada, que sigue marcada, se purga con ella: su confirmación en vuelo ya no podrá marcarla (D205).
      expect(lote.body.consulta).toMatchObject({ estado: "CONFIRMADA", creadas: 2 });
      const tarde = await confirmarFila(request, c.id, f3.id, f3.revision, { baseURL: inst.url });
      expect([tarde.status, tarde.body.codigo]).toEqual([409, "CONSULTA_NO_ABIERTA"]);
      expect(await hduEn("QTY-3")).toBeUndefined();
    } finally {
      await inst.detener();
      instancias.pop();
    }
  });

  test("[E5-B07#11] T20 (lote con Organización lenta): si Organización escribe un lote pero responde después del tiempo límite, repetir el lote no pierde ni duplica HDU (60 de 60) y la consulta termina CONFIRMADA con todas aplicadas", async ({ request }) => {
    test.setTimeout(240_000);
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: "BIG" })).body.guardado).toBe(true);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const ids: string[] = [];
    for (let n = 1; n <= 60; n += 1) ids.push((await fila(request, c.id, `BIG-${n}`)).id);
    const e = await editar(request, c.id, { itemIds: ids, asignacion: { celulaId: p.celC, qeId: p.qe2 }, marcada: true });
    expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBe(200);
    // Cada fila CREADA retrasa 100 ms la respuesta del upsert (25 filas = 2,5 s) y Integraciones espera solo 1 s: el lote falla en Integraciones pero Organización ya escribió.
    const proxy = await proxyOrganizacion(env.organizacionUrl, 3188, null, 100);
    const inst = await levantarIntegraciones(3148, { ORGANIZACION_URL: proxy.url, ORGANIZACION_TIMEOUT_MS: "1000" });
    instancias.push(inst);
    const pasadas: unknown[] = [];
    try {
      let version = (await cabecera(request, c.id)).body.version as number;
      for (let pasada = 1; pasada <= 8; pasada += 1) {
        const r = await confirmar(request, c.id, version, "adm1", inst.url);
        expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
        pasadas.push({ pasada, resultado: r.body.ejecucion.resultado, codigo: r.body.ejecucion.codigoError, creadas: r.body.ejecucion.creadas, omitidas: r.body.ejecucion.omitidas, estado: r.body.consulta.estado, pendientes: r.body.consulta.pendientes });
        version = r.body.consulta.version;
        if (r.body.consulta.estado === "CONFIRMADA") break;
      }
    } finally {
      await inst.detener();
      instancias.pop();
      await proxy.cerrar();
    }
    test.info().annotations.push({ type: "pasadas", description: JSON.stringify(pasadas) });
    const k = (await cabecera(request, c.id)).body;
    expect((await sql("SELECT count(*)::int n, count(DISTINCT codigo_normalizado)::int d FROM organizacion.historia_usuario WHERE codigo LIKE 'BIG-%'"))[0], `ninguna HDU perdida ni duplicada; pasadas: ${JSON.stringify(pasadas)}`).toEqual({ n: 60, d: 60 });
    expect(k.estado, JSON.stringify(pasadas)).toBe("CONFIRMADA");
    expect((await sql("SELECT count(*)::int n FROM organizacion.auditoria WHERE accion = 'CREAR_HDU' AND despues::text LIKE $1", [`%${c.id}%`]))[0].n, "una auditoría CREAR_HDU por HDU").toBe(60);
  });

  test("[E5-B07#13] T14: al vencer la consulta (vigencia de 2 s) las HDU creadas una a una permanecen; la confirmación de una fila posterior da 410", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const i6 = await levantarIntegraciones(3143, { INTEGRACIONES_CONSULTA_VIGENCIA_MS: "2500" });
    instancias.push(i6);
    try {
      const c = (await consultarOk(request, {}, i6.url)).consulta;
      const f1 = await fila(request, c.id, "QTY-1");
      const f2 = await fila(request, c.id, "QTY-2");
      for (const f of [f1, f2]) {
        const e = await editar(request, c.id, { itemIds: [f.id], asignacion: { celulaId: p.celC, qeId: p.qe2 } }, "adm1", i6.url);
        expect(e.status, JSON.stringify(e.body)).toBe(200);
      }
      const rev1 = (await fila(request, c.id, "QTY-1")).revision;
      expect((await confirmarFila(request, c.id, f1.id, rev1, { baseURL: i6.url })).status).toBe(200);
      await new Promise((r) => setTimeout(r, 3500));
      const rev2 = (await sql("SELECT revision FROM integraciones.consulta_item WHERE id_item = $1", [f2.id]))[0]?.revision ?? 1;
      const vencida = await confirmarFila(request, c.id, f2.id, rev2, { baseURL: i6.url });
      expect([vencida.status, vencida.body.codigo]).toEqual([410, "CONSULTA_VENCIDA"]);
      expect(await hduEn("QTY-1"), "lo ya creado se conserva").toBeDefined();
      expect(await hduEn("QTY-2")).toBeUndefined();
      expect((await actual(request, "adm1", i6.url)).body.ultimaCerrada).toMatchObject({ id: c.id, estado: "VENCIDA", creadas: 1 });
    } finally {
      await i6.detener();
      instancias.pop();
    }
  });

  test("[E5-B07#14] T15: permisos y orden de validación: 401 → 403 → 404 → 400/422 de estructura → 410 → 409; 403 a QE, Líder, Analista y Auditor; sin secretos; las 2 rutas nuevas pasan el gateway real", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const f = await filaLista(request, c.id, "QTY-1", p.qe2);
    const ruta = `${CONSULTAS}/${c.id}/items/${f.id}/confirmaciones`;
    expect((await api.post<any>(request, ruta, { body: { revision: f.revision } })).status).toBe(401);
    expect((await api.post<any>(request, ruta, { token: "token-invalido", body: { revision: f.revision } })).status).toBe(401);
    for (const clave of ["qe1", "qe2", "ana1", "lid1", "aud1"] as const) {
      const r = await confirmarFila(request, c.id, f.id, f.revision, { clave });
      expect([r.status, r.body.codigo], clave).toEqual([403, "ACCESO_DENEGADO"]);
      // 403 antes que 404: ni siquiera con ids ajenos.
      const ajeno = await confirmarFila(request, "00000000-0000-4000-8000-000000000000", "00000000-0000-4000-8000-000000000001", 1, { clave });
      expect([ajeno.status, ajeno.body.codigo], `${clave} con ids ajenos`).toEqual([403, "ACCESO_DENEGADO"]);
      const get = await obtenerItem(request, c.id, f.id, clave);
      expect(get.status, `${clave} GET`).toBe(403);
    }
    expect(await hduEn("QTY-1")).toBeUndefined();
    const nc = await confirmarFila(request, "00000000-0000-4000-8000-000000000000", f.id, 1);
    expect([nc.status, nc.body.codigo]).toEqual([404, "CONSULTA_NO_ENCONTRADA"]);
    const nf = await confirmarFila(request, c.id, "00000000-0000-4000-8000-000000000000", 1);
    expect([nf.status, nf.body.codigo]).toEqual([404, "CONSULTA_NO_ENCONTRADA"]);
    // 404 antes que 400: con un cuerpo inválido pero ids ajenos manda el 404.
    const antes400 = await confirmarFila(request, "00000000-0000-4000-8000-000000000000", f.id, null, { body: { revision: "x" } });
    expect(antes400.status).toBe(404);
    const malo = await confirmarFila(request, c.id, f.id, null, { body: { revision: f.revision, intruso: true } });
    expect([malo.status, malo.body.codigo]).toEqual([400, "VALIDACION"]);
    expect(JSON.stringify(malo.body)).not.toMatch(/Bearer|Authorization|eyJ/);
    const idMalo = await confirmarFila(request, c.id, "no-es-uuid", f.revision);
    expect(idMalo.status).toBe(400);
    // 410 antes que 409 antes que 422: la consulta cerrada responde 409; una vencida, 410 (T07 y T14).
    const noNueva = await fila(request, c.id, "QTY-11", "CON_ERROR");
    expect((await confirmarFila(request, c.id, noNueva.id, 1)).body.codigo).toBe("FILA_NO_ASIGNABLE");
    expect((await descartar(request, c.id)).status).toBe(200);
    const cerrada = await confirmarFila(request, c.id, f.id, f.revision);
    expect([cerrada.status, cerrada.body.codigo]).toEqual([409, "CONSULTA_NO_ABIERTA"]);
    expect(registrosE5D()).not.toMatch(/Bearer eyJ|Basic [A-Za-z0-9+/=]{12,}/);
    // Cubo de tasa de la consulta (D152) en un gateway recién levantado (el cubo es por IP y por minuto: uno compartido arrastra el consumo de otras corridas).
    // El cubo general de escritura vale 30/min; si el POST de la fila estuviera en él, daría 429 desde el 31.
    const c2 = (await consultarOk(request, { reemplazar: true })).consulta;
    const f2 = await fila(request, c2.id, "QTY-2");
    const token = await tk("adm1");
    const gw = await levantarGateway(3198, { LIMITE_TASA_MAX: "100000", LIMITE_TASA_ESCRITURA_MAX: "30", LIMITE_TASA_CONSULTA_MAX: "" });
    instancias.push(gw);
    let tooMany = 0;
    let primero429 = 0;
    try {
      for (let i = 1; i <= 130; i += 1) {
        const resp = await fetch(`${gw.url}${CONSULTAS}/${c2.id}/items/${f2.id}/confirmaciones`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ revision: 999 }) });
        if (resp.status === 429) { tooMany += 1; primero429 ||= i; }
        else expect([409, 422], `POST ${i}: ${resp.status}`).toContain(resp.status);
      }
    } finally {
      await gw.detener();
      instancias.pop();
    }
    test.info().annotations.push({ type: "cubo-consulta", description: `primer 429 en la petición ${primero429}; 429 en total: ${tooMany}` });
    expect(primero429, "el POST de la fila usa el cubo de la consulta (120/min), no el de escritura (30/min)").toBe(121);
    expect(tooMany, "120 pasan y las 10 siguientes dan 429 (cubo propio de la consulta, D152)").toBe(10);
  });

  test("[E5-B07#1] T17 (contrato interno, OD1/OD2): asignaciones/validar con proponerAnalista devuelve analistasActivos y analistaPropuesto solo si es 1 activo; estado-codigos suma analista; el token de servicio da 403", async ({ request }) => {
    const p = await pares(request);
    const a = await A(request);
    await crearManual(request, "E5M-INT1", "HDU interna", { prioridad: "MEDIA" });
    const hduId = (await hduEn("E5M-INT1")).id_historia;
    const as = await api.put<any>(request, `/v1/hdu/${hduId}/analista`, { token: await tk("qe1"), body: { analistaId: p.ana1 } });
    expect(as.status, JSON.stringify(as.body)).toBe(200);
    const adm = await tk("adm1");
    const interno = (ruta: string, body: unknown, headers: Record<string, string> = {}, token = adm) =>
      api.post<any>(request, ruta, { baseURL: env.organizacionUrl, token, body, headers });
    const asignaciones = [p.qe2, p.qe1, a.qe5.id, a.qe6.id].map((qe, i) => ({ ref: `r${i}`, celulaId: p.celC, qeResponsableId: qe, proponerAnalista: true }));
    const v = await interno("/v1/interno/integraciones/asignaciones/validar", { asignaciones });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    expect(cumpleContrato("ResultadoValidarAsignaciones", v.body)).toEqual({ ok: true, errores: [] });
    const r = v.body.resultados;
    expect(r.map((x: any) => [x.analistasActivos, x.analistaPropuesto?.id ?? null])).toEqual([[1, p.ana3], [2, null], [0, null], [1, a.qe6.ana6]]);
    // Con analistaId explícito no se propone; sin proponerAnalista tampoco hay propuesta.
    const e = await interno("/v1/interno/integraciones/asignaciones/validar", { asignaciones: [{ ref: "x", qeResponsableId: p.qe2, analistaId: p.ana3, proponerAnalista: true }, { ref: "y", qeResponsableId: p.qe2 }] });
    expect(e.status).toBe(200);
    expect(e.body.resultados[0].analistaPropuesto ?? null).toBeNull();
    expect(e.body.resultados[1].analistaPropuesto ?? null).toBeNull();
    const ec = await interno("/v1/interno/integraciones/hdu/estado-codigos", { codigos: ["E5M-INT1", "NO-EXISTE-1"] });
    expect(ec.status, JSON.stringify(ec.body)).toBe(200);
    expect(cumpleContrato("ResultadoEstadoCodigos", ec.body)).toEqual({ ok: true, errores: [] });
    const [existe, noExiste] = ec.body.resultados ?? ec.body.items;
    expect(existe).toMatchObject({ existe: true, qeResponsable: await nombreDe(p.qe1), analista: await nombreDe(p.ana1) });
    expect(noExiste).toMatchObject({ existe: false });
    // La credencial de servicio y la ausencia de sesión no entran.
    expect((await interno("/v1/interno/integraciones/asignaciones/validar", { asignaciones }, { "X-Q360-Servicio-Token": env.servicioToken }, "")).status, "la credencial de servicio sola: 403 (contrato)").toBe(403);
    expect((await interno("/v1/interno/integraciones/asignaciones/validar", { asignaciones }, {}, "")).status, "sin sesión").toBe(401);
    expect((await interno("/v1/interno/integraciones/asignaciones/validar", { asignaciones }, { "X-Q360-Servicio-Token": env.servicioToken }, await tk("qe1"))).status).toBe(403);
    expect((await interno("/v1/interno/integraciones/asignaciones/validar", { asignaciones }, {}, await tk("qe1"))).status).toBe(403);
  });

  test("[E5-B07#15] T16: registro: confirmar una fila deja una ejecución CONFIRMACION con alcance HDU, leidas 1, detalle con la asignación en nombres, visible a Administrador y Auditor; el filtro alcance separa HDU de LOTE", async ({ request }) => {
    await prepararDetalle(request);
    const p = await pares(request);
    const c = (await consultarOk(request)).consulta;
    const f = await filaLista(request, c.id, "QTY-1", p.qe2);
    const r = await confirmarFila(request, c.id, f.id, f.revision);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const ej = r.body.ejecucion;
    expect(cumpleContrato("Ejecucion", ej)).toEqual({ ok: true, errores: [] });
    expect(ej).toMatchObject({ fase: "CONFIRMACION", alcance: "HDU", leidas: 1, creadas: 1, resultado: "EXITOSA", consultaId: c.id });
    expect(ej.terminadaEn).toBeTruthy();
    for (const clave of ["adm1", "aud1"] as const) {
      const lista = await ejecuciones(request, "fase=CONFIRMACION&alcance=HDU&tamanoPagina=100", clave);
      expect(lista.status, clave).toBe(200);
      expect(lista.body.items.map((e: any) => e.id), clave).toContain(ej.id);
      expect(lista.body.items.every((e: any) => e.alcance === "HDU"), `${clave}: el filtro deja solo alcance HDU`).toBe(true);
      const det = await detalleEjecucion(request, ej.id, "tamanoPagina=100", clave);
      expect(det.status, clave).toBe(200);
      expect(det.body.items).toHaveLength(1);
      expect(JSON.stringify(det.body.items[0])).toContain("QTY-1");
      expect(det.body.items[0].asignacion).toMatchObject({ celula: "CEL-C", qe: await nombreDe(p.qe2), analista: await nombreDe(p.ana3) });
    }
    // Invariante de D141: el detalle cuenta lo que dice la ejecución.
    expect((await sql("SELECT count(*)::int n FROM integraciones.detalle_ejecucion WHERE id_ejecucion = $1", [ej.id]))[0].n).toBe(ej.leidas);
    expect((await sql("SELECT alcance, terminada_en IS NOT NULL AS cerrada FROM integraciones.ejecucion_integracion WHERE id_ejecucion = $1", [ej.id]))[0]).toEqual({ alcance: "HDU", cerrada: true });
    // El lote tiene alcance LOTE y el filtro LOTE no incluye la ejecución HDU.
    const f2 = await filaLista(request, c.id, "QTY-2", p.qe2);
    expect((await editar(request, c.id, { itemIds: [f2.id], marcada: true })).status).toBe(200);
    const lote = await confirmar(request, c.id, (await cabecera(request, c.id)).body.version);
    expect(lote.status, JSON.stringify(lote.body)).toBe(200);
    expect(lote.body.ejecucion.alcance).toBe("LOTE");
    const soloLote = await ejecuciones(request, "fase=CONFIRMACION&alcance=LOTE&tamanoPagina=100");
    expect(soloLote.body.items.map((e: any) => e.id)).toContain(lote.body.ejecucion.id);
    expect(soloLote.body.items.map((e: any) => e.id)).not.toContain(ej.id);
    const malFiltro = await ejecuciones(request, "alcance=OTRO");
    expect(malFiltro.status).toBe(400);
    // El historial es de Administrador, QE y Auditor (D106); el detalle por fila, solo de Administrador y Auditor; Líder y Analista, nada.
    const qe = await ejecuciones(request, "alcance=HDU", "qe1");
    expect(qe.status).toBe(200);
    // D106: QE1 no es el responsable de QTY-1 (es de QE2): la fila se cuenta como oculta; QE2 sí la ve.
    const detQe1 = await detalleEjecucion(request, ej.id, "tamanoPagina=100", "qe1");
    expect(detQe1.status).toBe(200);
    expect(detQe1.body.items).toHaveLength(0);
    expect(detQe1.body.filasOcultas).toBe(1);
    const detQe2 = await detalleEjecucion(request, ej.id, "tamanoPagina=100", "qe2");
    expect(detQe2.body.items).toHaveLength(1);
    expect(detQe2.body.filasOcultas).toBe(0);
    for (const clave of ["lid1", "ana1"] as const) expect((await ejecuciones(request, "alcance=HDU", clave)).status, clave).toBe(403);
  });
});
