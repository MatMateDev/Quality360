import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { estadoE6 } from "@/mocks/dataE6";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";
const QE1 = "jose.seguel@quality360.local";

describe("Snapshots del Administrador [E6-B03]", () => {
  it("muestra la última ejecución, la lista y ninguna cifra de indicadores", async () => {
    await abrirComo(ADMIN, "/admin/indicadores/snapshots");
    const estado = await screen.findByTestId("snapshot-estado");
    await waitFor(() => expect(estado).toHaveTextContent("Última ejecución"));
    expect(estado).toHaveTextContent("Exitosa");
    expect(estado).toHaveTextContent("24 filas escritas");
    expect(estado).toHaveTextContent("entre las 02:00 y las 03:59");
    const lista = await screen.findByTestId("lista-ejecuciones");
    expect(within(lista).getAllByRole("row")).toHaveLength(3);
    expect(within(lista).getByText("Programada")).toBeInTheDocument();
    expect(within(lista).getByText("No respondió el servicio de impedimentos")).toBeInTheDocument();
    expect(screen.queryByTestId("indicador-totales")).not.toBeInTheDocument();
  });

  it("«Generar snapshot ahora» muestra la espera y luego el éxito, y recarga la lista", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/indicadores/snapshots");
    await screen.findByTestId("lista-ejecuciones");
    await user.click(screen.getByTestId("boton-generar-snapshot"));
    expect(await screen.findByTestId("mensaje-exito")).toHaveTextContent("Snapshot generado: 24 filas escritas.");
    await waitFor(() => expect(within(screen.getByTestId("lista-ejecuciones")).getAllByRole("row")).toHaveLength(4));
    expect(screen.getByTestId("boton-generar-snapshot")).toBeEnabled();
  });

  it("una ejecución fallida muestra el motivo en una tabla local y «No se guardó ninguna fila»", async () => {
    estadoE6.snapshotFalla = "CERTIFICACIONES_NO_DISPONIBLE";
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/indicadores/snapshots");
    await user.click(await screen.findByTestId("boton-generar-snapshot"));
    expect(await screen.findByTestId("mensaje-error-global")).toHaveTextContent("No respondió el servicio de avance de entregables. No se guardó ninguna fila.");
  });

  it("409 EJECUCION_EN_CURSO avisa que ya hay un snapshot en ejecución", async () => {
    estadoE6.snapshotEnCurso = true;
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/indicadores/snapshots");
    await user.click(await screen.findByTestId("boton-generar-snapshot"));
    expect(await screen.findByTestId("aviso-en-curso")).toHaveTextContent("Ya hay un snapshot en ejecución");
  });

  it("un 403 y un 5xx al generar tienen su propio mensaje", async () => {
    const user = userEvent.setup();
    server.use(http.post(`${env.gatewayUrl}/v1/indicadores/snapshots`, () => HttpResponse.json({ codigo: "ACCESO_DENEGADO", mensaje: "x", traceId: "t", detalles: [] }, { status: 403 })));
    await abrirComo(ADMIN, "/admin/indicadores/snapshots");
    await user.click(await screen.findByTestId("boton-generar-snapshot"));
    expect(await screen.findByTestId("mensaje-error-global")).toHaveTextContent("Ya no tienes permiso para esta acción");
    server.use(http.post(`${env.gatewayUrl}/v1/indicadores/snapshots`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x", traceId: "t", detalles: [] }, { status: 500 })));
    await user.click(screen.getByTestId("boton-generar-snapshot"));
    await waitFor(() => expect(screen.getByTestId("mensaje-error-global")).toHaveTextContent("No fue posible generar el snapshot. Intenta nuevamente."));
  });

  it("sin ejecuciones dice «Aún no se ha ejecutado ningún snapshot»", async () => {
    estadoE6.ejecuciones = [];
    await abrirComo(ADMIN, "/admin/indicadores/snapshots");
    expect(await screen.findByTestId("estado-vacio-snapshot-ejecuciones")).toHaveTextContent("Aún no se ha ejecutado ningún snapshot");
  });

  it("un error al listar muestra «Reintentar»", async () => {
    estadoE6.indicadoresCaido = true;
    await abrirComo(ADMIN, "/admin/indicadores/snapshots");
    const e = await screen.findByTestId("estado-error-snapshot-ejecuciones");
    expect(within(e).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("un QE no entra a la pantalla y la API responde 403", async () => {
    await abrirComo(QE1, "/admin/indicadores/snapshots");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    expect(screen.queryByTestId("boton-generar-snapshot")).not.toBeInTheDocument();
  });
});
