import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { hdu, hoySantiago } from "../support/e4";
import { celulas, consultaDb, csvDeIndicadores, exportar, fotoE6, restaurarE6, ind, idLocal, serieTresDias, sprint, textoPdf, tkLocal, type FotoE6 } from "../support/e6run";
import { env } from "../support/env";
import { impedimentosCaidoEnIndicadores, pilaE6, proxyQueCorta, type PilaE6 } from "../support/entornoE6";

/** E6-B04 · Exportación CSV y PDF (12 casos). */
test.describe.configure({ mode: "default" });
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
  await restaurarE6(foto, { impedimentos: true });
});
test.beforeEach(async () => {
  await restaurarE6(foto);
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const ahoraChile = () => hoySantiago();
const codigos = (filas: string[][], col: number) => filas.map((f) => f[col]).filter((c) => c.startsWith("E7-H")).sort();

test.describe("E6-B04 · Exportación", () => {
  test("[E6-B04#1] E6-B04-T01: CSV de cumplimiento filtrado por CEL-A: encabezado con el filtro y la fecha, valores iguales a GET cumplimiento (3 HDU, 13.3)", async ({ request }) => {
    const c = await celulas(request);
    const x = await exportar(request, "qe1", { vista: "cumplimiento", formato: "csv", celulaId: c["CEL-A"] });
    expect(x.status).toBe(200);
    expect(x.tipo).toContain("text/csv");
    expect(x.disposicion).toMatch(/quality360-indicadores-cumplimiento-\d{8}\.csv/);
    expect(x.buf.subarray(0, 3).toString("hex")).toBe("efbbbf");
    expect(x.texto).toContain("\r\n");
    const t = csvDeIndicadores(x.texto);
    expect(t.encabezado.Reporte).toBe("Quality360 · Indicadores");
    expect(t.encabezado.Vista).toBe("cumplimiento");
    expect(t.encabezado.Filtros).toContain("Célula CEL-A");
    expect(t.encabezado["Generado (hora de Chile)"]).toContain(ahoraChile());
    const v = Object.fromEntries(t.filas.map((f) => [f[0], f[1]]));
    const api_ = (await ind(request, "qe1", "cumplimiento", { celulaId: c["CEL-A"] })).body;
    expect(Number(v["HDU totales"])).toBe(api_.hduTotales.valor);
    expect(Number(v["HDU totales"])).toBe(3);
    expect(Number(v["Cumplimiento promedio (%)"])).toBe(13.3);
  });

  test("[E6-B04#1] E6-B04-T02: las celdas de texto que empiezan con = + - @ tabulación o retorno se prefijan con '; números y fechas no", async ({ request }) => {
    const h = await hdu(request);
    const titulos: Array<[string, string]> = [[h.H1.id, "=1+1"], [h.H2.id, "+cmd"], [h.H5.id, "-cmd"], [h.H6.id, "@SUM(A1)"], [h.H8.id, "\tTab"]];
    for (const [id, t] of titulos) await consultaDb("UPDATE organizacion.historia_usuario SET titulo = $2 WHERE id_historia = $1", [id, t]);
    await consultaDb("UPDATE organizacion.usuario SET nombre = $2 WHERE email = $1", ["ana1@quality360.local", "\rRetorno"]);
    await consultaDb("UPDATE organizacion.usuario SET nombre = $2 WHERE email = $1", ["ana2@quality360.local", "=ANA2"]);
    await consultaDb("UPDATE organizacion.celula SET nombre = $2 WHERE nombre = $1", ["CEL-B", "=CEL-B"]);
    const s = await exportar(request, "qe1", { vista: "semaforo", formato: "csv" });
    expect(s.status).toBe(200);
    for (const esperado of ["'=1+1", "'+cmd", "'-cmd", "'@SUM(A1)", "'\tTab"]) expect(s.texto, esperado).toContain(esperado);
    expect(s.texto).toContain("'=CEL-B");
    const filasS = csvDeIndicadores(s.texto).filas;
    for (const f of filasS) {
      expect(f.every((c) => !/^[=+\-@\t\r]/.test(c)), JSON.stringify(f)).toBe(true);
      expect(f[5]).toMatch(/^\d+$/);
    }
    const c = await exportar(request, "qe1", { vista: "carga", formato: "csv" });
    expect(c.texto).toContain("'=ANA2");
    expect(c.texto).toContain("'\rRetorno");
    for (const f of csvDeIndicadores(c.texto).filas) expect(f.every((x) => !/^[=+\-@\t\r]/.test(x))).toBe(true);
    // Filtro con texto peligroso: el encabezado lo neutraliza igual.
    const cel = (await celulas(request))["CEL-B"];
    const e = await exportar(request, "qe1", { vista: "cumplimiento", formato: "csv", celulaId: cel });
    expect(csvDeIndicadores(e.texto).encabezado.Filtros).toContain("Célula =CEL-B"); // la celda empieza con «Célula», no con un carácter de fórmula
    for (const v of Object.values(csvDeIndicadores(e.texto).encabezado)) expect(/^[=+\-@\t\r]/.test(v)).toBe(false);
  });

  test("[E6-B04#2] E6-B04-T03: PDF del semáforo de QE1: %PDF, título, filtros, rol, fecha de Chile y «Rojo» en las filas", async ({ request }) => {
    const x = await exportar(request, "qe1", { vista: "semaforo", formato: "pdf" });
    expect(x.status).toBe(200);
    expect(x.tipo).toContain("application/pdf");
    expect(x.buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(x.disposicion).toMatch(/quality360-indicadores-semaforo-\d{8}\.pdf/);
    const t = textoPdf(x.buf);
    expect(t).toContain("Quality360 · Indicadores");
    expect(t).toContain("Sin filtros");
    expect(t).toMatch(/QE/);
    expect(t).toContain(ahoraChile());
    expect(t).toContain("Rojo");
  });

  test("[E6-B04#3] E6-B04-T04: el semáforo exportado respeta el ámbito de QE2, QE1, LID1 y AUD1 (y la base compartida de AUD1)", async ({ request }) => {
    const f = async (local: string) => csvDeIndicadores((await exportar(request, local, { vista: "semaforo", formato: "csv" })).texto);
    const q2 = await f("qe2");
    expect(codigos(q2.filas, 2)).toEqual(["E7-H3", "E7-H4"]);
    expect(q2.filas.some((r) => r[0] === "CEL-A")).toBe(true);
    const q1 = await f("qe1");
    expect(codigos(q1.filas, 2)).toEqual(["E7-H1", "E7-H2", "E7-H5", "E7-H6", "E7-H8"]);
    const l1 = await f("lid1");
    expect(codigos(l1.filas, 2)).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6"]);
    const a = await f("aud1");
    expect(codigos(a.filas, 2)).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H4", "E7-H5", "E7-H6", "E7-H8"]);
    const noCerradas = Number((await consultaDb("SELECT count(*) n FROM organizacion.historia_usuario WHERE estado <> 'CERRADA'"))[0].n);
    const sinActivas = Number(
      (await consultaDb(
        `SELECT count(*) n FROM (SELECT id_celula FROM organizacion.historia_usuario GROUP BY id_celula HAVING count(*) FILTER (WHERE estado <> 'CERRADA') = 0) x`,
      ))[0].n,
    );
    expect(a.filas.length).toBe(noCerradas + sinActivas);
  });

  test("[E6-B04#1] E6-B04-T05: con Impedimentos detenido exportar el semáforo da 503 INDICADORES_NO_DISPONIBLES y no entrega archivo", async ({ request }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await impedimentosCaidoEnIndicadores();
      const x = await exportar(request, "qe1", { vista: "semaforo", formato: "csv" }, pila.gatewayUrl);
      expect(x.status).toBe(503);
      expect(JSON.parse(x.texto).codigo).toBe("INDICADORES_NO_DISPONIBLES");
      expect(x.tipo).toContain("json");
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-B04#1] E6-B04-T06: exportar la carga deja una entrada EXPORTAR en la auditoría de Organización con actor, vista, formato y filas, antes de entregar", async ({ request }) => {
    const antes = Number((await consultaDb("SELECT count(*) n FROM organizacion.auditoria WHERE accion = 'EXPORTAR'"))[0].n);
    const x = await exportar(request, "qe1", { vista: "carga", formato: "csv" });
    expect(x.status).toBe(200);
    const filas = await consultaDb<any>("SELECT * FROM organizacion.auditoria WHERE accion = 'EXPORTAR' ORDER BY fecha DESC LIMIT 1");
    expect(Number((await consultaDb("SELECT count(*) n FROM organizacion.auditoria WHERE accion = 'EXPORTAR'"))[0].n)).toBe(antes + 1);
    const e = filas[0];
    expect(e.actor_id).toBe(await idLocal(request, "qe1"));
    const detalle = JSON.stringify(e);
    expect(detalle).toContain("carga");
    expect(detalle).toContain("csv");
    expect(detalle).toMatch(/filas/i);
  });

  test("[E6-B04#1] E6-B04-T07: con la auditoría de Organización cortada la exportación da 503 SERVICIO_NO_DISPONIBLE sin archivo", async ({ request }) => {
    const proxy = await proxyQueCorta(env.organizacionUrl, ["/v1/interno/auditoria/exportaciones"]);
    let pila: PilaE6 | undefined;
    try {
      pila = await pilaE6({ indicadores: { ORGANIZACION_URL: proxy.url } });
      const x = await exportar(request, "qe1", { vista: "carga", formato: "csv" }, pila.gatewayUrl);
      expect(x.status).toBe(503);
      expect(JSON.parse(x.texto).codigo).toBe("SERVICIO_NO_DISPONIBLE");
      expect(x.tipo).toContain("json");
      const control = await exportar(request, "qe1", { vista: "carga", formato: "csv" }, pila.gatewayUrl);
      expect(control.status).toBe(503);
    } finally {
      await pila?.detener();
      await proxy.detener();
    }
  });

  test("[E6-B04#1] E6-B04-T08: con límites bajos el CSV da 422 «Acota los filtros» y el PDF 422 «Usa CSV»", async ({ request }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await pilaE6({ indicadores: { EXPORTACION_LIMITE_FILAS: "2", EXPORTACION_PDF_LIMITE_FILAS: "2" } });
      const csv = await exportar(request, "aud1", { vista: "semaforo", formato: "csv" }, pila.gatewayUrl);
      expect(csv.status).toBe(422);
      expect(JSON.parse(csv.texto)).toMatchObject({ codigo: "EXPORTACION_EXCEDE_LIMITE" });
      expect(JSON.parse(csv.texto).mensaje).toContain("Acota los filtros");
      const pdf = await exportar(request, "aud1", { vista: "semaforo", formato: "pdf" }, pila.gatewayUrl);
      expect(pdf.status).toBe(422);
      expect(JSON.parse(pdf.texto).codigo).toBe("EXPORTACION_EXCEDE_LIMITE");
      expect(JSON.parse(pdf.texto).mensaje).toContain("Usa CSV");
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-B04#1] E6-B04-T09: ANA1 y ADM1 reciben 403 ACCESO_DENEGADO; sin sesión 401 NO_AUTENTICADO", async ({ request }) => {
    for (const l of ["ana1", "adm1"]) {
      const x = await exportar(request, l, { vista: "cumplimiento", formato: "csv" });
      expect(x.status, l).toBe(403);
      expect(JSON.parse(x.texto).codigo).toBe("ACCESO_DENEGADO");
    }
    const s = await exportar(request, undefined, { vista: "cumplimiento", formato: "csv" });
    expect(s.status).toBe(401);
    expect(JSON.parse(s.texto).codigo).toBe("NO_AUTENTICADO");
  });

  test("[E6-B04#1] E6-B04-T10: vista=otra, formato=xls y celulaId=abc dan 400 VALIDACION con campo", async ({ request }) => {
    const casos: Array<[Record<string, string>, string]> = [
      [{ vista: "otra", formato: "csv" }, "vista"],
      [{ vista: "carga", formato: "xls" }, "formato"],
      [{ vista: "carga", formato: "csv", celulaId: "abc" }, "celulaId"],
    ];
    for (const [p, campo] of casos) {
      const x = await exportar(request, "qe1", p);
      expect(x.status, campo).toBe(400);
      const b = JSON.parse(x.texto);
      expect(b.codigo).toBe("VALIDACION");
      expect(b.detalles.map((d: any) => d.campo)).toContain(campo);
    }
  });

  test("[E6-B04#2] E6-B04-T11: filtros CEL-C y SP-PROX de CEL-A: CSV y PDF con «Sin datos para los filtros aplicados» y sin cifras ni 0 %", async ({ request }) => {
    const c = await celulas(request);
    const f = { vista: "cumplimiento", celulaId: c["CEL-C"], sprintId: await sprint(request, "SP-PROX", "CEL-A") };
    const csv = await exportar(request, "qe1", { ...f, formato: "csv" });
    expect(csv.status).toBe(200);
    expect(csv.texto).toContain("Sin datos para los filtros aplicados");
    expect(csv.texto).toContain("Quality360 · Indicadores");
    expect(csv.texto).not.toMatch(/0 ?%/);
    expect(csvDeIndicadores(csv.texto).filas.filter((r) => /^\d+(\.\d+)?$/.test(r[1] ?? ""))).toEqual([]);
    const pdf = await exportar(request, "qe1", { ...f, formato: "pdf" });
    expect(pdf.status).toBe(200);
    const t = textoPdf(pdf.buf);
    expect(t).toContain("Sin datos para los filtros aplicados");
    expect(t).not.toMatch(/0 ?%/);
  });

  test("[E6-B04#1] E6-B04-T12: la tendencia en CSV trae una fila por fecha en orden (30.0, 30.0, 40.0), igual a GET tendencia", async ({ request }) => {
    const dias = await serieTresDias(request);
    const c = await celulas(request);
    const filtros = { celulaId: c["CEL-A"], sprintId: await sprint(request, "SP-PROX", "CEL-A") };
    const x = await exportar(request, "qe1", { vista: "tendencia", formato: "csv", ...filtros });
    expect(x.status).toBe(200);
    const t = csvDeIndicadores(x.texto);
    expect(t.filas).toHaveLength(3);
    const fechaCol = t.columnas.findIndex((n) => /fecha/i.test(n));
    const cumpCol = t.columnas.findIndex((n) => /cumplimiento/i.test(n));
    expect(t.filas.map((f) => f[fechaCol])).toEqual(dias);
    expect(t.filas.map((f) => Number(f[cumpCol]))).toEqual([30.0, 30.0, 40.0]);
    const g = await ind(request, "qe1", "tendencia", filtros);
    expect(g.body.series[0].puntos.map((p: any) => p.cumplimiento)).toEqual(t.filas.map((f) => Number(f[cumpCol])));
    void api;
  });
});
