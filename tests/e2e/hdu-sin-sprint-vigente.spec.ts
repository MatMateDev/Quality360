import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { conOrganizacion } from "../support/db";
import { env } from "../support/env";
import { crearHdu, listarTodasHdu, obtenerCatalogos, obtenerUsuarioPorCorreo } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * Certificación del arreglo `38d6c15`: `GET /v1/hdu` con una HDU sin sprint vigente.
 *
 * Una HDU cuyo `historia_sprint` vigente se cerró (dato inconsistente) no cabe en `HduResumen` (el sprint es
 * obligatorio, `comun.v1.yaml`). Antes el listado respondía 500 a todos; ahora la deja fuera y responde 200.
 * La prueba crea sus propias HDU, cierra el sprint de una con el dueño de las tablas de `organizacion` y borra
 * todo al terminar, aun si falla.
 */
const CORREOS = {
  ADMINISTRADOR: USUARIOS_SEMILLA.patricia.correo,
  QE: USUARIOS_SEMILLA.carla.correo,
  ANALISTA_QA: USUARIOS_SEMILLA.ana.correo,
  LIDER_QA: "lorena.soto@quality360.local",
  AUDITOR: "andres.vega@quality360.local",
} as const;

let tokens: Record<keyof typeof CORREOS, string>;
let sana: { id: string; codigo: string };
let rota: { id: string; codigo: string };
const creadas: string[] = [];

