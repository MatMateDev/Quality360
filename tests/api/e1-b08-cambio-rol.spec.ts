import { expect, test } from "@playwright/test";
import { fijarContrasena } from "../support/adminIdentidad";
import { api, iniciarSesion } from "../support/api";
import { conOrganizacion } from "../support/db";
import { env } from "../support/env";
import { crearUsuario } from "../support/fixtures";
import { correoUnico, nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B08 · Cambio de rol de un usuario", () => {
  test("[E1-B08#1] solo se aceptan roles del catálogo", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const nuevo = await crearUsuario(request, sesion.accessToken, {
      nombre: nombreUnico("QA Rol Catalogo"),
      correo: correoUnico("rol-catalogo"),
      rol: "ANALISTA_QA",
    });

    const respuesta = await api.put(request, `/v1/usuarios/${nuevo.id}/rol`, {
      token: sesion.accessToken,
      body: { rol: "SUPERADMIN_INEXISTENTE" },
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toMatchObject({ codigo: "VALIDACION" });
  });

  test("[E1-B08#3] un QE con analistas vigentes no puede pasar a Analista QA sin resolver la relación", async ({ request }) => {
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);

    const qeNuevo = await crearUsuario(request, sesionAdmin.accessToken, {
      nombre: nombreUnico("QE Relaciones"),
      correo: correoUnico("qe-relaciones"),
      rol: "QE",
    });
    const analistaNuevo = await crearUsuario(request, sesionAdmin.accessToken, {
      nombre: nombreUnico("QA Relaciones"),
      correo: correoUnico("qa-relaciones"),
      rol: "ANALISTA_QA",
    });

    const asignacion = await api.put(request, `/v1/analistas/${analistaNuevo.id}/supervisor`, {
      token: sesionAdmin.accessToken,
      body: { qeId: qeNuevo.id },
    });
    expect(asignacion.status).toBe(200);

    const cambio = await api.put<{ codigo: string; relaciones: { analistasVigentes: Array<{ id: string }> } }>(
      request,
      `/v1/usuarios/${qeNuevo.id}/rol`,
      { token: sesionAdmin.accessToken, body: { rol: "ANALISTA_QA" } },
    );

    expect(cambio.status).toBe(409);
    expect(cambio.body).toMatchObject({ codigo: "RELACIONES_INCOMPATIBLES" });
    expect(cambio.body.relaciones.analistasVigentes.map((a) => a.id)).toContain(analistaNuevo.id);
  });

  test("[E1-B08#2] se evita dejar la plataforma sin administradores activos", async ({ request }) => {
    const sesionAdmin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);

    // Administrador propio de la prueba, autenticable (password fijada con la
    // Admin API), para no arriesgar nunca la sesión de Patricia.
    const contrasenaFA = "Quality360Prueba#B08!";
    const adminFA = await crearUsuario(request, sesionAdmin.accessToken, {
      nombre: nombreUnico("Admin Ultimo"),
      correo: correoUnico("admin-ultimo"),
      rol: "ADMINISTRADOR",
    });
    await fijarContrasena(adminFA.id, contrasenaFA);
    const sesionFA = await iniciarSesion(adminFA.correo, contrasenaFA);

    // Se reduce el conteo global de administradores activos a solo `adminFA`,
    // directamente en Postgres (rol `svc_organizacion`, mismo esquema que usa
    // Organización): así nunca se pasa por el flujo HTTP de Patricia y su
    // sesión sigue intacta durante y después de la prueba (columna `activo`,
    // no el token: D4).
    const idsRestaurar = await conOrganizacion(async (cliente) => {
      const previos = await cliente.query<{ id: string }>(
        `SELECT id FROM organizacion.usuario WHERE rol = 'ADMINISTRADOR' AND activo = true AND id <> $1`,
        [adminFA.id],
      );
      await cliente.query(`UPDATE organizacion.usuario SET activo = false WHERE rol = 'ADMINISTRADOR' AND activo = true AND id <> $1`, [adminFA.id]);
      return previos.rows.map((fila) => fila.id);
    });

    try {
      const soloUno = await conOrganizacion((cliente) => cliente.query(`SELECT count(*)::int AS total FROM organizacion.usuario WHERE rol = 'ADMINISTRADOR' AND activo = true`));
      expect(soloUno.rows[0].total).toBe(1);

      const intento = await api.put(request, `/v1/usuarios/${adminFA.id}/rol`, {
        token: sesionFA.accessToken,
        body: { rol: "QE" },
      });

      expect(intento.status).toBe(409);
      expect(intento.body).toMatchObject({ codigo: "ULTIMO_ADMINISTRADOR" });
    } finally {
      // Restaura exactamente lo que había, pase o no la prueba.
      await conOrganizacion((cliente) => cliente.query(`UPDATE organizacion.usuario SET activo = true WHERE id = ANY($1::uuid[])`, [idsRestaurar]));
    }

    // Patricia sigue activa y utilizable para el resto de la suite.
    const perfilPatricia = await api.get(request, "/v1/me", { token: sesionAdmin.accessToken });
    expect(perfilPatricia.status).toBe(200);
    expect(perfilPatricia.body).toMatchObject({ correo: USUARIOS_SEMILLA.patricia.correo });

    // Limpieza: el administrador de la prueba no queda activo de más.
    await api.patch(request, `/v1/usuarios/${adminFA.id}`, { token: sesionAdmin.accessToken, body: { activo: false } });
  });
});
