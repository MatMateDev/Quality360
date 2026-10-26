import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { rutaPermitidaParaRol, rutaPortal, type Rol } from "@/types/dominio";
import { abrirComo, iniciarSesionUi, renderApp, renderAppConEstado } from "./renderApp";

const CUENTAS: Record<Rol, string> = {
  ANALISTA_QA: "jonathan.choque@quality360.local",
  QE: "jose.seguel@quality360.local",
  LIDER_QA: "luis.soto@quality360.local",
  ADMINISTRADOR: "admin@quality360.local",
  AUDITOR: "andrea.mora@quality360.local",
};

const ETIQUETA_PORTAL: Record<Rol, string> = {
  ANALISTA_QA: "Portal Analista QA",
  QE: "Portal QE",
  LIDER_QA: "Portal Líder QA",
  ADMINISTRADOR: "Portal Administrador",
  AUDITOR: "Portal Auditor",
};

const RUTA_EJEMPLO: Record<Rol, string> = {
  ANALISTA_QA: "/qa",
  QE: "/qe/equipo",
  LIDER_QA: "/lider",
  ADMINISTRADOR: "/admin/usuarios",
  AUDITOR: "/auditor/bitacora",
};

describe("Guard de rutas por rol [E1-F02, E1-F05, E1-F07, E7-F01 · D41]", () => {
  it("dirige a cada rol a su propio portal tras iniciar sesión", async () => {
    renderApp("/login");
    await iniciarSesionUi(CUENTAS.ANALISTA_QA);
    expect(await screen.findByText("Portal Analista QA")).toBeInTheDocument();
  });

  it("un QE que abre una ruta administrativa ve acceso denegado en esa URL, con «Ir a mi bandeja», sin el h1 «Usuarios»", async () => {
    await abrirComo(CUENTAS.QE, "/admin/usuarios");

    const denegado = await screen.findByTestId("acceso-denegado");
    expect(denegado).toHaveTextContent("No tienes acceso a esta sección.");
    expect(within(denegado).getByRole("heading", { name: "Acceso denegado" })).toBeInTheDocument();
    expect(within(denegado).getByTestId("boton-ir-a-mi-bandeja")).toHaveAttribute("href", "/qe");
    expect(screen.queryByRole("heading", { name: "Usuarios" })).not.toBeInTheDocument();
    // Se muestra dentro del Layout: el menú propio sigue visible.
    expect(screen.getByRole("navigation", { name: "Portal" })).toHaveTextContent("Historias supervisadas");
  });

  it("un Analista QA que abre una ruta de QE ve acceso denegado en /qe/equipo", async () => {
    await abrirComo(CUENTAS.ANALISTA_QA, "/qe/equipo");
    expect(await screen.findByTestId("acceso-denegado")).toHaveTextContent("No tienes acceso a esta sección.");
    expect(screen.queryByText("Portal QE")).not.toBeInTheDocument();
  });

  it("el acceso denegado no dispara ninguna petición de datos del portal ajeno [E7-F01-T04]", async () => {
    const peticiones: string[] = [];
    server.events.on("request:start", ({ request }) => peticiones.push(new URL(request.url).pathname));
    await abrirComo(CUENTAS.LIDER_QA, "/admin");
    await screen.findByTestId("acceso-denegado");
    expect(peticiones.some((p) => p.startsWith("/v1/inicio/admin") || p.startsWith("/v1/bandeja/admin") || p === "/v1/usuarios")).toBe(false);
    server.events.removeAllListeners();
  });

  it("el Administrador no entra a /lider ni /auditor, y el Auditor no entra a /admin [E7-F01-T04]", async () => {
    await abrirComo(CUENTAS.ADMINISTRADOR, "/auditor");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    cleanup();
    renderApp("/lider");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
  });

  it.each(Object.keys(CUENTAS) as Rol[])("%s: cada portal ajeno responde acceso denegado y el propio abre su bandeja", async (rol) => {
    await abrirComo(CUENTAS[rol], rutaPortal(rol));
    expect(await screen.findByText(ETIQUETA_PORTAL[rol])).toBeInTheDocument();
    cleanup();
    for (const otro of Object.keys(CUENTAS) as Rol[]) {
      if (otro === rol) continue;
      renderApp(RUTA_EJEMPLO[otro]);
      expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
      cleanup();
    }
  });

  it("menú por rol: «Bandeja» primero y sin entradas de escritura para Líder y Auditor [E7-F01-T02]", async () => {
    await abrirComo(CUENTAS.LIDER_QA, "/lider");
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Bandeja", "Perfil"]);
    cleanup();

    renderApp("/");
    // Cambio de sesión: se vuelve a entrar como Auditor.
    await userEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));
    await iniciarSesionUi(CUENTAS.AUDITOR);
    const navAuditor = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(navAuditor).getAllByRole("link").map((a) => a.textContent)).toEqual(["Bandeja", "Perfil"]);
  });

  it("menús de los roles ya certificados cambian «Inicio» por «Bandeja» [E1-F02#3, E1-F05#2]", async () => {
    await abrirComo(CUENTAS.QE, "/qe");
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Bandeja", "Equipo", "Historias supervisadas", "Impedimentos", "Perfil"]);
    cleanup();
    renderApp("/");
  });

  it("sin sesión, una ruta protegida redirige al login", async () => {
    renderApp("/admin");
    expect(await screen.findByRole("heading", { name: "Inicia sesión" })).toBeInTheDocument();
  });

  it("tras el login se descarta una ruta pedida de otro rol y se abre la bandeja propia [E7-F01-T06]", async () => {
    renderAppConEstado({ pathname: "/login", state: { desde: "/admin/usuarios" } });
    await iniciarSesionUi(CUENTAS.QE);
    expect(await screen.findByText("Portal QE")).toBeInTheDocument();
    expect(screen.queryByTestId("acceso-denegado")).not.toBeInTheDocument();
  });

  it("rutaPermitidaParaRol: las rutas compartidas valen para todos y las de otro portal no", () => {
    expect(rutaPermitidaParaRol("/hdu/abc", "AUDITOR")).toBe(true);
    expect(rutaPermitidaParaRol("/perfil", "LIDER_QA")).toBe(true);
    expect(rutaPermitidaParaRol("/auditor/bitacora", "AUDITOR")).toBe(true);
    expect(rutaPermitidaParaRol("/lider", "AUDITOR")).toBe(false);
  });

  it("un 403 vuelve a consultar /v1/me y, si el rol cambió, lleva a la nueva bandeja con aviso [E7-F01-T07]", async () => {
    await abrirComo(CUENTAS.QE, "/qe");
    await screen.findByTestId("bandeja-qe");

    // El Administrador le cambió el rol mientras tenía la sesión abierta: /v1/me ya responde Líder QA.
    server.use(
      http.get(`${env.gatewayUrl}/v1/me`, ({ request }) => {
        const id = request.headers.get("Authorization")?.replace("Bearer mock-token:", "");
        return HttpResponse.json({ id, nombre: "Jose Seguel", correo: CUENTAS.QE, rol: "LIDER_QA" });
      }),
      http.get(`${env.gatewayUrl}/v1/inicio/qe`, () =>
        HttpResponse.json({ codigo: "ACCESO_DENEGADO", mensaje: "No tienes acceso a este recurso.", traceId: "t", detalles: [] }, { status: 403 }),
      ),
    );
    await userEvent.click(screen.getByRole("link", { name: "Equipo" }));
    await userEvent.click(screen.getByRole("link", { name: "Bandeja" }));

    expect(await screen.findByTestId("aviso-rol-cambio")).toHaveTextContent("Tu rol cambió. Te llevamos a tu nueva bandeja.");
    expect(await screen.findByTestId("bandeja-lider")).toBeInTheDocument();
  });
});
