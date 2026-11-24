// E5 · pestaña Conexión con OAuth (FO3 a FO7), contra los mocks que siguen el contrato.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { estadoConfig, estadoOauth, eventosConfig, modoE5, oauthConectada, oauthPendienteSitio, oauthReconexion, prepararOauth } from "@/mocks/dataE5";
import { abrirComo } from "./renderApp";
import { ADMIN, espiarNavegacion } from "./ayudasOauth";

const TEXTO_DEL_SERVIDOR = "TEXTO-DEL-SERVIDOR-QUE-EL-PORTAL-NO-DEBE-MOSTRAR";

async function abrirConexion() {
  await abrirComo(ADMIN, "/admin/integraciones");
  await screen.findByTestId("tarjeta-estado-conexion");
  await screen.findByTestId("form-jira");
}

function registrarPeticiones() {
  const hechas: Array<{ metodo: string; ruta: string; cuerpo: unknown }> = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "GET") return;
    const texto = await request.clone().text();
    hechas.push({ metodo: request.method, ruta: new URL(request.url).pathname, cuerpo: texto ? JSON.parse(texto) : undefined });
  });
  return hechas;
}

describe("E5-F08 · selector de método y botón «Conectar con Jira»", () => {
  it("sin configuración abre en OAuth, con el botón disponible y el API token a un clic [E5-F01#4]", async () => {
    modoE5.configuracion = "vacia";
    await abrirConexion();
    expect(screen.getByTestId("selector-metodo")).toHaveAccessibleName("Método de conexión");
    expect(screen.getByTestId("opcion-oauth")).toBeChecked();
    expect(screen.getByTestId("opcion-api-token")).not.toBeChecked();
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "sin-conectar");
    expect(screen.getByTestId("boton-conectar-jira")).toHaveAttribute("data-estado", "disponible");
    expect(screen.getByTestId("boton-conectar-jira")).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByTestId("campo-token")).not.toBeInTheDocument();
    expect(screen.getByTestId("aviso-oauth-no-disponible")).not.toBeVisible();
  });

  it("pulsar «Conectar con Jira» pide la dirección al servidor y navega a ella; el doble clic no envía dos veces [E5-F08#1]", async () => {
    const user = userEvent.setup();
    const navegacion = espiarNavegacion();
    const hechas = registrarPeticiones();
    modoE5.configuracion = "vacia";
    await abrirConexion();
    const boton = screen.getByTestId("boton-conectar-jira");
    await user.dblClick(boton);
    await waitFor(() => expect(navegacion).toHaveBeenCalledTimes(1));
    expect(navegacion.mock.calls[0]![0]).toContain("/admin/integraciones/jira/oauth/retorno");
    expect(hechas.filter((h) => h.ruta.endsWith("/oauth/iniciar"))).toHaveLength(1);
    // Sin cuerpo: el portal no manda `redirect_uri` ni nada.
    expect(hechas.find((h) => h.ruta.endsWith("/oauth/iniciar"))?.cuerpo).toBeUndefined();
    expect(boton).toHaveAttribute("data-estado", "en-curso");
    expect(boton).toHaveAttribute("aria-busy", "true");
    expect(boton).toHaveTextContent("Conectando…");
    expect(screen.getByText("Abriendo Atlassian…")).toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it("sin credenciales en el servidor el botón queda con aria-disabled, en el orden de tabulación y con su motivo [E5-F08#7]", async () => {
    const user = userEvent.setup();
    const navegacion = espiarNavegacion();
    const hechas = registrarPeticiones();
    modoE5.oauth = "no-configurado";
    modoE5.configuracion = "vacia";
    await abrirConexion();
    const boton = screen.getByTestId("boton-conectar-jira");
    expect(boton).toHaveAttribute("data-estado", "no-disponible");
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).not.toBeDisabled();
    const aviso = screen.getByTestId("aviso-oauth-no-disponible");
    expect(aviso).toBeVisible();
    expect(aviso).toHaveTextContent("La conexión automática aún no está habilitada en el servidor.");
    expect(boton).toHaveAccessibleDescription(/La conexión automática aún no está habilitada/);
    // Llega con el teclado y Enter no hace nada.
    boton.focus();
    expect(boton).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.click(boton);
    expect(navegacion).not.toHaveBeenCalled();
    expect(hechas.filter((h) => h.ruta.includes("/oauth/"))).toHaveLength(0);
    // El API token sigue disponible.
    await user.click(screen.getByTestId("enlace-usar-api-token"));
    expect(screen.getByTestId("opcion-api-token")).toBeChecked();
    expect(screen.getByTestId("campo-sitio")).toHaveFocus();
    server.events.removeAllListeners();
  });

  it("503 JIRA_OAUTH_NO_CONFIGURADO al iniciar deja el botón no-disponible aunque el GET lo creyera disponible [E5-F08#7]", async () => {
    const user = userEvent.setup();
    espiarNavegacion();
    modoE5.configuracion = "vacia";
    await abrirConexion();
    modoE5.oauth = "no-configurado";
    await user.click(screen.getByTestId("boton-conectar-jira"));
    const error = await screen.findByTestId("error-oauth");
    expect(error).toHaveAttribute("data-codigo", "JIRA_OAUTH_NO_CONFIGURADO");
    expect(error).toHaveTextContent("La conexión automática con Jira no está habilitada en el servidor.");
    expect(screen.getByTestId("boton-conectar-jira")).toHaveAttribute("data-estado", "no-disponible");
    expect(screen.getByTestId("aviso-oauth-no-disponible")).toBeVisible();
  });

  it("un fallo de red o 5xx al iniciar muestra error-oauth con foco y vuelve a disponible [E5-F08#1]", async () => {
    const user = userEvent.setup();
    const navegacion = espiarNavegacion();
    modoE5.configuracion = "vacia";
    await abrirConexion();
    modoE5.oauth = "servidor-caido";
    await user.click(screen.getByTestId("boton-conectar-jira"));
    const error = await screen.findByTestId("error-oauth");
    expect(error).toHaveTextContent("No fue posible abrir Atlassian. Intenta nuevamente.");
    expect(error).toHaveFocus();
    expect(document.body.textContent).not.toContain(TEXTO_DEL_SERVIDOR);
    expect(screen.getByTestId("boton-conectar-jira")).toHaveAttribute("data-estado", "disponible");
    expect(navegacion).not.toHaveBeenCalled();
    // Reintentar funciona.
    modoE5.oauth = "normal";
    await user.click(screen.getByTestId("boton-conectar-jira"));
    await waitFor(() => expect(navegacion).toHaveBeenCalledTimes(1));
  });

  it("elegir un método no cambia el método activo: lo dice y el chip sigue igual [E5-F08#9]", async () => {
    const user = userEvent.setup();
    await abrirConexion();
    // Activo: API token (conectado).
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token");
    await user.click(screen.getByTestId("opcion-oauth"));
    expect(screen.getByTestId("aviso-cambio-a-oauth")).toHaveTextContent("Tu conexión con API token sigue activa. No se cambiará hasta que la conexión con Jira funcione.");
    expect(screen.getByTestId("metodo-activo-ahora")).toHaveTextContent("Método activo ahora: API token");
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token");
    expect(screen.getByTestId("form-jira")).toContainElement(screen.getByTestId("boton-conectar-jira"));
    expect(screen.getByTestId("form-jira")).toContainElement(screen.getByTestId("campo-proyecto"));
  });

  it("la guía es un panel expandible, sin variables ni valores, con el pie hacia el documento [E5-F08#7]", async () => {
    const user = userEvent.setup();
    modoE5.configuracion = "vacia";
    await abrirConexion();
    const boton = screen.getByTestId("boton-guia-oauth");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    await user.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByTestId("panel-guia-oauth");
    expect(panel).toBeVisible();
    for (let n = 1; n <= 7; n += 1) expect(screen.getByTestId(`guia-oauth-paso-${n}`)).toBeInTheDocument();
    expect(panel).toHaveTextContent("docs/arquitectura/guia-oauth-atlassian.md");
    expect(panel.textContent).not.toMatch(/JIRA_OAUTH|CLIENT_ID|CLIENT_SECRET/i);
    // Escape cierra el panel y devuelve el foco al botón.
    panel.focus();
    await user.keyboard("{Escape}");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(boton).toHaveFocus();
  });
});

