import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { tokenE7, type ClaveE7 } from "../support/e7";
import { certificacionesCaidaEnImpedimentos, impedimentosConFecha, type PilaE4 } from "../support/entornoE4";
import { contarDb, hdu, hoySantiago, imps, reiniciarFixtureE4, texto, uid, type ImpedimentoApi } from "../support/e4";

/** E4-B03 · Riesgo sugerido y confirmación manual (3 escenarios, T01..T12). El fixture se recarga antes de cada caso. */
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await reiniciarFixtureE4();
});

interface Factor {
  codigo: string;
  nivel: string;
  detalle: { diasAbierto?: number; diasRestantes?: number; avance?: number; sprintFin?: string; impedimentos?: number; umbralDias?: number; umbralAvance?: number };
}
interface Riesgo {
  hduId: string;
  hduCerrada: boolean;
  nivelVigente: string | null;
  origen: string | null;
  fijado: { nivel: string; nivelAnterior: string | null; justificacion: string; sugeridoAlFijar: string | null; actor: { id: string; nombre: string; rol: string }; fecha: string } | null;
  nivelSugerido: string | null;
  estado: string;
  motivoSinSugerencia: string | null;
  calculoParcial: boolean;
  factores: Factor[];
  factoresNoEvaluados: string[];
  sugerenciaDistinta: boolean;
  fechaReferencia: string;
  permisos: { puedeFijarRiesgo: boolean };
}

async function riesgo(request: Parameters<typeof api.get>[0], clave: ClaveE7, hduId: string, baseURL?: string) {
  const r = await api.get<Riesgo>(request, `/v1/hdu/${hduId}/riesgo`, { token: await tokenE7(clave), baseURL });
  expect(r.status, `GET riesgo ${clave}`).toBe(200);
  expect(cumpleContrato("RiesgoHdu", r.body).errores, "RiesgoHdu (contrato)").toEqual([]);
  return r.body;
}
const codigos = (r: Riesgo) => r.factores.map((f) => f.codigo).sort();
const filasRiesgo = (hduId: string) => contarDb("SELECT count(*) n FROM impedimentos.riesgo_hdu WHERE id_historia = $1", [hduId]);

