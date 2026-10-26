import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conCertificaciones, conImpedimentos } from "../support/db";
import { cuerpoSinTrace, tokenE7 } from "../support/e7";
import { contarDb, evaluar, hdu, imps, reiniciarFixtureE4, texto, uid, type ImpedimentoApi } from "../support/e4";

/**
 * E4-B01 · Registro de impedimentos como entidad vinculada a la HDU (3 escenarios, T01..T10).
 * Fixture E7 + E4 recargado antes del archivo; los casos corren en orden y comparten el estado que dejan.
 */
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await reiniciarFixtureE4();
});

const filasHdu = (hduId: string) => contarDb("SELECT count(*) n FROM impedimentos.impedimento WHERE id_historia = $1", [hduId]);

let nuevoH5: ImpedimentoApi;
let nuevoH1: ImpedimentoApi;

test.describe("E4-B01 · Registro de impedimentos", () => {
  test("[E4-B01#1] T01: QE1 registra RECURSOS en H5 (sin ciclo): 201, ABIERTO, certificacionId null, creadoPor QE1/QE, 0 días, abiertoDesde = fechaRegistro", async ({ request }) => {
    const h = await hdu(request);
    const qe1 = await uid(request, "qe1");
    const r = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H5.id}/impedimentos`, {
      token: await tokenE7("qe1"),
      body: { tipo: "RECURSOS", titulo: "Falta personal de pruebas", descripcion: texto(30, "descripcion "), responsableId: qe1 },
    });
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe("ABIERTO");
    expect(r.body.certificacionId).toBeNull();
    expect(r.body.creadoPor).toMatchObject({ id: qe1, rol: "QE" });
    expect(r.body.diasAbierto).toBe(0);
    expect(r.body.abiertoDesde).toBe(r.body.fechaRegistro);
    expect(r.body.hduId).toBe(h.H5.id);
    expect(r.body.responsable).toMatchObject({ id: qe1, externo: false });
    const c = cumpleContrato("ImpedimentoDetalle", r.body);
    expect(c.errores, "ImpedimentoDetalle del 201 (contrato)").toEqual([]);
    nuevoH5 = r.body;
    // No se creó ningún ciclo de certificación como efecto del impedimento (D58).
    const ciclos = await conCertificaciones(async (c2) => Number((await c2.query("SELECT count(*) n FROM certificaciones.certificacion WHERE id_historia = $1", [h.H5.id])).rows[0].n));
    expect(ciclos).toBe(0);
  });

  test("[E4-B01#1] T02: ANA1 registra AMBIENTE en H1 con responsable externo: certificacionId = ciclo activo de H1, creadoPor ANA1/ANALISTA_QA", async ({ request }) => {
    const h = await hdu(request);
    const ana1 = await uid(request, "ana1");
    const r = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H1.id}/impedimentos`, {
      token: await tokenE7("ana1"),
      body: { tipo: "AMBIENTE", titulo: "Ambiente de integración caído", descripcion: texto(30, "descripcion "), responsableNombre: "Equipo de Infraestructura" },
    });
    expect(r.status).toBe(201);
    const cicloActivo = await conCertificaciones(async (c) =>
      (await c.query("SELECT id_certificacion FROM certificaciones.certificacion WHERE id_historia = $1 AND activo", [h.H1.id])).rows.map((f) => f.id_certificacion as string),
    );
    expect(cicloActivo).toHaveLength(1);
    expect(r.body.certificacionId).toBe(cicloActivo[0]);
    expect(r.body.responsable).toEqual({ id: null, nombre: "Equipo de Infraestructura", externo: true });
    expect(r.body.creadoPor).toMatchObject({ id: ana1, rol: "ANALISTA_QA" });
    expect(cumpleContrato("ImpedimentoDetalle", r.body).errores).toEqual([]);
    nuevoH1 = r.body;
  });

  test("[E4-B01#1] T03: el detalle del impedimento recién creado trae una acción REGISTRAR con estadoAnterior null, estado ABIERTO, actor ANA1 y fecha", async ({ request }) => {
    const ana1 = await uid(request, "ana1");
    const r = await api.get<ImpedimentoApi>(request, `/v1/impedimentos/${nuevoH1.id}`, { token: await tokenE7("ana1") });
    expect(r.status).toBe(200);
    expect(cumpleContrato("ImpedimentoDetalle", r.body).errores).toEqual([]);
    expect(r.body.acciones).toHaveLength(1);
    const a = r.body.acciones![0];
    expect(a).toMatchObject({ tipo: "REGISTRAR", estadoAnterior: null, estado: "ABIERTO" });
    expect(a.actor).toMatchObject({ id: ana1, rol: "ANALISTA_QA" });
    expect(Date.parse(a.fecha)).not.toBeNaN();
    expect(a.comentario).toMatch(/^Registro del impedimento/);
  });

  test("[E4-B01#2] T04: la evaluación interna y el listado de H5 informan bloqueada true y abiertos 1; H4 (sin impedimentos) bloqueada false y abiertos 0", async ({ request }) => {
    const h = await hdu(request);
    const tokenQe1 = await tokenE7("qe1");
    const ev = await evaluar(tokenQe1, [
      { hduId: h.H5.id, estado: h.H5.estado },
    ]);
    expect(ev.status).toBe(200);
    expect(ev.body.items[0]).toMatchObject({ hduId: h.H5.id, bloqueada: true, abiertos: 1 });
    expect(cumpleContrato("ResultadoEvaluacionImpedimentos", ev.body).errores).toEqual([]);
    const lista = await api.get<{ bloqueada: boolean; abiertos: number; items: unknown[] }>(request, `/v1/hdu/${h.H5.id}/impedimentos`, { token: tokenQe1 });
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ bloqueada: true, abiertos: 1 });
    expect(cumpleContrato("ImpedimentosHdu", lista.body).errores).toEqual([]);

    // H4 es de QE2: se evalúa con su token.
    const tokenQe2 = await tokenE7("qe2");
    const ev4 = await evaluar(tokenQe2, [{ hduId: h.H4.id, estado: h.H4.estado }]);
    expect(ev4.body.items[0]).toMatchObject({ bloqueada: false, abiertos: 0 });
    const l4 = await api.get<{ bloqueada: boolean; abiertos: number }>(request, `/v1/hdu/${h.H4.id}/impedimentos`, { token: tokenQe2 });
    expect(l4.body).toMatchObject({ bloqueada: false, abiertos: 0 });
  });

  test("[E4-B01#1] T05 (negativo): ANA3 en H4 con título/descripción faltantes o fuera de largo, tipo INVENTADO o sin responsable: 400 VALIDACION con su campo y sin filas", async ({ request }) => {
    const h = await hdu(request);
    const token = await tokenE7("ana3");
    const qe2 = await uid(request, "qe2");
    const base = { tipo: "ACCESO", titulo: "VPN sin permisos", descripcion: texto(30, "descripcion "), responsableId: qe2 };
    const antes = await filasHdu(h.H4.id);
    const casos: Array<{ nombre: string; cuerpo: Record<string, unknown>; campo: string; codigo?: string }> = [
      { nombre: "sin título", cuerpo: { ...base, titulo: undefined }, campo: "titulo" },
      { nombre: "sin descripción", cuerpo: { ...base, descripcion: undefined }, campo: "descripcion" },
      { nombre: "descripción de 9", cuerpo: { ...base, descripcion: texto(9) }, campo: "descripcion" },
      { nombre: "descripción de 1.001", cuerpo: { ...base, descripcion: texto(1001) }, campo: "descripcion" },
      { nombre: "tipo INVENTADO", cuerpo: { ...base, tipo: "INVENTADO" }, campo: "tipo", codigo: "VALOR_NO_PERMITIDO" },
      { nombre: "sin responsableId ni nombre", cuerpo: { ...base, responsableId: undefined }, campo: "responsableNombre" },
      { nombre: "OTRO con descripción de 15", cuerpo: { ...base, tipo: "OTRO", descripcion: texto(15) }, campo: "descripcion" },
    ];
    for (const caso of casos) {
      const r = await api.post<{ codigo: string; detalles: Array<{ campo: string; codigo: string }> }>(request, `/v1/hdu/${h.H4.id}/impedimentos`, { token, body: caso.cuerpo });
      expect(r.status, caso.nombre).toBe(400);
      expect(r.body.codigo, caso.nombre).toBe("VALIDACION");
      const d = r.body.detalles.find((x) => x.campo === caso.campo);
      expect(d, `${caso.nombre}: detalle del campo ${caso.campo} en ${JSON.stringify(r.body.detalles)}`).toBeDefined();
      if (caso.codigo) expect(d!.codigo).toBe(caso.codigo);
      expect(cumpleContrato("Error", r.body).errores, caso.nombre).toEqual([]);
    }
    expect(await filasHdu(h.H4.id)).toBe(antes);
  });

  test("[E4-B01#1] T06 (negativo): responsableId de otro analista o inexistente: 422 RESPONSABLE_INVALIDO; responsableNombre de 2 caracteres: 400; sin filas", async ({ request }) => {
    const h = await hdu(request);
    const token = await tokenE7("ana3");
    const ana1 = await uid(request, "ana1");
    const base = { tipo: "ACCESO", titulo: "VPN sin permisos", descripcion: texto(30, "descripcion ") };
    const antes = await filasHdu(h.H4.id);
    for (const responsableId of [ana1, "00000000-0000-4000-8000-000000000999"]) {
      const r = await api.post<{ codigo: string }>(request, `/v1/hdu/${h.H4.id}/impedimentos`, { token, body: { ...base, responsableId } });
      expect(r.status).toBe(422);
      expect(r.body.codigo).toBe("RESPONSABLE_INVALIDO");
    }
    const corto = await api.post<{ codigo: string; detalles: Array<{ campo: string }> }>(request, `/v1/hdu/${h.H4.id}/impedimentos`, { token, body: { ...base, responsableNombre: "ab" } });
    expect(corto.status).toBe(400);
    expect(corto.body.detalles.map((d) => d.campo)).toContain("responsableNombre");
    // D92: ambos a la vez → 400.
    const ambos = await api.post(request, `/v1/hdu/${h.H4.id}/impedimentos`, { token, body: { ...base, responsableId: await uid(request, "qe2"), responsableNombre: "Equipo externo" } });
    expect(ambos.status).toBe(400);
    expect(await filasHdu(h.H4.id)).toBe(antes);
  });

  test("[E4-B01#3] T07 (negativo): ANA1 en H3 (de ANA3), ANA3 en H5 y ANA4 en H1: 403 ACCESO_DENEGADO con cuerpo idéntico y sin filas", async ({ request }) => {
    const h = await hdu(request);
    const body = { tipo: "ACCESO", titulo: "Intento sin permiso", descripcion: texto(30, "descripcion "), responsableNombre: "Equipo externo" };
    const casos = [
      { clave: "ana1", hdu: h.H3 },
      { clave: "ana3", hdu: h.H5 },
      { clave: "ana4", hdu: h.H1 },
    ] as const;
    const antes = await Promise.all(casos.map((c) => filasHdu(c.hdu.id)));
    const respuestas = [];
    for (const c of casos) {
      const r = await api.post<{ codigo: string }>(request, `/v1/hdu/${c.hdu.id}/impedimentos`, { token: await tokenE7(c.clave), body });
      expect(r.status, `${c.clave} en ${c.hdu.codigo}`).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
      respuestas.push(cuerpoSinTrace(r));
    }
    expect(new Set(respuestas).size, "los tres 403 deben ser idénticos").toBe(1);
    const despues = await Promise.all(casos.map((c) => filasHdu(c.hdu.id)));
    expect(despues).toEqual(antes);
  });

  test("[E4-B01#3] T08 (negativo): QE2, LID1, AUD1 y ADM1 en H1: 403; sin token: 401 NO_AUTENTICADO; H1 conserva solo I2 y el creado por T02", async ({ request }) => {
    const h = await hdu(request);
    const body = { tipo: "ACCESO", titulo: "Intento sin permiso", descripcion: texto(30, "descripcion "), responsableNombre: "Equipo externo" };
    const antes = await filasHdu(h.H1.id);
    for (const clave of ["qe2", "lid1", "aud1", "adm1"] as const) {
      const r = await api.post<{ codigo: string }>(request, `/v1/hdu/${h.H1.id}/impedimentos`, { token: await tokenE7(clave), body });
      expect(r.status, clave).toBe(403);
      expect(r.body.codigo).toBe("ACCESO_DENEGADO");
    }
    const sin = await api.post<{ codigo: string }>(request, `/v1/hdu/${h.H1.id}/impedimentos`, { body });
    expect(sin.status).toBe(401);
    expect(sin.body.codigo).toBe("NO_AUTENTICADO");
    expect(await filasHdu(h.H1.id)).toBe(antes);
    expect(antes).toBe(2); // I2 y el registrado en T02
  });

  test("[E4-B01#3] T09 (negativo): ANA3 en H7 (CERRADA): 409 HDU_CERRADA; id de HDU inexistente: 403; sin filas", async ({ request }) => {
    const h = await hdu(request);
    const token = await tokenE7("ana3");
    const body = { tipo: "ACCESO", titulo: "Intento sobre cerrada", descripcion: texto(30, "descripcion "), responsableNombre: "Equipo externo" };
    const antes = await filasHdu(h.H7.id);
    const cerrada = await api.post<{ codigo: string }>(request, `/v1/hdu/${h.H7.id}/impedimentos`, { token, body });
    expect(cerrada.status).toBe(409);
    expect(cerrada.body.codigo).toBe("HDU_CERRADA");
    const inexistente = await api.post<{ codigo: string }>(request, "/v1/hdu/00000000-0000-4000-8000-0000000000aa/impedimentos", { token, body });
    expect(inexistente.status).toBe(403);
    expect(inexistente.body.codigo).toBe("ACCESO_DENEGADO");
    expect(await filasHdu(h.H7.id)).toBe(antes);
  });

  test("[E4-B01#1] T10: svc_impedimentos no tiene llaves foráneas hacia otros esquemas; un tipo fuera del catálogo y un RESUELTO sin fecha_resolucion fallan por CHECK", async ({ request }) => {
    const h = await hdu(request);
    await conImpedimentos(async (c) => {
      const fk = await c.query(
        `SELECT conrelid::regclass::text AS tabla, confrelid::regclass::text AS destino
           FROM pg_constraint WHERE contype = 'f' AND connamespace = 'impedimentos'::regnamespace`,
      );
      for (const f of fk.rows) expect(f.destino, `FK ${f.tabla} -> ${f.destino}`).toMatch(/^(impedimentos\.)?(impedimento|accion_impedimento)$/);
      const insertar = (tipo: string, estado: string, fechaResolucion: string | null) =>
        c.query(
          `INSERT INTO impedimentos.impedimento (id_impedimento, titulo, descripcion, tipo, estado, fecha_resolucion, id_historia, responsable_nombre, creado_por_id, creado_por_nombre, creado_por_rol)
           VALUES (gen_random_uuid(), 'Prueba de CHECK', 'descripcion', $1, $2, $3, $4, 'Externo', gen_random_uuid(), 'QA', 'QE')`,
          [tipo, estado, fechaResolucion, h.H4.id],
        );
      await c.query("BEGIN");
      await expect(insertar("INVENTADO", "ABIERTO", null)).rejects.toMatchObject({ code: "23514" });
      await c.query("ROLLBACK");
      await c.query("BEGIN");
      await expect(insertar("AMBIENTE", "RESUELTO", null)).rejects.toMatchObject({ code: "23514" });
      await c.query("ROLLBACK");
    });
    expect(nuevoH5.id).toBeTruthy(); // el estado de T01 sigue intacto: ninguna de las dos inserciones persistió
    const imp = await imps(request);
    expect(Object.keys(imp)).toHaveLength(5);
  });
});
