// E5-F08 · página de retorno de Atlassian (FO2): los 11 estados, el consumo único y la sesión.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "@/auth/AuthContext";
import { hayRetornoOauthPendiente } from "@/lib/capturaRetornoOauth";
import { RUTA_RETORNO_OAUTH } from "@/lib/rutasIntegraciones";
import { estadoOauth, modoE5, OAUTH_MOCK, prepararOauth, oauthConectada } from "@/mocks/dataE5";
import { server } from "@/mocks/server";
import { AppRoutes } from "@/routes/router";
import { ADMIN, capturarEnTest, espiarNavegacion, QE, RETORNO_CON_CODIGO, RETORNO_RECHAZADO } from "./ayudasOauth";
import { abrirComo, iniciarSesionUi, renderApp } from "./renderApp";

const estado = () => screen.getByTestId("estado-retorno");

async function esperarEstado(esperado: string) {
  await waitFor(() => expect(estado()).toHaveAttribute("data-estado", esperado), { timeout: 3000 });
}

async function abrirRetorno(search: string | null = RETORNO_CON_CODIGO) {
  if (search !== null) capturarEnTest(search);
  await abrirComo(ADMIN, RUTA_RETORNO_OAUTH);
  await screen.findByTestId("pagina-retorno-oauth");
}

function registrarRetornos() {
  const cuerpos: unknown[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/oauth/retorno")) cuerpos.push(await request.clone().json());
  });
  return cuerpos;
}