test.describe("E4-B03 · Riesgo", () => {
  test("[E4-B03#1] T01: H3 (QE2) sugiere MEDIO con el único factor IMPEDIMENTO_ABIERTO; vigente MEDIO, origen SUGERIDO", async ({ request }) => {
    const h = await hdu(request);
    const r = await riesgo(request, "qe2", h.H3.id);
    expect(r).toMatchObject({ nivelSugerido: "MEDIO", nivelVigente: "MEDIO", origen: "SUGERIDO", estado: "ok", calculoParcial: false, fijado: null });
    expect(codigos(r)).toEqual(["IMPEDIMENTO_ABIERTO"]);
    expect(r.factores[0].detalle.impedimentos).toBe(1);
  });

  test("[E4-B03#1] T02: H1 sugiere ALTO con IMPEDIMENTO_ABIERTO, IMPEDIMENTO_ANTIGUO (6 días) y ATRASO_SPRINT_ALTO (2 días, avance 30)", async ({ request }) => {
    const h = await hdu(request);
    const r = await riesgo(request, "qe1", h.H1.id);
    expect(r).toMatchObject({ nivelSugerido: "ALTO", nivelVigente: "ALTO", origen: "SUGERIDO" });
    expect(codigos(r)).toEqual(["ATRASO_SPRINT_ALTO", "IMPEDIMENTO_ABIERTO", "IMPEDIMENTO_ANTIGUO"]);
    const antiguo = r.factores.find((f) => f.codigo === "IMPEDIMENTO_ANTIGUO")!;
    expect(antiguo.detalle).toMatchObject({ diasAbierto: 6, umbralDias: 5 });
    const atraso = r.factores.find((f) => f.codigo === "ATRASO_SPRINT_ALTO")!;
    expect(atraso.detalle).toMatchObject({ diasRestantes: 2, avance: 30, umbralAvance: 70 });
    expect(r.fechaReferencia).toBe(hoySantiago());
  });

  test("[E4-B03#2] T03: H2 MEDIO por ATRASO_SPRINT_MEDIO (6 días, avance 10); H5 ALTO por SPRINT_VENCIDO; H6 sugerido ALTO por IMPEDIMENTO_ESCALADO pero vigente MEDIO (MANUAL)", async ({ request }) => {
    const h = await hdu(request);
    const h2 = await riesgo(request, "qe1", h.H2.id);
    expect(h2).toMatchObject({ nivelSugerido: "MEDIO", nivelVigente: "MEDIO", origen: "SUGERIDO" });
    expect(codigos(h2)).toEqual(["ATRASO_SPRINT_MEDIO"]);
    expect(h2.factores[0].detalle).toMatchObject({ diasRestantes: 6, avance: 10, umbralAvance: 50 });

    const h5 = await riesgo(request, "qe1", h.H5.id);
    expect(h5).toMatchObject({ nivelSugerido: "ALTO", nivelVigente: "ALTO" });
    expect(codigos(h5), "H5 solo SPRINT_VENCIDO (backlog sección 7)").toEqual(["SPRINT_VENCIDO"]);
    expect(h5.factores[0].detalle.diasRestantes).toBe(-3);

    const h6 = await riesgo(request, "qe1", h.H6.id);
    expect(h6).toMatchObject({ nivelSugerido: "ALTO", nivelVigente: "MEDIO", origen: "MANUAL", sugerenciaDistinta: true });
    expect(codigos(h6)).toEqual(["IMPEDIMENTO_ABIERTO", "IMPEDIMENTO_ESCALADO"]);
    expect(h6.fijado).toMatchObject({ nivel: "MEDIO", justificacion: "Dependencia en gestión con el equipo de Pagos" });
  });

  test("[E4-B03#2] T04: H8 y H4 sugieren BAJO sin factores; H7 (CERRADA) no tiene sugerencia (HDU_CERRADA) y queda sin evaluar", async ({ request }) => {
    const h = await hdu(request);
    for (const [clave, x] of [["qe1", h.H8], ["qe2", h.H4]] as const) {
      const r = await riesgo(request, clave, x.id);
      expect(r, x.codigo).toMatchObject({ nivelSugerido: "BAJO", nivelVigente: "BAJO", origen: "SUGERIDO" });
      expect(r.factores, x.codigo).toEqual([]);
    }
    const h7 = await riesgo(request, "qe2", h.H7.id);
    expect(h7).toMatchObject({ hduCerrada: true, nivelSugerido: null, motivoSinSugerencia: "HDU_CERRADA", nivelVigente: null, origen: null });
  });

  test("[E4-B03#1] T05: un impedimento nuevo en H8 sube la sugerencia a MEDIO exacto, solo con IMPEDIMENTO_ABIERTO (0 días de antigüedad, sprint lejano)", async ({ request }) => {
    const h = await hdu(request);
    const reg = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H8.id}/impedimentos`, {
      token: await tokenE7("qe1"),
      body: { tipo: "RECURSOS", titulo: "Falta personal para cerrar", descripcion: texto(30, "descripcion "), responsableId: await uid(request, "qe1") },
    });
    expect(reg.status).toBe(201);
    const r = await riesgo(request, "qe1", h.H8.id);
    expect(r).toMatchObject({ nivelSugerido: "MEDIO", nivelVigente: "MEDIO" });
    expect(codigos(r)).toEqual(["IMPEDIMENTO_ABIERTO"]);
  });

  test("[E4-B03#1] T06: al resolver I2 la sugerencia de H1 sigue ALTO solo con ATRASO_SPRINT_ALTO; al resolver I1, H3 baja a BAJO sin factores", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    expect((await api.post(request, `/v1/impedimentos/${i.I2.id}/resolver`, { token: await tokenE7("qe1"), body: { comentario: "Cuentas entregadas" } })).status).toBe(200);
    const h1 = await riesgo(request, "qe1", h.H1.id);
    expect(h1.nivelSugerido).toBe("ALTO");
    expect(codigos(h1)).toEqual(["ATRASO_SPRINT_ALTO"]);
    expect((await api.post(request, `/v1/impedimentos/${i.I1.id}/resolver`, { token: await tokenE7("qe2"), body: { comentario: "Ambiente restablecido" } })).status).toBe(200);
    const h3 = await riesgo(request, "qe2", h.H3.id);
    expect(h3).toMatchObject({ nivelSugerido: "BAJO" });
    expect(h3.factores).toEqual([]);
  });

  test("[E4-B03#3] T07: QE1 fija BAJO en H1 contra una sugerencia ALTO: cambio true; vigente BAJO (MANUAL), sugerido ALTO, sugeridoAlFijar ALTO, con justificación y autor", async ({ request }) => {
    const h = await hdu(request);
    const justificacion = "Se acordó con el PO ampliar el sprint";
    const put = await api.put<{ cambio: boolean; riesgo: Riesgo }>(request, `/v1/hdu/${h.H1.id}/riesgo`, { token: await tokenE7("qe1"), body: { nivel: "BAJO", justificacion } });
    expect(put.status).toBe(200);
    expect(put.body.cambio).toBe(true);
    expect(cumpleContrato("ResultadoCambioRiesgo", put.body).errores).toEqual([]);
    const r = await riesgo(request, "qe1", h.H1.id);
    expect(r).toMatchObject({ nivelVigente: "BAJO", origen: "MANUAL", nivelSugerido: "ALTO", sugerenciaDistinta: true });
    expect(r.fijado).toMatchObject({ nivel: "BAJO", nivelAnterior: null, sugeridoAlFijar: "ALTO", justificacion });
    expect(r.fijado!.actor).toMatchObject({ id: await uid(request, "qe1"), rol: "QE" });
    // Repetir el mismo nivel con la misma justificación no agrega filas (cambio false).
    const igual = await api.put<{ cambio: boolean }>(request, `/v1/hdu/${h.H1.id}/riesgo`, { token: await tokenE7("qe1"), body: { nivel: "BAJO", justificacion } });
    expect(igual.body.cambio).toBe(false);
    expect(await filasRiesgo(h.H1.id)).toBe(1);
  });

  test("[E4-B03#3] T08 (negativo): nivel CRITICO, sin justificación y de 501 caracteres dan 400 VALIDACION; en blanco, 422 JUSTIFICACION_REQUERIDA; sin filas nuevas", async ({ request }) => {
    const h = await hdu(request);
    const token = await tokenE7("qe1");
    const antes = await filasRiesgo(h.H1.id);
    const put = (body: unknown) => api.put<{ codigo: string; detalles: Array<{ campo: string; codigo: string }> }>(request, `/v1/hdu/${h.H1.id}/riesgo`, { token, body });
    const critico = await put({ nivel: "CRITICO", justificacion: "No existe ese nivel" });
    expect(critico.status).toBe(400);
    expect(critico.body.detalles.find((d) => d.campo === "nivel")?.codigo).toBe("VALOR_NO_PERMITIDO");
    expect((await put({ nivel: "ALTO" })).status).toBe(400);
    expect((await put({ nivel: "ALTO", justificacion: texto(501) })).status).toBe(400);
    const blanco = await put({ nivel: "ALTO", justificacion: "     " });
    expect(blanco.status).toBe(422);
    expect(blanco.body.codigo).toBe("JUSTIFICACION_REQUERIDA");
    expect(await filasRiesgo(h.H1.id)).toBe(antes);
  });

  test("[E4-B03#3] T09 (negativo): PUT 403 para QE2, ANA1, LID1, AUD1 y ADM1; GET 403 para QE2 y ANA1 y 200 para LID1, AUD1 y ADM1; sin token 401", async ({ request }) => {
    const h = await hdu(request);
    for (const clave of ["qe2", "ana1", "lid1", "aud1", "adm1"] as const) {
      const r = await api.put<{ codigo: string }>(request, `/v1/hdu/${h.H1.id}/riesgo`, { token: await tokenE7(clave), body: { nivel: "ALTO", justificacion: "Intento no autorizado" } });
      expect(r.status, `PUT ${clave}`).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
    for (const clave of ["qe2", "ana1"] as const) {
      const r = await api.get<{ codigo: string }>(request, `/v1/hdu/${h.H1.id}/riesgo`, { token: await tokenE7(clave) });
      expect(r.status, `GET ${clave}`).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
    for (const clave of ["lid1", "aud1", "adm1"] as const) {
      const r = await api.get<Riesgo>(request, `/v1/hdu/${h.H1.id}/riesgo`, { token: await tokenE7(clave) });
      expect(r.status, `GET ${clave}`).toBe(200);
      expect(r.body.permisos.puedeFijarRiesgo, `${clave} no puede fijar`).toBe(false);
    }
    expect((await api.get(request, `/v1/hdu/${h.H1.id}/riesgo`)).status).toBe(401);
    expect((await api.put(request, `/v1/hdu/${h.H1.id}/riesgo`, { body: { nivel: "ALTO", justificacion: "Sin sesión" } })).status).toBe(401);
    expect(await filasRiesgo(h.H1.id)).toBe(0);
  });

  test("[E4-B03#3] T10: QE2 fija el riesgo de H7 (CERRADA): 409 HDU_CERRADA", async ({ request }) => {
    const h = await hdu(request);
    const r = await api.put<{ codigo: string }>(request, `/v1/hdu/${h.H7.id}/riesgo`, { token: await tokenE7("qe2"), body: { nivel: "BAJO", justificacion: "Intento sobre HDU cerrada" } });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("HDU_CERRADA");
    expect(await filasRiesgo(h.H7.id)).toBe(0);
  });

  test.describe("con «hoy» fijo (Q360_FECHA_REFERENCIA)", () => {
    test("[E4-B03#2] T11: hoy+3 → H2 ALTO (3 días, avance 10) y H6 incluye SPRINT_VENCIDO; hoy−1 → H2 MEDIO (7 días); hoy−2 → H2 BAJO (8 días, sin factores)", async ({ request }) => {
      const h = await hdu(request);
      const casos: Array<{ desplazo: number; esperado: (r: Riesgo) => void; h6?: (r: Riesgo) => void }> = [
        {
          desplazo: 3,
          esperado: (r) => {
            expect(r.nivelSugerido).toBe("ALTO");
            expect(codigos(r)).toEqual(["ATRASO_SPRINT_ALTO"]);
            expect(r.factores[0].detalle).toMatchObject({ diasRestantes: 3, avance: 10 });
          },
          h6: (r) => expect(codigos(r)).toContain("SPRINT_VENCIDO"),
        },
        {
          desplazo: -1,
          esperado: (r) => {
            expect(r.nivelSugerido).toBe("MEDIO");
            expect(codigos(r)).toEqual(["ATRASO_SPRINT_MEDIO"]);
            expect(r.factores[0].detalle.diasRestantes).toBe(7);
          },
        },
        {
          desplazo: -2,
          esperado: (r) => {
            expect(r.nivelSugerido).toBe("BAJO");
            expect(r.factores).toEqual([]);
          },
        },
      ];
      for (const caso of casos) {
        const fecha = hoySantiago(caso.desplazo);
        const pila: PilaE4 = await impedimentosConFecha(fecha);
        try {
          const r2 = await riesgo(request, "qe1", h.H2.id, pila.gatewayUrl);
          expect(r2.fechaReferencia).toBe(fecha);
          caso.esperado(r2);
          if (caso.h6) caso.h6(await riesgo(request, "qe1", h.H6.id, pila.gatewayUrl));
        } finally {
          await pila.detener();
        }
      }
    });
  });

  test.describe("con Certificaciones caída", () => {
    let pila: PilaE4;
    test.beforeAll(async () => {
      pila = await certificacionesCaidaEnImpedimentos();
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E4-B03#2] T12: sin avance, H1 es ALTO con calculoParcial y atraso indisponible; H8 queda sin sugerencia (indisponible, no BAJO); H6 mantiene MEDIO fijado con sugerido ALTO", async ({ request }) => {
      const h = await hdu(request);
      const h1 = await riesgo(request, "qe1", h.H1.id, pila.gatewayUrl);
      expect(h1).toMatchObject({ nivelSugerido: "ALTO", calculoParcial: true });
      expect(h1.factoresNoEvaluados).toContain("ATRASO_SPRINT_ALTO");

      const h8 = await riesgo(request, "qe1", h.H8.id, pila.gatewayUrl);
      expect(h8.nivelSugerido).toBeNull();
      expect(h8.estado).toBe("indisponible");
      expect(h8.nivelVigente, "nunca BAJO por una fuente caída").not.toBe("BAJO");
      expect(h8.motivoSinSugerencia).toBe("FUENTE_NO_DISPONIBLE");

      const h6 = await riesgo(request, "qe1", h.H6.id, pila.gatewayUrl);
      expect(h6).toMatchObject({ nivelVigente: "MEDIO", origen: "MANUAL", nivelSugerido: "ALTO" });
    });
  });
});
