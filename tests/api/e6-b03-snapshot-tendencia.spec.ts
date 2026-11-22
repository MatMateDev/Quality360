import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { RAIZ_REPO, env } from "../support/env";
import { hdu, hoySantiago } from "../support/e4";
import { celulas, consultaDb, fotoE6, restaurarE6, ind, idLocal, instanteDe, snapshotEn, sprint, tkLocal, type FotoE6 } from "../support/e6run";
import { pilaE6, impedimentosCaidoEnIndicadores, type PilaE6 } from "../support/entornoE6";

/** E6-B03 · Snapshot diario y tendencia (14 casos). */
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

const cron = (request: any, cabeceras: Record<string, string>) => request.fetch(`${env.gatewayUrl}/v1/cron/indicadores/snapshot`, { method: "GET", headers: cabeceras, failOnStatusCode: false });
const manual = async (request: any, local = "adm1", baseURL?: string) => api.post<any>(request, "/v1/indicadores/snapshots", { token: await tkLocal(local), baseURL });
const nEjecuciones = async () => Number((await consultaDb("SELECT count(*) n FROM indicadores.ejecucion_snapshot"))[0].n);
const nFilas = async () => Number((await consultaDb("SELECT count(*) n FROM indicadores.snapshot_indicadores"))[0].n);
const fila = async (celula: string, sprintPrefijo: string, ambito: string, fecha?: string) =>
  (
    await consultaDb(
      `SELECT * FROM indicadores.snapshot_indicadores WHERE celula_nombre = $1 AND sprint_nombre LIKE $2 AND ambito = $3 ${fecha ? "AND fecha = $4" : ""} ORDER BY fecha`,
      fecha ? [celula, `${sprintPrefijo}%`, ambito, fecha] : [celula, `${sprintPrefijo}%`, ambito],
    )
  );

/** Serie de tres días con H1 en 30, 30 y 40 %: los dos primeros antes de aprobar el entregable 4, el tercero después. */
async function serieTresDias(request: any): Promise<string[]> {
  const h = await hdu(request);
  const dias = [hoySantiago(-3), hoySantiago(-2), hoySantiago(-1)];
  for (const d of dias.slice(0, 2)) expect((await snapshotEn(instanteDe(d))).body.resultado).toBe("EXITOSA");
  const ap = await api.post(request, `/v1/hdu/${h.H1.id}/entregables/APROBACION_CASOS/aprobar`, { token: await tkLocal("qe1") });
  expect(ap.status).toBe(200);
  expect((await snapshotEn(instanteDe(dias[2]))).body.resultado).toBe("EXITOSA");
  return dias;
}

