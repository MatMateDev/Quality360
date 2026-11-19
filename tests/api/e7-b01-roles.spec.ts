import { expect, test } from "@playwright/test";
import { fijarContrasena } from "../support/adminIdentidad";
import { api, iniciarSesion } from "../support/api";
import { cumpleContrato } from "../support/contrato";
import { conOrganizacion } from "../support/db";
import { env } from "../support/env";
import { crearUsuarioE7, desactivarUsuario, tokenE7, type ClaveE7 } from "../support/e7";
import { correoUnico, nombreUnico } from "../support/unique";

interface PaginaAuditoria {
  items: Array<{ operacion: string; actor: { nombre: string }; usuarioAfectado: { id: string } | null; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null }>;
  total: number;
}
interface ErrorValidacion {
  codigo: string;
  detalles: Array<{ campo: string; codigo: string }>;
}

/**
 * E7-B01 tras D208: el catálogo tiene 4 roles y el rol Líder QA se retiró junto con sus células. Los escenarios de
 * células (E7-B01#2 T04 a T07) quedan retirados; aquí se comprueba además que el rol, las rutas y los campos ya no existen.
 */
test.describe("E7-B01 · Rol Auditor y catálogo de 4 roles (sin Líder QA, D208)", () => {
  test("[E7-B01#1] T01: el catálogo ofrece 4 roles, AUDITOR de solo lectura; en la base no quedan LIDER_QA ni celula_lider", async ({ request }) => {
    const r = await api.get<{ items: Array<{ codigo: string; nombre: string; soloLectura: boolean }> }>(request, "/v1/roles", { token: await tokenE7("adm1") });
    expect(r.status).toBe(200);
    expect(r.body.items.map((x) => x.codigo).sort()).toEqual(["ADMINISTRADOR", "ANALISTA_QA", "AUDITOR", "QE"]);
    expect(Object.fromEntries(r.body.items.map((x) => [x.codigo, x.soloLectura]))).toEqual({ ADMINISTRADOR: false, ANALISTA_QA: false, AUDITOR: true, QE: false });
    expect(cumpleContrato("ListaRoles", r.body).errores).toEqual([]);

    const enBase = await conOrganizacion(async (c) => ({
      roles: (await c.query<{ nombre: string }>(`SELECT nombre FROM organizacion.rol ORDER BY nombre`)).rows.map((f) => f.nombre),
      tabla: (await c.query<{ t: string | null }>(`SELECT to_regclass('organizacion.celula_lider')::text AS t`)).rows[0]!.t,
    }));
    expect(enBase.roles).toEqual(["ADMINISTRADOR", "ANALISTA_QA", "AUDITOR", "QE"]);
    expect(enBase.tabla).toBeNull();
  });

  test("[E7-B01#1] T02: ADM1 cambia a un analista a AUDITOR en una sola llamada; la auditoría registra el rol anterior y el nuevo", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t02" });
    try {
      const rol = await api.put(request, `/v1/usuarios/${ana.id}/rol`, { token: adm, body: { rol: "AUDITOR" } });
      expect(rol.status).toBe(200);
      expect(rol.body).toMatchObject({ rol: "AUDITOR" });

      const aud = await api.get<PaginaAuditoria>(request, `/v1/auditor/auditoria-usuarios?usuarioAfectadoId=${ana.id}&tamanoPagina=50`, { token: await tokenE7("aud1") });
      expect(aud.status).toBe(200);
      const propias = aud.body.items.filter((e) => e.usuarioAfectado?.id === ana.id);
      const cambio = propias.find((e) => e.operacion === "CAMBIAR_ROL");
      expect(cambio?.actor.nombre).toContain("ADM1");
      expect(cambio?.antes).toEqual({ rol: "ANALISTA_QA" });
      expect(cambio?.despues).toEqual({ rol: "AUDITOR" });
      expect(propias.some((e) => e.operacion === "ASIGNAR_CELULAS_LIDER")).toBe(false);
    } finally {
      await desactivarUsuario(request, adm, ana.id);
    }
  });

  test("[E7-B01#2] T03: un rol fuera del catálogo (SUPERVISOR o el retirado LIDER_QA) responde 400 VALOR_NO_PERMITIDO, en el cambio y en el alta", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const u = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t03" });
    try {
      for (const rol of ["SUPERVISOR", "LIDER_QA"]) {
        const r = await api.put<ErrorValidacion>(request, `/v1/usuarios/${u.id}/rol`, { token: adm, body: { rol } });
        expect(r.status, `cambio a ${rol}`).toBe(400);
        expect(r.body.codigo).toBe("VALIDACION");
        expect(r.body.detalles).toEqual(expect.arrayContaining([expect.objectContaining({ campo: "rol", codigo: "VALOR_NO_PERMITIDO" })]));

        const alta = await api.post<ErrorValidacion>(request, "/v1/usuarios", { token: adm, body: { nombre: nombreUnico("QA E7 b01-t03"), correo: correoUnico("b01-t03-alta"), rol } });
        expect(alta.status, `alta con ${rol}`).toBe(400);
        expect(alta.body.codigo).toBe("VALIDACION");
      }
      expect((await api.get<{ rol: string }>(request, `/v1/usuarios/${u.id}`, { token: adm })).body.rol).toBe("ANALISTA_QA");
      // AUDITOR sí está en el catálogo.
      expect((await api.put(request, `/v1/usuarios/${u.id}/rol`, { token: adm, body: { rol: "AUDITOR" } })).status).toBe(200);
    } finally {
      await desactivarUsuario(request, adm, u.id);
    }
  });

  test("[D208] T04: `celulaIds` ya no es un campo del cambio de rol ni del alta: 400 VALIDACION y nada cambia", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t04" });
    try {
      const r = await api.put<ErrorValidacion>(request, `/v1/usuarios/${ana.id}/rol`, { token: adm, body: { rol: "AUDITOR", celulaIds: [] } });
      expect(r.status).toBe(400);
      expect(r.body.codigo).toBe("VALIDACION");
      expect((await api.get<{ rol: string }>(request, `/v1/usuarios/${ana.id}`, { token: adm })).body.rol).toBe("ANALISTA_QA");

      const correo = correoUnico("b01-t04-alta");
      const alta = await api.post<ErrorValidacion & { id?: string }>(request, "/v1/usuarios", { token: adm, body: { nombre: nombreUnico("QA E7 b01-t04"), correo, rol: "AUDITOR", celulaIds: [] } });
      if (alta.status === 201 && alta.body.id) await desactivarUsuario(request, adm, alta.body.id);
      expect(alta.status).toBe(400);
      expect(alta.body.codigo).toBe("VALIDACION");
    } finally {
      await desactivarUsuario(request, adm, ana.id);
    }
  });

  test("[D208] T05: las rutas de las células del Líder y su bandeja ya no existen (404)", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t05" });
    try {
      expect((await api.get(request, `/v1/usuarios/${ana.id}/celulas-lider`, { token: adm })).status).toBe(404);
      expect((await api.put(request, `/v1/usuarios/${ana.id}/celulas-lider`, { token: adm, body: { celulaIds: [] } })).status).toBe(404);
      expect((await api.get(request, "/v1/bandeja/lider", { token: adm })).status).toBe(404);
    } finally {
      await desactivarUsuario(request, adm, ana.id);
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
    } finally {
      await conOrganizacion((c) => c.query(`UPDATE organizacion.usuario SET activo = true WHERE id_usuario = ANY($1::uuid[])`, [previos]));
      await desactivarUsuario(request, adm, admin.id);
    }
    expect((await api.get(request, "/v1/me", { token: adm })).status).toBe(200);
  });

  test("[E7-B01#3] T09: QE1, ANA1 y AUD1 reciben 403 ACCESO_DENEGADO al cambiar el rol y al registrar usuarios, y nada cambia", async ({ request }) => {
    const adm = await tokenE7("adm1");
    const ana = await crearUsuarioE7(request, adm, "ANALISTA_QA", { prefijo: "b01-t09" });
    try {
      let intentos = 0;
      for (const clave of ["qe1", "ana1", "aud1"] as ClaveE7[]) {
        const token = await tokenE7(clave);
        const r = await api.put(request, `/v1/usuarios/${ana.id}/rol`, { token, body: { rol: "AUDITOR" } });
        expect(r.status, `${clave} rol`).toBe(403);
        expect(r.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
        const crea = await api.post(request, "/v1/usuarios", { token, body: { nombre: nombreUnico("No"), correo: correoUnico("no"), rol: "AUDITOR" } });
        expect(crea.status, `${clave} alta`).toBe(403);
        intentos += 2;
      }
      expect(intentos).toBe(6);
      expect((await api.get<{ rol: string }>(request, `/v1/usuarios/${ana.id}`, { token: adm })).body.rol).toBe("ANALISTA_QA");
    } finally {
      await desactivarUsuario(request, adm, ana.id);
    }
  });

  test("[E7-B01#3] T10: sin token, PUT rol responde 401 NO_AUTENTICADO", async ({ request }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    const r = await api.put(request, `/v1/usuarios/${id}/rol`, { body: { rol: "AUDITOR" } });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ codigo: "NO_AUTENTICADO" });
    expect(env.gatewayUrl).toBeTruthy();
  });
});
