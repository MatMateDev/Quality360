import { expect, test } from "@playwright/test";
import { api } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conOrganizacion } from "../support/db";
import { crearHdu, obtenerCatalogos } from "../support/fixtures";
import { codigoHduUnico } from "../support/unique";
import { crearUsuarioE7, desactivarUsuario, hduFixture, sesionDe, tokenE7, type ClaveE7 } from "../support/e7";

interface Reasignacion {
  cambio: boolean;
  hdu: { id: string; qeResponsable: { id: string } };
  qeAnterior: { id: string };
  qeNuevo: { id: string };
  motivo: string;
  actor: { nombre: string };
}

/** Un QE propio de la prueba con una HDU abierta de la que es responsable, y un segundo QE de destino. */
async function escenario(request: Parameters<typeof api.get>[0], prefijo: string) {
  const adm = await tokenE7("adm1");
  const qeA = await crearUsuarioE7(request, adm, "QE", { prefijo: `${prefijo}-qea`, conContrasena: true });
  const qeB = await crearUsuarioE7(request, adm, "QE", { prefijo: `${prefijo}-qeb`, conContrasena: true });
  const tokenA = (await sesionDe(qeA.correo)).accessToken;
  const { celula, sprint } = await obtenerCatalogos(request, tokenA);
  const hdu = await crearHdu(request, tokenA, { codigo: codigoHduUnico(prefijo), celulaId: celula.id, sprintId: sprint.id });
  const limpiar = async () => {
    await desactivarUsuario(request, adm, qeA.id);
    await desactivarUsuario(request, adm, qeB.id);
  };
  return { adm, qeA, qeB, tokenA, hdu, celula, sprint, limpiar };
}

const cuenta = (sql: string, params: unknown[]) => conOrganizacion(async (c) => Number((await c.query(sql, params)).rows[0].n));