test.describe("E6-B03 · Snapshot diario y tendencia", () => {
  test("[E6-B03#1] E6-B03-T01: el cron con CRON_SECRET deja una ejecución EXITOSA, origen CRON, actor SISTEMA, filas > 0 y fecha de hoy", async ({ request }) => {
    const r = await cron(request, { Authorization: `Bearer ${env.cronSecret}` });
    expect(r.status()).toBe(200);
    const b = await r.json();
    expect(cumpleContrato("EjecucionSnapshot", b, "comun").errores).toEqual([]);
    expect(b).toMatchObject({ resultado: "EXITOSA", origen: "CRON", fecha: hoySantiago() });
    expect(b.actor.nombre).toBe("SISTEMA");
    expect(b.filasEscritas).toBeGreaterThan(0);
  });

  test("[E6-B03#1] E6-B03-T02: el cron sin cabecera, con secreto incorrecto o con la sesión de ADM1 da 401 y no crea ejecución", async ({ request }) => {
    const antes = await nEjecuciones();
    for (const cab of [{}, { Authorization: "Bearer secreto-incorrecto" }, { Authorization: `Bearer ${await tkLocal("adm1")}` }]) {
      const r = await cron(request, cab);
      expect(r.status()).toBe(401);
      expect((await r.json()).codigo).toBe("NO_AUTENTICADO");
    }
    expect(await nEjecuciones()).toBe(antes);
  });

  test("[E6-B03#1] E6-B03-T03: el snapshot guarda por célula, sprint y ámbito con los valores del estado base y las sumas cuadran", async ({ request }) => {
    const qe1 = await idLocal(request, "qe1");
    expect((await manual(request)).body.resultado).toBe("EXITOSA");
    const [q] = await fila("CEL-A", "SP-PROX", `QE:${qe1}`);
    expect(q).toMatchObject({ hdu_total: 1, suma_avance: 30, bloqueadas: 1 });
    expect(Number(q.cumplimiento_promedio)).toBe(30.0);
    const [t] = await fila("CEL-A", "SP-PROX", "TODOS");
    expect(t).toMatchObject({ hdu_total: q.hdu_total, suma_avance: q.suma_avance, bloqueadas: q.bloqueadas });
    const todas = await consultaDb("SELECT * FROM indicadores.snapshot_indicadores");
    expect(todas.length).toBeGreaterThan(0);
    for (const f of todas) expect(f.hdu_total, `${f.celula_nombre}/${f.sprint_nombre}`).toBe(f.certificadas + f.cerradas_excepcion + f.en_curso + f.sin_iniciar);
    const suma = Number((await consultaDb("SELECT coalesce(sum(hdu_total),0) n FROM indicadores.snapshot_indicadores WHERE ambito = 'TODOS'"))[0].n);
    const vigentes = Number((await consultaDb("SELECT count(*) n FROM organizacion.historia_sprint WHERE fecha_retiro IS NULL"))[0].n);
    expect(suma).toBe(vigentes);
  });

  test("[E6-B03#2] E6-B03-T04: dos ejecuciones el mismo día no duplican filas; la segunda informa actualizadas; la clave única se hace cumplir", async ({ request }) => {
    const a = await manual(request);
    expect(a.body.filasNuevas).toBeGreaterThan(0);
    const n1 = await nFilas();
    const b = await manual(request);
    expect(b.status).toBe(200);
    expect(await nFilas()).toBe(n1);
    expect(b.body.filasActualizadas).toBeGreaterThan(0);
    expect(b.body.filasNuevas).toBe(0);
    await expect(
      consultaDb(
        `WITH s AS (SELECT * FROM indicadores.snapshot_indicadores LIMIT 1) INSERT INTO indicadores.snapshot_indicadores SELECT (jsonb_populate_record(null::indicadores.snapshot_indicadores, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid()::text))).* FROM s`,
      ),
    ).rejects.toThrow(/unique|duplicate|único|duplicad/i);
  });

  test("[E6-B03#2] E6-B03-T05: H1 pasa de 30 a 40 entre dos ejecuciones y queda una sola fila por clave con suma 40 y 40.0", async ({ request }) => {
    const h = await hdu(request);
    const qe1 = await idLocal(request, "qe1");
    await manual(request);
    const antes = await nFilas();
    expect((await api.post(request, `/v1/hdu/${h.H1.id}/entregables/APROBACION_CASOS/aprobar`, { token: await tkLocal("qe1") })).status).toBe(200);
    await manual(request);
    expect(await nFilas()).toBe(antes);
    const f = await fila("CEL-A", "SP-PROX", `QE:${qe1}`, hoySantiago());
    expect(f).toHaveLength(1);
    expect(f[0].suma_avance).toBe(40);
    expect(Number(f[0].cumplimiento_promedio)).toBe(40.0);
  });

  test("[E6-B03#2] E6-B03-T06: dos POST manuales simultáneos: uno 200 y otro 409 EJECUCION_EN_CURSO; una sola ejecución EXITOSA", async ({ request }) => {
    const rs = await Promise.all([manual(request), manual(request)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409)!.body.codigo).toBe("EJECUCION_EN_CURSO");
    const ok = await consultaDb("SELECT count(*) n FROM indicadores.ejecucion_snapshot WHERE resultado = 'EXITOSA'");
    expect(Number(ok[0].n)).toBe(1);
  });

  test("[E6-B03#1] E6-B03-T07: ADM1 dispara el snapshot (MANUAL, actor ADM1); QE1, LID1, AUD1 y ANA1 reciben 403", async ({ request }) => {
    const a = await manual(request);
    expect(a.status).toBe(200);
    expect(a.body.origen).toBe("MANUAL");
    expect(a.body.actor.id).toBe(await idLocal(request, "adm1"));
    for (const l of ["qe1", "lid1", "aud1", "ana1"]) {
      const r = await manual(request, l);
      expect(r.status, l).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
  });

  test("[E6-B03#1] E6-B03-T08: con Impedimentos detenido la ejecución queda FALLIDA sin filas; al reponerlo queda EXITOSA", async ({ request }) => {
    await manual(request);
    const n = await nFilas();
    let pila: PilaE6 | undefined;
    try {
      pila = await impedimentosCaidoEnIndicadores();
      const f = await manual(request, "adm1", pila.gatewayUrl);
      expect(f.status).toBe(200);
      expect(f.body).toMatchObject({ resultado: "FALLIDA", motivo: "IMPEDIMENTOS_NO_DISPONIBLE", filasEscritas: 0 });
    } finally {
      await pila?.detener();
    }
    expect(await nFilas()).toBe(n);
    const ok = await manual(request);
    expect(ok.body.resultado).toBe("EXITOSA");
  });

  test("[E6-B03#3] E6-B03-T09: la serie de tres días de QE1 (CEL-A, SP-PROX) trae 3 puntos ascendentes 30.0, 30.0, 40.0", async ({ request }) => {
    const dias = await serieTresDias(request);
    const c = await celulas(request);
    const r = await ind(request, "qe1", "tendencia", { celulaId: c["CEL-A"], sprintId: await sprint(request, "SP-PROX", "CEL-A") });
    expect(r.status).toBe(200);
    expect(cumpleContrato("TendenciaIndicadores", r.body, "comun").errores).toEqual([]);
    expect(r.body.series).toHaveLength(1);
    expect(r.body.series[0].puntos.map((p: any) => [p.fecha, p.cumplimiento])).toEqual([[dias[0], 30.0], [dias[1], 30.0], [dias[2], 40.0]]);
  });

  test("[E6-B03#3] E6-B03-T10: QE2 no ve la serie de H1 (sinDatos); AUD1 ve la serie completa", async ({ request }) => {
    await serieTresDias(request);
    const c = await celulas(request);
    const f = { celulaId: c["CEL-A"], sprintId: await sprint(request, "SP-PROX", "CEL-A") };
    const q = await ind(request, "qe2", "tendencia", f);
    expect(q.status).toBe(200);
    expect(q.body.sinDatos).toBe(true);
    const a = await ind(request, "aud1", "tendencia", f);
    expect(a.body.series[0].puntos.map((p: any) => p.cumplimiento)).toEqual([30.0, 30.0, 40.0]);
  });

  test("[E6-B03#3] E6-B03-T11: ADM1 y ANA1 reciben 403 en tendencia; ADM1 ve las ejecuciones sin cifras de indicadores", async ({ request }) => {
    await manual(request);
    for (const l of ["adm1", "ana1"]) {
      const r = await ind(request, l, "tendencia");
      expect(r.status, l).toBe(403);
    }
    const e = await ind(request, "adm1", "snapshots/ejecuciones");
    expect(e.status).toBe(200);
    expect(cumpleContrato("PaginaEjecucionesSnapshot", e.body, "comun").errores).toEqual([]);
    expect(e.body.items.length).toBeGreaterThan(0);
    expect(e.body.items[0]).toMatchObject({ origen: "MANUAL", resultado: "EXITOSA" });
    expect(JSON.stringify(e.body)).not.toMatch(/cumplimiento|suma_avance|hduTotal/);
  });

  test("[E6-B03#1] E6-B03-T12: con Q360_FECHA_REFERENCIA = 2026-07-01T02:30:00Z la fecha del snapshot es 2026-06-30", async ({ request }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await pilaE6({ indicadores: { Q360_FECHA_REFERENCIA: "2026-07-01T02:30:00Z" } });
      const r = await manual(request, "adm1", pila.gatewayUrl);
      expect(r.status).toBe(200);
      expect(r.body.fecha).toBe("2026-06-30");
      expect(r.body.resultado).toBe("EXITOSA");
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-B03#3] E6-B03-T13: H1 cambia de sprint (SP-PROX a SP-MED de CEL-A): las filas anteriores no cambian, hay fila nueva y la serie de SP-PROX termina el día anterior", async ({ request }) => {
    const h = await hdu(request);
    const qe1 = await idLocal(request, "qe1");
    const dAnt = hoySantiago(-2);
    const dNuevo = hoySantiago(-1);
    expect((await snapshotEn(instanteDe(dAnt))).body.resultado).toBe("EXITOSA");
    const antes = await fila("CEL-A", "SP-PROX", `QE:${qe1}`, dAnt);
    expect(antes).toHaveLength(1);
    const destino = await sprint(request, "SP-MED", "CEL-A");
    const mv = await fetch(`${env.organizacionUrl}/v1/interno/carga/hdu/${h.H1.id}/sprint`, {
      method: "PUT",
      headers: { "x-q360-servicio-token": env.servicioToken, "Content-Type": "application/json" },
      body: JSON.stringify({ sprintId: destino }),
    });
    expect(mv.status).toBe(200);
    expect((await snapshotEn(instanteDe(dNuevo))).body.resultado).toBe("EXITOSA");
    const despues = await fila("CEL-A", "SP-PROX", `QE:${qe1}`, dAnt);
    expect(despues).toEqual(antes);
    expect(await fila("CEL-A", "SP-PROX", `QE:${qe1}`, dNuevo)).toHaveLength(0);
    const nueva = await fila("CEL-A", "SP-MED", `QE:${qe1}`, dNuevo);
    expect(nueva).toHaveLength(1);
    expect(nueva[0].hdu_total).toBeGreaterThanOrEqual(1);
    const c = await celulas(request);
    const r = await ind(request, "qe1", "tendencia", { celulaId: c["CEL-A"], sprintId: await sprint(request, "SP-PROX", "CEL-A") });
    expect(r.body.series[0].puntos.map((p: any) => p.fecha)).toEqual([dAnt]);
  });

  test("[E6-B03#1] E6-B03-T14: vercel.json de Indicadores declara una tarea diaria GET /v1/cron/indicadores/snapshot a las 0 6 * * *", async () => {
    const v = JSON.parse(readFileSync(path.join(RAIZ_REPO, "services", "indicadores", "vercel.json"), "utf8"));
    expect(v.crons).toEqual([{ path: "/v1/cron/indicadores/snapshot", schedule: "0 6 * * *" }]);
  });
});
