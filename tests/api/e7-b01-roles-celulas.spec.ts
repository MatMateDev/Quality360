import { expect, test } from "@playwright/test";
import { fijarContrasena } from "../support/adminIdentidad";
import { api, iniciarSesion } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conOrganizacion } from "../support/db";
import { env } from "../support/env";
import { celulasFixture, crearUsuarioE7, desactivarUsuario, tokenE7, type ClaveE7 } from "../support/e7";
import { correoUnico, nombreUnico } from "../support/unique";

interface CelulasLider {
  usuario: { id: string };
  vigentes: Array<{ celula: { id: string; nombre: string }; hasta: string | null }>;
  historial: Array<{ celula: { id: string; nombre: string }; desde: string; hasta: string | null; asignadoPor: { nombre: string }; retiradoPor: { nombre: string } | null }>;
}
interface PaginaAuditoria {
  items: Array<{ operacion: string; actor: { nombre: string }; usuarioAfectado: { id: string } | null; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null }>;
  total: number;
}

const leerCelulas = (request: Parameters<typeof api.get>[0], token: string, id: string) =>
  api.get<CelulasLider>(request, `/v1/usuarios/${id}/celulas-lider`, { token });

test.describe("E7-B01 · Roles Líder QA y Auditor, y células del Líder", () => {
  test("[E7-B01#1] T01: el catálogo ofrece 5 roles, incluidos LIDER_QA y AUDITOR", async ({ request }) => {
    const r = await api.get<{ items: Array<{ codigo: string; nombre: string; soloLectura: boolean }> }>(request, "/v1/roles", { token: await tokenE7("adm1") });
    expect(r.status).toBe(200);
    expect(r.body.items.map((x) => x.codigo).sort()).toEqual(["ADMINISTRADOR", "ANALISTA_QA", "AUDITOR", "LIDER_QA", "QE"]);
    expect(Object.fromEntries(r.body.items.map((x) => [x.codigo, x.soloLectura]))).toMatchObject({ LIDER_QA: true, AUDITOR: true, QE: false });
    expect(cumpleContrato("ListaRoles", r.body).errores).toEqual([]);
  });

  test("[E7-B01#1] T02: ADM1 cambia a un analista a LIDER_QA y le asigna CEL-A y CEL-B; hay 2 vigentes y 2 entradas de auditoría con actor ADM1", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t02" });
    try {
      const rol = await api.put(request, `/v1/usuarios/${ana.id}/rol`, { token: adm, body: { rol: "LIDER_QA" } });
      expect(rol.status).toBe(200);
      expect(rol.body).toMatchObject({ rol: "LIDER_QA" });
      const put = await api.put<CelulasLider>(request, `/v1/usuarios/${ana.id}/celulas-lider`, { token: adm, body: { celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id] } });
      expect(put.status).toBe(200);
      const get = await leerCelulas(request, adm, ana.id);
      expect(get.status).toBe(200);
      expect(get.body.vigentes.map((v) => v.celula.nombre).sort()).toEqual(["CEL-A", "CEL-B"]);
      expect(cumpleContrato("CelulasLider", get.body).errores).toEqual([]);

      const aud = await api.get<PaginaAuditoria>(request, `/v1/auditor/auditoria-usuarios?usuarioAfectadoId=${ana.id}&tamanoPagina=50`, { token: await tokenE7("aud1") });
      const ops = aud.body.items.filter((e) => e.usuarioAfectado?.id === ana.id).map((e) => e.operacion);
      expect(ops).toEqual(expect.arrayContaining(["CAMBIAR_ROL", "ASIGNAR_CELULAS_LIDER"]));
      const celulasAud = aud.body.items.find((e) => e.operacion === "ASIGNAR_CELULAS_LIDER");
      expect(celulasAud?.actor.nombre).toContain("ADM1");
      expect(JSON.stringify(celulasAud?.despues)).toContain("CEL-A");
      expect(celulasAud?.antes).toBeTruthy(); // valor anterior y nuevo de las células
    } finally {
      await desactivarUsuario(request, adm, ana.id);
    }
  });

  test("[E7-B01#1] T02b: el cambio de rol con celulaIds se aplica de forma atómica (D42) y un usuario nuevo LIDER_QA nace con sus células", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-atomico" });
    const nuevoLider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "b01-nuevo-lider", celulaIds: [celulas["CEL-C"].id] });
    try {
      const rol = await api.put(request, `/v1/usuarios/${ana.id}/rol`, { token: adm, body: { rol: "LIDER_QA", celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id] } });
      expect(rol.status).toBe(200);
      expect((await leerCelulas(request, adm, ana.id)).body.vigentes.map((v) => v.celula.nombre).sort()).toEqual(["CEL-A", "CEL-B"]);
      expect((await leerCelulas(request, adm, nuevoLider.id)).body.vigentes.map((v) => v.celula.nombre)).toEqual(["CEL-C"]);
    } finally {
      await desactivarUsuario(request, adm, ana.id);
      await desactivarUsuario(request, adm, nuevoLider.id);
    }
  });

  test("[E7-B01#2] T03: un rol fuera del catálogo (SUPERVISOR) responde 400 VALIDACION con VALOR_NO_PERMITIDO", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const u = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t03" });
    try {
      const r = await api.put<{ codigo: string; detalles: Array<{ campo: string; codigo: string }> }>(request, `/v1/usuarios/${u.id}/rol`, { token: adm, body: { rol: "SUPERVISOR" } });
      expect(r.status).toBe(400);
      expect(r.body.codigo).toBe("VALIDACION");
      expect(r.body.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: "rol", codigo: "VALOR_NO_PERMITIDO" })]));
      // LIDER_QA y AUDITOR dejaron de ser «roles inválidos» (D28): se aceptan.
      expect((await api.put(request, `/v1/usuarios/${u.id}/rol`, { token: adm, body: { rol: "AUDITOR" } })).status).toBe(200);
    } finally {
      await desactivarUsuario(request, adm, u.id);
    }
  });

  test("[E7-B01#2] T04: asignar células a un QE responde 409 ROL_INCOMPATIBLE y no cambia nada", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const qe = await crearUsuarioE7(request, adm, "QE", { prefijo: "b01-t04" });
    try {
      const r = await api.put(request, `/v1/usuarios/${qe.id}/celulas-lider`, { token: adm, body: { celulaIds: [celulas["CEL-A"].id] } });
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ codigo: "ROL_INCOMPATIBLE" });
      const filas = await conOrganizacion(async (c) => Number((await c.query(`SELECT count(*) n FROM organizacion.celula_lider WHERE id_usuario = $1`, [qe.id])).rows[0].n));
      expect(filas).toBe(0);
    } finally {
      await desactivarUsuario(request, adm, qe.id);
    }
  });

  test("[E7-B01#2] T05: una célula inexistente responde 422 y las células del Líder no cambian (tampoco en el cambio de rol atómico)", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "b01-t05", celulaIds: [celulas["CEL-A"].id] });
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t05b" });
    try {
      const inexistente = "00000000-0000-4000-8000-0000000000aa";
      const r = await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [celulas["CEL-A"].id, inexistente] } });
      expect(r.status).toBe(422);
      expect((await leerCelulas(request, adm, lider.id)).body.vigentes.map((v) => v.celula.nombre)).toEqual(["CEL-A"]);
      // Atomicidad: si las células fallan, tampoco se cambia el rol.
      const atomico = await api.put(request, `/v1/usuarios/${ana.id}/rol`, { token: adm, body: { rol: "LIDER_QA", celulaIds: [inexistente] } });
      expect(atomico.status).toBe(422);
      const yo = await api.get<{ rol: string }>(request, `/v1/usuarios/${ana.id}`, { token: adm });
      expect(yo.body.rol).toBe("ANALISTA_QA");
      // celulaIds con un rol distinto de LIDER_QA es un error de validación.
      const otroRol = await api.put(request, `/v1/usuarios/${ana.id}/rol`, { token: adm, body: { rol: "QE", celulaIds: [celulas["CEL-A"].id] } });
      expect(otroRol.status).toBe(400);
      expect((await api.get<{ rol: string }>(request, `/v1/usuarios/${ana.id}`, { token: adm })).body.rol).toBe("ANALISTA_QA");
    } finally {
      await desactivarUsuario(request, adm, lider.id);
      await desactivarUsuario(request, adm, ana.id);
    }
  });

  test("[E7-B01#2] T06: cambiar el rol de un Líder con células da 409 RELACIONES_INCOMPATIBLES estructurado; sin células el cambio pasa", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "b01-t06", celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id] });
    try {
      const r = await api.put<{ codigo: string; relaciones: { analistasVigentes: unknown[]; supervisorVigente: unknown; hduAbiertas: { total: number; items: unknown[] }; celulasVigentes: Array<{ nombre: string }> } }>(
        request, `/v1/usuarios/${lider.id}/rol`, { token: adm, body: { rol: "ANALISTA_QA" } });
      expect(r.status).toBe(409);
      expect(r.body.codigo).toBe("RELACIONES_INCOMPATIBLES");
      expect(Object.keys(r.body.relaciones).sort()).toEqual(["analistasVigentes", "celulasVigentes", "hduAbiertas", "supervisorVigente"]);
      expect(r.body.relaciones.celulasVigentes.map((c) => c.nombre).sort()).toEqual(["CEL-A", "CEL-B"]);
      expect(r.body.relaciones.hduAbiertas).toMatchObject({ total: 0, items: [] });
      expect(cumpleContrato("ErrorRelacionesIncompatibles", r.body).errores).toEqual([]);
      // Sin cambio parcial: sigue siendo Líder con sus 2 células.
      expect((await api.get<{ rol: string }>(request, `/v1/usuarios/${lider.id}`, { token: adm })).body.rol).toBe("LIDER_QA");
      expect((await leerCelulas(request, adm, lider.id)).body.vigentes).toHaveLength(2);

      expect((await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [] } })).status).toBe(200);
      const ok = await api.put(request, `/v1/usuarios/${lider.id}/rol`, { token: adm, body: { rol: "ANALISTA_QA" } });
      expect(ok.status).toBe(200);
    } finally {
      await desactivarUsuario(request, adm, lider.id);
    }
  });

  test("[E7-B01#2] T07: quitar una célula conserva el registro con fecha de término; las vigentes pasan a 1", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "b01-t07", celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id] });
    try {
      const put = await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [celulas["CEL-A"].id] } });
      expect(put.status).toBe(200);
      const g = await leerCelulas(request, adm, lider.id);
      expect(g.body.vigentes.map((v) => v.celula.nombre)).toEqual(["CEL-A"]);
      const celB = g.body.historial.find((h) => h.celula.nombre === "CEL-B");
      expect(celB?.hasta).toBeTruthy();
      expect(celB?.retiradoPor?.nombre).toContain("ADM1");
      expect(celB?.asignadoPor.nombre).toContain("ADM1");
      expect(Date.parse(celB!.hasta!)).toBeGreaterThanOrEqual(Date.parse(celB!.desde));
      const filas = await conOrganizacion(async (c) =>
        (await c.query(`SELECT fecha_hasta FROM organizacion.celula_lider cl JOIN organizacion.celula ce ON ce.id_celula = cl.id_celula WHERE cl.id_usuario = $1 AND ce.nombre = 'CEL-B'`, [lider.id])).rows,
      );
      expect(filas).toHaveLength(1);
      expect(filas[0].fecha_hasta).not.toBeNull();
      // Reasignarla crea un registro nuevo y deja el anterior en el historial (índice único parcial solo sobre vigentes).
      await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: adm, body: { celulaIds: [celulas["CEL-A"].id, celulas["CEL-B"].id] } });
      const g2 = await leerCelulas(request, adm, lider.id);
      expect(g2.body.vigentes).toHaveLength(2);
      expect(g2.body.historial.filter((h) => h.celula.nombre === "CEL-B")).toHaveLength(2);
    } finally {
      await desactivarUsuario(request, adm, lider.id);
    }
  });

  test("[E7-B01#2] T08: el único administrador activo no puede cambiar su propio rol (ULTIMO_ADMINISTRADOR)", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const contrasena = "Quality360Prueba#B01!";
    const admin = await crearUsuarioE7(request, adm, "ADMINISTRADOR", { prefijo: "b01-ultimo-admin" });
    await fijarContrasena(admin.id, contrasena);
    const sesion = await iniciarSesion(admin.correo, contrasena);
    const previos = await conOrganizacion(async (c) => {
      const ids = (
        await c.query<{ id: string }>(
          `SELECT u.id_usuario AS id FROM organizacion.usuario u JOIN organizacion.rol r ON r.id_rol = u.id_rol WHERE r.nombre = 'ADMINISTRADOR' AND u.activo AND u.id_usuario <> $1`,
          [admin.id],
        )
      ).rows.map((f) => f.id);
      await c.query(`UPDATE organizacion.usuario SET activo = false WHERE id_usuario = ANY($1::uuid[])`, [ids]);
      return ids;
    });
    try {
      const r = await api.put(request, `/v1/usuarios/${admin.id}/rol`, { token: sesion.accessToken, body: { rol: "AUDITOR" } });
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ codigo: "ULTIMO_ADMINISTRADOR" });
      // Y tampoco se le puede dejar como Líder con células (orden de validación D43: último administrador antes que relaciones).
    } finally {
      await conOrganizacion((c) => c.query(`UPDATE organizacion.usuario SET activo = true WHERE id_usuario = ANY($1::uuid[])`, [previos]));
      await desactivarUsuario(request, adm, admin.id);
    }
    expect((await api.get(request, "/v1/me", { token: adm })).status).toBe(200);
  });

  test("[E7-B01#3] T09: QE1, ANA1, LID1 y AUD1 reciben 403 ACCESO_DENEGADO al asignar células y al cambiar el rol, y nada cambia", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const celulas = await celulasFixture(request);
    const lider = await crearUsuarioE7(request, adm, "LIDER_QA", { prefijo: "b01-t09", celulaIds: [celulas["CEL-A"].id] });
    try {
      let intentos = 0;
      for (const clave of ["qe1", "ana1", "lid1", "aud1"] as ClaveE7[]) {
        const token = await tokenE7(clave);
        const a = await api.put(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token, body: { celulaIds: [celulas["CEL-B"].id] } });
        const b = await api.put(request, `/v1/usuarios/${lider.id}/rol`, { token, body: { rol: "AUDITOR" } });
        expect(a.status, `${clave} células`).toBe(403);
        expect(b.status, `${clave} rol`).toBe(403);
        expect(a.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
        expect(b.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
        intentos += 2;
      }
      expect(intentos).toBe(8);
      const g = await leerCelulas(request, adm, lider.id);
      expect(g.body.vigentes.map((v) => v.celula.nombre)).toEqual(["CEL-A"]);
      expect((await api.get<{ rol: string }>(request, `/v1/usuarios/${lider.id}`, { token: adm })).body.rol).toBe("LIDER_QA");
      // Leer las células de un Líder también es solo del Administrador.
      expect((await api.get(request, `/v1/usuarios/${lider.id}/celulas-lider`, { token: await tokenE7("lid1") })).status).toBe(403);
      // Registrar usuarios con rol Líder tampoco lo pueden hacer.
      const crea = await api.post(request, "/v1/usuarios", { token: await tokenE7("qe1"), body: { nombre: nombreUnico("No"), correo: correoUnico("no"), rol: "LIDER_QA" } });
      expect(crea.status).toBe(403);
    } finally {
      await desactivarUsuario(request, adm, lider.id);
    }
  });

  test("[E7-B01#3] T10: sin token, PUT celulas-lider y PUT rol responden 401 NO_AUTENTICADO", async ({ request }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    const a = await api.put(request, `/v1/usuarios/${id}/celulas-lider`, { body: { celulaIds: [] } });
    const b = await api.put(request, `/v1/usuarios/${id}/rol`, { body: { rol: "AUDITOR" } });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toMatchObject({ codigo: "NO_AUTENTICADO" });
    expect(b.body).toMatchObject({ codigo: "NO_AUTENTICADO" });
    expect(env.gatewayUrl).toBeTruthy();
  });
});
