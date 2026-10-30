import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { cuerpoSinTrace, tokenE7, type ClaveE7 } from "../support/e7";
import { impedimentosCaidoEnOrganizacion, type PilaE4 } from "../support/entornoE4";
import { conConexion } from "../support/db";
import { DATABASE_URL_DUENO, contarDb, evaluar, hdu, imps, reiniciarFixtureE4, texto, uid, type AccionApi, type ImpedimentoApi } from "../support/e4";

/**
 * E4-B02 · Ciclo de vida de los impedimentos (3 escenarios, T01..T13; T14 es la regresión de la suite completa).
 * El fixture se recarga antes de cada caso: cada uno parte del estado base de la sección 7.
 */
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await reiniciarFixtureE4();
});

interface Resultado {
  impedimento: ImpedimentoApi;
  accion: AccionApi;
  hdu: { bloqueada: boolean; abiertos: number };
}
interface ErrorTransicion {
  codigo: string;
  mensaje: string;
  estadoActual: string;
  operacion: string;
  operacionesPermitidas: string[];
}

const accion = (id: string, op: string, clave: ClaveE7, body?: unknown) =>
  tokenE7(clave).then((token) => ({ token, ruta: `/v1/impedimentos/${id}/${op}`, body }));

async function accionar<T = Resultado>(request: Parameters<typeof api.get>[0], id: string, op: string, clave: ClaveE7, body?: unknown) {
  const a = await accion(id, op, clave, body);
  return api.post<T>(request, a.ruta, { token: a.token, body: a.body });
}

const estadoDe = (id: string) => contarDb("SELECT count(*) n FROM impedimentos.impedimento WHERE id_impedimento = $1", [id]);
const accionesDe = (id: string) => contarDb("SELECT count(*) n FROM impedimentos.accion_impedimento WHERE id_impedimento = $1", [id]);

