import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { conConexion } from "../support/db";
import { env } from "../support/env";
import { hdu } from "../support/e4";
import { exportar, fotoE6, restaurarE6, llevarAPendienteCierre, ind, tkLocal, textoPdf, consultaDb, celulas, JUSTIFICACION_40, type FotoE6 } from "../support/e6run";
import { DATABASE_URL_DUENO } from "../support/e4";
import { certificacionesCaidaEnOrganizacion, type PilaE6 } from "../support/entornoE6";

/**
 * Seguridad de E6 (CRON_SECRET, credenciales de servicio y Authorization no se filtran; rutas internas no publicadas; cron sin secreto 401)
 * y desviaciones de diseño validadas. Los IDs `E6-SEC` y `E6-DIS` son de esta certificación (no están en el backlog).
 */
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

const secretos = () => [env.cronSecret, env.servicioToken, env.indicadoresServicioToken].filter((s) => s.length > 0);

test.describe("E6 · Seguridad", () => {
  test("[E6-SEC#1] E6-SEC-T01: las rutas internas de Indicadores y Organización no se publican en el gateway (404), ni con credencial de servicio", async ({ request }) => {
    const rutas: Array<[string, string]> = [
      ["POST", "/v1/interno/carga/snapshots"],
      ["POST", "/v1/interno/auditoria/exportaciones"],
      ["GET", "/v1/interno/hdu/ambito"],
      ["POST", "/v1/interno/checklist/estados"],
      ["POST", "/v1/interno/impedimentos/evaluacion"],
    ];
    for (const [m, ruta] of rutas) {
      for (const cabeceras of [{}, { "x-q360-servicio-token": env.servicioToken }, { Authorization: `Bearer ${await tkLocal("adm1")}` }]) {
        const r = await request.fetch(`${env.gatewayUrl}${ruta}`, { method: m, headers: cabeceras, data: m === "POST" ? {} : undefined, failOnStatusCode: false });
        expect(r.status(), `${m} ${ruta}`).toBe(404);
      }
    }
  });

  test("[E6-SEC#2] E6-SEC-T02: el cron sin secreto, con secreto ajeno o con JWT de sesión responde 401, por el gateway y directo al servicio", async ({ request }) => {
    expect(env.cronSecret.length).toBeGreaterThan(10);
    const sesion = `Bearer ${await tkLocal("adm1")}`;
    for (const base of [env.gatewayUrl, env.indicadoresUrl]) {
      for (const cab of [{}, { Authorization: "Bearer otro-secreto" }, { Authorization: sesion }, { Authorization: env.cronSecret }]) {
        const r = await request.fetch(`${base}/v1/cron/indicadores/snapshot`, { method: "GET", headers: cab, failOnStatusCode: false });
        expect(r.status(), `${base} ${JSON.stringify(Object.keys(cab))}`).toBe(401);
      }
    }
    const antes = Number((await consultaDb("SELECT count(*) n FROM indicadores.ejecucion_snapshot"))[0].n);
    expect(antes).toBe(0);
  });

  test("[E6-SEC#3] E6-SEC-T03: CRON_SECRET, la credencial de servicio y el Authorization del llamante no aparecen en ninguna respuesta (cuerpos ni cabeceras)", async ({ request }) => {
    expect(secretos().length).toBeGreaterThanOrEqual(2);
    const salidas: string[] = [];
    const guardar = (r: { status: number; body: unknown; headers: Record<string, string> }, token: string) => {
      salidas.push(JSON.stringify(r.headers), typeof r.body === "string" ? r.body : JSON.stringify(r.body));
      return token;
    };
    for (const l of ["qe1", "lid1", "aud1", "adm1", "ana1"]) {
      const t = await tkLocal(l);
      for (const [recurso] of [["cumplimiento"], ["semaforo"], ["carga"], ["umbral-carga"], ["tendencia"], ["snapshots/ejecuciones"], ["filtros"]]) {
        guardar(await ind(request, l, recurso), t);
      }
    }
    guardar(await api.post(request, "/v1/indicadores/snapshots", { token: await tkLocal("adm1") }), "");
    guardar(await api.post(request, "/v1/indicadores/snapshots", { token: await tkLocal("qe1") }), "");
    guardar(await api.put(request, "/v1/indicadores/umbral-carga", { token: await tkLocal("qe1"), body: { valor: "abc" } }), "");
    guardar(await ind(request, undefined, "cumplimiento"), "");
    const cron = await request.fetch(`${env.gatewayUrl}/v1/cron/indicadores/snapshot`, { headers: { Authorization: `Bearer ${env.cronSecret}` }, failOnStatusCode: false });
    salidas.push(JSON.stringify(cron.headers()), await cron.text());
    for (const [formato, vista] of [["csv", "carga"], ["pdf", "semaforo"], ["csv", "cumplimiento"]] as const) {
      const x = await exportar(request, "qe1", { vista, formato });
      salidas.push(formato === "pdf" ? textoPdf(x.buf) + x.buf.toString("latin1") : x.texto, x.disposicion);
    }
    const todo = salidas.join("\n");
    for (const s of secretos()) expect(todo.includes(s), "un secreto aparece en una respuesta").toBe(false);
    for (const l of ["qe1", "lid1", "aud1", "adm1", "ana1"]) expect(todo.includes(await tkLocal(l)), `el token de ${l} se devuelve`).toBe(false);
  });

  test("[E6-SEC#4] E6-SEC-T04: los registros del stack y del gateway de la corrida no contienen secretos ni tokens Bearer", async () => {
    const rutas = [process.env.LOGS_E6_FILE ?? "C:\\DuocUC\\CAPSTONE\\logs-q360\\local-e6.log", "C:\\DuocUC\\CAPSTONE\\logs-q360\\qa\\gw3110.log"].filter((r) => existsSync(r));
    expect(rutas.length, "no se encontró ningún registro que revisar").toBeGreaterThan(0);
    for (const ruta of rutas) {
      const texto = readFileSync(ruta, "utf8");
      for (const s of secretos()) expect(texto.includes(s), `${ruta} contiene un secreto`).toBe(false);
      expect(/Bearer\s+[A-Za-z0-9_-]{20,}/.test(texto), `${ruta} contiene un Bearer`).toBe(false);
      expect(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(texto), `${ruta} contiene un JWT`).toBe(false);
    }
  });
});

