import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { http as mswHttp } from "msw";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { simularFuentes } from "@/mocks/dataE7";
import { abrirComo } from "./renderApp";

const QA1 = "jonathan.choque@quality360.local";
const QE1 = "jose.seguel@quality360.local";
const LIDER = "luis.soto@quality360.local";
const ADMIN = "admin@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

describe("Panel de riesgo [E4-F04]", () => {
  it("muestra el sugerido con sus factores y el origen «Sugerido» [E4-F04-T03]", async () => {
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    const panel = within(await screen.findByTestId("panel-riesgo"));
    await waitFor(() => expect(panel.getByTestId("riesgo-sugerido")).toHaveTextContent("Alto"));
    expect(panel.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO");
    expect(panel.getByTestId("factor-IMPEDIMENTO_ABIERTO")).toHaveTextContent("Hay 1 impedimento abierto o escalado");
    expect(panel.getByTestId("factor-IMPEDIMENTO_ANTIGUO")).toHaveTextContent("lleva 6 días abierto (desde 5 días se considera alto)");
    expect(panel.getByTestId("factor-ATRASO_SPRINT_ALTO")).toHaveTextContent("el avance es 30 % (menos de 70 %)");
    expect(panel.getByTestId("riesgo-origen")).toHaveTextContent("Sugerido por el sistema");
  });

  it("sin factores dice «Sin factores de riesgo» con nivel Bajo [E4-F04-T04]", async () => {
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    const panel = within(await screen.findByTestId("panel-riesgo"));
    expect(await panel.findByTestId("factor-sin-factores")).toHaveTextContent("Sin factores de riesgo");
    expect(panel.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "BAJO");
  });

  it("fijar con justificación guarda el nivel y conserva la sugerencia; sin ella o con 501 caracteres no guarda [E4-F04-T01/T02]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    await user.click(await screen.findByTestId("boton-fijar-riesgo"));
    const dlg = within(await screen.findByTestId("form-riesgo"));
    await user.click(dlg.getByTestId("riesgo-opcion-ALTO"));
    await user.click(dlg.getByRole("button", { name: "Guardar nivel" }));
    expect(dlg.getByTestId("error-justificacion-riesgo")).toHaveTextContent("La justificación es obligatoria");
    await user.click(dlg.getByTestId("campo-justificacion-riesgo"));
    await user.paste("x".repeat(501));
    await user.click(dlg.getByRole("button", { name: "Guardar nivel" }));
    expect(dlg.getByTestId("error-justificacion-riesgo")).toHaveTextContent("Máximo 500 caracteres");
    await user.clear(dlg.getByTestId("campo-justificacion-riesgo"));
    await user.type(dlg.getByTestId("campo-justificacion-riesgo"), "El cliente exige la entrega");
    await user.click(dlg.getByRole("button", { name: "Guardar nivel" }));
    await waitFor(() => expect(screen.queryByTestId("form-riesgo")).not.toBeInTheDocument());
    const panel = within(screen.getByTestId("panel-riesgo"));
    await waitFor(() => expect(panel.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO"));
    expect(panel.getByTestId("riesgo-origen")).toHaveTextContent("Fijado por Jose Seguel");
    expect(panel.getByTestId("riesgo-sugerido")).toHaveTextContent("Bajo");
    expect(panel.getByTestId("aviso-sugerencia-distinta")).toHaveTextContent("La sugerencia actual es Bajo");
  });

  it("un nivel fijado distinto avisa «La sugerencia actual es X» [E4-F04-T08]", async () => {
    await abrirComo(QE1, `/hdu/${ID.hdu6}`);
    const panel = within(await screen.findByTestId("panel-riesgo"));
    await waitFor(() => expect(panel.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO"));
    expect(panel.getByTestId("riesgo-justificacion")).toHaveTextContent("Dependencia en gestión con el equipo de Pagos");
    expect(panel.getByTestId("aviso-sugerencia-distinta")).toHaveTextContent("La sugerencia actual es Alto");
  });

  it("«Usar el sugerido» precarga el nivel y exige justificación [E4-F04-T05]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    await user.click(await screen.findByTestId("boton-usar-sugerido"));
    const dlg = within(await screen.findByTestId("form-riesgo"));
    expect(dlg.getByTestId("riesgo-opcion-ALTO")).toBeChecked();
    await user.click(dlg.getByRole("button", { name: "Guardar nivel" }));
    expect(dlg.getByTestId("error-justificacion-riesgo")).toBeInTheDocument();
  });

  it("el Analista no tiene panel y no se hace ninguna llamada al riesgo [E4-F04-T09]", async () => {
    const llamadas: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/riesgo")) llamadas.push(request.url);
    });
    await abrirComo(QA1, `/hdu/${ID.hdu1}`);
    await screen.findByTestId("seccion-impedimentos");
    await screen.findByTestId(`impedimento-e4000000-0000-4000-8000-000000000002`);
    expect(screen.queryByTestId("panel-riesgo")).not.toBeInTheDocument();
    expect(llamadas).toEqual([]);
  });

  it.each([LIDER, ADMIN, AUDITOR])("%s ve el panel sin «Fijar riesgo» ni «Usar el sugerido» [E4-F04-T09]", async (correo) => {
    await abrirComo(correo, `/hdu/${ID.hdu1}`);
    const panel = within(await screen.findByTestId("panel-riesgo"));
    await panel.findByTestId("riesgo-sugerido");
    expect(screen.queryByTestId("boton-fijar-riesgo")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-usar-sugerido")).not.toBeInTheDocument();
  });

  it("con Certificaciones caída: ALTO con «Cálculo parcial», y «No disponible» (nunca Bajo) cuando no alcanza [E4-F04-T10]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    const panel = within(await screen.findByTestId("panel-riesgo"));
    expect(await panel.findByTestId("aviso-calculo-parcial")).toHaveTextContent("Cálculo parcial");
    expect(panel.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO");
    expect(panel.getByTestId("factor-no-evaluado")).toHaveTextContent("No disponible");
  });

  it("sin factores evaluables y la fuente caída dice «No disponible», no Bajo", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    const panel = within(await screen.findByTestId("panel-riesgo"));
    expect(await panel.findByTestId("estado-indisponible-riesgo")).toHaveTextContent("No disponible");
    expect(panel.queryByTestId("semaforo-riesgo")).not.toBeInTheDocument();
  });

  it("si el servicio responde 503 el panel completo dice «No disponible» y el detalle sigue", async () => {
    server.use(mswHttp.get(`${env.gatewayUrl}/v1/hdu/:id/riesgo`, () => new Response(JSON.stringify({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "x", traceId: "t", detalles: [] }), { status: 503, headers: { "Content-Type": "application/json" } })));
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    await screen.findByTestId("panel-riesgo");
    expect(await screen.findByTestId("estado-indisponible-riesgo")).toHaveTextContent("No disponible");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
