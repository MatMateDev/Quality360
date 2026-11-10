import { expect, test } from "@playwright/test";
import { conCertificaciones, conImpedimentos, conIndicadores, conOrganizacion } from "../support/db";
import { env } from "../support/env";

/**
 * Escenario obligatorio (informe p. 15) «Aislamiento de datos»: el rol de
 * Postgres de un servicio no puede leer el esquema de otro
 * (`infrastructure/db/001_esquemas_roles.sql`, regla no negociable #1). No
 * tiene un ID de HU: es la verificación de arquitectura que pide la
 * definición de este agente, adicional a los 96 escenarios de E1/E2.
 *
 * Cada rol de servicio (`svc_organizacion`, `svc_certificaciones`,
 * `svc_impedimentos`) solo tiene `USAGE` sobre su propio esquema: cualquier
 * referencia a una tabla de otro esquema falla por falta de privilegio,
 * exista o no esa tabla (no se filtra ni siquiera si el esquema existe).
 */
test.describe("Aislamiento de esquemas por rol de servicio", () => {
  test("svc_organizacion puede leer su esquema pero no certificaciones, impedimentos ni indicadores", async () => {
    await conOrganizacion(async (cliente) => {
      const propio = await cliente.query('select count(*)::int as total from organizacion.usuario');
      expect(propio.rows[0].total).toBeGreaterThanOrEqual(0);

      await expect(cliente.query("select 1 from certificaciones.cualquier_tabla")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from impedimentos.cualquier_tabla")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from indicadores.cualquier_tabla")).rejects.toThrow(/permission denied/i);
    });
  });

  test("svc_certificaciones no puede leer organizacion, impedimentos ni indicadores", async () => {
    await conCertificaciones(async (cliente) => {
      await expect(cliente.query("select 1 from organizacion.usuario")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from impedimentos.cualquier_tabla")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from indicadores.cualquier_tabla")).rejects.toThrow(/permission denied/i);
    });
  });

  test("svc_impedimentos no puede leer organizacion, certificaciones ni indicadores", async () => {
    await conImpedimentos(async (cliente) => {
      await expect(cliente.query("select 1 from organizacion.usuario")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from certificaciones.cualquier_tabla")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from indicadores.cualquier_tabla")).rejects.toThrow(/permission denied/i);
    });
  });

  // E6 (D24): el esquema y el rol de Indicadores quedan aislados igual que los demás.
  test("[E6] svc_indicadores lee su esquema y no puede leer organizacion, certificaciones, impedimentos ni public", async () => {
    await conIndicadores(async (cliente) => {
      const rol = await cliente.query("select current_user as usuario, rolsuper, rolbypassrls from pg_roles where rolname = current_user");
      expect(rol.rows[0]).toMatchObject({ usuario: "svc_indicadores", rolsuper: false, rolbypassrls: false });
      const propio = await cliente.query("select count(*)::int as total from indicadores.snapshot_indicadores");
      expect(propio.rows[0].total).toBeGreaterThanOrEqual(0);

      await expect(cliente.query("select 1 from organizacion.usuario")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from organizacion.cierre_hdu")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from certificaciones.cualquier_tabla")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from impedimentos.cualquier_tabla")).rejects.toThrow(/permission denied/i);
      await expect(cliente.query("select 1 from public.cualquier_tabla")).rejects.toThrow(/permission denied/i);
    });
  });

  test("ningún rol de servicio alcanza el esquema public ni la Data API expone los esquemas de dominio", async ({ request }) => {
    await conOrganizacion(async (cliente) => {
      await expect(cliente.query("select 1 from public.cualquier_tabla")).rejects.toThrow(/permission denied/i);
    });

    // La Data API de PostgREST (anon/authenticated) no debe exponer las
    // tablas de organizacion: sin PostgREST configurado sobre ese esquema,
    // la ruta ni siquiera existe.
    const respuesta = await request.fetch(`${env.supabaseUrl}/rest/v1/usuario?select=*`, {
      headers: { apikey: env.supabaseAnonKey },
      failOnStatusCode: false,
    });
    expect(respuesta.status()).toBeGreaterThanOrEqual(400);
  });
});
