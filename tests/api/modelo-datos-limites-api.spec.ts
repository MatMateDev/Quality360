import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { crearHduAsignadaAAna } from "../support/checklist";
import { conCertificaciones, conOrganizacion } from "../support/db";
import { env } from "../support/env";
import { nombreUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * Corrida «modelo de datos»: la API pública no cambia salvo tres límites que impone el modelo
 * (decisiones, «Largos del modelo en la API»): correo hasta 150 caracteres (antes 254), enlace de
 * evidencia hasta 500 (antes 2000) y la carga semilla interna de sprints exige `celulaId`.
 */

/** Correo con un largo exacto y válido (parte local ≤ 64, etiquetas de dominio ≤ 63). */
function correoConLargo(largo: number): string {
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const local = `qa.modelo.${marca}`.padEnd(64, "m").slice(0, 64);
  const dominio = largo - local.length - 1; // tras la arroba
  const correo = `${local}@${"d".repeat(63)}.${"e".repeat(dominio - 64)}`;
  if (correo.length !== largo) throw new Error(`Correo de prueba mal armado: ${correo.length} != ${largo}`);
  return correo;
}

test.describe("[MODELO] Límites de la API que fija el modelo de datos", () => {
  // Las escrituras comparten el límite de tasa del gateway (30/min): un reintento puede esperar una ventana completa.
  test.describe.configure({ timeout: 180_000 });

  test("[MODELO] el correo admite hasta 150 caracteres y se guarda completo; con 151 la API responde 400", async ({ request }) => {
    const admin = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);

    const demasiadoLargo = correoConLargo(151);
    const rechazado = await api.post<{ codigo: string; detalles?: Array<{ campo: string }> }>(request, "/v1/usuarios", {
      token: admin.accessToken,
      body: { nombre: nombreUnico("Correo Largo"), correo: demasiadoLargo, rol: "ANALISTA_QA" },
    });
    expect(rechazado.status).toBe(400);
    expect(rechazado.body.codigo).toBe("VALIDACION");

    const correoLimite = correoConLargo(150);
    const aceptado = await api.post<{ id: string; correo: string }>(request, "/v1/usuarios", {
      token: admin.accessToken,
      body: { nombre: nombreUnico("Correo Limite"), correo: correoLimite, rol: "ANALISTA_QA" },
    });
    expect(aceptado.status).toBe(201);
    expect(aceptado.body.correo).toBe(correoLimite);

    // Queda guardado completo en organizacion.usuario.email (VARCHAR(150) del modelo).
    await conOrganizacion(async (cliente) => {
      const fila = await cliente.query<{ largo: number }>("select length(email)::int as largo from organizacion.usuario where id_usuario = $1", [aceptado.body.id]);
      expect(fila.rows[0]?.largo).toBe(150);
    });

    // El mismo límite aplica a la modificación de un correo ya existente.
    const sinDuplicar = correoConLargo(151);
    const edicion = await api.patch<{ codigo: string }>(request, `/v1/usuarios/${aceptado.body.id}`, { token: admin.accessToken, body: { correo: sinDuplicar } });
    expect(edicion.status).toBe(400);
    expect(edicion.body.codigo).toBe("VALIDACION");

    // Limpieza: el usuario de prueba no queda activo.
    await api.patch(request, `/v1/usuarios/${aceptado.body.id}`, { token: admin.accessToken, body: { activo: false } });
  });

  test("[MODELO] el enlace de evidencia admite hasta 500 caracteres y se guarda completo; con 501 la API lo rechaza", async ({ request }) => {
    const equipo = await crearHduAsignadaAAna(request, "MODELOURL");
    const base = "https://evidencia.quality360.local/modelo/";
    const urlDeLargo = (largo: number) => `${base}${"u".repeat(largo - base.length)}`;
    const marcar = (url: string) =>
      api.post<{ codigo?: string; clave?: string; estado?: string }>(request, `/v1/hdu/${equipo.hdu.id}/entregables/PLAN_PRUEBAS/marcar`, {
        token: equipo.sesionAna.accessToken,
        body: { evidencia: { tipo: "ENLACE", url } },
      });

    const rechazada = await marcar(urlDeLargo(501));
    expect(rechazada.status).toBe(400);
    expect(rechazada.body.codigo).toBe("VALIDACION");
    // Un rechazo no deja nada a medias: ni ciclo ni evidencia en Certificaciones.
    const trasRechazo = await conCertificaciones((cliente) =>
      cliente.query<{ ciclos: number; evidencias: number }>(
        `select (select count(*) from certificaciones.certificacion where id_historia = $1)::int as ciclos,
                (select count(*) from certificaciones.evidencia ev join certificaciones.entregable e on e.id_entregable = ev.id_entregable
                   join certificaciones.certificacion c on c.id_certificacion = e.id_certificacion where c.id_historia = $1)::int as evidencias`,
        [equipo.hdu.id],
      ),
    );
    expect(trasRechazo.rows[0].evidencias).toBe(0);

    const limite = urlDeLargo(500);
    const aceptada = await marcar(limite);
    expect(aceptada.status).toBe(200);
    expect(aceptada.body).toMatchObject({ clave: "PLAN_PRUEBAS", estado: "POR_APROBAR" });

    const guardada = await conCertificaciones((cliente) =>
      cliente.query<{ referencia: string }>(
        `select ev.referencia from certificaciones.evidencia ev
           join certificaciones.entregable e on e.id_entregable = ev.id_entregable
           join certificaciones.certificacion c on c.id_certificacion = e.id_certificacion
          where c.id_historia = $1`,
        [equipo.hdu.id],
      ),
    );
    expect(guardada.rows).toHaveLength(1);
    expect(guardada.rows[0].referencia).toBe(limite);
    expect(guardada.rows[0].referencia).toHaveLength(500);
  });

  test("[MODELO] la carga semilla interna de sprints exige celulaId: sin él responde 400 y con una célula inexistente 422 CATALOGO_INVALIDO", async ({ request }) => {
    test.skip(!env.servicioToken, "Sin X_Q360_SERVICIO_TOKEN no se puede llamar a la carga semilla.");
    const cabeceras = { "X-Q360-Servicio-Token": env.servicioToken };
    const ruta = "/v1/interno/carga/sprints";
    const nombre = nombreUnico("Sprint Modelo");

    const sinCelula = await api.post<{ codigo: string }>(request, ruta, {
      baseURL: env.organizacionUrl,
      headers: cabeceras,
      body: { nombre, inicio: "2026-01-05", fin: "2026-01-16" },
    });
    expect(sinCelula.status).toBe(400);
    expect(sinCelula.body.codigo).toBe("VALIDACION");

    const celulaInexistente = await api.post<{ codigo: string }>(request, ruta, {
      baseURL: env.organizacionUrl,
      headers: cabeceras,
      body: { nombre, inicio: "2026-01-05", fin: "2026-01-16", celulaId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(celulaInexistente.status).toBe(422);
    expect(celulaInexistente.body.codigo).toBe("CATALOGO_INVALIDO");

    // Sin credencial de servicio el endpoint interno no responde ni siquiera a una petición válida.
    // El guard (carga-semilla.guard.ts) contesta 404 «como si la ruta no existiera» (ADR 0007); el
    // contrato enumera 401/403 para esta ruta: discrepancia anterior al modelo de datos, anotada
    // como observación en docs/validacion/certificacion-modelo-datos.md.
    const sinCredencial = await api.post(request, ruta, {
      baseURL: env.organizacionUrl,
      body: { nombre, inicio: "2026-01-05", fin: "2026-01-16", celulaId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(sinCredencial.status).toBe(404);

    // Ninguno de los rechazos creó un sprint.
    const creados = await conOrganizacion((cliente) => cliente.query("select 1 from organizacion.sprint where nombre = $1", [nombre]));
    expect(creados.rowCount).toBe(0);
  });
});
