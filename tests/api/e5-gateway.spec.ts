import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { hduFixture } from "../support/e7";
import { tk, limpiarE5, estadoConfigBase, guardarConfigBase } from "../support/e5";
import { CONSULTAS, asignarYMarcar, consultarOk, continuar, editar, fila, pares } from "../support/e5c";
import { levantarGateway, type InstanciaE5 } from "../support/entornoE5";

/**
 * E5 · Gateway: rutas explícitas hacia Integraciones (D127), 503 solo en esas rutas con INTEGRACIONES_URL ausente o inválida, y
 * IMPEDIMENTOS_URL no fatal (D129). El gateway principal (:3000) se usa tal cual; las variantes son instancias del mismo build.
 */
const GATEWAY_REAL = "http://localhost:3000";
test.describe.configure({ mode: "default" }); // cada prueba parte de su propio estado base: un fallo no debe ocultar a las demás
test.afterAll(async () => {
  await limpiarE5();
});

test.describe("E5 · Gateway hacia Integraciones", () => {
  test("[E5-GW#1] el gateway real ya no responde 501 en /v1/integraciones/*: 200 para el Administrador, 401 sin token, 403 para el Líder", async ({ request }) => {
    for (const ruta of ["/v1/integraciones/estado", "/v1/integraciones/ejecuciones", "/v1/integraciones/jira/configuracion"]) {
      const r = await api.get<any>(request, ruta, { token: await tk("adm1"), baseURL: GATEWAY_REAL });
      expect(r.status, ruta).toBe(200);
      expect((await api.get<any>(request, ruta, { baseURL: GATEWAY_REAL })).status, `${ruta} sin token`).toBe(401);
      expect((await api.get<any>(request, ruta, { token: await tk("lid1"), baseURL: GATEWAY_REAL })).status, `${ruta} líder`).toBe(403);
    }
    const nueva = await api.get<any>(request, "/v1/integraciones/ruta-que-no-existe", { token: await tk("adm1"), baseURL: GATEWAY_REAL });
    expect(nueva.status).not.toBe(501);
  });

  test("[E5-GW#2] /v1/interno/* no se publica en el gateway", async ({ request }) => {
    for (const ruta of ["/v1/interno/integraciones/hdu/upsert", "/v1/interno/acceso"]) {
      const r = await api.post<any>(request, ruta, { token: await tk("adm1"), body: {}, baseURL: GATEWAY_REAL });
      expect([404, 403], ruta).toContain(r.status);
    }
  });

  for (const [nombre, valor] of [["ausente", ""], ["inválida", "esto no es una url"]] as const) {
    test.describe(`INTEGRACIONES_URL ${nombre}`, () => {
      let g: InstanciaE5 | undefined;
      test.afterAll(async () => {
        await g?.detener();
      });

      test(`[E5-GW#3] con INTEGRACIONES_URL ${nombre} el gateway arranca y solo /v1/integraciones/* responde 503 SERVICIO_NO_DISPONIBLE; el resto sigue`, async ({ request }) => {
        g = await levantarGateway(nombre === "ausente" ? 3111 : 3112, { NODE_ENV: "production", INTEGRACIONES_URL: valor });
        const token = await tk("adm1");
        expect((await fetch(`${g.url}/health`)).status).toBe(200);
        for (const ruta of ["/v1/integraciones/estado", "/v1/integraciones/ejecuciones", "/v1/integraciones/jira/configuracion"]) {
          const r = await api.get<any>(request, ruta, { token, baseURL: g.url });
          expect([r.status, r.body.codigo], ruta).toEqual([503, "SERVICIO_NO_DISPONIBLE"]);
        }
        const post = await api.post<any>(request, "/v1/integraciones/jira/consultas", { token, body: {}, baseURL: g.url });
        expect([post.status, post.body.codigo]).toEqual([503, "SERVICIO_NO_DISPONIBLE"]);
        // Lo demás no se afecta: HDU, usuarios y la composición del inicio.
        expect((await api.get<any>(request, "/v1/hdu?tamanoPagina=1", { token, baseURL: g.url })).status).toBe(200);
        expect((await api.get<any>(request, "/v1/me", { token, baseURL: g.url })).status).toBe(200);
        // El registro lo dice una vez y sin el valor.
        const salida = g.salida();
        expect(salida.match(/INTEGRACIONES_URL no configurada o inválida/g)?.length ?? 0).toBe(1);
        if (valor) expect(salida).not.toContain(valor);
      });
    });
  }


  test('[E5-GW#5] la ruta retirada POST /v1/integraciones/jira/sincronizaciones responde 404 y las 8 rutas de la consulta están publicadas (no son 404)', async ({ request }) => {
    const adm = await tk('adm1');
    const retirada = await api.post<any>(request, '/v1/integraciones/jira/sincronizaciones', { token: adm, body: {}, baseURL: GATEWAY_REAL });
    expect(retirada.status).toBe(404);
    const falso = '00000000-0000-4000-8000-000000000000';
    const casos: Array<[string, string, unknown]> = [
      ['get', `${CONSULTAS}/actual`, undefined], ['get', `${CONSULTAS}/${falso}`, undefined], ['get', `${CONSULTAS}/${falso}/items?grupo=NUEVA`, undefined],
      ['patch', `${CONSULTAS}/${falso}/items`, { itemIds: [falso], marcada: false }], ['post', `${CONSULTAS}/${falso}/continuaciones`, {}],
      ['post', `${CONSULTAS}/${falso}/confirmaciones`, { version: 1 }], ['post', `${CONSULTAS}/${falso}/descartes`, {}],
    ];
    for (const [metodo, ruta, body] of casos) {
      const r = await (api as any)[metodo](request, ruta, { token: adm, body, baseURL: GATEWAY_REAL });
      expect([r.status, r.body?.codigo], metodo + ' ' + ruta).not.toEqual([404, undefined]);
      expect(r.status, ruta).not.toBe(501);
    }
  });

  test('[E5-B05#5] GW-D152: 100 PATCH seguidos de la consulta y un PATCH de 230 filas pasan el gateway real sin 429 (cubo propio de 120/min, no el de escritura de 30/min)', async ({ request }) => {
    await estadoConfigBase(request);
    expect((await guardarConfigBase(request, { proyecto: 'BIG' })).body.guardado).toBe(true);
    const r = await consultarOk(request);
    const id = r.consulta.id as string;
    await continuar(request, id);
    await continuar(request, id);
    const p = await pares(request);
    const primera = await fila(request, id, 'BIG-1');
    const token = await tk('adm1');
    const estados: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const resp = await fetch(`${GATEWAY_REAL}${CONSULTAS}/${id}/items`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemIds: [primera.id], asignacion: { celulaId: p.celC } }) });
      estados.push(resp.status);
    }
    expect(estados.filter((s) => s === 429), 'respuestas 429 en 100 PATCH').toHaveLength(0);
    expect(new Set(estados)).toEqual(new Set([200]));
    const grande = await fetch(`${GATEWAY_REAL}${CONSULTAS}/${id}/items`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ grupo: 'NUEVA', todas: true, asignacion: { celulaId: p.celC, qeId: p.qe2, analistaId: p.ana3 } }) });
    expect(grande.status).toBe(200);
    expect(((await grande.json()) as any).aplicadas).toBe(230);
    void editar; void asignarYMarcar;
  });

  test.describe("IMPEDIMENTOS_URL ausente", () => {
    let g: InstanciaE5 | undefined;
    test.afterAll(async () => {
      await g?.detener();
    });

    test("[E5-GW#4] con IMPEDIMENTOS_URL ausente (D129) el gateway arranca y solo las rutas de Impedimentos responden 503; Integraciones y HDU siguen", async ({ request }) => {
      g = await levantarGateway(3113, { NODE_ENV: "production", IMPEDIMENTOS_URL: "" });
      const token = await tk("adm1");
      expect((await fetch(`${g.url}/health`)).status).toBe(200);
      const h = await hduFixture(request);
      const imp = await api.get<any>(request, `/v1/hdu/${h["E7-H1"].id}/impedimentos`, { token: await tk("qe1"), baseURL: g.url });
      expect([imp.status, imp.body.codigo]).toEqual([503, "SERVICIO_NO_DISPONIBLE"]);
      expect((await api.get<any>(request, "/v1/integraciones/estado", { token, baseURL: g.url })).status).toBe(200);
      expect((await api.get<any>(request, "/v1/hdu?tamanoPagina=1", { token, baseURL: g.url })).status).toBe(200);
      expect(g.salida().match(/IMPEDIMENTOS_URL no configurada o inválida/g)?.length ?? 0).toBe(1);
    });
  });
});
