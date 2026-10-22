import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";

describe("Reasignar el QE responsable de una HDU [E7-B05 · solo Administrador]", () => {
  it("el Administrador reasigna con motivo obligatorio y el detalle se refresca", async () => {
    const user = userEvent.setup();
    let cuerpo: unknown;
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "PUT" && request.url.endsWith("/qe-responsable")) cuerpo = await request.clone().json();
    });
    await abrirComo(ADMIN, `/hdu/${ID.hdu1}`);
    expect(await screen.findByText("Jose Seguel")).toBeInTheDocument();
    await user.click(await screen.findByTestId("boton-reasignar-qe"));

    const dialogo = within(await screen.findByTestId("dialogo-reasignar-qe"));
    expect(dialogo.getByText(/QE actual:/)).toHaveTextContent("Jose Seguel");
    // Solo QE activos distintos del actual.
    await waitFor(() =>
      expect(within(dialogo.getByTestId("selector-qe-destino")).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Selecciona un QE",
        "Constanza Díaz",
      ]),
    );

    // Sin motivo no se envía.
    await user.selectOptions(dialogo.getByTestId("selector-qe-destino"), ID.qe2);
    await user.click(dialogo.getByRole("button", { name: "Confirmar" }));
    expect(await dialogo.findByText(/El motivo es obligatorio/)).toBeInTheDocument();
    expect(dialogo.getByTestId("campo-motivo-reasignacion")).toHaveAttribute("aria-invalid", "true");
    expect(cuerpo).toBeUndefined();

    await user.type(dialogo.getByTestId("campo-motivo-reasignacion"), "Rebalanceo de carga");
    await user.click(dialogo.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByTestId("aviso-qe-reasignado")).toHaveTextContent("QE responsable reasignado a Constanza Díaz.");
    expect(cuerpo).toEqual({ qeResponsableId: ID.qe2, motivo: "Rebalanceo de carga" });
    await waitFor(() => expect(screen.queryByTestId("dialogo-reasignar-qe")).not.toBeInTheDocument());
    // El detalle se vuelve a consultar: el QE responsable ya es otro.
    await waitFor(() => expect(screen.getByText("QE responsable").nextElementSibling).toHaveTextContent("Constanza Díaz"));
    server.events.removeAllListeners();
  });

  it("muestra el mensaje del servidor ante 409 HDU_CERRADA, 422 QE_INVALIDO y 403, y no cierra el diálogo", async () => {
    const user = userEvent.setup();
    const error = (status: number, codigo: string, mensaje: string) =>
      http.put(`${env.gatewayUrl}/v1/hdu/${ID.hdu1}/qe-responsable`, () => HttpResponse.json({ codigo, mensaje, traceId: "t", detalles: [] }, { status }));
    await abrirComo(ADMIN, `/hdu/${ID.hdu1}`);
    await user.click(await screen.findByTestId("boton-reasignar-qe"));
    const dialogo = within(await screen.findByTestId("dialogo-reasignar-qe"));
    await waitFor(() => expect(dialogo.getByTestId("selector-qe-destino").querySelectorAll("option").length).toBe(2));
    await user.selectOptions(dialogo.getByTestId("selector-qe-destino"), ID.qe2);
    await user.type(dialogo.getByTestId("campo-motivo-reasignacion"), "Motivo válido");

    for (const [status, codigo, mensaje] of [
      [409, "HDU_CERRADA", "La HDU está cerrada y no admite cambios."],
      [422, "QE_INVALIDO", "El QE responsable debe tener rol QE y estar activo."],
      [403, "ACCESO_DENEGADO", "No tienes acceso a este recurso."],
    ] as const) {
      server.use(error(status, codigo, mensaje));
      await user.click(dialogo.getByRole("button", { name: "Confirmar" }));
      expect(await dialogo.findByTestId("error-reasignar-qe")).toHaveTextContent(mensaje);
      expect(screen.getByTestId("dialogo-reasignar-qe")).toBeInTheDocument();
    }
  });

  it("el QE, el Analista y el Líder no ven «Reasignar QE responsable» (se oculta, y el backend lo rechaza igual)", async () => {
    await abrirComo("jose.seguel@quality360.local", `/hdu/${ID.hdu1}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Validación de transferencias" })).toBeInTheDocument();
    expect(screen.queryByTestId("boton-reasignar-qe")).not.toBeInTheDocument();
  });

  it("una HDU cerrada no ofrece la reasignación al Administrador", async () => {
    await abrirComo(ADMIN, `/hdu/${ID.hdu4}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Bloqueo preventivo de tarjeta" })).toBeInTheDocument();
    expect(screen.queryByTestId("boton-reasignar-qe")).not.toBeInTheDocument();
  });
});