test.describe("E7-B05 · Reasignación del QE responsable de una HDU", () => {
  test("[E7-B05#1] T01: ADM1 reasigna el QE responsable con motivo; queda en historial y auditoría; el mismo QE no registra nada", async ({ request }) => {
    const e = await escenario(request, "b05-t01");
    try {
      const motivo = "Rotación de cartera del QE";
      const r = await api.put<Reasignacion>(request, `/v1/hdu/${e.hdu.id}/qe-responsable`, { token: e.adm, body: { qeResponsableId: e.qeB.id, motivo } });
      expect(r.status).toBe(200);
      expect(r.body.cambio).toBe(true);
      expect(r.body.qeAnterior.id).toBe(e.qeA.id);
      expect(r.body.qeNuevo.id).toBe(e.qeB.id);
      expect(r.body.motivo).toBe(motivo);
      expect(r.body.actor.nombre).toContain("ADM1");

      const detalle = await api.get<{ qeResponsable: { id: string } }>(request, `/v1/hdu/${e.hdu.id}`, { token: e.adm });
      expect(detalle.body.qeResponsable.id).toBe(e.qeB.id);

      const aud = await api.get<{ items: Array<{ accion: string; actor: { nombre: string }; antes: Record<string, unknown>; despues: Record<string, unknown>; motivo: string }> }>(
        request, `/v1/auditoria?entidad=HDU&entidadId=${e.hdu.id}`, { token: e.adm });
      const reg = aud.body.items.find((x) => x.accion === "REASIGNAR_QE_RESPONSABLE");
      expect(reg).toBeDefined();
      expect(reg!.actor.nombre).toContain("ADM1");
      expect(reg!.motivo).toBe(motivo);
      expect(JSON.stringify(reg!.antes)).toContain(e.qeA.id);
      expect(JSON.stringify(reg!.despues)).toContain(e.qeB.id);

      const historial = await api.get<{ items: Array<{ tipo: string; qeAnterior?: { id: string }; qeNuevo?: { id: string }; motivo?: string }> }>(request, `/v1/hdu/${e.hdu.id}/historial`, { token: e.adm });
      const ev = historial.body.items.find((x) => x.tipo === "QE_RESPONSABLE");
      expect(ev).toBeDefined();
      expect(ev!.qeAnterior?.id).toBe(e.qeA.id);
      expect(ev!.qeNuevo?.id).toBe(e.qeB.id);
      expect(ev!.motivo).toBe(motivo);

      // Mismo QE otra vez: 200 cambio:false y sin registros nuevos.
      const filasAntes = await cuenta(`SELECT count(*) n FROM organizacion.hdu_historial_responsable WHERE hdu_id = $1`, [e.hdu.id]);
      const audAntes = aud.body.items.length;
      const igual = await api.put<Reasignacion>(request, `/v1/hdu/${e.hdu.id}/qe-responsable`, { token: e.adm, body: { qeResponsableId: e.qeB.id, motivo: "Sin cambio real" } });
      expect(igual.status).toBe(200);
      expect(igual.body.cambio).toBe(false);
      expect(await cuenta(`SELECT count(*) n FROM organizacion.hdu_historial_responsable WHERE hdu_id = $1`, [e.hdu.id])).toBe(filasAntes);
      const audDespues = await api.get<{ items: unknown[] }>(request, `/v1/auditoria?entidad=HDU&entidadId=${e.hdu.id}`, { token: e.adm });
      expect(audDespues.body.items.length).toBe(audAntes);
    } finally {
      await e.limpiar();
    }
  });

  test("[E7-B05#2] T02: el QE responsable, otro QE, un analista, un Líder y un Auditor reciben 403 ACCESO_DENEGADO; sin sesión, 401", async ({ request }) => {
    const e = await escenario(request, "b05-t02");
    try {
      const intentos: Array<[string, string | undefined]> = [["QE responsable", e.tokenA]];
      for (const clave of ["qe2", "ana3", "lid1", "aud1"] as ClaveE7[]) intentos.push([clave, await tokenE7(clave)]);
      for (const [quien, token] of intentos) {
        const r = await api.put(request, `/v1/hdu/${e.hdu.id}/qe-responsable`, { token, body: { qeResponsableId: e.qeB.id, motivo: "Intento no autorizado" } });
        expect(r.status, quien).toBe(403);
        expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
      }
      const sin = await api.put(request, `/v1/hdu/${e.hdu.id}/qe-responsable`, { body: { qeResponsableId: e.qeB.id, motivo: "Sin sesión" } });
      expect(sin.status).toBe(401);
      expect(sin.body).toMatchObject({ codigo: "NO_AUTENTICADO" });
      const detalle = await api.get<{ qeResponsable: { id: string } }>(request, `/v1/hdu/${e.hdu.id}`, { token: e.adm });
      expect(detalle.body.qeResponsable.id).toBe(e.qeA.id);
      expect(await cuenta(`SELECT count(*) n FROM organizacion.hdu_historial_responsable WHERE hdu_id = $1`, [e.hdu.id])).toBe(0);
    } finally {
      await e.limpiar();
    }
  });

  test("[E7-B05#3] T03: destino inválido, motivo inválido, HDU cerrada o inexistente se rechazan sin cambiar nada", async ({ request }) => {
    const e = await escenario(request, "b05-t03");
    try {
      const fx = await hduFixture(request);
      const adm = e.adm;
      const ids = async (correo: string) => (await api.get<{ items: Array<{ id: string }> }>(request, `/v1/usuarios?q=${encodeURIComponent(correo)}`, { token: adm })).body.items[0].id;
      const put = (hduId: string, body: unknown) => api.put<{ codigo: string }>(request, `/v1/hdu/${hduId}/qe-responsable`, { token: adm, body });
      const motivoOk = "Motivo válido de prueba";

      for (const [nombre, destino] of [
        ["analista (ANA1)", await ids("ana1@quality360.local")],
        ["líder (LID1)", await ids("lid1@quality360.local")],
        ["QE desactivado (INACT1)", await ids("inact1@quality360.local")],
        ["id inexistente", "00000000-0000-4000-8000-0000000000bb"],
      ] as const) {
        const r = await put(e.hdu.id, { qeResponsableId: destino, motivo: motivoOk });
        expect(r.status, nombre).toBe(422);
        expect(r.body.codigo, nombre).toBe("QE_INVALIDO");
      }

      const cerrada = await put(fx["E7-H7"].id, { qeResponsableId: e.qeB.id, motivo: motivoOk });
      expect(cerrada.status).toBe(409);
      expect(cerrada.body.codigo).toBe("HDU_CERRADA");

      expect((await put(e.hdu.id, { qeResponsableId: e.qeB.id })).status).toBe(400);
      expect((await put(e.hdu.id, { qeResponsableId: e.qeB.id, motivo: "ab" })).status).toBe(400);
      expect((await put(e.hdu.id, { qeResponsableId: e.qeB.id, motivo: "x".repeat(501) })).status).toBe(400);
      const blanco = await put(e.hdu.id, { qeResponsableId: e.qeB.id, motivo: "     " });
      expect(blanco.status).toBe(422);
      expect(blanco.body.codigo).toBe("MOTIVO_REQUERIDO");

      expect((await put("00000000-0000-4000-8000-0000000000cc", { qeResponsableId: e.qeB.id, motivo: motivoOk })).status).toBe(404);

      const detalle = await api.get<{ qeResponsable: { id: string } }>(request, `/v1/hdu/${e.hdu.id}`, { token: adm });
      expect(detalle.body.qeResponsable.id).toBe(e.qeA.id);
      const h7 = await api.get<{ qeResponsable: { correo: string } }>(request, `/v1/hdu/${fx["E7-H7"].id}`, { token: adm });
      expect(h7.body.qeResponsable.correo).toBe("qe2@quality360.local");
      expect(await cuenta(`SELECT count(*) n FROM organizacion.hdu_historial_responsable WHERE hdu_id = $1`, [e.hdu.id])).toBe(0);
    } finally {
      await e.limpiar();
    }
  });

  test("[E7-B05#1] T04: tras reasignar sus HDU abiertas, el 409 del cambio de rol de un QE ya no informa hduAbiertas, solo los analistas por reasignar", async ({ request }) => {
    const e = await escenario(request, "b05-t04");
    try {
      const analista = await crearUsuarioE7(request, e.adm, "ANALISTA_QA", { prefijo: "b05-t04-ana" });
      expect((await api.put(request, `/v1/analistas/${analista.id}/supervisor`, { token: e.adm, body: { qeId: e.qeA.id } })).status).toBe(200);
      const hdu2 = await crearHdu(request, e.tokenA, { codigo: codigoHduUnico("b05-t04b"), celulaId: e.celula.id, sprintId: e.sprint.id });

      type Conflicto = { codigo: string; relaciones: { analistasVigentes: unknown[]; hduAbiertas: { total: number; items: Array<{ codigo: string }> } } };
      const antes = await api.put<Conflicto>(request, `/v1/usuarios/${e.qeA.id}/rol`, { token: e.adm, body: { rol: "ANALISTA_QA" } });
      expect(antes.status).toBe(409);
      expect(antes.body.codigo).toBe("RELACIONES_INCOMPATIBLES");
      expect(antes.body.relaciones.hduAbiertas.total).toBe(2);
      expect(antes.body.relaciones.hduAbiertas.items.map((i) => i.codigo).sort()).toEqual([e.hdu.codigo, hdu2.codigo].sort());
      expect(antes.body.relaciones.analistasVigentes).toHaveLength(1);

      for (const h of [e.hdu, hdu2]) {
        const r = await api.put<Reasignacion>(request, `/v1/hdu/${h.id}/qe-responsable`, { token: e.adm, body: { qeResponsableId: e.qeB.id, motivo: "Liberar al QE antes del cambio de rol" } });
        expect(r.status).toBe(200);
        expect(r.body.cambio).toBe(true);
      }

      const despues = await api.put<Conflicto>(request, `/v1/usuarios/${e.qeA.id}/rol`, { token: e.adm, body: { rol: "ANALISTA_QA" } });
      expect(despues.status).toBe(409);
      expect(despues.body.relaciones.hduAbiertas).toMatchObject({ total: 0, items: [] });
      expect(despues.body.relaciones.analistasVigentes).toHaveLength(1);

      // Reasignado también el analista, el cambio de rol procede.
      const cambioSup = await api.put(request, `/v1/analistas/${analista.id}/supervisor`, { token: e.adm, body: { qeId: e.qeB.id, motivo: "Liberar al QE antes del cambio de rol" } });
      expect(cambioSup.status, JSON.stringify(cambioSup.body)).toBe(200);
      const ok = await api.put(request, `/v1/usuarios/${e.qeA.id}/rol`, { token: e.adm, body: { rol: "ANALISTA_QA" } });
      expect(ok.status).toBe(200);
      await desactivarUsuario(request, e.adm, analista.id);
    } finally {
      await e.limpiar();
    }
  });

  test("[E7-B05#1] contrato: la reasignación cumple ResultadoReasignacionQe", async ({ request }) => {
    const e = await escenario(request, "b05-contrato");
    try {
      const r = await api.put(request, `/v1/hdu/${e.hdu.id}/qe-responsable`, { token: e.adm, body: { qeResponsableId: e.qeB.id, motivo: "Prueba de contrato" } });
      expect(r.status).toBe(200);
      expect(cumpleContrato("ResultadoReasignacionQe", r.body).errores).toEqual([]);
    } finally {
      await e.limpiar();
    }
  });

  test("[E7-B05#1] T05: el catálogo de personas con rol QE es del Administrador; INACT1 solo aparece con activo=false", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const r = await api.get<{ items: Array<{ id: string; correo: string; rol: string }> }>(request, "/v1/catalogos/personas?rol=QE", { token: adm });
    expect(r.status).toBe(200);
    const correos = r.body.items.map((p) => p.correo);
    expect(correos).toEqual(expect.arrayContaining(["qe1@quality360.local", "qe2@quality360.local"]));
    expect(correos).not.toContain("inact1@quality360.local");
    expect(r.body.items.every((p) => p.rol === "QE")).toBe(true);
    expect(cumpleContrato("ListaPersonas", r.body).errores).toEqual([]);
    const inactivos = await api.get<{ items: Array<{ correo: string }> }>(request, "/v1/catalogos/personas?rol=QE&activo=false", { token: adm });
    expect(inactivos.status).toBe(200);
    expect(inactivos.body.items.map((p) => p.correo)).toContain("inact1@quality360.local");
    for (const clave of ["qe1", "ana1", "lid1", "aud1"] as ClaveE7[]) {
      const x = await api.get(request, "/v1/catalogos/personas?rol=QE", { token: await tokenE7(clave) });
      expect(x.status, clave).toBe(403);
      expect(x.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
    }
    expect((await api.get(request, "/v1/catalogos/personas?rol=QE")).status).toBe(401);
  });
});
