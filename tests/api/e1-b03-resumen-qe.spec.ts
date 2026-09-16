import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { type GatewayCaido, levantarGatewayConFuenteCaida } from "../support/entornoCaido";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B03 · Resumen de inicio del QE", () => {
  test("[E1-B03#1] calcula equipo e historias solo sobre datos autorizados del QE", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const respuesta = await api.get<{ equipo: { estado: string; datos?: { analistasVigentes: number } }; hdu: { estado: string; datos?: { hduEnAmbito: number } } }>(
      request,
      "/v1/inicio/qe",
      { token: sesion.accessToken },
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.equipo.estado).toBe("ok");
    expect(respuesta.body.equipo.datos?.analistasVigentes).toBeGreaterThanOrEqual(2); // Ana y Beatriz, como mínimo
    expect(respuesta.body.hdu.estado).toBe("ok");
    expect(respuesta.body.hdu.datos?.hduEnAmbito).toBeGreaterThanOrEqual(6); // HDU-PAG-001..006
  });

  test("[E1-B03#2] la consulta válida sin registros devuelve cero, no un error", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.sofia.correo, env.contrasenaDemo);
    const respuesta = await api.get<{ equipo: { estado: string; datos?: { analistasVigentes: number } } }>(
      request,
      "/v1/inicio/qe",
      { token: sesion.accessToken },
    );

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.equipo).toMatchObject({ estado: "ok", datos: { analistasVigentes: 0 } });
  });

  test("[E1-B03#3] si la fuente de historias no responde, se informa que no está disponible (nunca cero)", async ({ request }) => {
    let gatewayCaido: GatewayCaido | undefined;
    try {
      gatewayCaido = await levantarGatewayConFuenteCaida({
        FUENTE_RESUMEN_HDU_URL: `http://127.0.0.1:${env.fuenteMuertaPuerto}`,
      });

      const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
      const respuesta = await api.get<{ equipo: { estado: string }; hdu: { estado: string; datos?: unknown } }>(
        request,
        "/v1/inicio/qe",
        { token: sesion.accessToken, baseURL: gatewayCaido.url },
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.equipo.estado).toBe("ok"); // la otra fuente sigue sana
      expect(respuesta.body.hdu.estado).toBe("indisponible");
      expect(respuesta.body.hdu.datos).toBeUndefined();
    } finally {
      await gatewayCaido?.detener();
    }
  });
});
