import { expect, test, type APIRequestContext } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conCertificaciones, conOrganizacion } from "../support/db";
import { certificacionesCaida, certificacionesConLimite, type PilaCaida } from "../support/entornoE7";
import { env } from "../support/env";
import { celulasFixture, crearUsuarioE7, desactivarUsuario, hduFixture, tokenE7, type ClaveE7 } from "../support/e7";

interface PaginaBitacora {
  items: Array<{ id: string; hdu: { id: string; codigo: string }; accion: string; clave: string; actor: { nombre: string }; fecha: string; valorAnterior: unknown; valorNuevo: unknown; motivo: string | null }>;
  total: number;
}
interface PaginaCertificados {
  items: Array<{ folio: string; hdu: { codigo: string }; emitidoEn: string; emitidoPor: { nombre: string }; huellaSha256: string; valido: boolean }>;
  total: number;
}
interface PaginaAuditoria {
  items: Array<{ id: string; fecha: string; actor: { id: string; nombre: string; tipo: string }; operacion: string; entidad: string; usuarioAfectado: { id: string; correo: string } | null; antes: unknown; despues: Record<string, unknown> | null; motivo: string | null }>;
  total: number;
}

const CONSULTAS = ["bitacora", "auditoria-usuarios", "certificados"] as const;
const EXPORTACIONES = ["bitacora", "auditoria-usuarios", "certificados", "hdu"] as const;

/** Descarga cruda (bytes), para comprobar el BOM que un `text()` oculta. */
async function descargar(request: APIRequestContext, ruta: string, token: string, baseURL = env.gatewayUrl) {
  const r = await request.fetch(`${baseURL}${ruta}`, { headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false });
  return { status: r.status(), headers: r.headers(), bytes: await r.body() };
}

function analizarCsv(bytes: Buffer) {
  const tieneBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const texto = bytes.subarray(tieneBom ? 3 : 0).toString("utf8");
  const lineas = texto.split(/\r?\n/).filter((l) => l.length > 0);
  return { tieneBom, encabezado: lineas[0]?.split(";") ?? [], filas: lineas.slice(1).map((l) => l.split(";")), texto };
}

