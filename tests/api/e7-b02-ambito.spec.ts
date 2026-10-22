import { expect, test } from "@playwright/test";
import { api, llamarApi } from "../support/api";
import { crearHduAsignadaAAna } from "../support/checklist";
import { cumpleContrato } from "../support/contrato";
import { conOrganizacion } from "../support/db";
import {
  celulasFixture,
  cuerpoSinTrace,
  crearUsuarioE7,
  desactivarUsuario,
  hduFixture,
  listarHduE7,
  marcarConArchivo,
  sesionDe,
  tokenE7,
  type ClaveE7,
} from "../support/e7";
import { correoUnico } from "../support/unique";

interface PaginaHdu {
  items: Array<{ id: string; codigo: string; celula: { nombre: string }; estado: string }>;
  total: number;
}

test.describe("E7-B02 · Ámbito de lectura y solo lectura de Líder y Auditor", () => {
  test("[E7-B02#1] T01: LID1 lista solo las HDU de sus células vigentes (E7-H1, H2, H3, H5, H6, H7; sin H4 ni H8)", async ({ request }) => {
    const items = (await listarHduE7(request, await tokenE7("lid1"))).filter((h) => h.codigo.startsWith("E7-H"));
    expect(items.map((h) => h.codigo).sort()).toEqual(["E7-H1", "E7-H2", "E7-H3", "E7-H5", "E7-H6", "E7-H7"]);
    // Sin filtro: ninguna HDU fuera de CEL-A y CEL-B (también con las HDU ajenas al fixture que hay en la base).
    const todas = await api.get<PaginaHdu>(request, "/v1/hdu?tamanoPagina=100", { token: await tokenE7("lid1") });
    expect(todas.status).toBe(200);
    // Ninguna HDU fuera de CEL-A y CEL-B (la primera página puede traer solo una de las dos: hay más de 100 HDU en CEL-A).
    for (const h of todas.body.items) expect(["CEL-A", "CEL-B"], `HDU ${h.codigo} en ${h.celula.nombre}`).toContain(h.celula.nombre);
    const total = await conOrganizacion(async (c) =>
      Number((await c.query(`SELECT count(*) n FROM organizacion.historia_usuario h JOIN organizacion.celula c ON c.id_celula = h.id_celula WHERE c.nombre IN ('CEL-A','CEL-B')`)).rows[0].n),
    );
    expect(todas.body.total).toBe(total);
  });

  test("[E7-B02#1] T02: LID1 recibe 403 ACCESO_DENEGADO genérico en todos los recursos de H4 y del certificado de H8", async ({ request }) => {
    const h = await hduFixture(request);
    const token = await tokenE7("lid1");
    const recursos = [
      `/v1/hdu/${h["E7-H4"].id}`,
      `/v1/hdu/${h["E7-H4"].id}/entregables`,
      `/v1/hdu/${h["E7-H4"].id}/entregables/bitacora`,
      `/v1/hdu/${h["E7-H4"].id}/historial`,
      `/v1/hdu/${h["E7-H4"].id}/entregables/PLAN_PRUEBAS/evidencia`,
      `/v1/hdu/${h["E7-H8"].id}/certificado`,
    ];
    const cuerpos = new Set<string>();
    for (const ruta of recursos) {
      const r = await api.get(request, ruta, { token });
      expect(r.status, ruta).toBe(403);
      expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
      expect(JSON.stringify(r.body)).not.toContain("E7-H");
      cuerpos.add(cuerpoSinTrace(r));
    }
    // No revela si existe: un id inexistente da exactamente la misma respuesta al Líder (D50).
    const inexistente = await api.get(request, "/v1/hdu/00000000-0000-4000-8000-000000000001", { token });
    expect(inexistente.status).toBe(403);
    cuerpos.add(cuerpoSinTrace(inexistente));
    expect(cuerpos.size).toBe(1);
  });

  test("[E7-B02#1] T03: LID2 (sin células) recibe 200 con lista vacía, no un error", async ({ request }) => {
    const r = await api.get<PaginaHdu>(request, "/v1/hdu", { token: await tokenE7("lid2") });
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
    expect(r.body.total).toBe(0);
  });

  test("[E7-B02#1] T04: LID1 pide celulaId de CEL-C (fuera de su ámbito) y recibe 403", async ({ request }) => {
    const celulas = await celulasFixture(request);
    const r = await api.get(request, `/v1/hdu?celulaId=${celulas["CEL-C"].id}`, { token: await tokenE7("lid1") });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
    const propia = (await listarHduE7(request, await tokenE7("lid1"), `celulaId=${celulas["CEL-A"].id}`)).filter((h) => h.codigo.startsWith("E7-H"));
    expect(propia.map((h) => h.codigo).sort()).toEqual(["E7-H1", "E7-H2", "E7-H5", "E7-H7"]);
  });

  test("[E7-B02#1] T05: al quitar una célula al Líder, su detalle pasa de 200 a 403 en la siguiente consulta", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const h = await hduFixture(request);
    const celulas = await celulasFixture(request);
    // Líder propio de la prueba con CEL-B (no se toca a LID1).
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "lider-quitar", celulaIds: [celulas["CEL-B"].id], conContrasena: true });
    try {
      const token = (await sesionDe(lider.correo)).accessToken;
      const antes = await api.get(request, `/v1/hdu/${h["E7-H3"].id}`, { token });
      expect(antes.status).toBe(200);
      const quita = await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [] } });
      expect(quita.status).toBe(200);
      const despues = await api.get(request, `/v1/hdu/${h["E7-H3"].id}`, { token });
      expect(despues.status).toBe(403);
      expect(despues.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
      const lista = await api.get<PaginaHdu>(request, "/v1/hdu", { token });
      expect(lista.body.items).toEqual([]);
    } finally {
      await desactivarUsuario(request, adm, lider.id);
    }
  });

  test("[E7-B02#2] T06: AUD1 lista todas las HDU y el detalle de H7 trae checklist, bitácora e historiales", async ({ request }) => {
    const token = await tokenE7("aud1");
    const h = await hduFixture(request);
    const r = await api.get<PaginaHdu>(request, "/v1/hdu?tamanoPagina=100", { token });
    expect(r.status).toBe(200);
    const total = await conOrganizacion(async (c) => Number((await c.query(`SELECT count(*) n FROM organizacion.historia_usuario`)).rows[0].n));
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

  for (const quien of ["aud1", "lid1"] as ClaveE7[]) {
test(`[E7-B02#3] T08: ${quien.toUpperCase()} recibe 403 ACCESO_DENEGADO en las 14 mutaciones (8 del backlog y 6 más)`, async ({ request }) => {
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
      { nombre: "asignar células", metodo: "PUT", ruta: `/v1/usuarios/${ana4.id}/celulas-lider`, body: { celulaIds: [celulas["CEL-A"].id] } },
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
    expect(combinaciones).toBe(14);
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
    for (const clave of ["aud1", "lid1"] as ClaveE7[]) {
      const t = await tokenE7(clave);
      await api.post(request, `/v1/hdu/${h["E7-H1"].id}/entregables/APROBACION_CASOS/aprobar`, { token: t, body: {} });
      await api.post(request, `/v1/hdu/${h["E7-H6"].id}/certificado`, { token: t, body: {} });
      await api.post(request, `/v1/hdu/${h["E7-H1"].id}/estado`, { token: t, body: { estado: "PENDIENTE_CIERRE" } });
    }
    expect(await instantanea()).toBe(antes);
  });

  test("[E7-B02#1] contrato: las listas de HDU de LID1 y AUD1 cumplen PaginaHdu", async ({ request }) => {
    for (const clave of ["lid1", "aud1"] as ClaveE7[]) {
      const r = await api.get(request, "/v1/hdu?tamanoPagina=100", { token: await tokenE7(clave) });
      expect(r.status).toBe(200);
      const c = cumpleContrato("PaginaHdu", r.body);
      expect(c.errores, clave).toEqual([]);
    }
  });
});
