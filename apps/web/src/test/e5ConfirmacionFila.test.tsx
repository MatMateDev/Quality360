import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ID, hdus, relacionesSupervision } from "@/mocks/data";
import { ejecuciones, modoE5 } from "@/mocks/dataE5";
import { abrirComo, renderApp } from "./renderApp";

const ADMIN = "admin@quality360.local";

async function consultar(modo: typeof modoE5.consulta = "exitosa") {
  const user = userEvent.setup();
  modoE5.consulta = modo;
  await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
  await user.click(await screen.findByTestId("boton-consultar-jira"));
  await screen.findByTestId("consulta-abierta");
  return user;
}

const fila = (codigo: string) => screen.findByTestId(`fila-${codigo}`);
const boton = (codigo: string) => within(screen.getByTestId(`fila-${codigo}`)).getByTestId("boton-confirmar-asignacion");

async function asignarFila(user: ReturnType<typeof userEvent.setup>, codigo: string, celula = "Clientes", qe = "Jose Seguel", analista = "Jonathan Choque") {
  const f = await fila(codigo);
  await user.selectOptions(within(f).getByTestId("selector-celula"), celula);
  await waitFor(() => expect(within(f).getByTestId("selector-sprint")).not.toBeDisabled());
  await user.selectOptions(within(f).getByTestId("selector-qe"), qe);
  await waitFor(() => expect(within(f).getByTestId("selector-analista")).toHaveTextContent(analista));
  await user.selectOptions(within(f).getByTestId("selector-analista"), analista);
  await waitFor(() => expect(within(screen.getByTestId(`fila-${codigo}`)).getByTestId("estado-fila")).toHaveTextContent("Lista"));
}

const cuantasHdu = (codigo: string) => hdus.filter((h) => h.codigo === codigo).length;

