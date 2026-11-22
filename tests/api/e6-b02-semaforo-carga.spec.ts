import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conConexion } from "../support/db";
import { env } from "../support/env";
import { hdu } from "../support/e4";
import { crearUsuarioE7, desactivarUsuario } from "../support/e7";
import { celulas, consultaDb, fotoE6, restaurarE6, ind, idLocal, tkLocal, UUID_INEXISTENTE, type FotoE6 } from "../support/e6run";
import { certificacionesCaidaEnIndicadores, type PilaE6 } from "../support/entornoE6";

/** E6-B02 · Semáforo, drill-down, carga y umbral (13 casos). Base compartida. */
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

const contrato = (esquema: string, b: unknown) => expect(cumpleContrato(esquema, b, "comun").errores).toEqual([]);
const celdas = (b: any) => Object.fromEntries(b.celulas.map((c: any) => [c.celula.nombre, c]));
const put = async (request: any, local: string, valor: unknown) => api.put<any>(request, "/v1/indicadores/umbral-carga", { token: await tkLocal(local), body: valor === undefined ? {} : { valor } });
const filasPorNombre = (b: any, qeId?: string) => {
  const grupos = qeId ? b.grupos.filter((g: any) => g.umbral.qe?.id === qeId) : b.grupos;
  return Object.fromEntries(grupos.flatMap((g: any) => g.filas).map((f: any) => [f.analista.nombre.split(" ")[0], f]));
};

