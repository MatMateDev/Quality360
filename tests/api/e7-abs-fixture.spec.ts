import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { listarHduE7, tokenE7 } from "../support/e7";

/**
 * Valores ABSOLUTOS de la sección 3 del backlog E7. Solo valen sobre una base con únicamente `npm run seed:e7`
 * (sin semilla MVP ni residuos de otras corridas): si la base no es esa, las pruebas se omiten (y una omitida no certifica).
 */
let pura = false;
test.beforeAll(async ({ request }) => {
  type Valor = { datos: { valor: number } };
  const r = await api.get<{ contadores: { usuariosActivos: Valor; usuariosInactivos: Valor; hduTotal: Valor } }>(request, "/v1/bandeja/admin", { token: await tokenE7("adm1") });
  const c = r.body.contadores;
  // Una base anterior a D208 migrada conserva a LID1 y LID2 como Auditores inactivos: no es el fixture puro.
  pura = r.status === 200 && c.usuariosActivos.datos.valor === 8 && c.usuariosInactivos.datos.valor === 1 && c.hduTotal.datos.valor === 8;
});
test.beforeEach(() => test.skip(!pura, "La base no es la del fixture puro (8 usuarios activos, 1 inactivo y 8 HDU): valores absolutos no verificables."));

const v = (c: { datos: { valor: number } }) => c.datos.valor;

test.describe("E7 · valores absolutos del fixture (base solo con seed:e7)", () => {
  test("[E7-B03#1] ABS-T06: ADM1 ve 8 activos (1/2/4/1, sin Líder QA desde D208), 1 inactivo, ANA4 sin QE y 8 HDU", async ({ request }) => {
    const r = await api.get<any>(request, "/v1/bandeja/admin", { token: await tokenE7("adm1") });
    const c = r.body.contadores;
    expect(v(c.usuariosActivos)).toBe(8);
    expect(c.usuariosActivos.datos.porRol).toEqual({ ADMINISTRADOR: 1, QE: 2, ANALISTA_QA: 4, AUDITOR: 1 });
    expect(v(c.usuariosInactivos)).toBe(1);
    expect(v(c.analistasSinQe)).toBe(1);
    expect(v(c.qeSinAnalistas)).toBe(0);
    expect(Object.keys(c)).not.toContain("lideresSinCelulas");
    expect(Object.keys(c)).not.toContain("celulasSinLider");
    expect(v(c.hduTotal)).toBe(8);
    const p = r.body.pendientes.datos;
    expect(p.total).toBe(1);
    expect(p.items).toEqual([{ tipo: "ANALISTA_SIN_QE", usuario: expect.objectContaining({ correo: "ana4@quality360.local" }) }]);
  });

  test("[E7-B03#1] ABS-T07: AUD1 ve 8 HDU y 2 certificados (F7 y F8)", async ({ request }) => {
    const r = await api.get<any>(request, "/v1/bandeja/auditor?tamanoPagina=100", { token: await tokenE7("aud1") });
    expect(v(r.body.contadores.hduTotal)).toBe(8);
    expect(v(r.body.contadores.certificados)).toBe(2);
    expect(r.body.hdu.datos.items).toHaveLength(8);
  });

  test("[E7-B02#1] ABS-T06: AUD1 lista las 8 HDU", async ({ request }) => {
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
