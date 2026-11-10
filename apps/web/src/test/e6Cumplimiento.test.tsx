import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { ID, hdus } from "@/mocks/data";
import { estadoE6 } from "@/mocks/dataE6";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";
const LIDER = "luis.soto@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

const valor = (clave: string) => screen.getByTestId(`indicador-${clave}`);

describe("Cumplimiento [E6-F01]", () => {
  it("el QE ve las siete cifras de su ámbito y las categorías suman los totales [E6-F01-T01]", async () => {
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    expect(valor("totales")).toHaveTextContent(/^6$/);
    expect(valor("certificadas")).toHaveTextContent(/^1$/);
    expect(valor("cerradas-excepcion")).toHaveTextContent(/^0$/);
    expect(valor("en-curso")).toHaveTextContent(/^3$/);
    expect(valor("sin-iniciar")).toHaveTextContent(/^2$/);
    expect(valor("bloqueadas")).toHaveTextContent(/^2$/);
    expect(valor("cumplimiento")).toHaveTextContent(/^52 %$/);
    expect(screen.getByTestId("nota-cuadre")).toHaveTextContent("(1 + 0 + 3 + 2 = 6)");
    expect(screen.getByText("Cerradas con excepción (sin certificado)")).toBeInTheDocument();
    expect(screen.getByTestId("actualizado-en")).toHaveTextContent(/Datos al \d{2}-\d{2}-\d{4} \d{2}:\d{2}/);
  });

  it("el Líder ve solo sus células y el Auditor todo, sin controles de edición [E6-F01-T03][E6-F01-T04]", async () => {
    await abrirComo(LIDER, "/lider/indicadores");
    await screen.findByTestId("indicador-totales");
    expect(valor("totales")).toHaveTextContent(/^5$/);
    expect(valor("certificadas")).toHaveTextContent(/^0$/);
    expect(valor("cumplimiento")).toHaveTextContent(/^42 %$/);
    expect(screen.getByTestId("aviso-solo-lectura")).toBeInTheDocument();
    expect(screen.getByTestId("texto-ambito")).toHaveTextContent("HDU de las células que tienes asignadas");
  });

  it("el Auditor ve todas las HDU y la pantalla no tiene formularios ni botones de envío [E6-F01-T04]", async () => {
    await abrirComo(AUDITOR, "/auditor/indicadores");
    await screen.findByTestId("indicador-totales");
    expect(valor("totales")).toHaveTextContent(/^6$/);
    expect(document.querySelector("form, button[type=submit]")).toBeNull();
  });

  it("un QE sin HDU en su ámbito ve «Aún no tienes HDU en tu ámbito» y ninguna cifra [E6-F01-T08]", async () => {
    await abrirComo(QE2, "/qe/indicadores");
    expect(await screen.findByTestId("estado-sin-datos")).toHaveTextContent("Aún no tienes HDU en tu ámbito");
    expect(screen.queryByTestId("indicador-totales")).not.toBeInTheDocument();
    expect(screen.queryByText(/0 %/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("filtro-celula")).not.toBeInTheDocument();
  });

  it("filtrar por célula recalcula y conserva el filtro en la URL [E6-F01-T05]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    await user.click(screen.getByTestId("boton-filtros"));
    await user.selectOptions(screen.getByLabelText("Célula"), ID.celPagos);
    await waitFor(() => expect(valor("totales")).toHaveTextContent(/^3$/));
    expect(valor("en-curso")).toHaveTextContent(/^2$/);
    expect(valor("sin-iniciar")).toHaveTextContent(/^1$/);
    expect(valor("bloqueadas")).toHaveTextContent(/^1$/);
    expect(valor("cumplimiento")).toHaveTextContent(/^37 %$/);
    expect(screen.getByTestId("total-cumplimiento")).toHaveTextContent("3 HDU en el filtro");
    // Las pestañas conservan el filtro.
    expect(screen.getByTestId("tab-semaforo").getAttribute("href")).toContain("celula=" + ID.celPagos);
  });

  it("una combinación sin HDU dice «No hay HDU con esos filtros» y no muestra cifras [E6-F01-T07]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/qe/indicadores?celula=${ID.celPagos}&sprint=${ID.sprint18}`);
    expect(await screen.findByTestId("estado-sin-datos")).toHaveTextContent("No hay HDU con esos filtros");
    expect(screen.queryByTestId("indicador-totales")).not.toBeInTheDocument();
    expect(screen.queryByText(/\b0 %/)).not.toBeInTheDocument();
    await user.click(within(screen.getByTestId("estado-sin-datos")).getByRole("button", { name: "Limpiar filtros" }));
    expect(await screen.findByTestId("indicador-totales")).toHaveTextContent(/^6$/);
  });

  it("«Sin sprint» solo aparece si hay HDU sin sprint y el sprint cerrado lleva «(cerrado)»", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    await user.click(screen.getByTestId("boton-filtros"));
    const select = screen.getByLabelText("Sprint");
    expect(within(select).queryByRole("option", { name: "Sin sprint" })).not.toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Sprint 2026-18 (cerrado)" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Sprint 2026-19" })).toBeInTheDocument();
  });

  it("«Sin sprint» aparece cuando el servidor informa HDU sin sprint (D180)", async () => {
    estadoE6.hduSinSprint = 2;
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    await user.click(screen.getByTestId("boton-filtros"));
    expect(within(screen.getByLabelText("Sprint")).getByRole("option", { name: "Sin sprint" })).toBeInTheDocument();
  });

  it("con Certificaciones caída conserva totales, excepción y bloqueadas y dice «No disponible» sin ceros [E6-F01-T09]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    expect(valor("totales")).toHaveTextContent(/^6$/);
    expect(valor("cerradas-excepcion")).toHaveTextContent(/^0$/);
    expect(valor("bloqueadas")).toHaveTextContent(/^2$/);
    for (const clave of ["certificadas", "en-curso", "sin-iniciar", "cumplimiento"]) {
      expect(screen.getByTestId(`estado-indisponible-${clave}`)).toHaveTextContent("No disponible");
      expect(screen.queryByTestId(`indicador-${clave}`)).not.toBeInTheDocument();
    }
    expect(screen.getAllByTestId("aviso-fuente-no-disponible")).toHaveLength(1);
    expect(screen.getByTestId("aviso-fuente-no-disponible")).toHaveTextContent("No pudimos consultar el avance de los entregables");
    expect(screen.queryByTestId("nota-cuadre")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Portal" })).toBeInTheDocument();
  });

  it("con Impedimentos caído solo «Bloqueadas» queda no disponible", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    expect(screen.getByTestId("estado-indisponible-bloqueadas")).toHaveTextContent("No disponible");
    expect(valor("certificadas")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("aviso-fuente-no-disponible")).toHaveTextContent("No pudimos consultar los impedimentos");
  });

  it("si Indicadores falla (5xx) muestra un error con «Reintentar» y nunca tarjetas con ceros", async () => {
    server.use(http.get(`${env.gatewayUrl}/v1/indicadores/cumplimiento`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x", traceId: "t", detalles: [] }, { status: 500 })));
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores");
    const error = await screen.findByTestId("estado-error-cumplimiento");
    expect(screen.queryByTestId("indicador-totales")).not.toBeInTheDocument();
    server.resetHandlers();
    await user.click(within(error).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByTestId("indicador-totales")).toHaveTextContent(/^6$/);
  });

  it("un 503 de Organización se muestra como no disponible, sin cifras", async () => {
    estadoE6.organizacionCaida = true;
    await abrirComo(QE1, "/qe/indicadores");
    expect(await screen.findByTestId("estado-indisponible-cumplimiento")).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("indicador-totales")).not.toBeInTheDocument();
  });

  it("una HDU cerrada con excepción cuenta 10 % por entregable, no 100 % [E6-F01-T12]", async () => {
    const h = hdus.find((x) => x.id === ID.hdu2)!;
    h.estado = "CERRADA";
    estadoE6.cierres.set(ID.hdu2, { aprobados: 1, pendientes: [], justificacion: "x".repeat(25), actorId: ID.qe1, fecha: "2026-11-04T15:20:00Z" });
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    expect(valor("cerradas-excepcion")).toHaveTextContent(/^1$/);
    expect(valor("certificadas")).toHaveTextContent(/^1$/);
    expect(valor("en-curso")).toHaveTextContent(/^2$/);
  });
});