test.describe("E4-B02 · Ciclo de vida", () => {
  test("[E4-B02#1] T01: QE1 resuelve I2 con comentario: 200, RESUELTO con fechaResolucion y acción RESOLVER (actor QE1, ABIERTO → RESUELTO)", async ({ request }) => {
    const i = await imps(request);
    const qe1 = await uid(request, "qe1");
    const r = await accionar(request, i.I2.id, "resolver", "qe1", { comentario: "Se entregaron las cuentas de prueba" });
    expect(r.status).toBe(200);
    expect(r.body.impedimento.estado).toBe("RESUELTO");
    expect(r.body.impedimento.fechaResolucion).toBeTruthy();
    expect(r.body.accion).toMatchObject({ tipo: "RESOLVER", estadoAnterior: "ABIERTO", estado: "RESUELTO", comentario: "Se entregaron las cuentas de prueba" });
    expect(r.body.accion.actor).toMatchObject({ id: qe1, rol: "QE" });
    expect(cumpleContrato("ResultadoAccionImpedimento", r.body).errores).toEqual([]);
  });

  test("[E4-B02#1] T02: QE1 escala I2 a LID1: 200, ESCALADO, responsable LID1 y acción ESCALAR con detalle anterior QE1 / nuevo LID1", async ({ request }) => {
    const i = await imps(request);
    const [qe1, lid1] = [await uid(request, "qe1"), await uid(request, "lid1")];
    const r = await accionar(request, i.I2.id, "escalar", "qe1", { responsableId: lid1, comentario: "Requiere gestión con TI" });
    expect(r.status).toBe(200);
    expect(r.body.impedimento).toMatchObject({ estado: "ESCALADO", responsable: { id: lid1, externo: false } });
    expect(r.body.accion.tipo).toBe("ESCALAR");
    expect(r.body.accion.detalle).toMatchObject({ responsableAnterior: { id: qe1 }, responsableNuevo: { id: lid1 } });
    expect(r.body.hdu).toEqual({ bloqueada: true, abiertos: 1 });
    expect(cumpleContrato("ResultadoAccionImpedimento", r.body).errores).toEqual([]);
  });

  test("[E4-B02#2] T03: al resolver I2 la evaluación de H1 queda bloqueada false / abiertos 0 (H6 sigue bloqueada); al resolver I3, H6 también", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const token = await tokenE7("qe1");
    const r2 = await accionar(request, i.I2.id, "resolver", "qe1", { comentario: "Cuentas entregadas" });
    expect(r2.status).toBe(200);
    expect(r2.body.hdu).toEqual({ bloqueada: false, abiertos: 0 });
    let ev = await evaluar(token, [h.H1, h.H6].map((x) => ({ hduId: x.id, estado: x.estado })));
    expect(ev.body.items[0]).toMatchObject({ hduId: h.H1.id, bloqueada: false, abiertos: 0 });
    expect(ev.body.items[1]).toMatchObject({ hduId: h.H6.id, bloqueada: true, abiertos: 1 });
    const r3 = await accionar(request, i.I3.id, "resolver", "qe1", { comentario: "Sandbox disponible" });
    expect(r3.status).toBe(200);
    expect(r3.body.hdu).toEqual({ bloqueada: false, abiertos: 0 });
    ev = await evaluar(token, [h.H1, h.H6].map((x) => ({ hduId: x.id, estado: x.estado })));
    expect(ev.body.items.map((x: { bloqueada: boolean; abiertos: number }) => [x.bloqueada, x.abiertos])).toEqual([[false, 0], [false, 0]]);
  });

  test("[E4-B02#2] T04: con un segundo impedimento en H1 (ANA1), resolver I2 deja H1 bloqueada con abiertos 1; al resolver el segundo pasa a false", async ({ request }) => {
    const [h, i] = [await hdu(request), await imps(request)];
    const nuevo = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H1.id}/impedimentos`, {
      token: await tokenE7("ana1"),
      body: { tipo: "HERRAMIENTA", titulo: "Jira sin integración", descripcion: texto(30, "descripcion "), responsableNombre: "Equipo de Herramientas" },
    });
    expect(nuevo.status).toBe(201);
    const r2 = await accionar(request, i.I2.id, "resolver", "qe1", { comentario: "Cuentas entregadas" });
    expect(r2.body.hdu).toEqual({ bloqueada: true, abiertos: 1 });
    const lista = await api.get<{ bloqueada: boolean; abiertos: number }>(request, `/v1/hdu/${h.H1.id}/impedimentos`, { token: await tokenE7("qe1") });
    expect(lista.body).toMatchObject({ bloqueada: true, abiertos: 1 });
    const r = await accionar(request, nuevo.body.id, "resolver", "qe1", { comentario: "Integración reparada" });
    expect(r.body.hdu).toEqual({ bloqueada: false, abiertos: 0 });
  });

  test("[E4-B02#3] T05 (negativo): sobre I4 (RESUELTO) escalar, resolver y seguimiento dan 409 TRANSICION_INVALIDA y sus acciones siguen siendo 2", async ({ request }) => {
    const i = await imps(request);
    const lid1 = await uid(request, "lid1");
    const cuerpos: Array<[string, unknown]> = [
      ["escalar", { responsableId: lid1, comentario: "Intento de escalar" }],
      ["resolver", { comentario: "Intento de resolver" }],
      ["seguimiento", { comentario: "Intento de seguimiento" }],
    ];
    for (const [op, body] of cuerpos) {
      const r = await accionar<ErrorTransicion>(request, i.I4.id, op, "qe1", body);
      expect(r.status, op).toBe(409);
      expect(r.body.codigo, op).toBe("TRANSICION_INVALIDA");
      expect(r.body.estadoActual).toBe("RESUELTO");
      expect(r.body.operacionesPermitidas).toEqual(["REABRIR"]);
      expect(cumpleContrato("ErrorTransicionImpedimento", r.body).errores, op).toEqual([]);
      if (op === "escalar") expect(r.body.mensaje).toContain("Un impedimento resuelto solo puede reabrirse");
    }
    expect(await accionesDe(i.I4.id)).toBe(2);
  });

  test("[E4-B02#1] T06: I3 (ESCALADO) se escala a ADM1 (sigue ESCALADO, acción con anterior LID1); reabrir un no resuelto da 409; resolver un ESCALADO da 200", async ({ request }) => {
    const i = await imps(request);
    const [lid1, adm1] = [await uid(request, "lid1"), await uid(request, "adm1")];
    const e = await accionar(request, i.I3.id, "escalar", "qe1", { responsableId: adm1, comentario: "Se escala a Administración" });
    expect(e.status).toBe(200);
    expect(e.body.impedimento).toMatchObject({ estado: "ESCALADO", responsable: { id: adm1 } });
    expect(e.body.accion.detalle).toMatchObject({ responsableAnterior: { id: lid1 }, responsableNuevo: { id: adm1 } });
    const reabrir = await accionar<ErrorTransicion>(request, i.I3.id, "reabrir", "qe1", { motivo: "No corresponde" });
    expect(reabrir.status).toBe(409);
    expect(reabrir.body.codigo).toBe("TRANSICION_INVALIDA");
    const resolver = await accionar(request, i.I3.id, "resolver", "qe1", { comentario: "Sandbox entregado" });
    expect(resolver.status).toBe(200);
    expect(resolver.body.accion).toMatchObject({ tipo: "RESOLVER", estadoAnterior: "ESCALADO", estado: "RESUELTO" });
  });

  test("[E4-B02#1] T07: QE1 reabre I4: ABIERTO, fechaResolucion null, abiertoDesde = ahora, fechaRegistro sin cambio y acciones REGISTRAR, RESOLVER, REABRIR", async ({ request }) => {
    const i = await imps(request);
    const antes = Date.now();
    const r = await accionar(request, i.I4.id, "reabrir", "qe1", { motivo: "Volvió a cambiar el criterio" });
    expect(r.status).toBe(200);
    expect(r.body.impedimento).toMatchObject({ estado: "ABIERTO", fechaResolucion: null, fechaRegistro: i.I4.fechaRegistro, diasAbierto: 0 });
    expect(Date.parse(r.body.impedimento.abiertoDesde)).toBeGreaterThan(antes - 60_000);
    expect(r.body.impedimento.abiertoDesde).not.toBe(i.I4.abiertoDesde);
    expect(r.body.accion).toMatchObject({ tipo: "REABRIR", estadoAnterior: "RESUELTO", estado: "ABIERTO", comentario: "Volvió a cambiar el criterio" });
    const d = await api.get<ImpedimentoApi>(request, `/v1/impedimentos/${i.I4.id}`, { token: await tokenE7("qe1") });
    expect(d.body.acciones!.map((a) => a.tipo)).toEqual(["REGISTRAR", "RESOLVER", "REABRIR"]);
  });

  test("[E4-B02#1] T08 (negativo): resolver sin comentario 400, en blanco 422 COMENTARIO_REQUERIDO; escalar sin destino 400; destino ANA1, QE2 y LID2: 422 RESPONSABLE_INVALIDO; I2 no cambia", async ({ request }) => {
    const i = await imps(request);
    const sin = await accionar<{ codigo: string }>(request, i.I2.id, "resolver", "qe1", {});
    expect(sin.status).toBe(400);
    expect(sin.body.codigo).toBe("VALIDACION");
    const blanco = await accionar<{ codigo: string }>(request, i.I2.id, "resolver", "qe1", { comentario: "     " });
    expect(blanco.status).toBe(422);
    expect(blanco.body.codigo).toBe("COMENTARIO_REQUERIDO");
    const sinDestino = await accionar<{ codigo: string }>(request, i.I2.id, "escalar", "qe1", { comentario: "Sin destino" });
    expect(sinDestino.status).toBe(400);
    for (const clave of ["ana1", "qe2", "lid2"] as const) {
      const r = await accionar<{ codigo: string }>(request, i.I2.id, "escalar", "qe1", { responsableId: await uid(request, clave), comentario: "Destino no permitido" });
      expect(r.status, clave).toBe(422);
      expect(r.body.codigo, clave).toBe("RESPONSABLE_INVALIDO");
    }
    // D92: escalar al mismo responsable actual (QE1) tampoco es válido.
    const mismo = await accionar<{ codigo: string }>(request, i.I2.id, "escalar", "qe1", { responsableId: await uid(request, "qe1"), comentario: "Mismo responsable" });
    expect(mismo.status).toBe(422);
    const d = await api.get<ImpedimentoApi>(request, `/v1/impedimentos/${i.I2.id}`, { token: await tokenE7("qe1") });
    expect(d.body.estado).toBe("ABIERTO");
    expect(d.body.acciones).toHaveLength(1);
  });

  test("[E4-B02#1] T09 (negativo): ANA1, QE2, LID1, AUD1 y ADM1 no pueden resolver, escalar, reabrir ni dar seguimiento (403, 25 combinaciones); sin token 401; los estados no cambian", async ({ request }) => {
    const i = await imps(request);
    const adm1 = await uid(request, "adm1");
    const operaciones: Array<[string, string, unknown]> = [
      ["resolver", i.I2.id, { comentario: "Intento no autorizado" }],
      ["escalar", i.I2.id, { responsableId: adm1, comentario: "Intento no autorizado" }],
      ["reabrir", i.I4.id, { motivo: "Intento no autorizado" }],
      ["seguimiento", i.I2.id, { comentario: "Intento no autorizado" }],
    ];
    const roles = ["ana1", "qe2", "lid1", "aud1", "adm1"] as const;
    let combinaciones = 0;
    for (const clave of roles) {
      for (const [op, id, body] of operaciones) {
        const r = await accionar<{ codigo: string }>(request, id, op, clave, body);
        expect(r.status, `${clave} ${op}`).toBe(403);
        expect(r.body.codigo).toBe("ACCESO_DENEGADO");
        combinaciones += 1;
      }
    }
    expect(combinaciones).toBe(20);
    for (const [op, id, body] of operaciones) {
      const r = await api.post<{ codigo: string }>(request, `/v1/impedimentos/${id}/${op}`, { body });
      expect(r.status, `sin token ${op}`).toBe(401);
      expect(r.body.codigo).toBe("NO_AUTENTICADO");
    }
    const qe1 = await tokenE7("qe1");
    expect((await api.get<ImpedimentoApi>(request, `/v1/impedimentos/${i.I2.id}`, { token: qe1 })).body).toMatchObject({ estado: "ABIERTO" });
    expect((await api.get<ImpedimentoApi>(request, `/v1/impedimentos/${i.I4.id}`, { token: qe1 })).body).toMatchObject({ estado: "RESUELTO" });
    expect(await accionesDe(i.I2.id)).toBe(1);
    expect(await accionesDe(i.I4.id)).toBe(2);
    // Un impedimento inexistente: 403 para quien no es Administrador/Auditor, 404 para ellos (D50, D89).
    const falso = "00000000-0000-4000-8000-0000000000bb";
    expect((await accionar(request, falso, "resolver", "ana1", { comentario: "xxx" })).status).toBe(403);
    // En la lectura, 404; en una operación de escritura el rol sin permiso recibe 403 antes de saber si existe (sin revelar nada).
    expect((await api.get(request, `/v1/impedimentos/${falso}`, { token: await tokenE7("adm1") })).status).toBe(404);
    expect((await api.get(request, `/v1/impedimentos/${falso}`, { token: await tokenE7("aud1") })).status).toBe(404);
    expect((await api.get(request, `/v1/impedimentos/${falso}`, { token: await tokenE7("ana1") })).status).toBe(403);
    expect((await accionar(request, falso, "resolver", "adm1", { comentario: "xxx" })).status).toBe(403);
  });

  test("[E4-B02#1] T10: dos resolver simultáneos sobre I2: uno 200 y el otro 409 TRANSICION_INVALIDA, y una sola acción RESOLVER", async ({ request }) => {
    const i = await imps(request);
    const token = await tokenE7("qe1");
    const lanzar = () => api.post<Resultado | ErrorTransicion>(request, `/v1/impedimentos/${i.I2.id}/resolver`, { token, body: { comentario: "Resolución simultánea" } });
    const [a, b] = await Promise.all([lanzar(), lanzar()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const perdedora = (a.status === 409 ? a : b).body as ErrorTransicion;
    expect(perdedora.codigo).toBe("TRANSICION_INVALIDA");
    expect(await contarDb("SELECT count(*) n FROM impedimentos.accion_impedimento WHERE id_impedimento = $1 AND tipo_accion = 'RESOLVER'", [i.I2.id])).toBe(1);
  });

  test("[E4-B02#3] T11: QE2 reabre I5 (H7 CERRADA): 409 HDU_CERRADA y I5 sigue resuelto", async ({ request }) => {
    const i = await imps(request);
    const r = await accionar<{ codigo: string }>(request, i.I5.id, "reabrir", "qe2", { motivo: "Intento sobre HDU cerrada" });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("HDU_CERRADA");
    const d = await api.get<ImpedimentoApi>(request, `/v1/impedimentos/${i.I5.id}`, { token: await tokenE7("qe2") });
    expect(d.body.estado).toBe("RESUELTO");
    expect(d.body.operacionesPermitidas).toEqual([]);
    expect(await accionesDe(i.I5.id)).toBe(2);
  });

  test("[E4-B02#2] T12: H8 (PENDIENTE_CIERRE, 10 aprobados) con un impedimento abierto: pedir CERRADA da 409 HDU_BLOQUEADA con total e items; con 22 abiertos, total 22 y 20 items", async ({ request }) => {
    const h = await hdu(request);
    const qe1 = await uid(request, "qe1");
    const token = await tokenE7("qe1");
    const reg = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H8.id}/impedimentos`, {
      token,
      body: { tipo: "DEPENDENCIA", titulo: "Entrega pendiente del equipo de Pagos", descripcion: texto(30, "descripcion "), responsableId: qe1 },
    });
    expect(reg.status).toBe(201);
    const cerrar = () => api.post<{ codigo: string; impedimentos: { total: number; items: Array<{ id: string; titulo: string; tipo: string; estado: string; diasAbierto: number }> } }>(request, `/v1/hdu/${h.H8.id}/estado`, { token, body: { estado: "CERRADA" } });
    const c1 = await cerrar();
    expect(c1.status).toBe(409);
    expect(c1.body.codigo).toBe("HDU_BLOQUEADA");
    expect(c1.body.impedimentos.total).toBe(1);
    expect(c1.body.impedimentos.items[0]).toMatchObject({ id: reg.body.id, titulo: "Entrega pendiente del equipo de Pagos", estado: "ABIERTO" });
    expect(cumpleContrato("ErrorHduBloqueada", c1.body).errores).toEqual([]);
    expect((await api.get<{ estado: string }>(request, `/v1/hdu/${h.H8.id}`, { token })).body.estado).toBe("PENDIENTE_CIERRE");

    // Volumen: 21 más insertados con el dueño de la base (sin pasar por el límite de escrituras del gateway).
    await conConexion(DATABASE_URL_DUENO, async (c) => {
      for (let n = 0; n < 21; n += 1) {
        await c.query(
          `INSERT INTO impedimentos.impedimento (id_impedimento, titulo, descripcion, tipo, estado, id_historia, responsable_nombre, creado_por_id, creado_por_nombre, creado_por_rol)
           VALUES (gen_random_uuid(), $1, 'Volumen de la prueba de cierre', 'OTRO', 'ABIERTO', $2, 'Externo', $3, 'QE1 Quality Engineer', 'QE')`,
          [`Impedimento de volumen ${n + 1}`, h.H8.id, qe1],
        );
      }
    });
    const c2 = await cerrar();
    expect(c2.status).toBe(409);
    expect(c2.body.impedimentos.total).toBe(22);
    expect(c2.body.impedimentos.items).toHaveLength(20);
    expect(cumpleContrato("ErrorHduBloqueada", c2.body).errores).toEqual([]);

  });

  test("[E4-B02#2] T12b: resolver el único impedimento de H8 deja la consulta de cierre en cero", async ({ request }) => {
    const h = await hdu(request);
    const qe1 = await uid(request, "qe1");
    const token = await tokenE7("qe1");
    const reg = await api.post<ImpedimentoApi>(request, `/v1/hdu/${h.H8.id}/impedimentos`, {
      token,
      body: { tipo: "RECURSOS", titulo: "Falta una persona de pruebas", descripcion: texto(30, "descripcion "), responsableId: qe1 },
    });
    expect(reg.status).toBe(201);
    const consulta = async () => {
      const r = await fetch(`http://localhost:3003/v1/interno/hdu/${h.H8.id}/impedimentos/abiertos`, { headers: { Authorization: `Bearer ${token}`, "x-trace-id": "qa-e4" } });
      return (await r.json()) as { total: number };
    };
    expect((await consulta()).total).toBe(1);
    expect((await accionar(request, reg.body.id, "resolver", "qe1", { comentario: "Persona asignada" })).status).toBe(200);
    expect((await consulta()).total).toBe(0);
    expect(await estadoDe(reg.body.id)).toBe(1);
  });

  test.describe("con Impedimentos caído", () => {
    let pila: PilaE4;
    test.beforeAll(async () => {
      pila = await impedimentosCaidoEnOrganizacion();
    });
    test.afterAll(async () => {
      await pila?.detener();
    });

    test("[E4-B02#2] T13: con Impedimentos detenido, pedir CERRADA en H8 da 503 SERVICIO_NO_DISPONIBLE (con bloque impedimentos indisponible) y H8 sigue PENDIENTE_CIERRE", async ({ request }) => {
      const h = await hdu(request);
      const token = await tokenE7("qe1");
      const r = await api.post<{ codigo: string; mensaje: string; impedimentos: { estado: string } }>(request, `/v1/hdu/${h.H8.id}/estado`, {
        token,
        body: { estado: "CERRADA" },
        baseURL: pila.gatewayUrl,
      });
      expect(r.status).toBe(503);
      expect(r.body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
      expect(r.body.mensaje).toContain("No pudimos verificar los impedimentos de la HDU");
      expect(r.body.impedimentos.estado).toBe("indisponible");
      expect(cumpleContrato("ErrorImpedimentosNoVerificables", r.body).errores).toEqual([]);
      const d = await api.get<{ estado: string }>(request, `/v1/hdu/${h.H8.id}`, { token });
      expect(d.body.estado).toBe("PENDIENTE_CIERRE");
    });
  });
});

void cuerpoSinTrace;
