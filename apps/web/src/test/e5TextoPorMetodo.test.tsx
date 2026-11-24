// DEF-E5O-02 · el texto de error de «Probar» y «Probar y guardar» lo decide el método de la acción (el elegido), no el guardado.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ID } from "@/mocks/data";
import { modoE5, oauthConectada, prepararOauth } from "@/mocks/dataE5";
import { abrirComo } from "./renderApp";
import { ADMIN } from "./ayudasOauth";

const TEXTO_OAUTH = "No encontramos el proyecto. Revisa la clave; también puede ser que la cuenta de Jira conectada no tenga permiso para verlo.";
const TEXTO_API = "No encontramos el proyecto en Jira.";

async function abrir() {
  await abrirComo(ADMIN, "/admin/integraciones");
  await screen.findByTestId("form-jira");
}

describe("DEF-E5O-02 · texto por el método de la acción en curso", () => {
  it("OAuth elegido con API token guardado: «Probar y guardar» usa el texto de OAuth", async () => {
    const user = userEvent.setup();
    prepararOauth("API_TOKEN", oauthConectada());
    modoE5.prueba = "JIRA_PROYECTO_NO_ENCONTRADO";
    await abrir();
    await user.click(screen.getByTestId("opcion-oauth"));
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(await screen.findByTestId("error-conexion")).toHaveTextContent(TEXTO_OAUTH);
  });

  it("OAuth elegido con API token guardado: «Probar sin guardar» y el texto de sin permiso", async () => {
    const user = userEvent.setup();
    prepararOauth("API_TOKEN", oauthConectada());
    modoE5.prueba = "JIRA_SIN_PERMISO";
    await abrir();
    await user.click(screen.getByTestId("opcion-oauth"));
    await user.click(screen.getByTestId("boton-probar"));
    expect(await screen.findByTestId("error-conexion")).toHaveTextContent("La cuenta de Jira conectada no tiene permiso para leer este proyecto.");
  });

  it("API token elegido con OAuth guardado: conserva los textos certificados del API token", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    modoE5.prueba = "JIRA_PROYECTO_NO_ENCONTRADO";
    await abrir();
    await user.click(screen.getByTestId("opcion-api-token"));
    await user.type(screen.getByTestId("campo-sitio"), "https://su-empresa.atlassian.net");
    await user.type(screen.getByTestId("campo-correo"), "admin@empresa.com");
    await user.type(screen.getByTestId("campo-token"), "q360-token-nuevo-EF56");
    await user.click(screen.getByTestId("boton-probar"));
    expect(await screen.findByTestId("error-conexion")).toHaveTextContent(TEXTO_API);
  });

  it("sin configuración guardada y OAuth conectado: «Probar y guardar» usa el texto de OAuth", async () => {
    const user = userEvent.setup();
    prepararOauth(null, oauthConectada());
    modoE5.prueba = "JIRA_PROYECTO_NO_ENCONTRADO";
    await abrir();
    await user.type(screen.getByTestId("campo-proyecto"), "QTY");
    await user.selectOptions(screen.getByTestId("campo-celula"), ID.celClientes);
    await user.selectOptions(screen.getByTestId("campo-qe"), ID.qe2);
    await waitFor(() => expect(within(screen.getByTestId("campo-sprint")).getAllByRole("option").length).toBeGreaterThan(1));
    await user.selectOptions(screen.getByTestId("campo-sprint"), "c3000000-0000-4000-8000-0000000000e2");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(await screen.findByTestId("error-conexion")).toHaveTextContent(TEXTO_OAUTH);
  });

  it("«Probar conexión» de la tarjeta usa el método activo", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    modoE5.prueba = "JIRA_SIN_PERMISO";
    await abrir();
    await user.click(screen.getByTestId("boton-probar-conexion"));
    expect(await screen.findByTestId("error-conexion")).toHaveTextContent("La cuenta de Jira conectada no tiene permiso");
  });

  it("Consultar Jira sigue usando el método guardado (FO7)", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    modoE5.consulta = "fallida-credencial";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    await user.click(await screen.findByTestId("boton-consultar-jira"));
    expect(await screen.findByTestId("error-consulta")).toBeInTheDocument();
  });
});