test.describe("E6 · Desviaciones de diseño", () => {
  test("[E6-DIS#1] E6-DIS-T01: cierre_hdu es inmutable por un disparador (no por REVOKE): el rol del servicio conserva el privilegio y aun así falla; TRUNCATE del dueño sí pasa", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    expect((await api.post(request, `/v1/hdu/${h.H2.id}/estado`, { token: await tkLocal("qe1"), body: { estado: "CERRADA", justificacion: JUSTIFICACION_40 } })).status).toBe(200);
    const trig = await consultaDb("SELECT tgname FROM pg_trigger WHERE tgrelid = 'organizacion.cierre_hdu'::regclass AND NOT tgisinternal");
    expect(trig.map((t) => t.tgname)).toContain("cierre_hdu_inmutable");
    const priv = await consultaDb("SELECT has_table_privilege(current_user, 'organizacion.cierre_hdu', 'UPDATE') AS u, has_table_privilege(current_user, 'organizacion.cierre_hdu', 'DELETE') AS d");
    expect(priv[0]).toEqual({ u: true, d: true });
    for (const sql of ["UPDATE organizacion.cierre_hdu SET aprobados = 9", "DELETE FROM organizacion.cierre_hdu"]) {
      await expect(conConexion(DATABASE_URL_DUENO, (c) => c.query(sql)), `dueño: ${sql}`).rejects.toThrow(/inmutable|insert|solo inserci/i);
      await expect(conConexion(env.databaseUrlOrganizacion, (c) => c.query(sql)), `servicio: ${sql}`).rejects.toThrow();
    }
    await consultaDb("TRUNCATE organizacion.cierre_hdu");
    expect(Number((await consultaDb("SELECT count(*) n FROM organizacion.cierre_hdu"))[0].n)).toBe(0);
  });

  test("[E6-DIS#2] E6-DIS-T02: solo el QE responsable recibe permisos.cerrarConExcepcion en true; Líder y Auditor no la reciben; Administrador y Analista la reciben en false", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    // Líder y Auditor (solo lectura) no reciben la propiedad en absoluto; Administrador y Analista la reciben en false.
    const esperado: Record<string, boolean | undefined> = { qe1: true, lid1: undefined, aud1: undefined, adm1: false, ana2: false };
    for (const [local, valor] of Object.entries(esperado)) {
      const r = await api.get<any>(request, `/v1/hdu/${h.H2.id}`, { token: await tkLocal(local) });
      expect(r.status, local).toBe(200);
      expect(r.body.permisos?.cerrarConExcepcion, local).toBe(valor);
    }
    const q2 = await api.get<any>(request, `/v1/hdu/${h.H2.id}`, { token: await tkLocal("qe2") });
    expect([403, 404]).toContain(q2.status);
  });

  test("[E6-DIS#3] E6-DIS-T03: con Certificaciones caída el cierre da 409 CHECKLIST_NO_DISPONIBLE (no 503)", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnOrganizacion();
      const r = await api.post<any>(request, `/v1/hdu/${h.H2.id}/estado`, { token: await tkLocal("qe1"), body: { estado: "CERRADA", justificacion: JUSTIFICACION_40 }, baseURL: pila.gatewayUrl });
      expect(r.status).toBe(409);
      expect(r.body.codigo).toBe("CHECKLIST_NO_DISPONIBLE");
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-DIS#4] E6-DIS-T04: los motivos del drill-down se limitan al color de la celda (H1 solo RIESGO_ALTO aunque tiene I2 abierto; H6 solo IMPEDIMENTO_ESCALADO aunque su riesgo es MEDIO)", async ({ request }) => {
    const c = await celulas(request);
    const a = await ind(request, "qe1", `semaforo/${c["CEL-A"]}/hdu`);
    const h1 = a.body.items.find((i: any) => i.hdu.codigo === "E7-H1");
    expect(h1.motivos).toEqual(["RIESGO_ALTO"]);
    expect(h1.impedimentoPrincipal).not.toBeNull();
    const b = await ind(request, "qe1", `semaforo/${c["CEL-B"]}/hdu`);
    expect(b.body.items[0].motivos).toEqual(["IMPEDIMENTO_ESCALADO"]);
    const amarilla = await ind(request, "qe2", `semaforo/${c["CEL-B"]}/hdu`);
    expect(amarilla.body.items[0].motivos.sort()).toEqual(["IMPEDIMENTO_ABIERTO", "RIESGO_MEDIO"]);
  });

  test("[E6-DIS#5] E6-DIS-T05: el evento CIERRE_EXCEPCION del historial no trae rol del actor (solo tipo, id y nombre)", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    await api.post(request, `/v1/hdu/${h.H2.id}/estado`, { token: await tkLocal("qe1"), body: { estado: "CERRADA", justificacion: JUSTIFICACION_40 } });
    const r = await api.get<any>(request, `/v1/hdu/${h.H2.id}/historial`, { token: await tkLocal("aud1") });
    const e = r.body.items.find((x: any) => x.tipo === "CIERRE_EXCEPCION");
    expect(Object.keys(e.actor).sort()).toEqual(["id", "nombre", "tipo"]);
    expect(JSON.stringify(e)).not.toMatch(/"rol"|actorRol/);
  });

  test("[E6-DIS#6] E6-DIS-T06: guardarLote hace una consulta por fila dentro de una transacción de 5 s: el snapshot del fixture escribe sus filas muy por debajo del tiempo límite", async ({ request }) => {
    const r = await api.post<any>(request, "/v1/indicadores/snapshots", { token: await tkLocal("adm1") });
    expect(r.status).toBe(200);
    expect(r.body.resultado).toBe("EXITOSA");
    expect(r.body.filasEscritas).toBeGreaterThan(10);
    expect(r.body.duracionMs).toBeLessThan(2500);
    const codigo = readFileSync("C:\\DuocUC\\CAPSTONE\\Quality360-e6\\services\\indicadores\\src\\infraestructura\\prisma\\repositorios.prisma.ts", "utf8");
    expect(codigo).toMatch(/for \(const f of filas\)[\s\S]*tx\.\$queryRaw/);
  });
});
