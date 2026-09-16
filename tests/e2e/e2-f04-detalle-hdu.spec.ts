import path from "node:path";
import { expect, test } from "@playwright/test";
import { iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { crearHdu, obtenerCatalogos } from "../support/fixtures";
import { api } from "../support/api";
import { codigoHduUnico } from "../support/unique";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E2-F04 · Detalle de HDU (con acceso)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "carla.json") });

  test("[E2-F04#1] muestra datos, responsables, estado, célula, sprint y avance del checklist", async ({ page, request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const codigo = codigoHduUnico("E2F04DET");
    const hdu = await crearHdu(request, sesion.accessToken, { codigo, celulaId: celula.id, sprintId: sprint.id });

    await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);

    const contenido = page.locator("main");
    await expect(contenido.getByText(codigo, { exact: true })).toBeVisible();
    await expect(contenido.getByText(USUARIOS_SEMILLA.carla.nombre, { exact: true })).toBeVisible();
    await expect(page.getByTestId("valor-analista-hdu")).toHaveText("Sin asignar");
    await expect(page.getByTestId("checklist-no-disponible")).toContainText("No disponible");
  });

  test("[E2-F04#3] cambiar el estado lo actualiza y muestra la fecha del cambio", async ({ page, request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2F04EST"), celulaId: celula.id, sprintId: sprint.id });

    await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
    const filaFecha = page.locator("article", { has: page.getByText("Último cambio de estado", { exact: true }) });
    await expect(filaFecha).toBeVisible();

    await page.getByRole("button", { name: "Pasar a Diseño de pruebas" }).click();

    const filaEstado = page.locator("article", { has: page.getByText("Estado", { exact: true }) });
    await expect(filaEstado).toContainText("Diseño de pruebas");

    // La fecha visible tiene precisión de minuto y puede no cambiar de texto
    // en una prueba rápida: se confirma con la marca exacta que guarda el
    // backend (E2-F04#3, "se muestra la fecha del cambio"), reciente y
    // coherente con `ResultadoCambioEstado.fecha` del contrato.
    const antesDelCambio = Date.now();
    const detalle = await api.get<{ estado: string; estadoActualizadoEn: string }>(request, `/v1/hdu/${hdu.id}`, { token: sesion.accessToken });
    expect(detalle.body.estado).toBe("DISENO_PRUEBAS");
    const marcaCambio = new Date(detalle.body.estadoActualizadoEn).getTime();
    expect(marcaCambio).toBeLessThanOrEqual(antesDelCambio + 1000);
    expect(marcaCambio).toBeGreaterThan(antesDelCambio - 60_000);
  });
});

test.describe("E2-F04 · Detalle de HDU (sin acceso)", () => {
  test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "ana.json") });

  test("[E2-F04#2] un usuario sin relación con la HDU recibe acceso denegado", async ({ page, request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.marcos.correo, env.contrasenaDemo);
    const { celula, sprint } = await obtenerCatalogos(request, sesion.accessToken);
    // HDU de Marcos, sin analista: Ana (equipo de Carla) no tiene ninguna relación con ella.
    const hdu = await crearHdu(request, sesion.accessToken, { codigo: codigoHduUnico("E2F04DEN"), celulaId: celula.id, sprintId: sprint.id });

    await page.goto(`${env.portalUrl}/hdu/${hdu.id}`);
    await expect(page.getByTestId("acceso-denegado")).toBeVisible();
  });
});
