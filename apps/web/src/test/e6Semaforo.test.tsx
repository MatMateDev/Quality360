import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";
const LIDER = "luis.soto@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

const tarjeta = (id: string) => screen.getByTestId(`tarjeta-celula-${id}`);

describe("Semáforo por célula [E6-F02]", () => {
  it("QE1: Pagos rojo, Clientes amarillo, Tarjetas verde, con texto y data-color, en orden de gravedad [E6-F02-T01]", async () => {
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    await screen.findByTestId(`tarjeta-celula-${ID.celPagos}`);
    expect(tarjeta(ID.celPagos)).toHaveAttribute("data-color", "ROJO");
    expect(tarjeta(ID.celPagos)).toHaveTextContent("Rojo");
    expect(tarjeta(ID.celClientes)).toHaveAttribute("data-color", "AMARILLO");
    expect(tarjeta(ID.celTarjetas)).toHaveAttribute("data-color", "VERDE");
    expect(tarjeta(ID.celTarjetas)).toHaveTextContent("Verde");
    const orden = screen.getAllByRole("article").map((a) => a.getAttribute("data-color"));
    expect(orden).toEqual(["ROJO", "AMARILLO", "VERDE"]);
  });

  it("Líder ve solo sus células y el Auditor todas [E6-F02-T03]", async () => {
    await abrirComo(LIDER, "/lider/indicadores/semaforo");
    await screen.findByTestId(`tarjeta-celula-${ID.celPagos}`);
    expect(screen.queryByTestId(`tarjeta-celula-${ID.celTarjetas}`)).not.toBeInTheDocument();
    expect(screen.getByTestId("aviso-solo-lectura")).toBeInTheDocument();
  });

  it("Auditor ve las tres células [E6-F02-T03]", async () => {
    await abrirComo(AUDITOR, "/auditor/indicadores/semaforo");
    await screen.findByTestId(`tarjeta-celula-${ID.celPagos}`);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("el drill-down lista las HDU que generan el color, en la URL, con foco y cierre [E6-F02-T04]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    const boton = await screen.findByTestId(`boton-ver-detalle-${ID.celPagos}`);
    expect(boton).toHaveAccessibleName("Ver HDU de Pagos");
    await user.click(boton);
    const lista = await screen.findByTestId("lista-drilldown");
    expect(within(lista).getByTestId(`fila-drilldown-${ID.hdu1}`)).toBeInTheDocument();
    expect(within(lista).getByTestId(`fila-drilldown-${ID.hdu5}`)).toBeInTheDocument();
    expect(within(lista).getByTestId(`fila-drilldown-${ID.hdu2}`)).toBeInTheDocument();
    expect(within(lista).queryByTestId(`fila-drilldown-${ID.hdu3}`)).not.toBeInTheDocument();
    const h1 = within(screen.getByTestId(`fila-drilldown-${ID.hdu1}`));
    expect(h1.getByTestId("chip-motivo-IMPEDIMENTO_ESCALADO")).toBeInTheDocument();
    expect(h1.getByTestId("chip-motivo-RIESGO_ALTO")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "HDU que generan el color de Pagos" })[0]).toHaveFocus();
    expect(boton).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByTestId("boton-cerrar-detalle"));
    await waitFor(() => expect(screen.queryByTestId("lista-drilldown")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId(`boton-ver-detalle-${ID.celPagos}`)).toHaveFocus());
  });

  it("recargar con ?detalle= abre el panel [E6-F02-T05]", async () => {
    await abrirComo(QE1, `/qe/indicadores/semaforo?detalle=${ID.celClientes}`);
    const lista = await screen.findByTestId("lista-drilldown");
    expect(within(lista).getByTestId(`fila-drilldown-${ID.hdu3}`)).toBeInTheDocument();
    expect(within(lista).getByTestId("chip-motivo-IMPEDIMENTO_ABIERTO")).toBeInTheDocument();
  });

  it("una célula verde dice «Sin HDU con riesgo ni impedimentos» [E6-F02-T06]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    await user.click(await screen.findByTestId(`boton-ver-detalle-${ID.celTarjetas}`));
    expect(await screen.findByTestId("estado-vacio-drilldown")).toHaveTextContent("Sin HDU con riesgo ni impedimentos");
  });

  it("con Impedimentos caído las tarjetas dicen «No disponible» y ninguna es verde [E6-F02-T09]", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    await screen.findByTestId(`tarjeta-celula-${ID.celPagos}`);
    for (const art of screen.getAllByRole("article")) {
      expect(art).toHaveAttribute("data-color", "NO_DISPONIBLE");
      expect(art).toHaveTextContent("No disponible");
    }
  });

  it("con Certificaciones caída: Pagos rojo con cálculo parcial, Clientes no disponible y no verde [E6-F02-T10]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    await screen.findByTestId(`tarjeta-celula-${ID.celPagos}`);
    expect(tarjeta(ID.celPagos)).toHaveAttribute("data-color", "ROJO");
    expect(within(tarjeta(ID.celPagos)).getByTestId("aviso-calculo-parcial")).toHaveTextContent("Cálculo parcial");
    expect(tarjeta(ID.celClientes)).toHaveAttribute("data-color", "NO_DISPONIBLE");
    expect(tarjeta(ID.celClientes)).toHaveTextContent("al menos Amarillo");
  });

  it("una célula del Líder sin HDU sale gris «Sin HDU» y no verde [E6-F02-T11]", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/indicadores/semaforo`, () =>
        HttpResponse.json({
          generadoEn: "2026-11-04T15:20:00Z",
          filtros: { celulaId: null, sprintId: null },
          sinDatos: false,
          motivoSinDatos: null,
          fuentes: { certificaciones: "ok", impedimentos: "ok" },
          celulas: [{ celula: { id: ID.celTarjetas, nombre: "CEL-D" }, estado: "SIN_HDU", color: null, alMenos: null, calculoParcial: false, riesgoMaximo: null, impedimentosAbiertos: null, impedimentosEscalados: null, hduActivas: 0 }],
        }),
      ),
    );
    await abrirComo(LIDER, "/lider/indicadores/semaforo");
    const t = await screen.findByTestId(`tarjeta-celula-${ID.celTarjetas}`);
    expect(t).toHaveAttribute("data-color", "SIN_HDU");
    expect(t).toHaveTextContent("Sin HDU en tu ámbito");
    expect(within(t).queryByRole("button")).not.toBeInTheDocument();
  });

  it("un QE sin HDU ve «Aún no tienes HDU en tu ámbito»", async () => {
    await abrirComo(QE2, "/qe/indicadores/semaforo");
    expect(await screen.findByTestId("estado-sin-datos")).toHaveTextContent("Aún no tienes HDU en tu ámbito");
  });

  it("un detalle ajeno (403) muestra «No tienes acceso a esa célula» y quita el parámetro", async () => {
    server.use(http.get(`${env.gatewayUrl}/v1/indicadores/semaforo/${ID.celClientes}/hdu`, () => HttpResponse.json({ codigo: "ACCESO_DENEGADO", mensaje: "x", traceId: "t", detalles: [] }, { status: 403 })));
    await abrirComo(QE1, `/qe/indicadores/semaforo?detalle=${ID.celClientes}`);
    expect(await screen.findByTestId("aviso-sin-acceso-celula")).toHaveTextContent("No tienes acceso a esa célula");
    await waitFor(() => expect(screen.queryByTestId("panel-drilldown")).not.toBeInTheDocument());
  });

  it("el error del semáforo muestra «Reintentar» y no tarjetas", async () => {
    server.use(http.get(`${env.gatewayUrl}/v1/indicadores/semaforo`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x", traceId: "t", detalles: [] }, { status: 500 })));
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    const e = await screen.findByTestId("estado-error-semaforo");
    expect(within(e).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});