test.describe("E6-B02 · Semáforo, drill-down, carga y umbral", () => {
  test("[E6-B02#1] E6-B02-T01: semáforo de QE1: CEL-A ROJO (ALTO, 1 abierto), CEL-B ROJO (MEDIO, 1 escalado), CEL-C VERDE (BAJO)", async ({ request }) => {
    const r = await ind(request, "qe1", "semaforo");
    expect(r.status).toBe(200);
    contrato("SemaforoIndicadores", r.body);
    const c = celdas(r.body);
    expect(c["CEL-A"]).toMatchObject({ color: "ROJO", riesgoMaximo: "ALTO", impedimentosAbiertos: 1, impedimentosEscalados: 0, estado: "ok" });
    expect(c["CEL-B"]).toMatchObject({ color: "ROJO", riesgoMaximo: "MEDIO", impedimentosAbiertos: 0, impedimentosEscalados: 1 });
    expect(c["CEL-C"]).toMatchObject({ color: "VERDE", riesgoMaximo: "BAJO" });
  });

  test("[E6-B02#1] E6-B02-T02: QE2 (A verde con 0 activas, B amarillo, C verde); AUD1 (rojo, rojo, verde) más las células de la semilla MVP", async ({ request }) => {
    const q = celdas((await ind(request, "qe2", "semaforo")).body);
    expect(q["CEL-A"]).toMatchObject({ color: "VERDE", hduActivas: 0 });
    expect(q["CEL-B"]).toMatchObject({ color: "AMARILLO", riesgoMaximo: "MEDIO", impedimentosAbiertos: 1 });
    expect(q["CEL-C"]).toMatchObject({ color: "VERDE" });
    const a = await ind(request, "aud1", "semaforo");
    contrato("SemaforoIndicadores", a.body);
    const c = celdas(a.body);
    expect([c["CEL-A"].color, c["CEL-B"].color, c["CEL-C"].color]).toEqual(["ROJO", "ROJO", "VERDE"]);
    const conHdu = Number((await consultaDb("SELECT count(DISTINCT id_celula) n FROM organizacion.historia_usuario"))[0].n);
    expect(a.body.celulas).toHaveLength(conHdu);
  });

  test("[E6-B02#1] E6-B02-T03: drill-down de QE1: CEL-A H1 y H5 (RIESGO_ALTO); CEL-B H6 (IMPEDIMENTO_ESCALADO, nivel MEDIO)", async ({ request }) => {
    const c = await celulas(request);
    const a = await ind(request, "qe1", `semaforo/${c["CEL-A"]}/hdu`);
    expect(a.status).toBe(200);
    contrato("DrilldownSemaforo", a.body);
    expect(a.body.items.map((i: any) => i.hdu.codigo).sort()).toEqual(["E7-H1", "E7-H5"]);
    for (const i of a.body.items) expect(i.motivos).toContain("RIESGO_ALTO");
    const b = await ind(request, "qe1", `semaforo/${c["CEL-B"]}/hdu`);
    expect(b.body.items.map((i: any) => i.hdu.codigo)).toEqual(["E7-H6"]);
    expect(b.body.items[0].motivos).toEqual(["IMPEDIMENTO_ESCALADO"]);
    expect(b.body.items[0].riesgo.nivelVigente).toBe("MEDIO");
  });

  test("[E6-B02#1] E6-B02-T04: célula ajena: QE2 con CEL-D y LID1 con CEL-C reciben 403; AUD1 con UUID inexistente 404", async ({ request }) => {
    const c = await celulas(request);
    expect((await ind(request, "qe2", `semaforo/${c["CEL-D"]}/hdu`)).status).toBe(403);
    const l = await ind(request, "lid1", `semaforo/${c["CEL-C"]}/hdu`);
    expect(l.status).toBe(403);
    expect(l.body.codigo).toBe("ACCESO_DENEGADO");
    expect((await ind(request, "aud1", `semaforo/${UUID_INEXISTENTE}/hdu`)).status).toBe(404);
  });

  test("[E6-B02#2] E6-B02-T05: carga de QE1: ANA1 2 activas en ejecución 55.0; ANA2 2 activas (1 en ejecución, 1 pendiente de cierre) 55.0; sin analista 1; umbral 5 por defecto", async ({ request }) => {
    const r = await ind(request, "qe1", "carga");
    expect(r.status).toBe(200);
    contrato("CargaIndicadores", r.body);
    const f = filasPorNombre(r.body);
    expect(f.ANA1).toMatchObject({ activas: 2, cumplimiento: { valor: 55.0 }, sobrecargado: false });
    expect(f.ANA1.porEstado.EN_EJECUCION).toBe(2);
    expect(f.ANA2).toMatchObject({ activas: 2, cumplimiento: { valor: 55.0 }, sobrecargado: false });
    expect(f.ANA2.porEstado).toMatchObject({ EN_EJECUCION: 1, PENDIENTE_CIERRE: 1 });
    expect(r.body.sinAnalista.activas).toBe(1);
    expect(r.body.grupos[0].umbral).toMatchObject({ valor: 5, porDefecto: true });
  });

  test("[E6-B02#3] E6-B02-T06: umbral 1 marca a ANA1 y ANA2; con 2 ninguno; porDefecto false", async ({ request }) => {
    const a = await put(request, "qe1", 1);
    expect(a.status).toBe(200);
    contrato("ResultadoUmbralCarga", a.body);
    let f = filasPorNombre((await ind(request, "qe1", "carga")).body);
    expect([f.ANA1.sobrecargado, f.ANA2.sobrecargado]).toEqual([true, true]);
    const b = await put(request, "qe1", 2);
    expect(b.status).toBe(200);
    const r = await ind(request, "qe1", "carga");
    f = filasPorNombre(r.body);
    expect([f.ANA1.sobrecargado, f.ANA2.sobrecargado]).toEqual([false, false]);
    expect(r.body.grupos[0].umbral).toMatchObject({ valor: 2, porDefecto: false });
  });

  test("[E6-B02#3] E6-B02-T07: PUT con 0 y 51 da 400 VALOR_FUERA_DE_RANGO; 2.5, «abc» y vacío 400 VALIDACION con campo valor; el umbral no cambia", async ({ request }) => {
    for (const v of [0, 51]) {
      const r = await put(request, "qe1", v);
      expect(r.status, String(v)).toBe(400);
      expect(r.body.codigo).toBe("VALOR_FUERA_DE_RANGO");
    }
    for (const v of [2.5, "abc", undefined]) {
      const r = await put(request, "qe1", v);
      expect(r.status, String(v)).toBe(400);
      expect(r.body.codigo).toBe("VALIDACION");
      expect(r.body.detalles.map((d: any) => d.campo)).toContain("valor");
    }
    const u = await api.get<any>(request, "/v1/indicadores/umbral-carga", { token: await tkLocal("qe1") });
    expect(u.body).toMatchObject({ valor: 5, porDefecto: true });
  });

  test("[E6-B02#3] E6-B02-T08: solo el QE dueño fija su umbral; LID1, AUD1, ADM1 y ANA1 403; QE2 no lee el de QE1; LID1 y AUD1 sí (5)", async ({ request }) => {
    const propio = await put(request, "qe2", 7);
    expect(propio.status).toBe(200);
    for (const l of ["lid1", "aud1", "adm1", "ana1"]) {
      const r = await put(request, l, 3);
      expect(r.status, l).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
    const qe1 = await idLocal(request, "qe1");
    const ajeno = await api.get<any>(request, `/v1/indicadores/umbral-carga?qeId=${qe1}`, { token: await tkLocal("qe2") });
    expect(ajeno.status).toBe(403);
    for (const l of ["lid1", "aud1"]) {
      const r = await api.get<any>(request, `/v1/indicadores/umbral-carga?qeId=${qe1}`, { token: await tkLocal(l) });
      expect(r.status, l).toBe(200);
      expect(r.body.valor).toBe(5);
      contrato("UmbralCarga", r.body);
    }
    expect((await api.get<any>(request, "/v1/indicadores/umbral-carga", { token: await tkLocal("qe1") })).body.valor).toBe(5);
  });

  test("[E6-B02#3] E6-B02-T09: historial tras 5→1 y 1→2: dos eventos, el más reciente primero; el rol del servicio no puede UPDATE ni DELETE; AUD1 lo lee y LID1 403", async ({ request }) => {
    await put(request, "qe1", 1);
    await put(request, "qe1", 2);
    const h = await api.get<any>(request, "/v1/indicadores/umbral-carga/historial", { token: await tkLocal("qe1") });
    expect(h.status).toBe(200);
    contrato("PaginaEventosUmbral", h.body);
    expect(h.body.items.map((e: any) => [e.valorAnterior, e.valorNuevo])).toEqual([[1, 2], [5, 1]]);
    expect(h.body.items[0].actor.id).toBe(await idLocal(request, "qe1"));
    expect(Date.parse(h.body.items[0].fecha)).toBeGreaterThanOrEqual(Date.parse(h.body.items[1].fecha));
    for (const sql of ["UPDATE indicadores.evento_umbral_carga SET valor_nuevo = 9", "DELETE FROM indicadores.evento_umbral_carga"]) {
      await expect(conConexion(env.databaseUrlIndicadores, (c) => c.query(sql)), sql).rejects.toThrow();
    }
    const qe1 = await idLocal(request, "qe1");
    expect((await api.get<any>(request, `/v1/indicadores/umbral-carga/historial?qeId=${qe1}`, { token: await tkLocal("aud1") })).status).toBe(200);
    expect((await api.get<any>(request, `/v1/indicadores/umbral-carga/historial?qeId=${qe1}`, { token: await tkLocal("lid1") })).status).toBe(403);
  });

  test("[E6-B02#1] E6-B02-T10: con Certificaciones detenido CEL-A ROJO parcial, CEL-B ROJO y CEL-C sin color e indisponible (no VERDE)", async ({ request }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnIndicadores();
      const r = await ind(request, "qe1", "semaforo", {}, pila.gatewayUrl);
      expect(r.status).toBe(200);
      contrato("SemaforoIndicadores", r.body);
      const c = celdas(r.body);
      expect(c["CEL-A"]).toMatchObject({ color: "ROJO", calculoParcial: true });
      expect(c["CEL-B"]).toMatchObject({ color: "ROJO" });
      expect(c["CEL-C"]).toMatchObject({ color: null, estado: "indisponible" });
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-B02#1] E6-B02-T11: QE2 ve CEL-A VERDE con 0 activas; LID3 ve CEL-D sin color con estado SIN_HDU", async ({ request }) => {
    const q = celdas((await ind(request, "qe2", "semaforo")).body);
    expect(q["CEL-A"]).toMatchObject({ color: "VERDE", hduActivas: 0 });
    const l = await ind(request, "lid3", "semaforo");
    expect(l.status).toBe(200);
    contrato("SemaforoIndicadores", l.body);
    expect(celdas(l.body)["CEL-D"]).toMatchObject({ color: null, estado: "SIN_HDU" });
  });

  test("[E6-B02#2] E6-B02-T12: H4 reasignada a ANA1: QE1 la ve con 3 activas sobrecargada; QE2 con 1 activa, no supervisada y sin sobrecarga; LID1 con 2", async ({ request }) => {
    const h = await hdu(request);
    expect((await put(request, "qe1", 1)).status).toBe(200);
    const re = await api.put(request, `/v1/hdu/${h.H4.id}/analista`, { token: await tkLocal("adm1"), body: { analistaId: await idLocal(request, "ana1"), motivo: "Prueba E6-B02-T12" } });
    expect(re.status).toBe(200);
    const q1 = filasPorNombre((await ind(request, "qe1", "carga")).body);
    expect(q1.ANA1).toMatchObject({ activas: 3, sobrecargado: true });
    const q2 = await ind(request, "qe2", "carga");
    expect(q2.body.grupos[0].umbral.valor).toBe(5);
    const a2 = filasPorNombre(q2.body).ANA1;
    expect(a2).toMatchObject({ activas: 1, supervisadoPorMi: false, sobrecargado: false });
    const l = await ind(request, "lid1", "carga");
    contrato("CargaIndicadores", l.body);
    const qe1 = await idLocal(request, "qe1");
    const grupo = l.body.grupos.find((g: any) => g.umbral.qe?.id === qe1);
    expect(grupo.umbral.valor).toBe(1);
    const filas = grupo.filas.filter((f: any) => f.analista.nombre.startsWith("ANA1"));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ activas: 2, sobrecargado: true });
  });

  test("[E6-B02#2] E6-B02-T13: AUD1 ve al analista desactivado con su HDU activa y a ANA4 sin QE (umbral 5); las activas igualan la base", async ({ request }) => {
    const h = await hdu(request);
    const adm = await tkLocal("adm1");
    const anad = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "anad" });
    try {
      const a = await api.put(request, `/v1/hdu/${h.H5.id}/analista`, { token: adm, body: { analistaId: anad.id, motivo: "Prueba E6-B02-T13" } });
      expect(a.status).toBe(200);
    } finally {
      await desactivarUsuario(request, adm, anad.id);
    }
    const r = await ind(request, "aud1", "carga");
    expect(r.status).toBe(200);
    contrato("CargaIndicadores", r.body);
    const todas = r.body.grupos.flatMap((g: any) => g.filas.map((f: any) => ({ ...f, grupo: g })));
    const d = todas.find((f: any) => f.analista.id === anad.id);
    expect(d).toMatchObject({ activas: 1 });
    expect(d.analista.activo).toBe(false);
    const a4 = todas.find((f: any) => f.analista.nombre.startsWith("ANA4"));
    expect(a4).toMatchObject({ activas: 0, sinHdu: true });
    expect(a4.grupo.umbral).toMatchObject({ qe: null, valor: 5 });
    // Las activas de cada fila igualan el conteo de HDU no cerradas de ese analista en la base.
    const base = await consultaDb<{ analista_id: string; n: string }>("SELECT analista_id, count(*) n FROM organizacion.historia_usuario WHERE estado <> 'CERRADA' AND analista_id IS NOT NULL GROUP BY 1");
    for (const f of todas) expect(f.activas, f.analista.nombre).toBe(Number(base.find((b) => b.analista_id === f.analista.id)?.n ?? 0));
    const por = Object.fromEntries(todas.map((f: any) => [f.analista.nombre.split(" ")[0], f]));
    expect([por.ANA1.activas, por.ANA2.activas, por.ANA3.activas]).toEqual([2, 2, 2]);
    const qes = r.body.grupos.map((g: any) => g.umbral.qe?.nombre.split(" ")[0]);
    expect(qes).toEqual(expect.arrayContaining(["QE1", "QE2"]));
  });
});
