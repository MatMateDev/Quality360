import { expect, test } from "@playwright/test";
import { env } from "../support/env";
import { type GatewayCaido, type PortalCaido, levantarGatewayConFuenteCaida, levantarPortalCaido } from "../support/entornoCaido";
import { esperarPortal, iniciarSesionUI } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

/**
 * E1-F03#3 y E1-F06#3: el portal debe decir «no disponible», nunca 0, cuando
 * la fuente de historias no responde. Se levanta una segunda instancia del
 * gateway (con `FUENTE_RESUMEN_HDU_URL` apuntando a un puerto muerto) y una
 * segunda instancia del portal apuntando a ella; el stack principal
 * (`:3000`/`:5173`) no se toca.
 *
 * Interpretación (acordada con el arquitecto, igual que E2-B02#3): dado que
 * el diseño (regla no negociable #4) representa la caída de una fuente como
 * un bloque `indisponible` dentro de una respuesta 200 — nunca como un error
 * de solicitud completo —, ambos escenarios se verifican comprobando que el
 * bloque de HDU muestra el texto de «no disponible» (`BloqueEstado`,
 * `estado=indisponible`), mientras el otro bloque de la misma pantalla sigue
 * mostrando datos reales: así se distingue de cargando, de vacío (cero
 * explícito) y de un error de solicitud completo.
 */
test.describe("Fuente de HDU caída", () => {
  let gatewayCaido: GatewayCaido;
  let portalCaido: PortalCaido;

  test.beforeAll(async () => {
    gatewayCaido = await levantarGatewayConFuenteCaida({
      FUENTE_RESUMEN_HDU_URL: `http://127.0.0.1:${env.fuenteMuertaPuerto}`,
    });
    portalCaido = await levantarPortalCaido(gatewayCaido.url);
  });

  test.afterAll(async () => {
    await portalCaido?.detener();
    await gatewayCaido?.detener();
  });

  test("[E1-F03#3] el panel del QE distingue la fuente de HDU indisponible de un error o de cero", async ({ page }) => {
    await iniciarSesionUI(page, USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo, portalCaido.url);
    await esperarPortal(page, "QE");

    await expect(page.getByTestId("bloque-hdu-qe-indisponible")).toContainText("Esta información no está disponible en este momento.");
    // El otro bloque de la misma pantalla sigue sano: la caída es parcial.
    await expect(page.getByTestId("tarjeta-equipo")).toContainText(/\d+/);
  });

  test("[E1-F06#3] el panel del Analista QA indica que el conteo de historias no está disponible (nunca 0)", async ({ page }) => {
    await iniciarSesionUI(page, USUARIOS_SEMILLA.ana.correo, env.contrasenaDemo, portalCaido.url);
    await esperarPortal(page, "ANALISTA_QA");

    await expect(page.getByTestId("bloque-hdu-qa-indisponible")).toContainText("Esta información no está disponible en este momento.");
    await expect(page.getByTestId("valor-supervisor")).toHaveText(USUARIOS_SEMILLA.carla.nombre);
  });
});

/** E1-F08#2: misma mecánica, con la fuente de supervisión (no la de HDU) caída para el panel del Administrador. */
test.describe("Fuente de supervisión caída (panel del Administrador)", () => {
  let gatewayCaido: GatewayCaido;
  let portalCaido: PortalCaido;

  test.beforeAll(async () => {
    gatewayCaido = await levantarGatewayConFuenteCaida({
      FUENTE_RESUMEN_SUPERVISION_URL: `http://127.0.0.1:${env.fuenteMuertaPuerto}`,
    });
    portalCaido = await levantarPortalCaido(gatewayCaido.url);
  });

  test.afterAll(async () => {
    await portalCaido?.detener();
    await gatewayCaido?.detener();
  });

  test("[E1-F08#2] informa el error de carga de supervisión sin mostrar cifras ficticias", async ({ page }) => {
    await iniciarSesionUI(page, USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo, portalCaido.url);
    await esperarPortal(page, "ADMINISTRADOR");

    await expect(page.getByTestId("bloque-supervision-vigentes-indisponible")).toContainText("Esta información no está disponible en este momento.");
    await expect(page.getByTestId("bloque-supervision-sin-supervisor-indisponible")).toBeVisible();
    // El bloque de usuarios, de otra fuente, sigue sano.
    await expect(page.getByTestId("tarjeta-usuarios-total")).toContainText(/\d+/);
  });
});