describe("E5-F08 · página de retorno", () => {
  it("conexión exitosa: procesa, muestra «Conectado», vuelve a Conexión con el aviso y limpia el consumo [E5-F08#1]", async () => {
    const user = userEvent.setup();
    const cuerpos = registrarRetornos();
    await abrirRetorno();
    expect(screen.getByRole("heading", { level: 1, name: "Conexión con Jira" })).toBeInTheDocument();
    await esperarEstado("exito");
    expect(screen.getByRole("heading", { name: "Conectado con Jira" })).toBeInTheDocument();
    expect(estado()).toHaveTextContent("Conectado con Jira (OAuth) como Ana Pérez en empresa.");
    // El portal solo pasa `code` y `state`: nada más.
    expect(cuerpos).toEqual([{ state: OAUTH_MOCK.state, code: OAUTH_MOCK.codigo }]);
    expect(hayRetornoOauthPendiente()).toBe(false);
    expect(document.body.textContent).not.toContain(OAUTH_MOCK.codigo);
    expect(document.body.textContent).not.toContain(OAUTH_MOCK.state);
    await user.click(screen.getByTestId("enlace-ir-conexion"));
    const aviso = await screen.findByTestId("aviso-oauth-conectado");
    expect(aviso).toHaveTextContent("Conectado con Jira (OAuth) como Ana Pérez en empresa. Pulsa «Probar y guardar» para confirmar.");
    expect(aviso).toHaveAttribute("role", "status");
    expect(await screen.findByTestId("chip-conexion")).toHaveAttribute("data-estado", "conectado-api-token");
    expect(screen.getByTestId("insignia-oauth")).toHaveTextContent("Lista, sin activar");
    // El selector parte en OAuth para que «Probar y guardar» la active.
    expect(screen.getByTestId("opcion-oauth")).toBeChecked();
    server.events.removeAllListeners();
  });

  it("vuelve solo a Conexión tras ~1,5 s con `replace`, sin dejar el estado de navegación [E5-F08#1]", async () => {
    await abrirRetorno();
    await esperarEstado("exito");
    expect(await screen.findByTestId("pagina-integraciones", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByTestId("aviso-oauth-conectado")).toBeInTheDocument();
    expect(screen.queryByTestId("pagina-retorno-oauth")).not.toBeInTheDocument();
  });

  it("consentimiento rechazado: manda `error` y `state`, no redirige y no cambia nada [E5-F08#2]", async () => {
    const user = userEvent.setup();
    const navegacion = espiarNavegacion();
    const cuerpos = registrarRetornos();
    prepararOauth("API_TOKEN", null);
    const reemplazos = capturarEnTest(RETORNO_RECHAZADO);
    await abrirComo(ADMIN, RUTA_RETORNO_OAUTH);
    await esperarEstado("consentimiento-rechazado");
    // La dirección se limpió: ni `error` ni `error_description` quedan.
    expect(reemplazos).toEqual([{ url: RUTA_RETORNO_OAUTH }]);
    expect(cuerpos).toEqual([{ state: OAUTH_MOCK.state, error: "access_denied" }]);
    const error = screen.getByTestId("error-oauth");
    expect(error).toHaveAttribute("data-codigo", "JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO");
    expect(error).toHaveTextContent("No aceptaste los permisos en Atlassian. No se conectó nada.");
    expect(error).toHaveTextContent("El estado anterior de la conexión no cambió.");
    expect(error).toHaveFocus();
    expect(screen.getByRole("heading", { name: "No se conectó nada" })).toBeInTheDocument();
    expect(estadoOauth.actual).toBeNull();
    // Sin redirección automática: el Administrador decide.
    await new Promise((r) => setTimeout(r, 1800));
    expect(screen.getByTestId("estado-retorno")).toBeInTheDocument();
    expect(screen.getByTestId("enlace-ir-conexion")).toHaveTextContent("Volver a Conexión");
    // «Intentar de nuevo» inicia una autorización nueva.
    modoE5.oauth = "normal";
    await user.click(screen.getByTestId("boton-conectar-jira"));
    await waitFor(() => expect(navegacion).toHaveBeenCalledTimes(1));
    server.events.removeAllListeners();
  });

  const casosDeError: Array<{ modo: typeof modoE5.oauth; estado: string; codigo: string; texto: string; titulo: string; boton: string }> = [
    {
      modo: "estado-invalido",
      estado: "estado-invalido",
      codigo: "JIRA_OAUTH_ESTADO_INVALIDO",
      texto: "La autorización venció o no es válida. Vuelve a pulsar «Conectar con Jira».",
      titulo: "La autorización no es válida",
      boton: "Conectar con Jira",
    },
    {
      modo: "permisos-insuficientes",
      estado: "permisos-insuficientes",
      codigo: "JIRA_OAUTH_PERMISOS_INSUFICIENTES",
      texto: "Faltan permisos en Atlassian: Ver datos de issues. Acepta todos los permisos solicitados.",
      titulo: "Faltan permisos",
      boton: "Intentar de nuevo",
    },
    {
      modo: "sin-sitio",
      estado: "sin-sitio",
      codigo: "JIRA_OAUTH_SIN_SITIO",
      texto: "Tu cuenta de Atlassian no tiene acceso a ningún sitio de Jira.",
      titulo: "Sin acceso a Jira",
      boton: "Intentar con otra cuenta",
    },
    {
      modo: "canje-rechazado",
      estado: "canje-fallido",
      codigo: "JIRA_OAUTH_CANJE_FALLIDO",
      texto: "Atlassian no aceptó la autorización. Vuelve a intentarlo.",
      titulo: "Atlassian no aceptó la autorización",
      boton: "Intentar de nuevo",
    },
    {
      modo: "servidor-caido",
      estado: "error-servidor",
      codigo: "OAUTH_ERROR_SERVIDOR",
      texto: "Hubo un problema del servidor. Intenta nuevamente en unos minutos.",
      titulo: "No pudimos completar la conexión",
      boton: "Intentar de nuevo",
    },
    {
      modo: "no-configurado",
      estado: "error-servidor",
      codigo: "JIRA_OAUTH_NO_CONFIGURADO",
      texto: "La conexión automática con Jira no está habilitada en el servidor.",
      titulo: "No pudimos completar la conexión",
      boton: "Intentar de nuevo",
    },
  ];

  it.each(casosDeError)("estado «$estado» con el modo $modo: mensaje fijo, foco, dos acciones y nada guardado [E5-F08#3, #5, #6]", async (caso) => {
    modoE5.oauth = caso.modo;
    await abrirRetorno();
    await esperarEstado(caso.estado);
    const error = screen.getByTestId("error-oauth");
    expect(error).toHaveAttribute("data-codigo", caso.codigo);
    expect(error).toHaveTextContent(caso.texto);
    expect(error).toHaveTextContent(caso.titulo);
    expect(error).toHaveFocus();
    expect(estado()).toHaveAttribute("role", "status");
    expect(screen.getByTestId("boton-conectar-jira")).toHaveTextContent(caso.boton);
    expect(screen.getByTestId("enlace-ir-conexion")).toHaveTextContent("Volver a Conexión");
    // El texto del servidor y los valores del retorno nunca se muestran.
    expect(document.body.textContent).not.toContain("TEXTO-DEL-SERVIDOR");
    expect(document.body.textContent).not.toContain(OAUTH_MOCK.codigo);
    expect(estadoOauth.actual).toBeNull();
  });

  it("sin respuesta (504): pide revisar Conexión antes de reintentar [E5-F08#1]", async () => {
    modoE5.oauth = "sin-respuesta";
    await abrirRetorno();
    await esperarEstado("sin-respuesta");
    expect(screen.getByTestId("error-oauth")).toHaveTextContent("La conexión pudo haberse completado: revisa la pestaña Conexión antes de reintentar.");
    expect(screen.getByTestId("enlace-ir-conexion")).toHaveTextContent("Ir a Conexión");
    expect(screen.queryByTestId("boton-conectar-jira")).not.toBeInTheDocument();
  });

  it("sin autorización pendiente (ruta abierta a mano o recargada): no envía nada [E5-F08#3]", async () => {
    const cuerpos = registrarRetornos();
    await abrirRetorno(null);
    await esperarEstado("sin-autorizacion");
    expect(screen.getByRole("heading", { name: "No hay una conexión en curso" })).toBeInTheDocument();
    expect(estado()).toHaveTextContent("Para conectar con Jira, pulsa «Conectar con Jira» en la pestaña Conexión.");
    expect(screen.getByTestId("enlace-ir-conexion")).toHaveTextContent("Ir a Conexión");
    expect(cuerpos).toHaveLength(0);
    server.events.removeAllListeners();
  });

  it("sin `state` no hay nada que completar aunque venga `code` [E5-F08#3]", async () => {
    const cuerpos = registrarRetornos();
    await abrirRetorno("?code=solo-code");
    await esperarEstado("sin-autorizacion");
    expect(cuerpos).toHaveLength(0);
    server.events.removeAllListeners();
  });

  it("varios sitios: vuelve a Conexión y la lista espera la elección [E5-F08#4]", async () => {
    modoE5.oauth = "varios-sitios";
    // Sin configuración previa: el chip refleja el método activo, que aún no hay.
    prepararOauth(null, null);
    await abrirRetorno();
    expect(await screen.findByTestId("lista-sitios", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByTestId("chip-conexion")).toHaveAttribute("data-estado", "falta-sitio");
    expect(screen.queryByTestId("aviso-oauth-conectado")).not.toBeInTheDocument();
  });

  it("el retorno se envía UNA sola vez aunque React monte dos veces (StrictMode) [D210]", async () => {
    renderApp("/login");
    await iniciarSesionUi(ADMIN);
    await screen.findByRole("navigation", { name: "Portal" });
    cleanup();
    const cuerpos = registrarRetornos();
    capturarEnTest(RETORNO_CON_CODIGO);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={[RUTA_RETORNO_OAUTH]}>
              <AppRoutes />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
    await esperarEstado("exito");
    expect(cuerpos).toHaveLength(1);
    server.events.removeAllListeners();
  });

  it("recargar la página de retorno ya no tiene `code`: muestra «No hay una conexión en curso» y no repite [E5-F08#3]", async () => {
    const cuerpos = registrarRetornos();
    await abrirRetorno();
    await esperarEstado("exito");
    cleanup();
    // La recarga abre la ruta limpia (sin query): la captura no encuentra nada.
    capturarEnTest("");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <MemoryRouter initialEntries={[RUTA_RETORNO_OAUTH]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await screen.findByTestId("pagina-retorno-oauth");
    await esperarEstado("sin-autorizacion");
    expect(cuerpos).toHaveLength(1);
    server.events.removeAllListeners();
  });
});

describe("E5-F08 · retorno sin sesión y por rol", () => {
  it("sin sesión descarta el `code`, lleva al inicio de sesión y, tras entrar, avisa en Conexión [E5-F08#3, D210]", async () => {
    const cuerpos = registrarRetornos();
    capturarEnTest(RETORNO_CON_CODIGO);
    expect(hayRetornoOauthPendiente()).toBe(true);
    renderApp(RUTA_RETORNO_OAUTH);
    expect(await screen.findByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(hayRetornoOauthPendiente()).toBe(false);
    await iniciarSesionUi(ADMIN);
    const aviso = await screen.findByTestId("aviso-sesion-cerrada", {}, { timeout: 4000 });
    expect(aviso).toHaveTextContent("Tu sesión se cerró durante la conexión. Vuelve a pulsar «Conectar con Jira».");
    expect(screen.getByTestId("pagina-integraciones")).toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);
    server.events.removeAllListeners();
  });

  it("un QE que llega a la ruta de retorno recibe «acceso denegado» y no se envía nada [E5-F08#12]", async () => {
    const cuerpos = registrarRetornos();
    capturarEnTest(RETORNO_CON_CODIGO);
    await abrirComo(QE, RUTA_RETORNO_OAUTH);
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    expect(screen.queryByTestId("pagina-retorno-oauth")).not.toBeInTheDocument();
    expect(cuerpos).toHaveLength(0);
    server.events.removeAllListeners();
  });

  it("un QE no tiene ninguna pestaña de integraciones de Administrador con OAuth [E5-F08#12]", async () => {
    await abrirComo(QE, "/admin/integraciones");
    expect(screen.queryByTestId("boton-conectar-jira")).not.toBeInTheDocument();
    expect(screen.queryByTestId("selector-metodo")).not.toBeInTheDocument();
    expect(within(document.body).queryByTestId("tarjeta-estado-conexion")).not.toBeInTheDocument();
  });

  it("la conexión OAuth guardada no mueve nada fuera de la tarjeta si ya había otra cuenta [E5-F08#1]", async () => {
    prepararOauth("OAUTH", oauthConectada({ cuenta: { nombre: "Luis Soto" } }));
    await abrirRetorno();
    await esperarEstado("exito");
    expect(estado()).toHaveTextContent("como Ana Pérez");
  });
});
