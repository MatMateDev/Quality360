import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { hdu } from "../support/e4";
import { ESPERADO } from "../support/e6";
import { cifras, consultaDb, fotoE6, restaurarE6, ind, celulas, sprint, tkLocal, llevarAPendienteCierre, JUSTIFICACION_40, UUID_INEXISTENTE, type FotoE6 } from "../support/e6run";
import { certificacionesCaidaEnIndicadores, impedimentosCaidoEnIndicadores, organizacionCaidaEnIndicadores, type PilaE6 } from "../support/entornoE6";

/** E6-B01 · Filtros y cumplimiento (11 casos). Base compartida (con la semilla MVP): las cifras absolutas del Auditor se contrastan con el conteo de la base. */
test.describe.configure({ mode: "default" });
let foto: FotoE6;
test.beforeAll(async () => {
  foto = await fotoE6();
  await restaurarE6(foto, { impedimentos: true });
});
test.afterAll(async () => {
  await restaurarE6(foto, { impedimentos: true });
});

const contrato = (b: unknown) => expect(cumpleContrato("IndicadoresCumplimiento", b, "comun").errores).toEqual([]);
const suma = (c: ReturnType<typeof cifras>) => (c.certificadas ?? 0) + (c.cerradasExcepcion ?? 0) + (c.enCurso ?? 0) + (c.sinIniciar ?? 0);

