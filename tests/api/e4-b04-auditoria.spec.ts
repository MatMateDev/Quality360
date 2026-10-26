import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conImpedimentos } from "../support/db";
import { env } from "../support/env";
import { tokenE7, type ClaveE7 } from "../support/e7";
import { contarDb, hdu, imps, reiniciarFixtureE4, uid, type ImpedimentoApi } from "../support/e4";

/** E4-B04 · Auditoría de la gestión de impedimentos y riesgos (3 escenarios, T01..T11; T12 es el e2e del Auditor). */
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await reiniciarFixtureE4();
});

interface Entrada {
  id: string;
  tipo: "IMPEDIMENTO" | "RIESGO";
  accion: string;
  hdu: { id: string; codigo: string };
  impedimento: { id: string; titulo: string; tipo: string } | null;
  actor: { id: string; nombre: string; rol: string };
  fecha: string;
  anterior: string | null;
  nuevo: string;
  comentario: string | null;
  sugeridoAlFijar: string | null;
}
interface Historial {
  hduId: string;
  orden: string;
  items: Entrada[];
}
interface Pagina<T> {
  items: T[];
  total: number;
}

const gestion = async (request: Parameters<typeof api.get>[0], clave: ClaveE7, hduId: string, query = "") => {
  const r = await api.get<Historial>(request, `/v1/hdu/${hduId}/gestion-impedimentos${query}`, { token: await tokenE7(clave) });
  return r;
};
const entradasDe = (hduId: string) =>
  contarDb(
    `SELECT (SELECT count(*) FROM impedimentos.accion_impedimento a JOIN impedimentos.impedimento i ON i.id_impedimento = a.id_impedimento WHERE i.id_historia = $1)
          + (SELECT count(*) FROM impedimentos.riesgo_hdu WHERE id_historia = $1) AS n`,
    [hduId],
  );