async function borrarCreadas(): Promise<void> {
  if (creadas.length === 0) return;
  await conOrganizacion(async (c) => {
    for (const tabla of ["hdu_historial_estado", "hdu_historial_asignacion", "hdu_historial_responsable"]) {
      await c.query(`delete from organizacion.${tabla} where hdu_id = any($1::uuid[])`, [creadas]);
    }
    await c.query("delete from organizacion.historia_sprint where id_historia = any($1::uuid[])", [creadas]);
    await c.query("delete from organizacion.historia_usuario where id_historia = any($1::uuid[])", [creadas]);
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  tokens = {} as typeof tokens;
  for (const [rol, correo] of Object.entries(CORREOS)) {
    tokens[rol as keyof typeof CORREOS] = (await iniciarSesion(correo, env.contrasenaDemo)).accessToken;
  }
  try {
    const ana = await obtenerUsuarioPorCorreo(request, tokens.ADMINISTRADOR, USUARIOS_SEMILLA.ana.correo);
    const { celula, sprint } = await obtenerCatalogos(request, tokens.QE);
    sana = await crearHdu(request, tokens.QE, { codigo: codigoHduUnico("SPRSANA"), celulaId: celula.id, sprintId: sprint.id });
    creadas.push(sana.id);
    rota = await crearHdu(request, tokens.QE, { codigo: codigoHduUnico("SPRROTA"), celulaId: celula.id, sprintId: sprint.id });
    creadas.push(rota.id);
    for (const hdu of [sana, rota]) await api.put(request, `/v1/hdu/${hdu.id}/analista`, { token: tokens.QE, body: { analistaId: ana.id } });
    // Cierra el sprint vigente de `rota` con el dueño de la tabla (el gateway no ofrece forma de hacerlo).
    const cerradas = await conOrganizacion((c) =>
      c.query("update organizacion.historia_sprint set fecha_retiro = current_date where id_historia = $1 and fecha_retiro is null", [rota.id]),
    );
    expect(cerradas.rowCount).toBe(1);
  } catch (error) {
    await borrarCreadas();
    throw error;
  }
});

test.afterAll(async () => {
  await borrarCreadas();
});

test.describe("HDU sin sprint vigente · GET /v1/hdu", () => {
  for (const rol of Object.keys(CORREOS) as Array<keyof typeof CORREOS>) {
    test(`[SIN-SPRINT#1] ${rol}: GET /v1/hdu responde 200 y deja fuera la HDU sin sprint vigente`, async ({ request }) => {
      const respuesta = await api.get<{ items: Array<{ id: string; sprint: { id: string } | null }>; total: number }>(request, "/v1/hdu?tamanoPagina=100", {
        token: tokens[rol],
      });
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
      expect(respuesta.body.items.every((hdu) => hdu.sprint !== null)).toBe(true);
      expect(respuesta.body.items.map((hdu) => hdu.id)).not.toContain(rota.id);
      if (rol === "ADMINISTRADOR" || rol === "QE" || rol === "ANALISTA_QA") expect(respuesta.body.items.map((hdu) => hdu.id)).toContain(sana.id);
    });
  }

  test("[SIN-SPRINT#2] paginación y total cuadran: recorrer todas las páginas de a 5 da `total` ítems sin la HDU rota", async ({ request }) => {
    const primera = await api.get<{ total: number }>(request, "/v1/hdu?pagina=1&tamanoPagina=5", { token: tokens.ADMINISTRADOR });
    expect(primera.status).toBe(200);
    const ids: string[] = [];
    for (let pagina = 1; pagina <= Math.ceil(primera.body.total / 5) + 1; pagina += 1) {
      const r = await api.get<{ items: Array<{ id: string }>; total: number }>(request, `/v1/hdu?pagina=${pagina}&tamanoPagina=5`, { token: tokens.ADMINISTRADOR });
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(primera.body.total);
      ids.push(...r.body.items.map((hdu) => hdu.id));
    }
    expect(ids.length).toBe(primera.body.total);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(sana.id);
    expect(ids).not.toContain(rota.id);
    expect((await listarTodasHdu(request, tokens.ADMINISTRADOR)).length).toBe(primera.body.total);
  });

  test("[SIN-SPRINT#3] los filtros por célula, sprint y estado siguen respondiendo 200 sin la HDU rota", async ({ request }) => {
    const { celula, sprint } = await obtenerCatalogos(request, tokens.QE);
    for (const consulta of [`celulaId=${celula.id}`, `sprintId=${sprint.id}`, "estado=PENDIENTE", `celulaId=${celula.id}&sprintId=${sprint.id}&estado=PENDIENTE`]) {
      const r = await api.get<{ items: Array<{ id: string }>; total: number }>(request, `/v1/hdu?${consulta}&tamanoPagina=100`, { token: tokens.QE });
      expect(r.status, consulta).toBe(200);
      expect(r.body.items.length).toBe(r.body.total);
      expect(r.body.items.map((hdu) => hdu.id), consulta).not.toContain(rota.id);
    }
  });

  test("[SIN-SPRINT#4] el portal muestra el resto de las HDU del QE y del Analista QA, sin error", async ({ browser }) => {
    for (const [clave, ruta] of [["carla", "/qe/hdu"], ["ana", "/qa/hdu"]] as const) {
      const contexto = await browser.newContext({ storageState: path.join(import.meta.dirname, "..", ".auth", `${clave}.json`) });
      const page = await contexto.newPage();
      await page.goto(`${env.portalUrl}${ruta}`);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      await expect(page.getByRole("link", { name: sana.codigo })).toBeVisible();
      await expect(page.getByRole("link", { name: rota.codigo })).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByText(/no disponible|error/i)).toHaveCount(0);
      await contexto.close();
    }
  });

  // DEF-SINSPRINT-01: por id, una HDU sin sprint vigente es inexistente (404/403 según el rol), nunca 500/503.
  test("[SIN-SPRINT#5] DEF-SINSPRINT-01: lecturas y escrituras por id de una HDU sin sprint vigente no responden 500 ni 503, para los 5 roles", async ({ request }) => {
    for (const rol of Object.keys(CORREOS) as Array<keyof typeof CORREOS>) {
      for (const sufijo of ["", "/historial", "/entregables", "/impedimentos"]) {
        const ruta = `/v1/hdu/${rota.id}${sufijo}`;
        const r = await api.get(request, ruta, { token: tokens[rol] });
        expect([403, 404], `${rol} ${ruta}: ${JSON.stringify(r.body)}`).toContain(r.status);
      }
    }
    for (const rol of ["QE", "ANALISTA_QA"] as const) {
      const r = await api.post(request, `/v1/hdu/${rota.id}/estado`, { token: tokens[rol], body: { estado: "DISENO_PRUEBAS" } });
      expect([403, 404], `${rol} estado: ${JSON.stringify(r.body)}`).toContain(r.status);
    }
    const a = await api.put(request, `/v1/hdu/${rota.id}/analista`, { token: tokens.QE, body: { analistaId: sana.id } });
    expect([403, 404, 422], `analista: ${JSON.stringify(a.body)}`).toContain(a.status);
  });

  test("[SIN-SPRINT#6] DEF-SINSPRINT-02: los contadores del inicio coinciden con el total de la lista", async ({ request }) => {
    const lista = async (rol: keyof typeof CORREOS) => (await api.get<{ total: number }>(request, "/v1/hdu?tamanoPagina=1", { token: tokens[rol] })).body.total;
    const qe = await api.get<{ hdu: { datos: { hduEnAmbito: number } } }>(request, "/v1/inicio/qe", { token: tokens.QE });
    expect(qe.body.hdu.datos.hduEnAmbito).toBe(await lista("QE"));
    const qa = await api.get<{ hdu: { datos: { hduAsignadas: number } } }>(request, "/v1/inicio/qa", { token: tokens.ANALISTA_QA });
    expect(qa.body.hdu.datos.hduAsignadas).toBe(await lista("ANALISTA_QA"));
  });
});