describe("E5-F07 · «Confirmar asignación» por fila", () => {
  it("incompleta: el botón queda aria-disabled con su motivo visible y no crea nada [E5-F07-T01]", async () => {
    const user = await consultar();
    await fila("QTY-1");
    const b = boton("QTY-1");
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).toHaveAccessibleName("Confirmar asignación de QTY-1");
    expect(screen.getByTestId("motivo-confirmar-QTY-1")).toHaveTextContent("Falta: célula, QE, analista y sprint");
    expect(b).toHaveAccessibleDescription("Falta: célula, QE, analista y sprint");
    await user.click(b);
    expect(cuantasHdu("QTY-1")).toBe(0);
    expect(screen.getByTestId("fila-QTY-1")).toHaveAttribute("data-estado", "sin-asignar");
  });

  it("completa: crea solo esa HDU, la fila queda Creada con «Ir a la HDU» y el foco pasa a la siguiente [E5-F07-T04]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    expect(boton("QTY-3")).not.toHaveAttribute("aria-disabled");
    await user.click(boton("QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    const f = screen.getByTestId("fila-QTY-3");
    expect(within(f).getByTestId("chip-creada")).toHaveAttribute("data-qe", "Jose Seguel");
    expect(within(f).getByTestId("chip-creada")).toHaveAttribute("data-analista", "Jonathan Choque");
    expect(within(f).getByTestId("chip-creada")).toHaveTextContent("Asignada a Jose Seguel / Jonathan Choque");
    expect(within(f).getByTestId("enlace-ir-a-hdu")).toHaveAccessibleName("Ir a la HDU QTY-3 en Quality360");
    expect(within(f).queryByTestId("boton-confirmar-asignacion")).not.toBeInTheDocument();
    expect(within(f).queryByTestId("selector-qe")).not.toBeInTheDocument();
    expect(within(f).getByTestId("casilla-seleccionar")).toBeDisabled();
    expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("HDU QTY-3 creada: asignada a Jose Seguel / Jonathan Choque");
    expect(cuantasHdu("QTY-3")).toBe(1);
    expect(cuantasHdu("QTY-4")).toBe(0);
    await waitFor(() => expect(screen.getByTestId("contador-creadas")).toHaveTextContent("1 creada"));
    // El lote no cuenta lo ya creado.
    expect(screen.getByTestId("boton-confirmar")).toHaveTextContent("Confirmar marcadas (0)");
    await waitFor(() => expect(within(screen.getByTestId("fila-QTY-4")).getByTestId("boton-ver-detalle")).toHaveFocus());
    // La ejecución queda en el historial con alcance HDU.
    const ejecucion = ejecuciones.find((e) => e.fase === "CONFIRMACION");
    expect(ejecucion).toMatchObject({ alcance: "HDU", leidas: 1, creadas: 1 });
  });

  it("el doble clic no manda dos solicitudes [E5-F07-T09]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    await user.dblClick(boton("QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    expect(cuantasHdu("QTY-3")).toBe(1);
    expect(ejecuciones.filter((e) => e.fase === "CONFIRMACION" && e.alcance === "HDU")).toHaveLength(1);
  });

  it("«Ir a la HDU» abre /hdu/:id para el Administrador [E5-F07-T04]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    await user.click(boton("QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    await user.click(within(screen.getByTestId("fila-QTY-3")).getByTestId("enlace-ir-a-hdu"));
    expect(await screen.findByTestId("valor-analista-hdu")).toHaveTextContent("Jonathan Choque");
    expect(screen.getByTestId("boton-reasignar-qe")).toBeInTheDocument();
  });

  it("carrera: otra persona la creó y la fila pasa a «Ya asignada» con los nombres actuales, sin crear nada [E5-F07-T06]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    modoE5.confirmacionFila = "ya-asignada";
    await user.click(boton("QTY-3"));
    const alerta = await within(screen.getByTestId("fila-QTY-3")).findByTestId("alerta-hdu-ya-asignada");
    expect(alerta).toHaveAttribute("role", "alert");
    expect(alerta).toHaveTextContent("Esta HDU ya fue asignada a Jose Seguel / sin Analista");
    expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "ya-asignada");
    expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("QTY-3 ya fue asignada a Jose Seguel / sin Analista. No se creó nada.");
    expect(within(screen.getByTestId("fila-QTY-3")).queryByTestId("boton-confirmar-asignacion")).not.toBeInTheDocument();
    await waitFor(() => expect(within(alerta).getByText(/Esta HDU ya fue asignada/)).toHaveFocus());
    expect(cuantasHdu("QTY-3")).toBe(0);
  });

  it("otra persona modificó la fila: aviso, la fila se refresca y se puede confirmar de nuevo [E5-F07-T07]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    modoE5.confirmacionFila = "modificada";
    await user.click(boton("QTY-3"));
    expect(await screen.findByTestId("aviso-fila-modificada")).toHaveTextContent("Otra persona modificó esta HDU. Revisa los datos actuales y confirma de nuevo.");
    expect(cuantasHdu("QTY-3")).toBe(0);
    await user.click(boton("QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    expect(cuantasHdu("QTY-3")).toBe(1);
  });

  it("otra persona la está confirmando: aviso y reintento solo pasado un momento [E5-F07-T08]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    modoE5.confirmacionFila = "en-curso";
    await user.click(boton("QTY-3"));
    expect(await screen.findByTestId("aviso-fila-en-curso")).toHaveTextContent("Otra persona está confirmando esta HDU ahora. Espera unos segundos y revisa.");
    expect(boton("QTY-3")).toHaveAttribute("aria-disabled", "true");
    expect(cuantasHdu("QTY-3")).toBe(0);
  });

  it("falla de red: mensaje, «Reintentar» y la fila queda intacta [E5-F07-T10]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    modoE5.confirmacionFila = "red";
    await user.click(boton("QTY-3"));
    const error = await screen.findByTestId("error-confirmar-asignacion");
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveTextContent("No se pudo confirmar. Revisa tu conexión e inténtalo de nuevo.");
    expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "error");
    expect(boton("QTY-3")).toHaveFocus();
    await user.click(screen.getByTestId("boton-reintentar-confirmacion-QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    expect(cuantasHdu("QTY-3")).toBe(1);
  });

  it("desde el panel: misma acción, foco a «Siguiente sin asignar» [E5-F07-T14]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    await user.click(within(screen.getByTestId("fila-QTY-3")).getByTestId("boton-ver-detalle"));
    const panel = await screen.findByTestId("panel-detalle-hdu");
    const confirmar = within(panel).getByTestId("boton-confirmar-asignacion");
    expect(confirmar).toHaveAttribute("data-origen", "panel");
    await user.click(confirmar);
    await waitFor(() => expect(within(panel).getByTestId("chip-creada")).toBeInTheDocument());
    await waitFor(() => expect(within(panel).getByTestId("boton-siguiente-sin-asignar")).toHaveFocus());
    expect(cuantasHdu("QTY-3")).toBe(1);
  });
});

