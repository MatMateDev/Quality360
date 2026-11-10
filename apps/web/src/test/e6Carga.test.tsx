import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { estadoE6 } from "@/mocks/dataE6";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";
const LIDER = "luis.soto@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

const fila = (id: string) => screen.getByTestId(`fila-analista-${id}`);

async function guardarUmbral(user: ReturnType<typeof userEvent.setup>, texto: string) {
  const campo = await screen.findByTestId("campo-umbral");
  await waitFor(() => expect(campo).toBeEnabled());
  await user.clear(campo);
  if (texto) await user.type(campo, texto);
  await user.click(screen.getByTestId("boton-guardar-umbral"));
}

describe("Carga por analista y umbral [E6-F03]", () => {
  it("el QE ve su equipo, la fila sin analista y el umbral 5 «Valor por defecto» sin sobrecargas [E6-F03-T01]", async () => {
    await abrirComo(QE1, "/qe/indicadores/carga");
    await screen.findByTestId(`fila-analista-${ID.qa1}`);
    const a1 = within(fila(ID.qa1));
    expect(a1.getByText("Jonathan Choque")).toBeInTheDocument();
    expect(fila(ID.qa1)).toHaveAttribute("data-sobrecarga", "false");
    expect(fila(ID.qa1)).toHaveTextContent("2 de 5");
    expect(fila(ID.qa1)).toHaveTextContent("70 %");
    expect(fila(ID.qa3)).toHaveTextContent("50 %");
    expect(fila("sin-asignar")).toHaveTextContent("Sin analista asignado");
    expect(fila("sin-asignar")).toHaveTextContent("No se evalúa");
    expect(screen.getByTestId("campo-umbral")).toHaveValue("5");
    expect(screen.getByTestId("insignia-umbral-defecto")).toHaveTextContent("Valor por defecto");
    expect(screen.getByTestId("resumen-umbral")).toHaveTextContent("Hay sobrecarga con más de 5 HDU activas");
    expect(screen.queryByTestId("insignia-sobrecarga")).not.toBeInTheDocument();
    expect(screen.getByTestId("historial-umbral")).toHaveTextContent("Aún no has cambiado el umbral");
  });

  it("fijar el umbral en 1 marca a los dos analistas, no a la fila sin analista; en 2 ninguno [E6-F03-T03][E6-F03-T04]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/carga");
    await guardarUmbral(user, "1");
    expect(await screen.findByTestId("mensaje-exito-umbral")).toHaveTextContent("Umbral guardado: 1 HDU activa");
    await waitFor(() => expect(fila(ID.qa1)).toHaveAttribute("data-sobrecarga", "true"));
    expect(fila(ID.qa3)).toHaveAttribute("data-sobrecarga", "true");
    expect(within(fila(ID.qa1)).getByTestId("insignia-sobrecarga")).toHaveTextContent("Sobrecargado");
    expect(fila("sin-asignar")).not.toHaveAttribute("data-sobrecarga", "true");
    await guardarUmbral(user, "2");
    await waitFor(() => expect(fila(ID.qa1)).toHaveAttribute("data-sobrecarga", "false"));
    expect(screen.queryByTestId("insignia-umbral-defecto")).not.toBeInTheDocument();
    expect(await screen.findByTestId("historial-umbral")).toHaveTextContent("Umbral: 1 → 2");
  });

  it("valores inválidos muestran su mensaje y no guardan; 50 sí se guarda [E6-F03-T06]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/carga");
    for (const [texto, mensaje] of [
      ["0", "El umbral debe estar entre 1 y 50"],
      ["51", "El umbral debe estar entre 1 y 50"],
      ["2.5", "Ingresa un número entero"],
      ["abc", "Ingresa un número entero"],
      ["", "Ingresa un número entero"],
    ] as const) {
      await guardarUmbral(user, texto);
      expect(await screen.findByTestId("error-umbral")).toHaveTextContent(mensaje);
      expect(screen.getByTestId("campo-umbral")).toHaveAttribute("aria-invalid", "true");
    }
    expect(estadoE6.umbrales.size).toBe(0);
    await guardarUmbral(user, "50");
    expect(await screen.findByTestId("mensaje-exito-umbral")).toHaveTextContent("Umbral guardado: 50 HDU activas");
    expect(screen.queryByTestId("error-umbral")).not.toBeInTheDocument();
  });

  it("guardar el mismo valor informa «El umbral ya era 5»", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/carga");
    await guardarUmbral(user, "5");
    expect(await screen.findByTestId("mensaje-exito-umbral")).toHaveTextContent("El umbral ya era 5");
  });

  it("un 403 al guardar avisa que ya no tiene permiso y un 5xx conserva lo escrito", async () => {
    const user = userEvent.setup();
    server.use(http.put(`${env.gatewayUrl}/v1/indicadores/umbral-carga`, () => HttpResponse.json({ codigo: "ACCESO_DENEGADO", mensaje: "x", traceId: "t", detalles: [] }, { status: 403 })));
    await abrirComo(QE1, "/qe/indicadores/carga");
    await guardarUmbral(user, "7");
    expect(await screen.findByTestId("mensaje-error-global")).toHaveTextContent("Ya no tienes permiso para esta acción");
    server.use(http.put(`${env.gatewayUrl}/v1/indicadores/umbral-carga`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x", traceId: "t", detalles: [] }, { status: 500 })));
    await user.click(screen.getByTestId("boton-guardar-umbral"));
    await waitFor(() => expect(screen.getByTestId("mensaje-error-global")).toHaveTextContent("No fue posible guardar. Intenta nuevamente."));
    expect(screen.getByTestId("campo-umbral")).toHaveValue("7");
  });

  it("un QE sin HDU ve el panel del umbral y «Aún no tienes HDU en tu ámbito» [E6-F03-T05]", async () => {
    await abrirComo(QE2, "/qe/indicadores/carga");
    expect(await screen.findByTestId("estado-sin-datos")).toHaveTextContent("Aún no tienes HDU en tu ámbito");
    expect(screen.getByTestId("panel-umbral")).toBeInTheDocument();
  });

  it("el Líder ve el grupo del QE con su umbral y sin controles de edición [E6-F03-T07]", async () => {
    estadoE6.umbrales.set(ID.qe1, { valor: 1, actualizadoEn: "2026-11-04T10:00:00Z", actualizadoPorId: ID.qe1 });
    await abrirComo(LIDER, "/lider/indicadores/carga");
    const grupo = await screen.findByTestId(`grupo-qe-${ID.qe1}`);
    expect(grupo).toHaveTextContent("Equipo de Jose Seguel (QE)");
    expect(grupo).toHaveTextContent("Umbral: 1 HDU activa");
    expect(within(grupo).getByTestId(`fila-analista-${ID.qa1}`)).toHaveAttribute("data-sobrecarga", "true");
    expect(screen.queryByTestId("campo-umbral")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-guardar-umbral")).not.toBeInTheDocument();
    expect(screen.queryByTestId("historial-umbral")).not.toBeInTheDocument();
  });

  it("el Auditor ve el historial del umbral de cada QE dentro de su grupo [E6-F03-T08]", async () => {
    estadoE6.umbrales.set(ID.qe1, { valor: 1, actualizadoEn: "2026-11-04T10:00:00Z", actualizadoPorId: ID.qe1 });
    estadoE6.eventosUmbral.unshift({ id: "ev1", qeId: ID.qe1, valorAnterior: 5, valorNuevo: 1, actorId: ID.qe1, fecha: "2026-11-04T10:00:00Z" });
    await abrirComo(AUDITOR, "/auditor/indicadores/carga");
    const grupo = await screen.findByTestId(`grupo-qe-${ID.qe1}`);
    expect(await within(grupo).findByTestId("historial-umbral")).toHaveTextContent("Jose Seguel · Umbral: 5 → 1");
    expect(document.querySelector("form, button[type=submit]")).toBeNull();
  });

  it("el historial muestra 5 y «Mostrar más» agrega los siguientes", async () => {
    for (let i = 0; i < 7; i++) {
      estadoE6.eventosUmbral.push({ id: `ev${i}`, qeId: ID.qe1, valorAnterior: i + 1, valorNuevo: i + 2, actorId: ID.qe1, fecha: `2026-11-0${i + 1}T10:00:00Z` });
    }
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/carga");
    const historial = await screen.findByTestId("historial-umbral");
    await waitFor(() => expect(within(historial).getAllByRole("listitem")).toHaveLength(5));
    await user.click(within(historial).getByTestId("boton-ver-mas-historial-umbral"));
    await waitFor(() => expect(within(historial).getAllByRole("listitem")).toHaveLength(7));
    expect(within(historial).queryByTestId("boton-ver-mas-historial-umbral")).not.toBeInTheDocument();
  });

  it("un filtro muestra la nota y la columna Activas no cambia [E6-F03]", async () => {
    await abrirComo(QE1, `/qe/indicadores/carga?celula=${ID.celPagos}`);
    expect(await screen.findByTestId("nota-filtros-carga")).toHaveTextContent("La marca de sobrecarga siempre cuenta todas las HDU activas");
    await screen.findByTestId(`fila-analista-${ID.qa1}`);
  });

  it("con Certificaciones caída el cumplimiento dice «No disponible» y la sobrecarga sigue correcta [E6-F03-T11]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, "/qe/indicadores/carga");
    await screen.findByTestId(`fila-analista-${ID.qa1}`);
    expect(within(fila(ID.qa1)).getByTestId("estado-indisponible-cumplimiento")).toHaveTextContent("No disponible");
    expect(fila(ID.qa1)).toHaveTextContent("2 de 5");
    expect(screen.getAllByTestId("aviso-fuente-no-disponible")).toHaveLength(1);
  });

  it("un analista sin HDU muestra ceros, «Sin HDU asignadas» y «—» sin estilo de error [E6-F03-T05]", async () => {
    server.use(
      http.get(`${env.gatewayUrl}/v1/indicadores/carga`, () =>
        HttpResponse.json({
          generadoEn: "2026-11-04T15:20:00Z",
          filtros: { celulaId: null, sprintId: null },
          sinDatos: false,
          motivoSinDatos: null,
          fuentes: { certificaciones: "ok", impedimentos: "ok" },
          grupos: [
            {
              umbral: { qe: { id: ID.qe2, nombre: "Constanza Díaz" }, valor: 5, porDefecto: true },
              filas: [{ analista: { id: ID.qa2, nombre: "Ana Pérez", activo: true }, supervisadoPorMi: true, porEstado: { PENDIENTE: 0, DISENO_PRUEBAS: 0, EN_EJECUCION: 0, PENDIENTE_CIERRE: 0, CERRADA: 0 }, activas: 0, sinHdu: true, cumplimiento: { estado: "ok", valor: null }, sobrecargado: false }],
            },
          ],
          sinAnalista: null,
        }),
      ),
    );
    await abrirComo(QE2, "/qe/indicadores/carga");
    const f = await screen.findByTestId(`fila-analista-${ID.qa2}`);
    expect(f).toHaveTextContent("Sin HDU asignadas");
    expect(f).toHaveTextContent("—");
    expect(f).toHaveAttribute("data-sobrecarga", "false");
    expect(within(f).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un error de la consulta muestra «Reintentar» y no una fila de ceros", async () => {
    server.use(http.get(`${env.gatewayUrl}/v1/indicadores/carga`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x", traceId: "t", detalles: [] }, { status: 500 })));
    await abrirComo(QE1, "/qe/indicadores/carga");
    const e = await screen.findByTestId("estado-error-carga");
    expect(within(e).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByTestId("lista-carga")).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-umbral")).toBeInTheDocument();
  });
});
