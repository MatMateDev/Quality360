import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { listarHduE7, tokenE7 } from "../support/e7";

/**
 * Valores ABSOLUTOS de la sección 3 del backlog E7. Solo valen sobre una base con únicamente `npm run seed:e7`
 * (sin semilla MVP ni residuos de otras corridas): si la base no es esa, las pruebas se omiten (y una omitida no certifica).
 */
let pura = false;
test.beforeAll(async ({ request }) => {
  const r = await api.get<{ contadores: { usuariosActivos: { datos: { valor: number } }; hduTotal: { datos: { valor: number } } } }>(request, "/v1/bandeja/admin", { token: await tokenE7("adm1") });
  pura = r.status === 200 && r.body.contadores.usuariosActivos.datos.valor === 10 && r.body.contadores.hduTotal.datos.valor === 8;
});
test.beforeEach(() => test.skip(!pura, "La base no es la del fixture puro (10 usuarios activos y 8 HDU): valores absolutos no verificables."));

const v = (c: { datos: { valor: number } }) => c.datos.valor;

test.describe("E7 · valores absolutos del fixture (base solo con seed:e7)", () => {
  test("[E7-B03#1] ABS-T06: ADM1 ve 10 activos (1/2/4/2/1), 1 inactivo, ANA4 sin QE, LID2 sin células, CEL-C sin líder y 8 HDU", async ({ request }) => {
    const r = await api.get<any>(request, "/v1/bandeja/admin", { token: await tokenE7("adm1") });
    const c = r.body.contadores;
    expect(v(c.usuariosActivos)).toBe(10);
    expect(c.usuariosActivos.datos.porRol).toEqual({ ADMINISTRADOR: 1, QE: 2, ANALISTA_QA: 4, LIDER_QA: 2, AUDITOR: 1 });
    expect(v(c.usuariosInactivos)).toBe(1);
    expect(v(c.analistasSinQe)).toBe(1);
    expect(v(c.qeSinAnalistas)).toBe(0);
    expect(v(c.lideresSinCelulas)).toBe(1);
    expect(v(c.celulasSinLider)).toBe(1);
    expect(v(c.hduTotal)).toBe(8);
    const p = r.body.pendientes.datos;
    expect(p.total).toBe(3);
    expect(p.items.map((i: any) => i.tipo).sort()).toEqual(["ANALISTA_SIN_QE", "CELULA_SIN_LIDER", "LIDER_SIN_CELULAS"]);
    expect(p.items.find((i: any) => i.tipo === "ANALISTA_SIN_QE").usuario.correo).toBe("ana4@quality360.local");
    expect(p.items.find((i: any) => i.tipo === "LIDER_SIN_CELULAS").usuario.correo).toBe("lid2@quality360.local");
    expect(p.items.find((i: any) => i.tipo === "CELULA_SIN_LIDER").celula.nombre).toBe("CEL-C");
  });

  test("[E7-B03#1] ABS-T04: LID1 tiene 2 células, 5 abiertas, 1 cerrada, 1 sin analista, 1 certificado y 6 HDU; LID2 ninguna", async ({ request }) => {
    const r = await api.get<any>(request, "/v1/bandeja/lider?tamanoPagina=100", { token: await tokenE7("lid1") });
    const c = r.body.contadores;
    expect([v(c.celulas), v(c.hduAbiertas), v(c.hduCerradas), v(c.sinAnalista), v(c.certificados)]).toEqual([2, 5, 1, 1, 1]);
    expect(r.body.hdu.datos.items.map((h: any) => h.codigo).sort()).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);
    const l2 = await api.get<any>(request, "/v1/bandeja/lider", { token: await tokenE7("lid2") });
    expect(v(l2.body.contadores.celulas)).toBe(0);
    expect(l2.body.hdu.datos.items).toEqual([]);
  });

  test("[E7-B03#1] ABS-T07: AUD1 ve 8 HDU y 2 certificados (F7 y F8)", async ({ request }) => {
    const r = await api.get<any>(request, "/v1/bandeja/auditor?tamanoPagina=100", { token: await tokenE7("aud1") });
    expect(v(r.body.contadores.hduTotal)).toBe(8);
    expect(v(r.body.contadores.certificados)).toBe(2);
    expect(r.body.hdu.datos.items).toHaveLength(8);
  });

  test("[E7-B02#1] ABS-T01/T06: LID1 lista exactamente 6 HDU y AUD1 las 8", async ({ request }) => {
    expect((await listarHduE7(request, await tokenE7("lid1"))).map((h) => h.codigo).sort()).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);
    expect(await listarHduE7(request, await tokenE7("aud1"))).toHaveLength(8);
  });

  test("[E7-B04#1] ABS-T03: la lista de certificados trae exactamente 2 (E7-H7 y E7-H8) y la bitácora global se recorre completa", async ({ request }) => {
    const token = await tokenE7("aud1");
    const c = await api.get<any>(request, "/v1/auditor/certificados", { token });
    expect(c.body.total).toBe(2);
    expect(c.body.items.map((x: any) => x.hdu.codigo).sort()).toEqual(["E7-H7", "E7-H8"]);
    const b = await api.get<any>(request, "/v1/auditor/bitacora?tamanoPagina=25", { token });
    for (let p = 1; p <= Math.ceil(b.body.total / 25); p += 1) expect((await api.get(request, `/v1/auditor/bitacora?pagina=${p}&tamanoPagina=25`, { token })).status, `pagina ${p}`).toBe(200);
  });
});
