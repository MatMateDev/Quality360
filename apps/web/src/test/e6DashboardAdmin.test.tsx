import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { hdus, supervisorVigenteDe, usuarios } from "@/mocks/data";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { ESTADOS_HDU, ROLES_CATALOGO } from "@/types/dominio";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";
const QE = "jose.seguel@quality360.local";

const pct = (parte: number, total: number) => Math.round((parte / total) * 100);

// Lo esperado se calcula con los mismos datos que sirven los mocks: si cambia la semilla, la prueba sigue.
const activos = usuarios.filter((u) => u.activo);
const analistasActivos = activos.filter((u) => u.rol === "ANALISTA_QA");
const analistasConQe = analistasActivos.filter((u) => supervisorVigenteDe(u.id)).length;

describe("Dashboard Administrador [E6]", () => {
  it("muestra los indicadores globales de la plataforma", async () => {
    await abrirComo(ADMIN, "/admin/dashboard");

    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard Administrador" })).toBeInTheDocument();
    expect(await screen.findByTestId("tarjeta-dash-admin-usuarios")).toHaveTextContent(String(activos.length));
    expect(screen.getByTestId("tarjeta-dash-admin-usuarios")).toHaveTextContent(`de ${usuarios.length} registrados`);
    expect(await screen.findByTestId("contador-dash-admin-hdu")).toHaveTextContent(String(hdus.length));
    expect(screen.getByTestId("tarjeta-dash-admin-cobertura")).toHaveTextContent(`${pct(analistasConQe, analistasActivos.length)}%`);
  });

  it("reparte los usuarios activos entre los cuatro roles, con cifra y porcentaje (sin Líder QA, D208)", async () => {
    await abrirComo(ADMIN, "/admin/dashboard");

    const lista = await screen.findByRole("list", { name: "Usuarios activos por rol" });
    for (const rol of ROLES_CATALOGO) {
      const cantidad = activos.filter((u) => u.rol === rol).length;
      expect(within(lista).getByTestId(`dash-admin-rol-${rol}`)).toHaveTextContent(`${cantidad} (${pct(cantidad, activos.length)}%)`);
    }
    expect(within(lista).getAllByRole("progressbar")).toHaveLength(ROLES_CATALOGO.length);
    expect(within(lista).queryByTestId("dash-admin-rol-LIDER_QA")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Usuarios activos por rol: Analista QA \d+/ })).toBeInTheDocument();
    expect(screen.getByTestId("dash-admin-anillo-cobertura-valor")).toHaveTextContent(`${pct(analistasConQe, analistasActivos.length)}%`);
  });

  it("al pasar sobre un rol, el centro de la dona muestra su cifra", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/dashboard");

    const centro = await screen.findByTestId("dash-admin-rol-centro");
    expect(centro).toHaveTextContent(`${activos.length}usuarios activos`);

    const qe = activos.filter((u) => u.rol === "QE").length;
    await user.hover(screen.getByTestId("dash-admin-rol-QE"));
    expect(centro).toHaveTextContent(`${qe}QE · ${pct(qe, activos.length)}%`);
    await user.unhover(screen.getByTestId("dash-admin-rol-QE"));
    expect(centro).toHaveTextContent(`${activos.length}usuarios activos`);
  });

  it("distribuye todas las HDU de la plataforma por estado y calcula la tasa de cierre", async () => {
    await abrirComo(ADMIN, "/admin/dashboard");

    const lista = await screen.findByRole("list", { name: "HDU por estado" });
    for (const estado of ESTADOS_HDU) {
      const cantidad = hdus.filter((h) => h.estado === estado).length;
      expect(within(lista).getByTestId(`dash-admin-estado-${estado}`)).toHaveTextContent(`${cantidad} (${pct(cantidad, hdus.length)}%)`);
    }
    const cerradas = hdus.filter((h) => h.estado === "CERRADA").length;
    expect(screen.getByTestId("dash-admin-anillo-cierre-valor")).toHaveTextContent(`${pct(cerradas, hdus.length)}%`);
  });

  it("si una fuente cae, solo su bloque lo informa y nunca muestra un 0", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/hdu`, () =>
        HttpResponse.json({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "x", traceId: "t", detalles: [] }, { status: 503 }),
      ),
    );
    simularFuentes({ impedimentos: false });
    await abrirComo(ADMIN, "/admin/dashboard");

    expect(await screen.findByTestId("bloque-dash-admin-hdu-estados-error")).toHaveTextContent("Reintentar");
    expect(screen.queryByRole("list", { name: "HDU por estado" })).not.toBeInTheDocument();
    expect(await screen.findByTestId("estado-indisponible-dash-admin-impedimentos-abiertos")).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("contador-dash-admin-impedimentos-abiertos")).not.toBeInTheDocument();
    // El resto del dashboard sigue con datos.
    expect(screen.getByRole("list", { name: "Usuarios activos por rol" })).toBeInTheDocument();
    expect(screen.getByTestId("contador-dash-admin-analistas-sin-qe")).toBeInTheDocument();
  });

  it("se abre desde el menú del Administrador y es solo para ese rol", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin");
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    await user.click(within(nav).getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard Administrador" })).toBeInTheDocument();
  });

  it("el QE recibe acceso denegado", async () => {
    await abrirComo(QE, "/admin/dashboard");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard Administrador" })).not.toBeInTheDocument();
  });
});