describe("E5-F08 · tarjeta de estado", () => {
  it("conectado con Jira (OAuth): cuenta, sitio, permisos traducidos y fechas; nunca un secreto [E5-F08#1]", async () => {
    prepararOauth("OAUTH", oauthConectada({ renovadoEn: "2026-11-22T14:10:00Z" }));
    await abrirConexion();
    const chip = screen.getByTestId("chip-conexion");
    expect(chip).toHaveAttribute("data-estado", "conectado-oauth");
    expect(chip).toHaveTextContent("Conectado con Jira (OAuth) como Ana Pérez en empresa");
    expect(screen.getByTestId("estado-oauth")).toHaveAttribute("data-estado", "CONECTADA");
    expect(screen.getByTestId("cuenta-oauth")).toHaveTextContent("Ana Pérez");
    expect(screen.getByTestId("sitio-oauth")).toHaveTextContent("empresa · https://empresa.atlassian.net");
    const permisos = screen.getByTestId("permisos-oauth");
    expect(permisos).toHaveTextContent("Solo lectura");
    expect(permisos).toHaveTextContent("Ver datos de issues");
    expect(permisos).toHaveTextContent("Ver perfil del usuario");
    expect(permisos).toHaveTextContent("Mantener la conexión");
    expect(screen.getByTestId("fecha-renovacion")).toHaveTextContent("Renovada el");
    expect(screen.getByText(/La conexión se renueva sola/)).toBeInTheDocument();
    expect(screen.queryByTestId("token-estado")).not.toBeInTheDocument();
    expect(screen.queryByTestId("campo-token")).not.toBeInTheDocument();
    // El botón del panel es «Reconectar» (opcional).
    expect(screen.getByTestId("boton-conectar-jira")).toHaveTextContent("Reconectar");
    expect(screen.queryByTestId("boton-reconectar-jira")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/token de acceso|refresh|client.?secret/i);
  });

  it("«Probar conexión» manda solo el método activo y no guarda nada [E5-F08#10]", async () => {
    const user = userEvent.setup();
    const hechas = registrarPeticiones();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    await user.click(screen.getByTestId("boton-probar-conexion"));
    expect(await screen.findByTestId("mensaje-conexion-ok")).toHaveTextContent("Conexión exitosa con Jira como Ana Pérez. No se guardaron cambios.");
    const prueba = hechas.find((h) => h.ruta.endsWith("/configuracion/probar"));
    expect(prueba?.cuerpo).toEqual({ metodo: "OAUTH" });
    expect(hechas.some((h) => h.metodo === "PUT")).toBe(false);
    server.events.removeAllListeners();
  });

  it("reconexión necesaria: aviso con foco, un único botón «Reconectar» y sin «Probar conexión» [E5-F08#8]", async () => {
    const user = userEvent.setup();
    const navegacion = espiarNavegacion();
    prepararOauth("OAUTH", oauthReconexion());
    await abrirConexion();
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "reconexion-necesaria");
    expect(screen.getByTestId("chip-conexion")).toHaveTextContent("⚠ Reconexión necesaria");
    const aviso = screen.getByTestId("aviso-reconexion");
    expect(aviso).toHaveAttribute("role", "alert");
    expect(aviso).toHaveTextContent("La conexión con Jira venció. Vuelve a conectar con Jira.");
    expect(aviso).toHaveTextContent("Lo que ya está en Quality360 no se modifica.");
    expect(screen.getByTestId("estado-oauth")).toHaveAttribute("data-estado", "RECONEXION_NECESARIA");
    expect(screen.queryByTestId("boton-conectar-jira")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-probar-conexion")).not.toBeInTheDocument();
    expect(screen.getByTestId("ultima-cuenta-oauth")).toHaveTextContent("Última cuenta: Ana Pérez · Sitio: empresa");
    await user.click(screen.getByTestId("boton-reconectar-jira"));
    await waitFor(() => expect(navegacion).toHaveBeenCalledTimes(1));
  });

  it("una prueba que descubre la reconexión pasa la tarjeta a «Reconexión necesaria» y mueve el foco al aviso [E5-F08#8]", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    modoE5.oauth = "reconexion-necesaria";
    await user.click(screen.getByTestId("boton-probar-conexion"));
    const aviso = await screen.findByTestId("aviso-reconexion");
    await waitFor(() => expect(aviso).toHaveFocus());
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "reconexion-necesaria");
    // El mismo error no se repite como `error-conexion`.
    expect(screen.queryByTestId("error-conexion")).not.toBeInTheDocument();
    // El evento queda en «Cambios de configuración» con «Sistema» como actor.
    await waitFor(() => expect(screen.getByTestId("lista-eventos-configuracion")).toHaveTextContent("Sistema · la renovación de la conexión falló; se necesita reconectar"));
  });

  it("API token activo con OAuth lista: «Lista, sin activar» y el chip no cambia; «Probar y guardar» con OAuth la activa [E5-F08#9]", async () => {
    const user = userEvent.setup();
    const hechas = registrarPeticiones();
    prepararOauth("API_TOKEN", oauthConectada());
    await abrirConexion();
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token");
    expect(screen.getByTestId("insignia-oauth")).toHaveTextContent("Lista, sin activar");
    expect(screen.getByTestId("aviso-oauth-lista")).toHaveTextContent("hasta entonces se sigue usando el API token");
    expect(screen.getByTestId("token-estado")).toHaveTextContent("termina en AB12");
    await user.click(screen.getByTestId("opcion-oauth"));
    expect(screen.queryByTestId("aviso-cambio-a-oauth")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("boton-probar-guardar"));
    expect(await screen.findByTestId("mensaje-conexion-ok")).toHaveTextContent("Ahora Quality360 usa esta conexión en lugar del API token.");
    const guardado = hechas.find((h) => h.metodo === "PUT")?.cuerpo as Record<string, unknown>;
    expect(guardado.metodo).toBe("OAUTH");
    // Con OAuth no viajan sitio, correo ni token.
    expect(Object.keys(guardado).sort()).toEqual(["celulaId", "metodo", "proyecto", "qeResponsableId", "sprintRespaldoId", "tiposIssue"]);
    await waitFor(() => expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth"));
    expect(estadoConfig.actual.metodo).toBe("OAUTH");
    server.events.removeAllListeners();
  });

  it("sin una conexión lista, con OAuth elegido no se puede probar ni guardar [E5-F08#10]", async () => {
    modoE5.configuracion = "vacia";
    await abrirConexion();
    expect(screen.getByTestId("boton-probar-guardar")).toBeDisabled();
    expect(screen.getByTestId("boton-probar")).toBeDisabled();
    expect(screen.getByTestId("nota-conectar-primero")).toBeInTheDocument();
  });

  it("los eventos OAuth aparecen con el texto del diseño, sin tokens [E5-F01#1]", async () => {
    const admin = { id: "a1000000-0000-4000-8000-000000000001", nombre: "Valentina Rojas" };
    const base = { actor: admin, camposCambiados: [] as never[], tokenCambiado: false, resultadoPrueba: "OK" };
    eventosConfig.unshift(
      { ...base, id: "e5000000-0000-4000-8000-0000000000b1", fecha: "2026-11-22T13:15:00Z", tipo: "CONECTAR_OAUTH", oauth: { cuenta: "Ana Pérez", sitio: "empresa" } },
      { ...base, id: "e5000000-0000-4000-8000-0000000000b2", fecha: "2026-11-22T14:00:00Z", tipo: "RECONECTAR", oauth: { cuenta: "Ana Pérez", sitio: "empresa" } },
      { ...base, id: "e5000000-0000-4000-8000-0000000000b3", fecha: "2026-11-22T15:00:00Z", tipo: "DESCONECTAR", oauth: null },
    );
    await abrirConexion();
    const lista = await screen.findByTestId("lista-eventos-configuracion");
    expect(lista).toHaveTextContent("Valentina Rojas · conectó con Jira (OAuth) como Ana Pérez en empresa");
    expect(lista).toHaveTextContent("Valentina Rojas · reconectó con Jira (OAuth) como Ana Pérez");
    expect(lista).toHaveTextContent("Valentina Rojas · desconectó la conexión con Jira");
  });
});

