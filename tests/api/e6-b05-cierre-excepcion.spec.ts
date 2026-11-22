import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conConexion } from "../support/db";
import { env } from "../support/env";
import { hdu, imps, reiniciarFixtureE4 } from "../support/e4";
import { fotoE6, restaurarE6, tkLocal, idLocal, llevarAPendienteCierre, estadoHdu, contarCierres, consultaDb, JUSTIFICACION_40, justificacion, type FotoE6 } from "../support/e6run";
import { certificacionesCaidaEnOrganizacion, type PilaE6 } from "../support/entornoE6";

/** E6-B05 · Cierre con excepción (12 casos). Cada caso parte del fixture restaurado con la foto del dueño de la base. */
test.describe.configure({ mode: "default" });
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
});
test.beforeEach(async () => {
  await restaurarE6(foto);
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const cerrar = async (request: any, local: string, hduId: string, cuerpo: Record<string, unknown> = {}, baseURL?: string) =>
  api.post<any>(request, `/v1/hdu/${hduId}/estado`, { token: await tkLocal(local), body: { estado: "CERRADA", ...cuerpo }, baseURL });

test.describe("E6-B05 · Cierre con excepción", () => {
  test("[E6-B05#1] E6-B05-T01: QE1 cierra H2 (1 aprobado) con 40 caracteres: CERRADA, cierreParcial y bloque cierre", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    const j = "Se descarta el alcance restante del sprint.".slice(0, 40);
    expect(j).toHaveLength(40);
    const r = await cerrar(request, "qe1", h.H2.id, { justificacion: j });
    expect(r.status).toBe(200);
    expect(r.body.hdu.estado).toBe("CERRADA");
    expect(r.body.hdu.cierreParcial).toBe(true);
    expect(r.body.cierre).toMatchObject({ aprobados: 1, justificacion: j, actorRol: "QE" });
    expect(r.body.cierre.pendientes).toHaveLength(9);
    expect(r.body.cierre.actor.id).toBe(await idLocal(request, "qe1"));
    expect(Date.now() - Date.parse(r.body.cierre.fecha)).toBeLessThan(120_000);
    const c = cumpleContrato("ResultadoCambioEstado", r.body, "comun");
    expect(c.errores).toEqual([]);
  });

  test("[E6-B05#1] E6-B05-T02: sin justificación 409 CHECKLIST_INCOMPLETO; en blanco 422; 19 y 501 caracteres 400; H2 sigue en PENDIENTE_CIERRE", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    const a = await cerrar(request, "qe1", h.H2.id);
    expect(a.status).toBe(409);
    expect(a.body.codigo).toBe("CHECKLIST_INCOMPLETO");
    expect(a.body.puedeCerrarConExcepcion).toBe(true);
    const b = await cerrar(request, "qe1", h.H2.id, { justificacion: "   " });
    expect(b.status).toBe(422);
    expect(b.body.codigo).toBe("JUSTIFICACION_REQUERIDA");
    for (const n of [19, 501]) {
      const r = await cerrar(request, "qe1", h.H2.id, { justificacion: justificacion(n) });
      expect(r.status, `${n} caracteres`).toBe(400);
      expect(r.body.codigo).toBe("VALIDACION");
      expect(r.body.detalles.map((d: any) => d.campo)).toContain("justificacion");
    }
    expect(await estadoHdu(request, h.H2.id)).toBe("PENDIENTE_CIERRE");
    expect(await contarCierres(h.H2.id)).toBe(0);
  });

  test("[E6-B05#1] E6-B05-T03: límites 20 (H5) y 500 (H2) caracteres se aceptan", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H5");
    await llevarAPendienteCierre(request, "H2");
    const a = await cerrar(request, "qe1", h.H5.id, { justificacion: justificacion(20) });
    expect(a.status).toBe(200);
    expect(a.body.cierre.aprobados).toBe(0);
    expect(a.body.cierre.pendientes).toHaveLength(10);
    const b = await cerrar(request, "qe1", h.H2.id, { justificacion: justificacion(500) });
    expect(b.status).toBe(200);
    expect(b.body.cierre.justificacion).toHaveLength(500);
  });

  test("[E6-B05#2] E6-B05-T04: QE2, QE que solo supervisa al analista, ANA2, LID1, ADM1 y AUD1 reciben 403 y H2 no cambia", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    for (const local of ["qe2", "ana2", "lid1", "adm1", "aud1"]) {
      const r = await cerrar(request, local, h.H2.id, { justificacion: JUSTIFICACION_40 });
      expect(r.status, local).toBe(403);
      expect(r.body.codigo, local).toBe("ACCESO_DENEGADO");
    }
    // QE2 pasa a supervisar al analista de H2 (ANA3, de su equipo) sin ser el responsable.
    const re = await api.put(request, `/v1/hdu/${h.H2.id}/analista`, { token: await tkLocal("adm1"), body: { analistaId: await idLocal(request, "ana3"), motivo: "Prueba E6-B05-T04" } });
    expect(re.status).toBe(200);
    const r = await cerrar(request, "qe2", h.H2.id, { justificacion: JUSTIFICACION_40 });
    expect(r.status).toBe(403);
    expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    expect(await estadoHdu(request, h.H2.id)).toBe("PENDIENTE_CIERRE");
    expect(await contarCierres()).toBe(0);
  });

  test("[E6-B05#2] E6-B05-T05: H1 con I2 abierto da 409 HDU_BLOQUEADA sin registro; al resolver I2 cierra con excepción", async ({ request }) => {
    const h = await hdu(request);
    try {
      await llevarAPendienteCierre(request, "H1");
      const i = await imps(request);
      const a = await cerrar(request, "qe1", h.H1.id, { justificacion: JUSTIFICACION_40 });
      expect(a.status).toBe(409);
      expect(a.body.codigo).toBe("HDU_BLOQUEADA");
      expect(JSON.stringify(a.body)).toContain(i.I2.id);
      expect(await contarCierres()).toBe(0);
      const res = await api.post(request, `/v1/impedimentos/${i.I2.id}/resolver`, { token: await tkLocal("qe1"), body: { comentario: "Se entregaron las cuentas" } });
      expect(res.status).toBe(200);
      const b = await cerrar(request, "qe1", h.H1.id, { justificacion: JUSTIFICACION_40 });
      expect(b.status).toBe(200);
      expect(b.body.hdu.cierreParcial).toBe(true);
      expect(b.body.cierre.aprobados).toBe(3);
    } finally {
      await reiniciarFixtureE4();
    }
  });

  test("[E6-B05#2] E6-B05-T06: (a) transición inválida antes de la justificación; (b) Certificaciones caída 409 CHECKLIST_NO_DISPONIBLE; (c) checklist antes que impedimentos", async ({ request }) => {
    const h = await hdu(request);
    // (a) H1 sigue en EN_EJECUCION
    const a = await cerrar(request, "qe1", h.H1.id, { justificacion: JUSTIFICACION_40 });
    expect(a.status).toBe(409);
    expect(a.body.codigo).toBe("TRANSICION_INVALIDA");
    // (c) H1 en PENDIENTE_CIERRE con I2 abierto y sin justificación
    await llevarAPendienteCierre(request, "H1");
    const c = await cerrar(request, "qe1", h.H1.id);
    expect(c.status).toBe(409);
    expect(c.body.codigo).toBe("CHECKLIST_INCOMPLETO");
    // (b) H2 con Certificaciones detenida para Organización
    await llevarAPendienteCierre(request, "H2");
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnOrganizacion();
      const b = await cerrar(request, "qe1", h.H2.id, { justificacion: JUSTIFICACION_40 }, pila.gatewayUrl);
      expect(b.status).toBe(409);
      expect(b.body.codigo).toBe("CHECKLIST_NO_DISPONIBLE");
      expect(b.body.checklist.estado).toBe("indisponible");
    } finally {
      await pila?.detener();
    }
    expect(await estadoHdu(request, h.H2.id)).toBe("PENDIENTE_CIERRE");
    expect(await contarCierres()).toBe(0);
  });

  test("[E6-B05#3] E6-B05-T07: la HDU cerrada con excepción no tiene certificado ni se puede generar; el de H8 no cambia", async ({ request }) => {
    const h = await hdu(request);
    const qe1 = await tkLocal("qe1");
    const antes = await api.get<any>(request, `/v1/hdu/${h.H8.id}/certificado`, { token: qe1 });
    const filas = () => consultaDb<{ n: string }>("SELECT count(*) n FROM certificaciones.certificado");
    const n0 = (await filas())[0].n;
    await llevarAPendienteCierre(request, "H2");
    expect((await cerrar(request, "qe1", h.H2.id, { justificacion: JUSTIFICACION_40 })).status).toBe(200);
    const get = await api.get<any>(request, `/v1/hdu/${h.H2.id}/certificado`, { token: qe1 });
    expect(get.status).toBe(404);
    const post = await api.post<any>(request, `/v1/hdu/${h.H2.id}/certificado`, { token: qe1 });
    expect(post.status).toBe(409);
    expect((await filas())[0].n).toBe(n0);
    const despues = await api.get<any>(request, `/v1/hdu/${h.H8.id}/certificado`, { token: qe1 });
    expect(despues.status).toBe(antes.status);
    expect(despues.body.folio).toBe(antes.body.folio);
  });

  test("[E6-B05#3] E6-B05-T08: auditoría CERRAR_HDU_PARCIAL, bloque cierre, cierreParcial en el listado y cierre_hdu inmutable", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    expect((await cerrar(request, "qe1", h.H2.id, { justificacion: JUSTIFICACION_40 })).status).toBe(200);
    const aud = await api.get<any>(request, `/v1/auditoria?entidad=HDU&entidadId=${h.H2.id}`, { token: await tkLocal("adm1") });
    expect(aud.status).toBe(200);
    const e = aud.body.items.find((x: any) => x.accion === "CERRAR_HDU_PARCIAL");
    expect(e).toBeTruthy();
    expect(e.actor.id).toBe(await idLocal(request, "qe1"));
    expect(e.despues).toMatchObject({ aprobados: 1, justificacion: JUSTIFICACION_40 });
    const det = await api.get<any>(request, `/v1/hdu/${h.H2.id}`, { token: await tkLocal("aud1") });
    expect(det.body.cierre).toMatchObject({ aprobados: 1, justificacion: JUSTIFICACION_40 });
    const hist = await api.get<any>(request, `/v1/hdu/${h.H2.id}/historial`, { token: await tkLocal("aud1") });
    expect(hist.body.items.some((x: any) => x.tipo === "CIERRE_EXCEPCION")).toBe(true);
    const lista = await api.get<any>(request, `/v1/hdu?pagina=1&tamanoPagina=100`, { token: await tkLocal("aud1") });
    expect(lista.body.items.find((x: any) => x.id === h.H2.id).cierreParcial).toBe(true);
    for (const sql of ["UPDATE organizacion.cierre_hdu SET aprobados = 9", "DELETE FROM organizacion.cierre_hdu"]) {
      await expect(conConexion(env.databaseUrlOrganizacion, (c) => c.query(sql)), sql).rejects.toThrow();
    }
    expect(await contarCierres(h.H2.id)).toBe(1);
  });

  test("[E6-B05#1] E6-B05-T09: H8 (10 aprobados) cierra con y sin justificación: cierre normal, sin registro ni CERRAR_HDU_PARCIAL", async ({ request }) => {
    const h = await hdu(request);
    const parciales = () => consultaDb<{ n: string }>("SELECT count(*) n FROM organizacion.auditoria WHERE accion = 'CERRAR_HDU_PARCIAL' AND entidad_id = $1", [h.H8.id]);
    const sin = await cerrar(request, "qe1", h.H8.id);
    expect(sin.status).toBe(200);
    expect(sin.body.hdu.cierreParcial).toBeFalsy();
    expect(await contarCierres()).toBe(0);
    await restaurarE6(foto);
    const con = await cerrar(request, "qe1", h.H8.id, { justificacion: JUSTIFICACION_40 });
    expect(con.status).toBe(200);
    expect(con.body.hdu.cierreParcial).toBeFalsy();
    expect(con.body.cierre ?? null).toBeNull();
    expect(await contarCierres()).toBe(0);
    expect((await parciales())[0].n).toBe("0");
  });

  test("[E6-B05#3] E6-B05-T10: tras el cierre, marcar, registrar impedimento y reabrir dan 409 y H2 no cambia", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    expect((await cerrar(request, "qe1", h.H2.id, { justificacion: JUSTIFICACION_40 })).status).toBe(200);
    const m = await api.post<any>(request, `/v1/hdu/${h.H2.id}/entregables/DASHBOARD/marcar`, { token: await tkLocal("ana2"), body: { evidencia: { tipo: "ENLACE", url: "https://evidencia.quality360.local/x" } } });
    expect(m.status).toBe(409);
    expect(m.body.codigo).toBe("HDU_CERRADA");
    const i = await api.post<any>(request, `/v1/hdu/${h.H2.id}/impedimentos`, { token: await tkLocal("qe1"), body: { tipo: "RECURSOS", titulo: "Tras el cierre", descripcion: "descripcion ".repeat(3), responsableId: await idLocal(request, "qe1") } });
    expect(i.status).toBe(409);
    expect(i.body.codigo).toBe("HDU_CERRADA");
    const re = await api.post<any>(request, `/v1/hdu/${h.H2.id}/estado`, { token: await tkLocal("qe1"), body: { estado: "EN_EJECUCION" } });
    expect(re.status).toBe(409);
    expect(re.body.codigo).toBe("TRANSICION_INVALIDA");
    expect(await estadoHdu(request, h.H2.id)).toBe("CERRADA");
  });

  test("[E6-B05#1] E6-B05-T11: dos cierres simultáneos: uno 200 y otro 409 TRANSICION_INVALIDA; un solo registro", async ({ request }) => {
    const h = await hdu(request);
    await llevarAPendienteCierre(request, "H2");
    const rs = await Promise.all([cerrar(request, "qe1", h.H2.id, { justificacion: JUSTIFICACION_40 }), cerrar(request, "qe1", h.H2.id, { justificacion: JUSTIFICACION_40 })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409)!.body.codigo).toBe("TRANSICION_INVALIDA");
    expect(await contarCierres(h.H2.id)).toBe(1);
  });

  test("[E6-B05#regresion] E6-B05-T12: regresión del cierre certificado (E2-B02, E3, E4-B02): checklist incompleto sin justificación, transición inválida y HDU_BLOQUEADA con checklist completo", async ({ request }) => {
    const h = await hdu(request);
    try {
      await llevarAPendienteCierre(request, "H2");
      const a = await cerrar(request, "qe1", h.H2.id);
      expect(a.status).toBe(409);
      expect(a.body.codigo).toBe("CHECKLIST_INCOMPLETO");
      expect(a.body.checklist.estado).toBe("ok");
      const b = await cerrar(request, "qe1", h.H6.id);
      expect(b.status).toBe(409);
      expect(b.body.codigo).toBe("TRANSICION_INVALIDA");
      const imp = await api.post<any>(request, `/v1/hdu/${h.H8.id}/impedimentos`, { token: await tkLocal("qe1"), body: { tipo: "RECURSOS", titulo: "Bloquea el cierre", descripcion: "descripcion ".repeat(3), responsableId: await idLocal(request, "qe1") } });
      expect(imp.status).toBe(201);
      const c = await cerrar(request, "qe1", h.H8.id);
      expect(c.status).toBe(409);
      expect(c.body.codigo).toBe("HDU_BLOQUEADA");
      expect(await estadoHdu(request, h.H8.id)).toBe("PENDIENTE_CIERRE");
    } finally {
      await reiniciarFixtureE4();
    }
  });
});
