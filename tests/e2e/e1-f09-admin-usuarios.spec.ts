import path from "node:path";
import { expect, test } from "@playwright/test";
import { crearUsuario } from "../support/fixtures";
import { env } from "../support/env";
import { correoUnico, nombreUnico } from "../support/unique";
import { iniciarSesion } from "../support/api";
import { clicConReintentoPorLimiteTasa } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.use({ storageState: path.join(import.meta.dirname, "..", ".auth", "patricia.json") });

const PATRON_URL_USUARIO = /\/v1\/usuarios\/[^/]+$/;

test.describe("E1-F09 · Administración de usuarios", () => {
  test("[E1-F09#1] lista usuarios y el buscador filtra por nombre o correo", async ({ page, request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const nombreBase = nombreUnico("Buscador Unico F09");
    const creado = await crearUsuario(request, sesion.accessToken, { nombre: nombreBase, correo: correoUnico("buscador-f09"), rol: "ANALISTA_QA" });

    await page.goto(`${env.portalUrl}/admin/usuarios`);
    // Hay más de una página de usuarios (la pantalla no pagina): se listan
    // filas, y el buscador reduce el resultado a coincidencias reales.
    await expect(page.locator("tbody tr").first()).toBeVisible();

    // Se busca por el correo único generado (no por el prefijo del nombre):
    // correr la suite varias veces deja más de un "Buscador Unico F09" con
    // sufijos distintos, y el correo sí es exclusivo de esta ejecución.
    await page.getByLabel("Buscar por nombre o correo").fill(creado.correo);
    await expect(page.getByTestId(`fila-usuario-${creado.id}`)).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });

  test("[E1-F09#2] valida los datos obligatorios al registrar un usuario", async ({ page }) => {
    await page.goto(`${env.portalUrl}/admin/usuarios`);
    await page.getByRole("button", { name: "+ Nuevo usuario" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo usuario" });
    await expect(dialogo).toBeVisible();

    await dialogo.getByRole("button", { name: "Crear" }).click();

    await expect(dialogo.getByText("El nombre es obligatorio.")).toBeVisible();
    await expect(dialogo.getByText("El correo es obligatorio.")).toBeVisible();
    // El diálogo sigue abierto: no se creó nada.
    await expect(dialogo).toBeVisible();
  });

  test("[E1-F09#3] pide confirmación antes de desactivar un usuario y muestra el resultado", async ({ page, request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.patricia.correo, env.contrasenaDemo);
    const creado = await crearUsuario(request, sesion.accessToken, {
      nombre: nombreUnico("Desactivar Desde UI"),
      correo: correoUnico("desactivar-ui"),
      rol: "ANALISTA_QA",
    });

    await page.goto(`${env.portalUrl}/admin/usuarios`);
    await page.getByLabel("Buscar por nombre o correo").fill(creado.correo);

    const fila = page.getByTestId(`fila-usuario-${creado.id}`);
    await expect(fila).toBeVisible();
    await fila.getByRole("button", { name: "Desactivar" }).click();

    const dialogo = page.getByRole("dialog", { name: "Desactivar usuario" });
    await expect(dialogo).toBeVisible();
    await clicConReintentoPorLimiteTasa(page, dialogo.getByRole("button", { name: "Desactivar" }), PATRON_URL_USUARIO);

    await expect(dialogo).toHaveCount(0);
    await expect(fila.getByText("Inactivo")).toBeVisible();
  });
});
