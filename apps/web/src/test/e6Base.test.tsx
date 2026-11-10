import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const LIDER = "luis.soto@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";
const ADMIN = "admin@quality360.local";
const ANALISTA = "jonathan.choque@quality360.local";

const enlaces = (nav: HTMLElement) => within(nav).getAllByRole("link").map((a) => a.textContent);

describe("Base de E6: rutas, menús y guard [E6-F01]", () => {
  it.each([
    ["QE", QE1, "/qe", ["Bandeja", "Equipo", "Historias supervisadas", "Impedimentos", "Indicadores", "Integraciones", "Perfil"]],
    ["Líder QA", LIDER, "/lider", ["Bandeja", "Indicadores", "Perfil"]],
    ["Auditor", AUDITOR, "/auditor", ["Bandeja", "Indicadores", "Perfil"]],
    ["Administrador", ADMIN, "/admin", ["Bandeja", "Usuarios", "Supervisión", "Integraciones", "Snapshots de indicadores", "Perfil"]],
    ["Analista QA", ANALISTA, "/qa", ["Bandeja", "Mis HDU", "Perfil"]],
  ])("menú exacto del %s [E6-F01-T11]", async (_rol, correo, ruta, esperado) => {
    await abrirComo(correo, ruta);
    expect(enlaces(await screen.findByRole("navigation", { name: "Portal" }))).toEqual(esperado);
  });

  it("el QE ve las cuatro pestañas por ruta y «Indicadores» queda activo en todas [E6-F01-T01]", async () => {
    await abrirComo(QE1, "/qe/indicadores/carga");
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav).getByRole("link", { name: "Indicadores" })).toHaveAttribute("aria-current", "page");
    const pestanas = screen.getByRole("navigation", { name: "Secciones de indicadores" });
    expect(within(pestanas).getAllByRole("link").map((a) => a.textContent)).toEqual(["Cumplimiento", "Semáforo", "Carga", "Tendencia"]);
    expect(screen.getByTestId("tab-carga")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("tab-cumplimiento")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("texto-ambito")).toHaveTextContent("HDU donde eres QE responsable y las de los analistas que supervisas");
  });

  it("el Auditor tiene «Indicadores» activo y «Bandeja» inactivo en /auditor/indicadores, sin dos filas de pestañas [E6-F01-T04]", async () => {
    await abrirComo(AUDITOR, "/auditor/indicadores");
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav).getByRole("link", { name: "Indicadores" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Bandeja" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("navigation", { name: /pestañas del auditor|secciones del auditor/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("aviso-solo-lectura")).toBeInTheDocument();
    expect(document.querySelector("form, button[type=submit]")).toBeNull();
  });

  it("en sus pestañas de siempre el Auditor conserva «Bandeja» activa [E6-F01-T11]", async () => {
    await abrirComo(AUDITOR, "/auditor/certificados");
    const nav2 = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav2).getByRole("link", { name: "Bandeja" })).toHaveAttribute("aria-current", "page");
  });

  it("el Líder tiene «Bandeja» sin aria-current en /lider/indicadores [E6-F01-T03]", async () => {
    await abrirComo(LIDER, "/lider/indicadores");
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav).getByRole("link", { name: "Bandeja" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Indicadores" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["Analista", ANALISTA, "/qe/indicadores"],
    ["Analista", ANALISTA, "/lider/indicadores"],
    ["Administrador", ADMIN, "/qe/indicadores"],
    ["Administrador", ADMIN, "/auditor/indicadores/carga"],
    ["QE", QE1, "/lider/indicadores"],
    ["QE", QE1, "/auditor/indicadores"],
    ["QE", QE1, "/admin/indicadores/snapshots"],
    ["Líder", LIDER, "/qe/indicadores/semaforo"],
    ["Auditor", AUDITOR, "/admin/indicadores/snapshots"],
  ])("%s en %s ve acceso denegado y no se pide ningún dato [E6-F01-T10]", async (_rol, correo, ruta) => {
    let peticiones = 0;
    server.use(http.get(`${env.gatewayUrl}/v1/indicadores/*`, () => (peticiones += 1, HttpResponse.json({}))));
    await abrirComo(correo, ruta);
    const denegado = await screen.findByTestId("acceso-denegado");
    expect(within(denegado).getByTestId("boton-ir-a-mi-bandeja")).toBeInTheDocument();
    expect(peticiones).toBe(0);
  });

  it("los portales de dashboards responden 403 al Administrador y al Analista (la autorización real es del backend)", async () => {
    await abrirComo(ADMIN, "/admin");
    await screen.findByRole("navigation", { name: "Portal" });
    const { obtenerAccessToken } = await import("@/auth/sessionStore");
    const token = obtenerAccessToken();
    for (const ruta of ["cumplimiento", "semaforo", "carga", "filtros", "tendencia"]) {
      const r = await fetch(`${env.gatewayUrl}/v1/indicadores/${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(r.status).toBe(403);
    }
  });
});