test.describe("E7-B04 · Bitácora, auditoría de usuarios, certificados y exportación del Auditor", () => {
  test("[E7-B04#1] T01: AUD1 consulta la bitácora de E7-H2 (incluye el rechazo del entregable 2), más reciente primero", async ({ request }) => {
    const h = await hduFixture(request);
    const r = await api.get<PaginaBitacora>(request, `/v1/auditor/bitacora?hduId=${h["E7-H2"].id}`, { token: await tokenE7("aud1") });
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items.every((e) => e.hdu.id === h["E7-H2"].id)).toBe(true);
    const rechazo = r.body.items.find((e) => e.accion === "RECHAZAR");
    expect(rechazo?.clave).toBe("DASHBOARD");
    expect(JSON.stringify(rechazo)).toContain("Falta evidencia de datos");
    const fechas = r.body.items.map((e) => Date.parse(e.fecha));
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    const total = await conCertificaciones(async (c) => Number((await c.query(`SELECT count(*) n FROM certificaciones.evento_checklist WHERE hdu_id = $1`, [h["E7-H2"].id])).rows[0].n));
    expect(r.body.total).toBe(total);
  });

  test("[E7-B04#1] T01b: la bitácora global sin filtros responde 200 en todas sus páginas", async ({ request }) => {
    const token = await tokenE7("aud1");
    const primera = await api.get<PaginaBitacora>(request, "/v1/auditor/bitacora?tamanoPagina=25", { token });
    expect(primera.status).toBe(200);
    const paginas = Math.ceil(primera.body.total / 25);
    const fallos: string[] = [];
    for (let pagina = 2; pagina <= paginas; pagina += 1) {
      const r = await api.get(request, `/v1/auditor/bitacora?pagina=${pagina}&tamanoPagina=25`, { token });
      if (r.status !== 200) fallos.push(`pagina ${pagina}: ${r.status} ${(r.body as { codigo?: string }).codigo}`);
    }
    expect(fallos, "páginas de la bitácora global que no responden 200").toEqual([]);
  });

  test("[E7-B04#1] T02: bitácora con accion=APROBAR y el rango de fechas del fixture devuelve solo aprobaciones dentro del rango", async ({ request }) => {
    const token = await tokenE7("aud1");
    const h = await hduFixture(request);
    const primera = await api.get<PaginaBitacora>(request, `/v1/auditor/bitacora?hduId=${h["E7-H1"].id}&tamanoPagina=100`, { token });
    const desde = primera.body.items.map((e) => e.fecha).sort()[0];
    const hasta = new Date(Date.now() + 60_000).toISOString();
    const r = await api.get<PaginaBitacora>(request, `/v1/auditor/bitacora?accion=APROBAR&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&tamanoPagina=100`, { token });
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    for (const e of r.body.items) {
      expect(e.accion).toBe("APROBAR");
      expect(Date.parse(e.fecha)).toBeGreaterThanOrEqual(Date.parse(desde));
      expect(Date.parse(e.fecha)).toBeLessThanOrEqual(Date.parse(hasta));
    }
    const esperado = await conCertificaciones(async (c) =>
      Number((await c.query(`SELECT count(*) n FROM certificaciones.evento_checklist WHERE accion = 'APROBAR' AND fecha BETWEEN $1 AND $2`, [desde, hasta])).rows[0].n),
    );
    expect(r.body.total).toBe(esperado);
    // Un rango que termina antes del primer evento no devuelve nada.
    const antes = await api.get<PaginaBitacora>(request, `/v1/auditor/bitacora?accion=APROBAR&hasta=${encodeURIComponent("2000-01-01T00:00:00Z")}`, { token });
    expect(antes.status).toBe(200);
    expect(antes.body.total).toBe(0);
  });

  test("[E7-B04#1] T03: AUD1 consulta los certificados con folio, HDU, fecha, QE emisor, huella y validez (F7 y F8)", async ({ request }) => {
    const r = await api.get<PaginaCertificados>(request, "/v1/auditor/certificados?tamanoPagina=100", { token: await tokenE7("aud1") });
    expect(r.status).toBe(200);
    const porHdu = Object.fromEntries(r.body.items.map((c) => [c.hdu.codigo, c]));
    for (const codigo of ["E7-H7", "E7-H8"]) {
      const c = porHdu[codigo];
      expect(c, codigo).toBeDefined();
      expect(c.folio).toMatch(/^Q360-\d{4}-[A-Z0-9]+$/);
      expect(c.huellaSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(c.valido).toBe(true);
      expect(c.emitidoPor.nombre).toBeTruthy();
      expect(Date.parse(c.emitidoEn)).not.toBeNaN();
    }
    const total = await conCertificaciones(async (c) => Number((await c.query(`SELECT count(*) n FROM certificaciones.certificado`)).rows[0].n));
    expect(r.body.total).toBe(total);
    const fechas = r.body.items.map((c) => Date.parse(c.emitidoEn));
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
  });

  test("[E7-B04#1] T04: la auditoría de usuarios con operacion=CAMBIAR_ROL trae solo cambios de rol, con antes y después", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const nuevo = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "cambio-rol-b04" });
    const cambio = await api.put(request, `/v1/usuarios/${nuevo.id}/rol`, { token: adm, body: { rol: "QE" } });
    expect(cambio.status).toBe(200);
    try {
      const r = await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?operacion=CAMBIAR_ROL&tamanoPagina=100", { token: await tokenE7("aud1") });
      expect(r.status).toBe(200);
      expect(r.body.items.length).toBeGreaterThan(0);
      for (const e of r.body.items) {
        expect(e.operacion).toBe("CAMBIAR_ROL");
        expect(e.antes).toBeTruthy();
        expect(e.despues).toBeTruthy();
      }
      const mio = r.body.items.find((e) => e.usuarioAfectado?.id === nuevo.id);
      expect(mio?.antes).toMatchObject({ rol: "ANALISTA_QA" });
      expect(mio?.despues).toMatchObject({ rol: "QE" });
      expect(mio?.actor.nombre).toContain("ADM1");
      const sinFiltro = await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?tamanoPagina=100", { token: await tokenE7("aud1") });
      expect(new Set(sinFiltro.body.items.map((e) => e.operacion)).size).toBeGreaterThan(1);
    } finally {
      await desactivarUsuario(request, adm, nuevo.id);
    }
  });

  test("[E7-B04#1] T05: un filtro sin coincidencias devuelve 200 con lista vacía y total 0", async ({ request }) => {
    const h = await hduFixture(request);
    const token = await tokenE7("aud1");
    const bitacora = await api.get<PaginaBitacora>(request, `/v1/auditor/bitacora?hduId=${h["E7-H3"].id}`, { token });
    expect(bitacora.status).toBe(200);
    expect(bitacora.body).toMatchObject({ items: [], total: 0 });
    const aud = await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?usuarioAfectadoId=00000000-0000-4000-8000-000000000001", { token });
    expect(aud.status).toBe(200);
    expect(aud.body).toMatchObject({ items: [], total: 0 });
    const cert = await api.get<PaginaCertificados>(request, `/v1/auditor/certificados?hasta=${encodeURIComponent("2000-01-01T00:00:00Z")}`, { token });
    expect(cert.status).toBe(200);
    expect(cert.body).toMatchObject({ items: [], total: 0 });
  });

  test("[E7-B04#2] T06: la auditoría de usuarios nunca contiene password, token ni secret (todas las páginas)", async ({ request }) => {
    const token = await tokenE7("aud1");
    let pagina = 1;
    let vistas = 0;
    for (;;) {
      const r = await api.get<PaginaAuditoria>(request, `/v1/auditor/auditoria-usuarios?pagina=${pagina}&tamanoPagina=100`, { token });
      expect(r.status).toBe(200);
      const texto = JSON.stringify(r.body).toLowerCase();
      for (const prohibido of ["password", "contrasena", "token", "secret"]) expect(texto, `página ${pagina} contiene ${prohibido}`).not.toContain(prohibido);
      vistas += r.body.items.length;
      if (vistas >= r.body.total || r.body.items.length === 0) break;
      pagina += 1;
    }
    expect(vistas).toBeGreaterThan(0);
  });

  test("[E7-B04#2] T07: ADM1, QE1, ANA1 y LID1 reciben 403 ACCESO_DENEGADO en las 3 consultas y las 4 exportaciones (28 intentos)", async ({ request }) => {
    let intentos = 0;
    for (const clave of ["adm1", "qe1", "ana1", "lid1"] as ClaveE7[]) {
      const token = await tokenE7(clave);
      for (const recurso of CONSULTAS) {
        const r = await api.get(request, `/v1/auditor/${recurso}`, { token });
        expect(r.status, `${clave} consulta ${recurso}`).toBe(403);
        expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
        intentos += 1;
      }
      for (const recurso of EXPORTACIONES) {
        const r = await api.get(request, `/v1/auditor/exportaciones/${recurso}`, { token });
        expect(r.status, `${clave} exporta ${recurso}`).toBe(403);
        expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
        intentos += 1;
      }
    }
    expect(intentos).toBe(28);
  });

  test("[E7-B04#2] T08: sin token (o con token inválido) los 7 endpoints responden 401 NO_AUTENTICADO", async ({ request }) => {
    for (const ruta of [...CONSULTAS.map((c) => `/v1/auditor/${c}`), ...EXPORTACIONES.map((c) => `/v1/auditor/exportaciones/${c}`)]) {
      const r = await api.get(request, ruta);
      expect(r.status, ruta).toBe(401);
      expect(r.body).toMatchObject({ codigo: "NO_AUTENTICADO" });
    }
    expect((await api.get(request, "/v1/auditor/bitacora", { token: "token.invalido.xyz" })).status).toBe(401);
  });

  test("[E7-B04#3] T09: AUD1 exporta HDU con celulaId=CEL-A en CSV con BOM, separador ; y fechas ISO", async ({ request }) => {
    const celulas = await celulasFixture(request);
    const d = await descargar(request, `/v1/auditor/exportaciones/hdu?celulaId=${celulas["CEL-A"].id}`, await tokenE7("aud1"));
    expect(d.status).toBe(200);
    expect(d.headers["content-type"]).toContain("text/csv");
    expect(d.headers["content-disposition"]).toMatch(/quality360-hdu-\d{4}-\d{2}-\d{2}\.csv/);
    const csv = analizarCsv(d.bytes);
    expect(csv.tieneBom).toBe(true);
    expect(csv.encabezado).toEqual(["Código", "Título", "Célula", "Sprint", "Estado", "QE", "Analista", "Avance", "Certificado", "Actualizada"]);
    // El subconjunto del fixture en CEL-A: exactamente E7-H1, H2, H5 y H7 (4 filas de datos del backlog).
    expect(csv.filas.map((f) => f[0]).filter((c) => c.startsWith("E7-H")).sort()).toEqual(["E7-H1", "E7-H2", "E7-H5", "E7-H7"]);
    for (const fila of csv.filas) {
      expect(fila, fila.join(";")).toHaveLength(10);
      expect(fila[2]).toBe("CEL-A");
      expect(fila[9]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    }
    const enBd = await conOrganizacion(async (c) =>
      Number((await c.query(`SELECT count(*) n FROM organizacion.historia_usuario h JOIN organizacion.celula c ON c.id_celula = h.id_celula WHERE c.nombre = 'CEL-A'`)).rows[0].n),
    );
    expect(csv.filas).toHaveLength(enBd);
    expect(Number(d.headers["x-q360-filas"])).toBe(enBd);
  });

  test("[E7-B04#3] T09b: las 4 exportaciones traen BOM, separador ; y un encabezado propio", async ({ request }) => {
    const token = await tokenE7("aud1");
    const esperado = { bitacora: "Fecha", "auditoria-usuarios": "Fecha", certificados: "Folio", hdu: "Código" } as const;
    const h = await hduFixture(request);
    for (const recurso of EXPORTACIONES) {
      // La bitácora se acota a una HDU del fixture: sin filtro, la base compartida tiene eventos de HDU que Organización
      // no conoce y la consulta global responde 403 (defecto DEF-E7-02, ver [E7-B04#1] T01b).
      const filtro = recurso === "bitacora" ? `?hduId=${h["E7-H2"].id}` : "";
      const d = await descargar(request, `/v1/auditor/exportaciones/${recurso}${filtro}`, token);
      expect(d.status, recurso).toBe(200);
      const csv = analizarCsv(d.bytes);
      expect(csv.tieneBom, `${recurso} BOM`).toBe(true);
      expect(csv.encabezado.length, recurso).toBeGreaterThan(3);
      expect(csv.encabezado[0], recurso).toBe(esperado[recurso]);
      expect(csv.texto.toLowerCase()).not.toMatch(/password|secret/);
    }
  });

  test("[E7-B04#3] T10: la exportación queda registrada en la auditoría con AUD1 como actor, recurso, filtros y filas", async ({ request }) => {
    const token = await tokenE7("aud1");
    const celulas = await celulasFixture(request);
    const d = await descargar(request, `/v1/auditor/exportaciones/hdu?celulaId=${celulas["CEL-A"].id}`, token);
    const filas = analizarCsv(d.bytes).filas.length;
    const r = await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=5", { token });
    expect(r.status).toBe(200);
    const ultima = r.body.items[0];
    expect(ultima.operacion).toBe("EXPORTAR");
    expect(ultima.actor.nombre).toContain("AUD1");
    expect(ultima.despues).toMatchObject({ recurso: "HDU", filas, filtros: { celulaId: celulas["CEL-A"].id } });
    expect(Date.now() - Date.parse(ultima.fecha)).toBeLessThan(60_000);
    const cuenta = (await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=1", { token })).body.total;
    await descargar(request, "/v1/auditor/exportaciones/certificados", token);
    const despues = await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=1", { token });
    expect(despues.body.total).toBe(cuenta + 1);
    expect(despues.body.items[0].despues).toMatchObject({ recurso: "CERTIFICADOS" });
  });

  test.describe("con el límite de exportación reducido a 2 filas", () => {
    let pila: PilaCaida;
    test.beforeAll(async () => {
      pila = await certificacionesConLimite(2);
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E7-B04#3] T11: exportar la bitácora con más de 2 filas responde 422 EXPORTACION_EXCEDE_LIMITE y no entrega archivo", async ({ request }) => {
      const token = await tokenE7("aud1");
      const antes = (await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=1", { token })).body.total;
      const r = await api.get<{ codigo: string; mensaje: string }>(request, "/v1/auditor/exportaciones/bitacora", { token, baseURL: pila.gatewayUrl });
      expect(r.status).toBe(422);
      expect(r.body.codigo).toBe("EXPORTACION_EXCEDE_LIMITE");
      expect(r.body.mensaje).toMatch(/Acota los filtros/);
      // Con un filtro que cabe en el límite (H2 tiene más de 2 eventos; H3 ninguno) sí se entrega.
      const h = await hduFixture(request);
      const cabe = await descargar(request, `/v1/auditor/exportaciones/bitacora?hduId=${h["E7-H3"].id}`, token, pila.gatewayUrl);
      expect(cabe.status).toBe(200);
      const despues = (await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?operacion=EXPORTAR&tamanoPagina=1", { token })).body.total;
      // La exportación rechazada no se registra; la que sí se entregó, sí.
      expect(despues).toBe(antes + 1);
    });
  });

  test.describe("con Certificaciones detenida", () => {
    let pila: PilaCaida;
    test.beforeAll(async () => {
      pila = await certificacionesCaida();
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E7-B04#1] T12: la bitácora y los certificados responden 503 SERVICIO_NO_DISPONIBLE y la auditoría de usuarios sigue en 200", async ({ request }) => {
      const token = await tokenE7("aud1");
      const bitacora = await api.get<{ codigo: string }>(request, "/v1/auditor/bitacora", { token, baseURL: pila.gatewayUrl });
      expect(bitacora.status).toBe(503);
      expect(bitacora.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
      const certificados = await api.get<{ codigo: string }>(request, "/v1/auditor/certificados", { token, baseURL: pila.gatewayUrl });
      expect(certificados.status).toBe(503);
      expect(certificados.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
      const auditoria = await api.get<PaginaAuditoria>(request, "/v1/auditor/auditoria-usuarios?tamanoPagina=5", { token, baseURL: pila.gatewayUrl });
      expect(auditoria.status).toBe(200);
      expect(auditoria.body.items.length).toBeGreaterThan(0);
      // Exportar HDU exige Certificaciones (D48): sin ella, 503 y no se entrega un CSV parcial.
      const exportaHdu = await api.get<{ codigo: string }>(request, "/v1/auditor/exportaciones/hdu", { token, baseURL: pila.gatewayUrl });
      expect(exportaHdu.status).toBe(503);
      expect(exportaHdu.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
    });
  });

  test("[E7-B04#1] contrato: bitácora, certificados y auditoría de usuarios cumplen contracts/comun.v1.yaml", async ({ request }) => {
    const token = await tokenE7("aud1");
    const casos = [
      ["bitacora", "PaginaBitacoraGlobal"],
      ["certificados", "PaginaCertificadosAuditoria"],
      ["auditoria-usuarios", "PaginaAuditoriaUsuarios"],
    ] as const;
    for (const [recurso, esquema] of casos) {
      const r = await api.get(request, `/v1/auditor/${recurso}?tamanoPagina=25`, { token });
      expect(r.status, recurso).toBe(200);
      expect(cumpleContrato(esquema, r.body).errores, esquema).toEqual([]);
    }
  });
});
