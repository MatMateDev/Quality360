import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { validarConexion } from "@/lib/validacionJira";
import { ID } from "@/mocks/data";
import { estadoConfig, modoE5, ultimosTokens } from "@/mocks/dataE5";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";
const TEXTO_DEL_SERVIDOR = "TEXTO-DEL-SERVIDOR-QUE-EL-PORTAL-NO-DEBE-MOSTRAR";

async function abrirConexion() {
  await abrirComo(ADMIN, "/admin/integraciones");
  await screen.findByTestId("form-jira");
  await screen.findByTestId("token-estado");
}

async function elegirDestino(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByTestId("campo-celula"), ID.celClientes);
  await user.selectOptions(screen.getByTestId("campo-qe"), ID.qe2);
  await waitFor(() => expect(within(screen.getByTestId("campo-sprint")).getAllByRole("option").length).toBeGreaterThan(1));
  await user.selectOptions(screen.getByTestId("campo-sprint"), "c3000000-0000-4000-8000-0000000000e2");
}

describe("E5-F01 · pestaña Conexión", () => {
  it("el campo del token es de contraseña, está vacío y no hay botón «mostrar» [E5-F01-T06]", async () => {
    await abrirConexion();
    const token = screen.getByTestId("campo-token");
    expect(token).toHaveAttribute("type", "password");
    expect(token).toHaveAttribute("autocomplete", "new-password");
    expect(token).toHaveValue("");
    expect(screen.getByTestId("token-estado")).toHaveTextContent("Configurado · termina en AB12");
    expect(screen.getByTestId("token-estado")).toHaveAttribute("data-configurado", "true");
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "OK");
    expect(screen.queryByRole("button", { name: /mostrar|ver token/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/API token/)).toBe(token);
  });

  it("con token guardado, vacío significa conservar: se guarda sin enviar el token y el campo queda vacío [E5-F01-T07]", async () => {
    const user = userEvent.setup();
    let cuerpo: Record<string, unknown> = {};
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "PUT" && request.url.endsWith("/v1/integraciones/jira/configuracion")) cuerpo = await request.clone().json();
    });
    await abrirConexion();
    await user.selectOptions(screen.getByTestId("campo-sprint"), "c3000000-0000-4000-8000-0000000000e2");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(await screen.findByTestId("mensaje-conexion-ok")).toHaveTextContent("Conexión exitosa con Jira como Admin Jira Falso");
    expect(screen.getByTestId("mensaje-conexion-ok")).toHaveTextContent("Configuración guardada.");
    expect("token" in cuerpo).toBe(false);
    expect(cuerpo.sprintRespaldoId).toBe("c3000000-0000-4000-8000-0000000000e2");
    expect(screen.getByTestId("campo-token")).toHaveValue("");
    server.events.removeAllListeners();
  });

  it("cambia el token, guarda y el campo se vacía; el valor no llega a la página ni al almacenamiento [E5-F01-T08, D116]", async () => {
    const user = userEvent.setup();
    await abrirConexion();
    await user.type(screen.getByTestId("campo-token"), "q360-token-nuevo-CD34");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    await screen.findByTestId("mensaje-conexion-ok");
    expect(ultimosTokens).toEqual(["q360-token-nuevo-CD34"]);
    expect(screen.getByTestId("campo-token")).toHaveValue("");
    await waitFor(() => expect(screen.getByTestId("token-estado")).toHaveTextContent("termina en CD34"));
    expect(document.body.innerHTML).not.toContain("q360-token-nuevo-CD34");
    expect(JSON.stringify({ ...localStorage })).not.toContain("q360-token-nuevo");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("q360-token-nuevo");
    // El evento se muestra como «API token (cambiado)», sin valor.
    const lista = await screen.findByTestId("lista-eventos-configuracion");
    await waitFor(() => expect(lista).toHaveTextContent("API token (cambiado)"));
    expect(lista.textContent).not.toContain("CD34");
  });

  it("una credencial rechazada muestra el mensaje del portal, no el del servidor, conserva la configuración y vacía el token [E5-F01-T03]", async () => {
    const user = userEvent.setup();
    modoE5.prueba = "JIRA_CREDENCIAL_INVALIDA";
    await abrirConexion();
    await user.type(screen.getByTestId("campo-token"), "token-malo-ZZ99");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    const error = await screen.findByTestId("error-conexion");
    expect(error).toHaveAttribute("data-codigo", "JIRA_CREDENCIAL_INVALIDA");
    expect(error).toHaveTextContent("Jira rechazó el correo o el API token. Revisa la conexión.");
    expect(error).toHaveTextContent("No se guardó nada: se conserva la configuración anterior.");
    expect(document.body.textContent).not.toContain(TEXTO_DEL_SERVIDOR);
    expect(document.body.textContent).not.toContain("token-malo-ZZ99");
    expect(document.body.textContent).not.toContain("Basic");
    expect(screen.getByTestId("campo-token")).toHaveValue("");
    expect(error).toHaveFocus();
    // Lo guardado antes sigue igual.
    expect(estadoConfig.actual.token.ultimos4).toBe("AB12");
  });

  it("«Probar sin guardar» no guarda y lo dice [E5-F01#2]", async () => {
    const user = userEvent.setup();
    await abrirConexion();
    await user.click(screen.getByTestId("boton-probar"));
    expect(await screen.findByTestId("mensaje-conexion-ok")).toHaveTextContent("No se guardaron cambios.");
  });

  it("valida al pulsar, marca cada campo y no envía ninguna petición [E5-F01-T05]", async () => {
    const user = userEvent.setup();
    let peticiones = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method !== "GET") peticiones += 1;
    });
    modoE5.configuracion = "vacia";
    await abrirComo(ADMIN, "/admin/integraciones");
    await screen.findByTestId("form-jira");
    expect(screen.getByTestId("token-estado")).toHaveTextContent("No configurado");
    expect(screen.getByTestId("campo-tipos")).toHaveValue("Story, Historia");
    await user.type(screen.getByTestId("campo-proyecto"), "qty-1");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(screen.getByTestId("error-campo-sitio")).toHaveTextContent("Ingresa la dirección del sitio de Jira");
    expect(screen.getByTestId("error-campo-correo")).toHaveTextContent("Ingresa el correo de la cuenta de Jira");
    expect(screen.getByTestId("error-campo-token")).toHaveTextContent("Ingresa el API token");
    expect(screen.getByTestId("error-campo-proyecto")).toHaveTextContent("La clave debe empezar con una letra mayúscula");
    expect(screen.getByTestId("error-campo-celula")).toHaveTextContent("Elige la célula destino");
    expect(screen.getByTestId("error-campo-qe")).toHaveTextContent("Elige el QE responsable");
    expect(screen.getByTestId("error-campo-sprint")).toHaveTextContent("Elige el sprint de respaldo");
    const sitio = screen.getByTestId("campo-sitio");
    expect(sitio).toHaveAttribute("aria-invalid", "true");
    expect(sitio).toHaveAccessibleDescription(/Ingresa la dirección del sitio de Jira/);
    expect(sitio).toHaveFocus();
    expect(peticiones).toBe(0);
    server.events.removeAllListeners();
  });

  it("primera configuración: llena el formulario, elige el destino por célula y guarda [E5-F01-T01]", async () => {
    const user = userEvent.setup();
    modoE5.configuracion = "vacia";
    await abrirComo(ADMIN, "/admin/integraciones");
    await screen.findByTestId("form-jira");
    await user.type(screen.getByTestId("campo-sitio"), "http://127.0.0.1:4010");
    await user.type(screen.getByTestId("campo-correo"), "admin@quality360.local");
    await user.type(screen.getByTestId("campo-token"), "q360-token-valido-AB12");
    await user.type(screen.getByTestId("campo-proyecto"), "QTY");
    await elegirDestino(user);
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(await screen.findByTestId("mensaje-conexion-ok")).toBeInTheDocument();
    // El sprint solo ofrece los de la célula elegida (D120).
    const opciones = within(screen.getByTestId("campo-sprint")).getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual(["Elige el sprint", "E5 Sprint 1", "E5 Sprint 2"]);
  });

  it("al cambiar de célula se limpia el sprint [D120]", async () => {
    const user = userEvent.setup();
    await abrirConexion();
    expect(screen.getByTestId("campo-sprint")).toHaveValue("c3000000-0000-4000-8000-0000000000e1");
    await user.selectOptions(screen.getByTestId("campo-celula"), ID.celTarjetas);
    expect(screen.getByTestId("campo-sprint")).toHaveValue("");
  });

  it("sin la llave de cifrado muestra el aviso y deja el formulario deshabilitado", async () => {
    modoE5.configuracion = "sin-llave";
    await abrirComo(ADMIN, "/admin/integraciones");
    expect(await screen.findByTestId("aviso-integracion-deshabilitada")).toHaveTextContent("La integración no está habilitada en el servidor");
    expect(screen.getByTestId("boton-probar-guardar")).toBeDisabled();
    expect(screen.getByTestId("campo-sitio")).toBeDisabled();
  });

  it("un token que no se puede descifrar vuelve obligatorio el campo [E5-F01#3]", async () => {
    const user = userEvent.setup();
    modoE5.configuracion = "no-descifrable";
    await abrirComo(ADMIN, "/admin/integraciones");
    expect(await screen.findByTestId("aviso-token-no-descifrable")).toHaveTextContent("Vuelve a ingresar el API token.");
    expect(screen.getByTestId("token-estado")).toHaveTextContent("No disponible: vuelve a ingresarlo");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(screen.getByTestId("error-campo-token")).toHaveTextContent("Ingresa el API token");
  });

  it("Integraciones caído: «No disponible» con Reintentar, y el resto de las pestañas sigue [E5-F01-T10]", async () => {
    const user = userEvent.setup();
    modoE5.configuracion = "indisponible";
    await abrirComo(ADMIN, "/admin/integraciones");
    const bloque = await screen.findByTestId("estado-indisponible-configuracion");
    expect(bloque).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("form-jira")).not.toBeInTheDocument();
    expect(screen.getByTestId("pestana-historial")).toBeInTheDocument();
    modoE5.configuracion = "ok";
    await user.click(within(bloque).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByTestId("form-jira")).toBeInTheDocument();
  });

  it("un error 500 de la configuración es «error», no «indisponible»", async () => {
    modoE5.configuracion = "error";
    await abrirComo(ADMIN, "/admin/integraciones");
    expect(await screen.findByTestId("estado-error-configuracion")).toBeInTheDocument();
    expect(screen.queryByTestId("estado-indisponible-configuracion")).not.toBeInTheDocument();
  });

  it("los cambios de configuración tienen su propio estado: si fallan, el formulario sigue operativo", async () => {
    modoE5.eventos = "indisponible";
    await abrirComo(ADMIN, "/admin/integraciones");
    expect(await screen.findByTestId("estado-indisponible-eventos-configuracion")).toBeInTheDocument();
    expect(screen.getByTestId("boton-probar-guardar")).toBeEnabled();
  });

  it("sin cambios registrados dice «Aún no hay cambios de configuración» [vacío]", async () => {
    modoE5.eventos = "vacio";
    await abrirComo(ADMIN, "/admin/integraciones");
    expect(await screen.findByTestId("estado-vacio-eventos-configuracion")).toHaveTextContent("Aún no hay cambios de configuración");
  });

  it("un 5xx al guardar muestra el mensaje global y conserva lo escrito salvo el token", async () => {
    const user = userEvent.setup();
    server.use(http.put(`${env.gatewayUrl}/v1/integraciones/jira/configuracion`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x", traceId: "t", detalles: [] }, { status: 500 })));
    await abrirConexion();
    await user.type(screen.getByTestId("campo-token"), "otro-token-9999");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(await screen.findByTestId("mensaje-error-global")).toHaveTextContent("No fue posible guardar. Intenta nuevamente.");
    expect(screen.getByTestId("campo-proyecto")).toHaveValue("QTY");
    expect(screen.getByTestId("campo-token")).toHaveValue("");
  });
});

describe("validarConexion [E5-F01]", () => {
  const completos = { sitio: "http://127.0.0.1:4010", correo: "a@b.cl", token: "t", proyecto: "QTY", tipos: "Story", celulaId: "c", qeId: "q", sprintId: "s" };

  it("acepta un sitio que no es atlassian.net (lo decide el servidor, D95)", () => {
    expect(validarConexion(completos, { requiereToken: true, incluirDestino: true })).toEqual({});
  });

  it("rechaza correo sin arroba, proyecto en minúsculas y más de 5 tipos", () => {
    const errores = validarConexion({ ...completos, correo: "sin-arroba", proyecto: "qty-1", tipos: "a,b,c,d,e,f" }, { requiereToken: true, incluirDestino: true });
    expect(Object.keys(errores).sort()).toEqual(["correo", "proyecto", "tipos"]);
  });

  it("el token vacío solo es válido si hay uno guardado", () => {
    expect(validarConexion({ ...completos, token: "" }, { requiereToken: false, incluirDestino: true })).toEqual({});
    expect(validarConexion({ ...completos, token: "" }, { requiereToken: true, incluirDestino: true }).token).toBe("Ingresa el API token");
  });
});
