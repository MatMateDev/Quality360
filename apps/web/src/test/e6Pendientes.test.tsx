import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ID, hdus } from "@/mocks/data";
import { I, impedimentosMock } from "@/mocks/dataE4";
import { estadoE6 } from "@/mocks/dataE6";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";

const orden = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole("row")
    .map((f) => f.getAttribute("data-testid"))
    .filter((t): t is string => Boolean(t?.startsWith("fila-analista-") && t !== "fila-analista-sin-asignar"));

describe("Carga: columnas ordenables [E6-F03]", () => {
  it("Analista, Activas y Cumplimiento tienen botón con aria-sort y reordenan las filas", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/carga");
    const tabla = await screen.findByTestId("lista-carga");
    // Orden del servidor: activas iguales, por nombre.
    expect(orden(tabla)).toEqual([`fila-analista-${ID.qa3}`, `fila-analista-${ID.qa1}`]);
    expect(within(tabla).getByRole("columnheader", { name: /Analista/ })).toHaveAttribute("aria-sort", "none");
    expect(within(tabla).queryByRole("button", { name: "Cerrada" })).not.toBeInTheDocument();

    await user.click(within(tabla).getByRole("button", { name: /Cumplimiento/ }));
    expect(orden(tabla)).toEqual([`fila-analista-${ID.qa3}`, `fila-analista-${ID.qa1}`]); // 50 % antes de 70 %
    expect(within(tabla).getByRole("columnheader", { name: /Cumplimiento/ })).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(tabla).getByRole("button", { name: /Cumplimiento/ }));
    expect(orden(tabla)).toEqual([`fila-analista-${ID.qa1}`, `fila-analista-${ID.qa3}`]);
    expect(within(tabla).getByRole("columnheader", { name: /Cumplimiento/ })).toHaveAttribute("aria-sort", "descending");

    await user.click(within(tabla).getByRole("button", { name: /^Analista/ }));
    expect(orden(tabla)).toEqual([`fila-analista-${ID.qa3}`, `fila-analista-${ID.qa1}`]); // Camila antes que Jonathan
    await user.click(within(tabla).getByRole("button", { name: /^Analista/ }));
    expect(orden(tabla)).toEqual([`fila-analista-${ID.qa1}`, `fila-analista-${ID.qa3}`]);
    // «Sin analista asignado» siempre queda al final.
    const filas = within(tabla).getAllByRole("row");
    expect(filas[filas.length - 1]).toHaveAttribute("data-testid", "fila-analista-sin-asignar");

    await user.click(within(tabla).getByRole("button", { name: /Activas/ }));
    expect(within(tabla).getByRole("columnheader", { name: /Activas/ })).toHaveAttribute("aria-sort", "ascending");
  });
});

describe("Semáforo refleja los cambios de impedimentos al volver [E6-F02]", () => {
  async function irAlDetalleDeClientes(user: ReturnType<typeof userEvent.setup>) {
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    expect(await screen.findByTestId(`tarjeta-celula-${ID.celClientes}`)).toHaveAttribute("data-color", "AMARILLO");
    await user.click(screen.getByTestId(`boton-ver-detalle-${ID.celClientes}`));
    await user.click(await screen.findByRole("link", { name: `Abrir HDU CLIENTES-2001: Actualización de datos personales` }));
  }

  it("al resolver el impedimento y volver, la célula pasa a verde; al reabrirlo, a amarillo [E6-F02-T07][E6-F02-T08]", async () => {
    const user = userEvent.setup();
    await irAlDetalleDeClientes(user);
    await user.click(await screen.findByTestId(`boton-resolver-${I.i1}`));
    const dlg = within(await screen.findByTestId("dialogo-resolver"));
    await user.type(dlg.getByLabelText(/^Comentario/), "Se estabilizó el ambiente");
    await user.click(dlg.getByRole("button", { name: /Confirmar resolución/ }));
    await screen.findByTestId("mensaje-exito-impedimento");

    await user.click(await screen.findByTestId("enlace-volver-bandeja"));
    await waitFor(() => expect(screen.getByTestId(`tarjeta-celula-${ID.celClientes}`)).toHaveAttribute("data-color", "VERDE"));
  });

  it("al reabrir un impedimento resuelto y volver al Semáforo, el color pasa de verde a amarillo [E6-F02-T08]", async () => {
    const user = userEvent.setup();
    const imp = impedimentosMock.find((x) => x.id === I.i1)!;
    imp.estado = "RESUELTO";
    imp.fechaResolucion = new Date().toISOString();
    await abrirComo(QE1, `/hdu/${ID.hdu3}`);
    await user.click(await screen.findByTestId(`boton-reabrir-${I.i1}`));
    const dlg = within(await screen.findByTestId("dialogo-reabrir"));
    await user.type(dlg.getByLabelText(/^Motivo/), "Volvió a fallar el ambiente");
    await user.click(dlg.getByRole("button", { name: /Confirmar reapertura/ }));
    await screen.findByTestId("hdu-bloqueada");

    const menu = screen.getByRole("navigation", { name: "Portal" });
    await user.click(within(menu).getByRole("link", { name: "Indicadores" }));
    await user.click(await screen.findByTestId("tab-semaforo"));
    await waitFor(() => expect(screen.getByTestId(`tarjeta-celula-${ID.celClientes}`)).toHaveAttribute("data-color", "AMARILLO"));
  });
});

describe("Carga con la reasignación de D190: un solo supervisor, umbral por QE [E6-F03-T10]", () => {
  // H6 (analista QA3, supervisada por QE1) pasa a tener a QE2 como responsable (la reasignación de ADM1).
  const reasignar = () => {
    hdus.find((h) => h.id === ID.hdu6)!.qeResponsableId = ID.qe2;
  };

  it("QE1 (supervisor) cuenta toda la carga de la analista con su umbral y la marca sobrecargada", async () => {
    reasignar();
    estadoE6.umbrales.set(ID.qe1, { valor: 1, actualizadoEn: "2026-11-04T10:00:00Z", actualizadoPorId: ID.qe1 });
    await abrirComo(QE1, "/qe/indicadores/carga");
    const f = await screen.findByTestId(`fila-analista-${ID.qa3}`);
    expect(f).toHaveAttribute("data-sobrecarga", "true");
    expect(f).toHaveTextContent("2 de 1");
    expect(within(f).queryByTestId("etiqueta-no-supervisado")).not.toBeInTheDocument();
  });

  it("QE2 la ve como «No supervisado por ti», con solo su parte de la carga y su umbral 5", async () => {
    reasignar();
    estadoE6.umbrales.set(ID.qe1, { valor: 1, actualizadoEn: "2026-11-04T10:00:00Z", actualizadoPorId: ID.qe1 });
    await abrirComo(QE2, "/qe/indicadores/carga");
    const f = await screen.findByTestId(`fila-analista-${ID.qa3}`);
    expect(within(f).getByTestId("etiqueta-no-supervisado")).toHaveTextContent("No supervisado por ti");
    expect(f).toHaveAttribute("data-sobrecarga", "false");
    expect(f).toHaveTextContent("1 de 5");
  });
});