test.describe("E6-B01 · Filtros y cumplimiento", () => {
  test("[E6-B01#1] E6-B01-T01: GET /v1/indicadores/cumplimiento como QE1: 5 totales, 1 certificada, 3 en curso, 1 sin iniciar, 2 bloqueadas, 44.0", async ({ request }) => {
    const r = await ind(request, "qe1", "cumplimiento");
    expect(r.status).toBe(200);
    contrato(r.body);
    expect(cifras(r.body)).toMatchObject({ totales: 5, certificadas: 1, cerradasExcepcion: 0, enCurso: 3, sinIniciar: 1, bloqueadas: 2, cumplimiento: 44.0 });
    expect(cifras(r.body)).toMatchObject(ESPERADO.qe1);
    expect(r.body.sinDatos).toBe(false);
  });

  test("[E6-B01#1] E6-B01-T02: QE2 ve 3 HDU y 33.3; QE1 en CEL-B ve solo H6 (1 HDU, 80.0)", async ({ request }) => {
    const q2 = await ind(request, "qe2", "cumplimiento");
    expect(cifras(q2.body)).toMatchObject({ totales: 3, cumplimiento: 33.3 });
    const c = await celulas(request);
    const q1 = await ind(request, "qe1", "cumplimiento", { celulaId: c["CEL-B"] });
    expect(cifras(q1.body)).toMatchObject({ totales: 1, cumplimiento: 80.0 });
  });

  test("[E6-B01#1] E6-B01-T03: ANA1 y ADM1 reciben 403 ACCESO_DENEGADO; sin sesión 401 NO_AUTENTICADO", async ({ request }) => {
    for (const l of ["ana1", "adm1"]) {
      const r = await ind(request, l, "cumplimiento");
      expect(r.status, l).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
    const s = await ind(request, undefined, "cumplimiento");
    expect(s.status).toBe(401);
    expect(s.body.codigo).toBe("NO_AUTENTICADO");
  });

  test("[E6-B01#2] E6-B01-T04: filtros de célula y sprint de QE1 (CEL-A 13.3; SP-PROX de CEL-A 30.0; de CEL-B 80.0; combinado 30.0)", async ({ request }) => {
    const c = await celulas(request);
    const pa = await sprint(request, "SP-PROX", "CEL-A");
    const pb = await sprint(request, "SP-PROX", "CEL-B");
    const a = await ind(request, "qe1", "cumplimiento", { celulaId: c["CEL-A"] });
    expect(cifras(a.body)).toMatchObject({ totales: 3, cumplimiento: 13.3 });
    const s1 = await ind(request, "qe1", "cumplimiento", { sprintId: pa });
    expect(cifras(s1.body)).toMatchObject({ totales: 1, cumplimiento: 30.0 });
    const s2 = await ind(request, "qe1", "cumplimiento", { sprintId: pb });
    expect(cifras(s2.body)).toMatchObject({ totales: 1, cumplimiento: 80.0 });
    expect(((cifras(s1.body).cumplimiento ?? 0) + (cifras(s2.body).cumplimiento ?? 0)) / 2).toBe(55.0);
    const ab = await ind(request, "qe1", "cumplimiento", { celulaId: c["CEL-A"], sprintId: pa });
    expect(cifras(ab.body)).toMatchObject({ totales: 1, cumplimiento: 30.0 });
  });

  test("[E6-B01#2] E6-B01-T05: UUID válido inexistente da 200 sinDatos con promedio null; UUID mal formado 400 VALIDACION", async ({ request }) => {
    const a = await ind(request, "qe2", "cumplimiento", { celulaId: UUID_INEXISTENTE });
    expect(a.status).toBe(200);
    expect(a.body.sinDatos).toBe(true);
    expect(cifras(a.body).cumplimiento).toBeNull();
    contrato(a.body);
    const b = await ind(request, "qe2", "cumplimiento", { celulaId: "abc" });
    expect(b.status).toBe(400);
    expect(b.body.codigo).toBe("VALIDACION");
    expect(b.body.detalles.map((d: any) => d.campo)).toContain("celulaId");
  });

  test("[E6-B01#3] E6-B01-T06: al aprobar el entregable 4 de H1 el cumplimiento de QE1 pasa de 44.0 a 46.0 en la misma consulta", async ({ request }) => {
    const h = await hdu(request);
    try {
      const antes = await ind(request, "qe1", "cumplimiento");
      expect(cifras(antes.body).cumplimiento).toBe(44.0);
      const ap = await api.post(request, `/v1/hdu/${h.H1.id}/entregables/APROBACION_CASOS/aprobar`, { token: await tkLocal("qe1") });
      expect(ap.status).toBe(200);
      const despues = await ind(request, "qe1", "cumplimiento");
      expect(cifras(despues.body).cumplimiento).toBe(46.0);
    } finally {
      await restaurarE6(foto);
    }
  });

  test("[E6-B01#1] E6-B01-T07: LID1 6 HDU y 36.7; AUD1 contrastado con la base compartida y con las cifras por célula del backlog", async ({ request }) => {
    const l = await ind(request, "lid1", "cumplimiento");
    expect(cifras(l.body)).toMatchObject({ totales: 6, cumplimiento: 36.7 });
    const a = await ind(request, "aud1", "cumplimiento");
    expect(a.status).toBe(200);
    contrato(a.body);
    const total = Number((await consultaDb("SELECT count(*) n FROM organizacion.historia_usuario"))[0].n);
    const ca = cifras(a.body);
    expect(ca.totales).toBe(total);
    expect(suma(ca)).toBe(ca.totales);
    const c = await celulas(request);
    const por: Record<string, ReturnType<typeof cifras>> = {};
    for (const n of ["CEL-A", "CEL-B", "CEL-C"]) por[n] = cifras((await ind(request, "aud1", "cumplimiento", { celulaId: c[n] })).body);
    expect(por["CEL-A"].totales! + por["CEL-B"].totales! + por["CEL-C"].totales!).toBe(8);
    // Cifras que el arquitecto agregó al backlog para la base compartida.
    expect([por["CEL-A"].totales, por["CEL-A"].cumplimiento]).toEqual([4, 35.0]);
    expect([por["CEL-B"].totales, por["CEL-B"].cumplimiento]).toEqual([2, 40.0]);
    expect([por["CEL-C"].totales, por["CEL-C"].cumplimiento]).toEqual([2, 50.0]);
    const conjunto = (35 * 4 + 40 * 2 + 50 * 2) / 8;
    expect(conjunto).toBe(40.0);
  });

  test("[E6-B01#1] E6-B01-T08: con Certificaciones detenido, totales, cerradas con excepción y bloqueadas con valor; el resto indisponible con null", async ({ request }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await certificacionesCaidaEnIndicadores();
      const r = await ind(request, "qe1", "cumplimiento", {}, pila.gatewayUrl);
      expect(r.status).toBe(200);
      contrato(r.body);
      expect(r.body.hduTotales).toEqual({ estado: "ok", valor: 5 });
      expect(r.body.cerradasConExcepcion).toEqual({ estado: "ok", valor: 0 });
      expect(r.body.bloqueadas).toEqual({ estado: "ok", valor: 2 });
      for (const k of ["certificadas", "enCurso", "sinIniciar", "cumplimientoPromedio"]) {
        expect(r.body[k].estado, k).toBe("indisponible");
        expect(r.body[k].valor, k).toBeNull();
      }
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-B01#1] E6-B01-T09: con Organización detenida responde 503 SERVICIO_NO_DISPONIBLE sin cifras", async ({ request }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await organizacionCaidaEnIndicadores();
      const r = await ind(request, "qe1", "cumplimiento", {}, pila.gatewayUrl);
      expect(r.status).toBe(503);
      expect(r.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
      expect(JSON.stringify(r.body)).not.toContain("hduTotales");
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-B01#1] E6-B01-T10: con Impedimentos detenido, bloqueadas indisponible y el resto con valor", async ({ request }) => {
    let pila: PilaE6 | undefined;
    try {
      pila = await impedimentosCaidoEnIndicadores();
      const r = await ind(request, "qe1", "cumplimiento", {}, pila.gatewayUrl);
      expect(r.status).toBe(200);
      expect(r.body.bloqueadas.estado).toBe("indisponible");
      expect(r.body.bloqueadas.valor).toBeNull();
      expect(cifras(r.body)).toMatchObject({ totales: 5, certificadas: 1, enCurso: 3, sinIniciar: 1, cumplimiento: 44.0 });
    } finally {
      await pila?.detener();
    }
  });

  test("[E6-B01#1] E6-B01-T11: tras cerrar H2 con excepción QE1 ve 1 cerrada con excepción y 44.0; CEL-A 3 HDU y 13.3", async ({ request }) => {
    const h = await hdu(request);
    try {
      await llevarAPendienteCierre(request, "H2");
      const c = await api.post(request, `/v1/hdu/${h.H2.id}/estado`, { token: await tkLocal("qe1"), body: { estado: "CERRADA", justificacion: JUSTIFICACION_40 } });
      expect(c.status).toBe(200);
      const r = await ind(request, "qe1", "cumplimiento");
      const x = cifras(r.body);
      expect(x).toMatchObject({ totales: 5, certificadas: 1, cerradasExcepcion: 1, enCurso: 2, sinIniciar: 1, cumplimiento: 44.0 });
      expect(suma(x)).toBe(x.totales);
      const a = await ind(request, "qe1", "cumplimiento", { celulaId: (await celulas(request))["CEL-A"] });
      expect(cifras(a.body)).toMatchObject({ totales: 3, cerradasExcepcion: 1, cumplimiento: 13.3 });
    } finally {
      await restaurarE6(foto);
    }
  });
});