async function descargar(ruta: string, token: string) {
  const r = await fetch(`${env.gatewayUrl}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  const bytes = Buffer.from(await r.arrayBuffer());
  const tieneBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const lineas = bytes.subarray(tieneBom ? 3 : 0).toString("utf8").split(/\r?\n/).filter((l) => l.length > 0);
  return { status: r.status, headers: Object.fromEntries(r.headers.entries()), tieneBom, lineas };
}

test.describe("E4-B04 · Auditoría", () => {
  test("[E4-B04#1] T01: al resolver I2, la última entrada de gestión de H1 es RESOLVER (actor QE1/QE, ABIERTO → RESUELTO, con comentario y fecha)", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const comentario = "Se entregaron las cuentas de prueba";
    expect((await api.post(request, `/v1/impedimentos/${i.I2.id}/resolver`, { token: await tokenE7("qe1"), body: { comentario } })).status).toBe(200);
    const r = await gestion(request, "qe1", h.H1.id);
    expect(r.status).toBe(200);
    expect(cumpleContrato("HistorialGestionHdu", r.body).errores).toEqual([]);
    const ultima = r.body.items.at(-1)!;
    expect(ultima).toMatchObject({ tipo: "IMPEDIMENTO", accion: "RESOLVER", anterior: "ABIERTO", nuevo: "RESUELTO", comentario });
    expect(ultima.actor).toMatchObject({ id: await uid(request, "qe1"), rol: "QE" });
    expect(Date.now() - Date.parse(ultima.fecha)).toBeLessThan(120_000);
  });

  test("[E4-B04#1] T02: fijar H6 en ALTO agrega una entrada RIESGO (anterior MEDIO, nuevo ALTO, sugeridoAlFijar ALTO, actor QE1 y justificación)", async ({ request }) => {
    const h = await hdu(request);
    const justificacion = "El cliente exige la entrega";
    const put = await api.put<{ cambio: boolean }>(request, `/v1/hdu/${h.H6.id}/riesgo`, { token: await tokenE7("qe1"), body: { nivel: "ALTO", justificacion } });
    expect(put.status).toBe(200);
    const r = await gestion(request, "qe1", h.H6.id);
    const ultima = r.body.items.at(-1)!;
    expect(ultima).toMatchObject({ tipo: "RIESGO", accion: "FIJAR_RIESGO", anterior: "MEDIO", nuevo: "ALTO", sugeridoAlFijar: "ALTO", comentario: justificacion, impedimento: null });
    expect(ultima.actor).toMatchObject({ id: await uid(request, "qe1"), rol: "QE" });
  });

  test("[E4-B04#2] T03: el historial base de H6 trae 3 entradas en orden: REGISTRAR de I3, cambio de riesgo a MEDIO y ESCALAR de I3", async ({ request }) => {
    const h = await hdu(request);
    const r = await gestion(request, "qe1", h.H6.id);
    expect(r.status).toBe(200);
    expect(r.body.orden).toBe("fecha:asc");
    expect(r.body.items.map((e) => [e.tipo, e.accion])).toEqual([["IMPEDIMENTO", "REGISTRAR"], ["RIESGO", "FIJAR_RIESGO"], ["IMPEDIMENTO", "ESCALAR"]]);
    expect(r.body.items[1]).toMatchObject({ nuevo: "MEDIO" });
    const fechas = r.body.items.map((e) => Date.parse(e.fecha));
    expect(fechas).toEqual([...fechas].sort((a, b) => a - b));
  });

  test("[E4-B04#2] T04: orden=fecha:desc invierte; desde = fecha del cambio de riesgo deja las 2 más recientes; hasta = fecha del registro deja solo REGISTRAR", async ({ request }) => {
    const h = await hdu(request);
    const base = (await gestion(request, "qe1", h.H6.id)).body.items;
    const desc = await gestion(request, "qe1", h.H6.id, "?orden=fecha:desc");
    expect(desc.body.items.map((e) => e.accion)).toEqual(["ESCALAR", "FIJAR_RIESGO", "REGISTRAR"]);
    const desde = await gestion(request, "qe1", h.H6.id, `?desde=${encodeURIComponent(base[1].fecha)}`);
    expect(desde.body.items.map((e) => e.accion)).toEqual(["FIJAR_RIESGO", "ESCALAR"]);
    const hasta = await gestion(request, "qe1", h.H6.id, `?hasta=${encodeURIComponent(base[0].fecha)}`);
    expect(hasta.body.items.map((e) => e.accion)).toEqual(["REGISTRAR"]);
    const tipo = await gestion(request, "qe1", h.H6.id, "?tipo=RIESGO");
    expect(tipo.body.items.map((e) => e.tipo)).toEqual(["RIESGO"]);
    const invertido = await gestion(request, "qe1", h.H6.id, `?desde=${encodeURIComponent(base[2].fecha)}&hasta=${encodeURIComponent(base[0].fecha)}`);
    expect(invertido.status).toBe(400);
  });

  test("[E4-B04#2] T05 (negativo): sobre H6 ANA1 recibe 2 entradas (sin la de riesgo), ANA3 403, LID1/AUD1/ADM1 reciben 3 y sin token 401", async ({ request }) => {
    const h = await hdu(request);
    const ana1 = await gestion(request, "ana1", h.H6.id);
    expect(ana1.status).toBe(200);
    expect(ana1.body.items).toHaveLength(2);
    expect(ana1.body.items.every((e) => e.tipo === "IMPEDIMENTO")).toBe(true);
    // D82: si el Analista pidiera tipo=RIESGO, no recibe entradas de riesgo.
    const soloRiesgo = await gestion(request, "ana1", h.H6.id, "?tipo=RIESGO");
    expect(soloRiesgo.body.items.every((e) => e.tipo === "IMPEDIMENTO")).toBe(true);
    const ana3 = await gestion(request, "ana3", h.H6.id);
    expect(ana3.status).toBe(403);
    for (const clave of ["lid1", "aud1", "adm1"] as const) {
      const r = await gestion(request, clave, h.H6.id);
      expect(r.status, clave).toBe(200);
      expect(r.body.items, clave).toHaveLength(3);
    }
    const sin = await api.get<{ codigo: string }>(request, `/v1/hdu/${h.H6.id}/gestion-impedimentos`);
    expect(sin.status).toBe(401);
    expect(sin.body.codigo).toBe("NO_AUTENTICADO");
  });

  test("[E4-B04#3] T06: AUD1 lee el historial de H7 (CERRADA): 2 entradas de I5 (REGISTRAR y RESOLVER) con sus actores y fechas originales", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const r = await gestion(request, "aud1", h.H7.id);
    expect(r.status).toBe(200);
    expect(r.body.items.map((e) => e.accion)).toEqual(["REGISTRAR", "RESOLVER"]);
    expect(r.body.items.every((e) => e.impedimento?.id === i.I5.id)).toBe(true);
    expect(r.body.items[0].actor).toMatchObject({ id: i.I5.creadoPor.id, rol: "ANALISTA_QA" });
    expect(r.body.items[1].actor).toMatchObject({ id: await uid(request, "qe2"), rol: "QE" });
    expect(Date.parse(r.body.items[0].fecha)).toBe(Date.parse(i.I5.fechaRegistro));
    expect(Date.parse(r.body.items[1].fecha)).toBe(Date.parse(i.I5.fechaResolucion!));
  });

  test("[E4-B04#3] T07: UPDATE y DELETE sobre accion_impedimento y riesgo_hdu fallan por permisos (42501) y las rutas de edición no existen (404/405); no cambia ninguna fila", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const antes = [await contarDb("SELECT count(*) n FROM impedimentos.accion_impedimento"), await contarDb("SELECT count(*) n FROM impedimentos.riesgo_hdu")];
    await conImpedimentos(async (c) => {
      for (const sql of [
        "UPDATE impedimentos.accion_impedimento SET descripcion = 'manipulado'",
        "DELETE FROM impedimentos.accion_impedimento",
        "UPDATE impedimentos.riesgo_hdu SET justificacion = 'manipulado'",
        "DELETE FROM impedimentos.riesgo_hdu",
      ]) {
        await expect(c.query(sql), sql).rejects.toMatchObject({ code: "42501" });
      }
    });
    const token = await tokenE7("qe1");
    const put = await api.put(request, `/v1/impedimentos/${i.I2.id}/acciones/0`, { token, body: { descripcion: "manipulado" } });
    expect([404, 405]).toContain(put.status);
    const del = await request.fetch(`${env.gatewayUrl}/v1/impedimentos/${i.I2.id}/acciones/0`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false });
    expect([404, 405]).toContain(del.status());
    const delRiesgo = await request.fetch(`${env.gatewayUrl}/v1/hdu/${h.H6.id}/riesgo`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false });
    expect([404, 405]).toContain(delRiesgo.status());
    expect([await contarDb("SELECT count(*) n FROM impedimentos.accion_impedimento"), await contarDb("SELECT count(*) n FROM impedimentos.riesgo_hdu")]).toEqual(antes);
  });

  test("[E4-B04#1] T08 (negativo): los intentos rechazados (ANA1 resolver 403, QE1 reabrir un abierto 409, QE2 fijar riesgo 403) no dejan entradas en H1", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const antes = await entradasDe(h.H1.id);
    const apiAntes = (await gestion(request, "qe1", h.H1.id)).body.items.length;
    const a = await api.post<{ codigo: string }>(request, `/v1/impedimentos/${i.I2.id}/resolver`, { token: await tokenE7("ana1"), body: { comentario: "Intento no autorizado" } });
    expect(a.status).toBe(403);
    const b = await api.post<{ codigo: string }>(request, `/v1/impedimentos/${i.I2.id}/reabrir`, { token: await tokenE7("qe1"), body: { motivo: "Ya está abierto" } });
    expect(b.status).toBe(409);
    const c = await api.put<{ codigo: string }>(request, `/v1/hdu/${h.H1.id}/riesgo`, { token: await tokenE7("qe2"), body: { nivel: "BAJO", justificacion: "Intento no autorizado" } });
    expect(c.status).toBe(403);
    expect(await entradasDe(h.H1.id)).toBe(antes);
    expect((await gestion(request, "qe1", h.H1.id)).body.items).toHaveLength(apiAntes);
  });

  test("[E4-B04#2] T09: AUD1 ve 5 impedimentos (I1–I5) y 9 entradas de gestión (8 acciones y 1 cambio de riesgo); hduId=H7 → solo I5; tipo=DEPENDENCIA → solo I3", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const token = await tokenE7("aud1");
    const lista = await api.get<Pagina<ImpedimentoApi & { hdu: { codigo: string } }>>(request, "/v1/auditor/impedimentos?tamanoPagina=100", { token });
    expect(lista.status).toBe(200);
    expect(cumpleContrato("PaginaAuditorImpedimentos", lista.body).errores).toEqual([]);
    expect(lista.body.total).toBe(5);
    expect(lista.body.items.map((x) => x.id).sort()).toEqual(Object.values(i).map((x) => x.id).sort());
    const gest = await api.get<Pagina<Entrada>>(request, "/v1/auditor/gestion-impedimentos?tamanoPagina=100", { token });
    expect(gest.status).toBe(200);
    expect(cumpleContrato("PaginaGestionImpedimentos", gest.body).errores).toEqual([]);
    expect(gest.body.total).toBe(9);
    expect(gest.body.items.filter((e) => e.tipo === "IMPEDIMENTO")).toHaveLength(8);
    expect(gest.body.items.filter((e) => e.tipo === "RIESGO")).toHaveLength(1);

    const h7 = await api.get<Pagina<Entrada>>(request, `/v1/auditor/gestion-impedimentos?hduId=${h.H7.id}`, { token });
    expect(h7.body.items.map((e) => e.impedimento?.id)).toEqual([i.I5.id, i.I5.id]);
    const h7i = await api.get<Pagina<ImpedimentoApi>>(request, `/v1/auditor/impedimentos?hduId=${h.H7.id}`, { token });
    expect(h7i.body.items.map((x) => x.id)).toEqual([i.I5.id]);

    const dep = await api.get<Pagina<ImpedimentoApi>>(request, "/v1/auditor/impedimentos?tipo=DEPENDENCIA", { token });
    expect(dep.body.items.map((x) => x.id)).toEqual([i.I3.id]);
    const depG = await api.get<Pagina<Entrada>>(request, "/v1/auditor/gestion-impedimentos?tipo=DEPENDENCIA", { token });
    expect(depG.body.items.every((e) => e.impedimento?.id === i.I3.id)).toBe(true);
    expect(depG.body.total).toBe(2);
  });

  test("[E4-B04#2] T10 (negativo): ADM1, QE1, LID1 y ANA1 reciben 403 en los 4 endpoints del Auditor (16 intentos) y sin token 401", async ({ request }) => {
    const rutas = [
      "/v1/auditor/impedimentos",
      "/v1/auditor/gestion-impedimentos",
      "/v1/auditor/exportaciones/impedimentos",
      "/v1/auditor/exportaciones/gestion-impedimentos",
    ];
    let intentos = 0;
    for (const clave of ["adm1", "qe1", "lid1", "ana1"] as const) {
      for (const ruta of rutas) {
        const r = await api.get<{ codigo: string }>(request, ruta, { token: await tokenE7(clave) });
        expect(r.status, `${clave} ${ruta}`).toBe(403);
        expect(r.body.codigo).toBe("ACCESO_DENEGADO");
        intentos += 1;
      }
    }
    expect(intentos).toBe(16);
    for (const ruta of rutas) {
      const r = await api.get<{ codigo: string }>(request, ruta);
      expect(r.status, `sin token ${ruta}`).toBe(401);
      expect(r.body.codigo).toBe("NO_AUTENTICADO");
    }
  });

  test("[E4-B04#2] T11: AUD1 exporta impedimentos: CSV con BOM, separador ; y 6 líneas (encabezado y 5 filas), X-Q360-Filas 5, y la última entrada de auditoría es la exportación", async ({ request }) => {
    const token = await tokenE7("aud1");
    const antes = (await api.get<Pagina<unknown>>(request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=1", { token })).body.total;
    const d = await descargar("/v1/auditor/exportaciones/impedimentos", token);
    expect(d.status).toBe(200);
    expect(d.headers["content-type"]).toContain("text/csv");
    expect(d.headers["content-disposition"]).toMatch(/quality360-impedimentos-\d{4}-\d{2}-\d{2}\.csv/);
    expect(d.tieneBom).toBe(true);
    expect(d.lineas).toHaveLength(6);
    const ancho = d.lineas[0].split(";").length;
    expect(ancho).toBeGreaterThan(5);
    for (const l of d.lineas) expect(l.split(";"), l).toHaveLength(ancho);
    expect(Number(d.headers["x-q360-filas"])).toBe(5);
    expect(d.lineas.join("\n")).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    const aud = await api.get<{ items: Array<{ operacion: string; actor: { nombre: string }; despues: Record<string, unknown> | null; fecha: string }>; total: number }>(
      request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=5", { token });
    expect(aud.body.total).toBe(antes + 1);
    expect(aud.body.items[0].actor.nombre).toContain("AUD1");
    expect(aud.body.items[0].despues).toMatchObject({ recurso: "IMPEDIMENTOS", filas: 5 });
    expect(Date.now() - Date.parse(aud.body.items[0].fecha)).toBeLessThan(60_000);

    // La exportación de gestión: 9 filas más encabezado, y queda registrada como GESTION_IMPEDIMENTOS.
    const g = await descargar("/v1/auditor/exportaciones/gestion-impedimentos", token);
    expect(g.status).toBe(200);
    expect(g.tieneBom).toBe(true);
    expect(g.lineas).toHaveLength(10);
    expect(Number(g.headers["x-q360-filas"])).toBe(9);
    const aud2 = await api.get<{ items: Array<{ despues: Record<string, unknown> | null }> }>(request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=1", { token });
    expect(aud2.body.items[0].despues).toMatchObject({ recurso: "GESTION_IMPEDIMENTOS", filas: 9 });
  });
});
