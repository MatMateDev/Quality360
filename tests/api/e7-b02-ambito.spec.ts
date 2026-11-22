import { expect, test } from "@playwright/test";
import { api, llamarApi } from "../support/api";
import { crearHduAsignadaAAna } from "../support/checklist";
import { cumpleContrato } from "../support/contrato";
import { conOrganizacion } from "../support/db";
import {
  celulasFixture,
  cuerpoSinTrace,
  hduFixture,
  listarHduE7,
  marcarConArchivo,
  tokenE7,
  type ClaveE7,
} from "../support/e7";
import { correoUnico } from "../support/unique";

interface PaginaHdu {
  items: Array<{ id: string; codigo: string; celula: { nombre: string }; estado: string }>;
  total: number;
}

// D208: el rol Líder QA se retiró; sus escenarios de ámbito por célula (T01 a T05) quedan retirados.
test.describe("E7-B02 · Ámbito de lectura y solo lectura del Auditor", () => {
  test("[E7-B02#2] T06: AUD1 lista todas las HDU y el detalle de H7 trae checklist, bitácora e historiales", async ({ request }) => {
    const token = await tokenE7("aud1");
    const h = await hduFixture(request);
    const r = await api.get<PaginaHdu>(request, "/v1/hdu?tamanoPagina=100", { token });
    expect(r.status).toBe(200);
    const total = await conOrganizacion(async (c) => Number((await c.query(`SELECT count(*) n FROM organizacion.historia_usuario h WHERE EXISTS (SELECT 1 FROM organizacion.historia_sprint s WHERE s.id_historia = h.id_historia AND s.fecha_retiro IS NULL AND s.id_sprint IS NOT NULL)`)).rows[0].n));
    expect(r.body.total).toBe(total);
    const codigos = (await listarHduE7(request, token)).map((x) => x.codigo);
    for (const c of ["E7-H1", "E7-H2", "E7-H3", "E7-H4", "E7-H5", "E7-H6", "E7-H7", "E7-H8"]) expect(codigos).toContain(c);
    for (const hdu of Object.values(h)) {
      const d = await api.get(request, `/v1/hdu/${hdu.id}`, { token });
      expect(d.status, hdu.codigo).toBe(200);
    }
    const h7 = h["E7-H7"].id;
    const entregables = await api.get<{ entregables: unknown[] }>(request, `/v1/hdu/${h7}/entregables`, { token });
    expect(entregables.status).toBe(200);
    expect(entregables.body.entregables).toHaveLength(10);
    const bitacora = await api.get<{ eventos: unknown[] }>(request, `/v1/hdu/${h7}/entregables/bitacora`, { token });
    expect(bitacora.status).toBe(200);
    expect(bitacora.body.eventos.length).toBeGreaterThan(10);
    const historial = await api.get<{ items: Array<{ tipo: string }> }>(request, `/v1/hdu/${h7}/historial`, { token });
    expect(historial.status).toBe(200);
    expect(new Set(historial.body.items.map((i) => i.tipo))).toEqual(new Set(["ESTADO", "ASIGNACION"]));
  });

  test("[E7-B02#2] T07: AUD1 obtiene URL firmada del certificado F7 (PDF) y de una evidencia en archivo", async ({ request }) => {
    const token = await tokenE7("aud1");
    const h = await hduFixture(request);
    const cert = await api.get<{ certificado: { folio: string }; descarga: { url: string; expiraEn: string } }>(request, `/v1/hdu/${h["E7-H7"].id}/certificado`, { token });
    expect(cert.status).toBe(200);
    expect(cert.body.certificado.folio).toMatch(/^Q360-/);
    expect(new Date(cert.body.descarga.expiraEn).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(cert.body.descarga.expiraEn).getTime() - Date.now()).toBeLessThan(60 * 60 * 1000);
    const pdf = await fetch(cert.body.descarga.url);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    const bytes = Buffer.from(await pdf.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    // El fixture de H7 no trae una evidencia en archivo (hallazgo del dictamen): la capacidad se verifica con una HDU propia.
    const equipo = await crearHduAsignadaAAna(request, "E7-EVID");
    const marca = await marcarConArchivo(request, equipo.sesionAna.accessToken, equipo.hdu.id, "PLAN_PRUEBAS");
    expect(marca.status).toBe(200);
    const ev = await api.get<{ url: string; expiraEn: string }>(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/evidencia`, { token });
    expect(ev.status).toBe(200);
    expect(ev.body.url).toContain("/storage/v1/object/sign/");
    const archivo = await fetch(ev.body.url);
    expect(archivo.status).toBe(200);
    expect(Buffer.from(await archivo.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });

  for (const quien of ["aud1"] as ClaveE7[]) {
test(`[E7-B02#3] T08: ${quien.toUpperCase()} recibe 403 ACCESO_DENEGADO en las 13 mutaciones (8 del backlog y 5 más)`, async ({ request }) => {
    const h = await hduFixture(request);
    const celulas = await celulasFixture(request);
    const ana4 = (await api.get<{ items: Array<{ id: string }> }>(request, `/v1/usuarios?q=ana4@quality360.local`, { token: await tokenE7("adm1") })).body.items[0];
    const qe1 = (await api.get<{ items: Array<{ id: string }> }>(request, `/v1/usuarios?q=qe1@quality360.local`, { token: await tokenE7("adm1") })).body.items[0];
    const hoy = Date.now();
    type Mutacion = { nombre: string; metodo: "POST" | "PUT" | "PATCH"; ruta: string; body: unknown };
    const mutaciones: Mutacion[] = [
      { nombre: "crear HDU", metodo: "POST", ruta: "/v1/hdu", body: { codigo: `E7-NO-${hoy}`, titulo: "No debe crearse", celulaId: celulas["CEL-A"].id, sprintId: (await hduFixture(request))["E7-H1"].id, prioridad: "MEDIA" } },
      { nombre: "cambiar estado de H1", metodo: "POST", ruta: `/v1/hdu/${h["E7-H1"].id}/estado`, body: { estado: "PENDIENTE_CIERRE" } },
      { nombre: "reasignar analista de H1", metodo: "PUT", ruta: `/v1/hdu/${h["E7-H1"].id}/analista`, body: { analistaId: ana4.id } },
      { nombre: "marcar entregable de H1", metodo: "POST", ruta: `/v1/hdu/${h["E7-H1"].id}/entregables/EJECUCION/marcar`, body: { evidencia: { tipo: "ENLACE", url: "https://x.quality360.local/no" } } },
      { nombre: "aprobar entregable de H1", metodo: "POST", ruta: `/v1/hdu/${h["E7-H1"].id}/entregables/APROBACION_CASOS/aprobar`, body: {} },
      { nombre: "rechazar entregable de H1", metodo: "POST", ruta: `/v1/hdu/${h["E7-H1"].id}/entregables/APROBACION_CASOS/rechazar`, body: { observacion: "No debe aplicarse" } },
      { nombre: "desmarcar entregable de H1", metodo: "POST", ruta: `/v1/hdu/${h["E7-H1"].id}/entregables/APROBACION_CASOS/desmarcar`, body: {} },
      { nombre: "generar certificado de H6", metodo: "POST", ruta: `/v1/hdu/${h["E7-H6"].id}/certificado`, body: {} },
      { nombre: "crear usuario", metodo: "POST", ruta: "/v1/usuarios", body: { nombre: "No debe crearse", correo: correoUnico("no-crear"), rol: "ANALISTA_QA" } },
      { nombre: "cambiar supervisión", metodo: "PUT", ruta: `/v1/analistas/${ana4.id}/supervisor`, body: { qeId: qe1.id } },
      { nombre: "cambiar rol", metodo: "PUT", ruta: `/v1/usuarios/${ana4.id}/rol`, body: { rol: "AUDITOR" } },
      { nombre: "reasignar QE responsable", metodo: "PUT", ruta: `/v1/hdu/${h["E7-H2"].id}/qe-responsable`, body: { qeResponsableId: qe1.id, motivo: "No debe aplicarse" } },
      { nombre: "desactivar usuario", metodo: "PATCH", ruta: `/v1/usuarios/${ana4.id}`, body: { activo: false } },
    ];
    let combinaciones = 0;
    const token = await tokenE7(quien);
    for (const m of mutaciones) {
      const r = await llamarApi(request, m.metodo, m.ruta, { token, body: m.body });
      expect(r.status, `${quien} · ${m.nombre}`).toBe(403);
      expect(r.body, `${quien} · ${m.nombre}`).toMatchObject({ codigo: "ACCESO_DENEGADO" });
      combinaciones += 1;
    }
    expect(combinaciones).toBe(13);
  });
}

  test("[E7-B02#3] T09: tras los intentos de mutación, H1, H6 y la bitácora no cambian (0 eventos nuevos)", async ({ request }) => {
    const h = await hduFixture(request);
    const token = await tokenE7("aud1");
    const instantanea = async () => {
      const partes: unknown[] = [];
      for (const codigo of ["E7-H1", "E7-H6"] as const) {
        const d = await api.get<{ estado: string; analista: unknown }>(request, `/v1/hdu/${h[codigo].id}`, { token });
        const e = await api.get<{ entregables: Array<{ clave: string; estado: string }> }>(request, `/v1/hdu/${h[codigo].id}/entregables`, { token });
        const b = await api.get<{ eventos: unknown[] }>(request, `/v1/hdu/${h[codigo].id}/entregables/bitacora`, { token });
        partes.push({ estado: d.body.estado, analista: d.body.analista, entregables: e.body.entregables.map((x) => [x.clave, x.estado]), eventos: b.body.eventos.length });
      }
      const global = await api.get<{ total: number }>(request, "/v1/auditor/bitacora?tamanoPagina=1", { token });
      partes.push({ eventosGlobal: global.body.total });
      return JSON.stringify(partes);
    };
    const antes = await instantanea();
    for (const clave of ["aud1"] as ClaveE7[]) {
      const t = await tokenE7(clave);
      await api.post(request, `/v1/hdu/${h["E7-H1"].id}/entregables/APROBACION_CASOS/aprobar`, { token: t, body: {} });
      await api.post(request, `/v1/hdu/${h["E7-H6"].id}/certificado`, { token: t, body: {} });
      await api.post(request, `/v1/hdu/${h["E7-H1"].id}/estado`, { token: t, body: { estado: "PENDIENTE_CIERRE" } });
    }
    expect(await instantanea()).toBe(antes);
  });

  test("[E7-B02#1] contrato: la lista de HDU de AUD1 cumple PaginaHdu", async ({ request }) => {
    for (const clave of ["aud1"] as ClaveE7[]) {
      const r = await api.get(request, "/v1/hdu?tamanoPagina=100", { token: await tokenE7(clave) });
      expect(r.status).toBe(200);
      const c = cumpleContrato("PaginaHdu", r.body);
      expect(c.errores, clave).toEqual([]);
    }
  });
});