describe("E5-F07 · asignación automática del único analista", () => {
  it("el QE con un solo analista activo lo asigna solo, con aviso visible y anuncio; al cambiar el QE el aviso se va [E5-F07-T02, T03]", async () => {
    const user = await consultar();
    // Se deja a Jose Seguel con un único analista vigente.
    const relacion = relacionesSupervision.find((r) => r.qeId === ID.qe1 && r.analistaId === ID.qa3 && r.hasta === null);
    expect(relacion).toBeDefined();
    relacion!.hasta = "2026-10-01T00:00:00Z";
    try {
      const f = await fila("QTY-3");
      await user.selectOptions(within(f).getByTestId("selector-qe"), "Jose Seguel");
      const aviso = await within(screen.getByTestId("fila-QTY-3")).findByTestId("aviso-analista-automatico");
      expect(aviso).toHaveTextContent("Asignado automáticamente: único analista de Jose Seguel");
      expect(aviso).toHaveAttribute("data-analista", "Jonathan Choque");
      expect(within(screen.getByTestId("fila-QTY-3")).getByTestId("selector-analista")).toHaveValue(ID.qa1);
      await waitFor(() => expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("Analista asignado automáticamente: Jonathan Choque, único del equipo de Jose Seguel"));
      // Cambiar a un QE sin analistas apaga el aviso y avisa que no hay a quién asignar.
      await user.selectOptions(within(screen.getByTestId("fila-QTY-3")).getByTestId("selector-qe"), "Constanza Díaz");
      await waitFor(() => expect(within(screen.getByTestId("fila-QTY-3")).queryByTestId("aviso-analista-automatico")).not.toBeInTheDocument());
      expect(await screen.findByTestId("ayuda-sin-analistas")).toHaveTextContent("Este QE no supervisa analistas activos. Elige otro QE.");
      const motivo = screen.getByTestId("motivo-confirmar-QTY-3");
      expect(motivo).toHaveTextContent("No se puede confirmar: el QE no tiene analistas activos");
    } finally {
      relacion!.hasta = null;
    }
  });
});

describe("E5-F07 · coexistencia con el lote", () => {
  it("el lote conserva lo creado una a una y lo dice; «Terminar revisión» reemplaza a «Descartar consulta» [E5-F07-T11, T12, T13]", async () => {
    const user = await consultar();
    expect(screen.getByTestId("boton-descartar-consulta")).toBeInTheDocument();
    await asignarFila(user, "QTY-3");
    await user.click(boton("QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    expect(screen.getByTestId("texto-coexistencia")).toHaveTextContent("Las HDU que ya confirmaste una a una se conservan y no se repiten.");
    expect(screen.queryByTestId("boton-descartar-consulta")).not.toBeInTheDocument();
    // Una segunda fila va por el lote.
    await asignarFila(user, "QTY-5");
    await user.click(within(screen.getByTestId("fila-QTY-5")).getByTestId("casilla-marcar"));
    await waitFor(() => expect(screen.getByTestId("boton-confirmar")).toHaveTextContent("Confirmar marcadas (1)"));
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(await screen.findByTestId("boton-confirmar-dialogo"));
    expect(await screen.findByTestId("texto-ya-creadas")).toHaveTextContent("1 HDU ya estaba creada y no se repitió");
    expect(cuantasHdu("QTY-3")).toBe(1);
    expect(cuantasHdu("QTY-5")).toBe(1);
  });

  it("«Terminar revisión»: el diálogo dice cuántas se conservan y cuántas se pierden, con «Seguir revisando» como acción segura [E5-F07-T12]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    await user.click(boton("QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    await user.click(screen.getByTestId("boton-terminar-revision"));
    const dialogo = await screen.findByTestId("dialogo-terminar-revision");
    expect(within(dialogo).getByRole("heading", { name: "¿Terminar la revisión?" })).toBeInTheDocument();
    expect(dialogo).toHaveTextContent("1 HDU ya creadas se conservan; 9 filas sin confirmar se perderán.");
    expect(within(dialogo).getByRole("button", { name: "Seguir revisando" })).toHaveFocus();
    await user.click(within(dialogo).getByRole("button", { name: "Seguir revisando" }));
    expect(screen.queryByTestId("dialogo-terminar-revision")).not.toBeInTheDocument();
    expect(cuantasHdu("QTY-3")).toBe(1);
  });
});

describe("E5-F04 · historial: «Una HDU»", () => {
  it("la confirmación de una fila lleva el chip «Una HDU» y se filtra por alcance [E5-F04-T05]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    await user.click(boton("QTY-3"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-3")).toHaveAttribute("data-estado", "creada"));
    const id = ejecuciones.find((e) => e.alcance === "HDU")!.id;
    // La sesión sigue vigente: se vuelve a montar la app directamente en el historial filtrado.
    cleanup();
    renderApp("/admin/integraciones/historial?alcance=HDU");
    expect(await screen.findByTestId(`chip-una-hdu-${id}`)).toHaveTextContent("Una HDU");
    expect(screen.getByLabelText("Alcance")).toHaveValue("HDU");
    const filas = screen.getAllByTestId(/^fila-ejecucion-/);
    expect(filas).toHaveLength(1);
  });
});