describe("E5-F08 · elegir el sitio", () => {
  it("la tarjeta muestra «Falta elegir el sitio» con la lista; Usar este sitio queda con aria-disabled hasta elegir [E5-F08#4]", async () => {
    const user = userEvent.setup();
    prepararOauth(null, oauthPendienteSitio());
    await abrirConexion();
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "falta-sitio");
    expect(screen.getByTestId("estado-oauth")).toHaveAttribute("data-estado", "PENDIENTE_SITIO");
    const lista = screen.getByTestId("lista-sitios");
    expect(lista).toHaveAccessibleName("Elige el sitio de Jira");
    expect(lista).toHaveFocus();
    expect(within(lista).getAllByRole("radio")).toHaveLength(3);
    expect(within(lista).getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    const boton = screen.getByTestId("boton-elegir-sitio");
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveAccessibleDescription("Elige un sitio para continuar.");
    const hechas = registrarPeticiones();
    await user.click(boton);
    expect(hechas).toHaveLength(0);
    // Las URL son texto, no enlaces.
    expect(within(lista).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-probar-conexion")).not.toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it("preselecciona el sitio actual, confirma y la tarjeta pasa a conectado con el aviso [E5-F08#4]", async () => {
    const user = userEvent.setup();
    const hechas = registrarPeticiones();
    prepararOauth(null, oauthPendienteSitio("https://laboratorio.atlassian.net"));
    await abrirConexion();
    const actual = screen.getByTestId("sitio-opcion-2c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809");
    expect(within(actual).getByRole("radio")).toBeChecked();
    expect(within(actual).getByTestId("sitio-actual")).toHaveTextContent("Actual");
    await user.click(screen.getByTestId("boton-elegir-sitio"));
    expect(await screen.findByTestId("aviso-oauth-conectado")).toHaveTextContent("Conectado con Jira (OAuth) como Ana Pérez en laboratorio.");
    expect(hechas.find((h) => h.ruta.endsWith("/oauth/sitio"))?.cuerpo).toEqual({ sitioId: "2c3d4e5f-6071-4b82-9ca3-b4c5d6e7f809" });
    await waitFor(() => expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth"));
    // El foco no se pierde: va al título de la tarjeta cuando desaparece el control que lo tenía.
    await waitFor(() => expect(screen.getByRole("heading", { name: "Estado de la conexión" })).toHaveFocus());
    await user.click(screen.getByTestId("boton-cerrar-aviso"));
    expect(screen.queryByTestId("aviso-oauth-conectado")).not.toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it("un sitio que ya no es candidato (400) limpia la lista y pide reconectar; un 5xx la conserva [E5-F08#4]", async () => {
    const user = userEvent.setup();
    prepararOauth(null, oauthPendienteSitio("https://empresa.atlassian.net"));
    await abrirConexion();
    modoE5.oauthSitio = "error";
    await user.click(screen.getByTestId("boton-elegir-sitio"));
    expect(await screen.findByTestId("error-sitio")).toHaveTextContent("No fue posible guardar el sitio. Intenta nuevamente.");
    expect(screen.getByTestId("lista-sitios")).toBeInTheDocument();
    // El servidor ya no reconoce los candidatos.
    modoE5.oauthSitio = "ok";
    estadoOauth.actual = oauthPendienteSitio();
    estadoOauth.actual = { ...estadoOauth.actual, sitiosCandidatos: estadoOauth.actual.sitiosCandidatos!.map((s) => ({ ...s, id: `0${s.id.slice(1)}` })) };
    await user.click(screen.getByTestId("boton-elegir-sitio"));
    const error = await screen.findByTestId("error-sitio");
    expect(error).toHaveTextContent("El sitio elegido no es válido. Vuelve a pulsar «Conectar con Jira».");
    expect(screen.queryByTestId("lista-sitios")).not.toBeInTheDocument();
  });
});

describe("E5-F08 · desconectar", () => {
  it("el diálogo abre con el foco en Cancelar, Escape cancela y el foco vuelve al botón [E5-F08#11]", async () => {
    const user = userEvent.setup();
    const hechas = registrarPeticiones();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    const abrir = screen.getByTestId("boton-desconectar-jira");
    await user.click(abrir);
    const dialogo = screen.getByTestId("confirmar-desconexion");
    expect(dialogo).toHaveAttribute("role", "alertdialog");
    expect(dialogo).toHaveAccessibleName("Desconectar de Jira");
    expect(dialogo).toHaveTextContent("Se borrarán las credenciales guardadas en Quality360.");
    expect(dialogo).toHaveTextContent("revoca la app desde tu cuenta");
    expect(dialogo).toHaveTextContent("Lo ya importado no se borra.");
    expect(screen.getByTestId("boton-cancelar-desconexion")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("confirmar-desconexion")).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
    expect(hechas.some((h) => h.metodo === "DELETE")).toBe(false);
    server.events.removeAllListeners();
  });

  it("confirmar borra la conexión: «Sin conectar», mensaje, ayuda para revocar y el evento [E5-F08#11]", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    await user.click(screen.getByTestId("boton-desconectar-jira"));
    await user.click(screen.getByTestId("boton-confirmar-desconexion"));
    expect(await screen.findByTestId("mensaje-desconexion-ok")).toHaveTextContent("Se desconectó de Jira. Las credenciales guardadas se borraron.");
    expect(screen.getByTestId("ayuda-revocar-jira")).toHaveTextContent("revoca el acceso");
    await waitFor(() => expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "sin-conectar"));
    expect(screen.queryByTestId("boton-desconectar-jira")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-probar-conexion")).not.toBeInTheDocument();
    expect(estadoOauth.actual).toBeNull();
    // El foco no queda perdido en <body>.
    await waitFor(() => expect(document.body).not.toHaveFocus());
    await waitFor(() => expect(screen.getByTestId("lista-eventos-configuracion")).toHaveTextContent("desconectó la conexión con Jira"));
  });

  it("un fallo al desconectar mantiene el diálogo con el error [E5-F08#11]", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    modoE5.oauthDesconexion = "error";
    await user.click(screen.getByTestId("boton-desconectar-jira"));
    await user.click(screen.getByTestId("boton-confirmar-desconexion"));
    expect(await screen.findByTestId("error-desconexion")).toHaveTextContent("No fue posible desconectar. Intenta nuevamente.");
    expect(screen.getByTestId("confirmar-desconexion")).toBeInTheDocument();
    expect(estadoOauth.actual).not.toBeNull();
  });

  it("con el API token activo no hay «Desconectar» para el token (D217)", async () => {
    await abrirConexion();
    expect(screen.queryByTestId("boton-desconectar-jira")).not.toBeInTheDocument();
    expect(screen.getByTestId("boton-probar-conexion")).toBeInTheDocument();
  });
});

describe("E5-F08 · cambio de OAuth a API token", () => {
  it("avisa, pide confirmación antes de enviar y, si la prueba pasa, borra la conexión OAuth [E5-F08#9]", async () => {
    const user = userEvent.setup();
    const hechas = registrarPeticiones();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    await user.click(screen.getByTestId("opcion-api-token"));
    expect(screen.getByTestId("aviso-cambio-a-api-token")).toHaveTextContent("se borrarán las credenciales de la conexión con Jira (OAuth) guardadas en Quality360");
    expect(screen.getByTestId("campo-token")).toHaveValue("");
    // El método activo no cambió por elegir.
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth");
    await user.type(screen.getByTestId("campo-sitio"), "https://su-empresa.atlassian.net");
    await user.type(screen.getByTestId("campo-correo"), "admin@empresa.com");
    await user.type(screen.getByTestId("campo-token"), "q360-token-nuevo-EF56");
    await user.click(screen.getByTestId("boton-probar-guardar"));
    // Cancelar no envía nada.
    const dialogo = screen.getByTestId("confirmar-cambio-a-api-token");
    expect(dialogo).toHaveAttribute("role", "alertdialog");
    expect(screen.getByTestId("boton-cancelar-cambio")).toHaveFocus();
    await user.click(screen.getByTestId("boton-cancelar-cambio"));
    expect(hechas.some((h) => h.metodo === "PUT")).toBe(false);
    // Confirmar sí.
    await user.click(screen.getByTestId("boton-probar-guardar"));
    await user.click(screen.getByTestId("boton-confirmar-cambio"));
    expect(await screen.findByTestId("mensaje-conexion-ok")).toHaveTextContent("Se borraron las credenciales de la conexión con Jira (OAuth).");
    await waitFor(() => expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token"));
    expect(estadoOauth.actual).toBeNull();
    expect(screen.getByTestId("campo-token")).toHaveValue("");
    server.events.removeAllListeners();
  });

  it("si la prueba falla no se guarda nada y las credenciales OAuth no se borran [E5-F08#9]", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    await user.click(screen.getByTestId("opcion-api-token"));
    await user.type(screen.getByTestId("campo-sitio"), "https://su-empresa.atlassian.net");
    await user.type(screen.getByTestId("campo-correo"), "admin@empresa.com");
    await user.type(screen.getByTestId("campo-token"), "token-malo-ZZ99");
    modoE5.prueba = "JIRA_CREDENCIAL_INVALIDA";
    await user.click(screen.getByTestId("boton-probar-guardar"));
    await user.click(screen.getByTestId("boton-confirmar-cambio"));
    const error = await screen.findByTestId("error-conexion");
    expect(error).toHaveTextContent("No se guardó nada: se conserva la configuración anterior.");
    expect(estadoOauth.actual).not.toBeNull();
    expect(estadoConfig.actual.metodo).toBe("OAUTH");
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-oauth");
    expect(screen.getByTestId("campo-token")).toHaveValue("");
  });

  it("«Probar sin guardar» no abre el diálogo ni cambia nada [E5-F08#9]", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    await abrirConexion();
    await user.click(screen.getByTestId("opcion-api-token"));
    await user.type(screen.getByTestId("campo-sitio"), "https://su-empresa.atlassian.net");
    await user.type(screen.getByTestId("campo-correo"), "admin@empresa.com");
    await user.type(screen.getByTestId("campo-token"), "q360-token-nuevo-EF56");
    await user.click(screen.getByTestId("boton-probar"));
    expect(await screen.findByTestId("mensaje-conexion-ok")).toHaveTextContent("No se guardaron cambios.");
    expect(screen.queryByTestId("confirmar-cambio-a-api-token")).not.toBeInTheDocument();
    expect(estadoOauth.actual).not.toBeNull();
  });
});

describe("E5-F02#6 · Consultar Jira con la conexión vencida", () => {
  it("muestra el aviso de reconexión con ⚠, el texto fijo y «Ir a Conexión» como acción principal [E5-F08#8]", async () => {
    const user = userEvent.setup();
    prepararOauth("OAUTH", oauthConectada());
    modoE5.consulta = "fallida-reconexion";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    await user.click(await screen.findByTestId("boton-consultar-jira"));
    const error = await screen.findByTestId("error-consulta");
    expect(error).toHaveAttribute("data-codigo", "JIRA_RECONEXION_NECESARIA");
    expect(error).toHaveTextContent("⚠ No se pudo consultar Jira");
    expect(error).toHaveTextContent("La conexión con Jira venció. Vuelve a conectar con Jira.");
    expect(error).toHaveClass("panel-resultado--incompleta");
    expect(within(error).getAllByRole("link").map((a) => a.textContent)).toEqual(["Ir a Conexión", "Importar un archivo"]);
    expect(within(error).getByTestId("enlace-ir-conexion")).toHaveAttribute("href", "/admin/integraciones");
    expect(document.body.textContent).not.toContain(TEXTO_DEL_SERVIDOR);
  });
});
