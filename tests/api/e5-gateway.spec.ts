import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { hduFixture } from "../support/e7";
import { tk, limpiarE5 } from "../support/e5";
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
        const post = await api.post<any>(request, "/v1/integraciones/jira/sincronizaciones", { token, body: {}, baseURL: g.url });
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
