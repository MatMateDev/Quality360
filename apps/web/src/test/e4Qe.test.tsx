import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { hdus, ID } from "@/mocks/data";
import { I } from "@/mocks/dataE4";
import { simularFuentes } from "@/mocks/dataE7";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";

const filasDe = (tabla: HTMLElement, prefijo: string) =>
  within(tabla)
    .getAllByRole("row")
    .map((f) => f.getAttribute("data-testid"))
    .filter((t): t is string => Boolean(t?.startsWith(prefijo)));

describe("/qe/impedimentos [E4-F02]", () => {
  it("lista priorizada por riesgo y días, con contadores [E4-F02-T01]", async () => {
    await abrirComo(QE1, "/qe/impedimentos");
    const tabla = await screen.findByTestId("lista-impedimentos");
    expect(filasDe(tabla, "fila-impedimento-")).toEqual([`fila-impedimento-${I.i2}`, `fila-impedimento-${I.i3}`, `fila-impedimento-${I.i1}`]);
    expect(screen.getByTestId("contador-abiertos")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-escalados")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-nuevos")).toHaveTextContent("1");
    const primera = within(screen.getByTestId(`fila-impedimento-${I.i2}`));
    expect(primera.getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "ALTO");
    expect(primera.getByText("Faltan cuentas de prueba con saldo")).toBeInTheDocument();
    expect(screen.queryByTestId(`fila-impedimento-${I.i4}`)).not.toBeInTheDocument();
    expect(within(screen.getByTestId(`fila-impedimento-${I.i1}`)).getByTestId("insignia-nuevo")).toBeInTheDocument();
  });

  it("«Incluir resueltos» agrega los resueltos al final [E4-F02-T03]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/impedimentos");
    await screen.findByTestId("lista-impedimentos");
    await user.click(screen.getByLabelText("Incluir resueltos"));
    await waitFor(() => expect(screen.getByTestId(`fila-impedimento-${I.i4}`)).toBeInTheDocument());
    const ids = filasDe(screen.getByTestId("lista-impedimentos"), "fila-impedimento-");
    expect(ids.slice(0, 3)).toEqual([`fila-impedimento-${I.i2}`, `fila-impedimento-${I.i3}`, `fila-impedimento-${I.i1}`]);
    expect(ids).toContain(`fila-impedimento-${I.i4}`);
  });

  it("ordenar por días ascendente pone primero al más reciente [E4-F02-T04]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/impedimentos");
    await screen.findByTestId("lista-impedimentos");
    await user.click(within(screen.getByTestId("lista-impedimentos")).getByRole("button", { name: /Días abiertos/ }));
    await waitFor(() => expect(filasDe(screen.getByTestId("lista-impedimentos"), "fila-impedimento-")[0]).toBe(`fila-impedimento-${I.i1}`));
  });

  it("un equipo sin bloqueos dice «Tu equipo no tiene bloqueos» con contadores en 0 [E4-F02-T05]", async () => {
    await abrirComo(QE2, "/qe/impedimentos");
    expect(await screen.findByTestId("estado-vacio-impedimentos")).toHaveTextContent("Tu equipo no tiene bloqueos");
    expect(screen.getByTestId("contador-abiertos")).toHaveTextContent("0");
    expect(screen.queryByTestId("estado-error-impedimentos")).not.toBeInTheDocument();
  });

  it("filtra por célula en la URL y distingue «sin coincidencias» de «sin bloqueos» [E4-F02-T06]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/qe/impedimentos?celula=${ID.celPagos}`);
    await screen.findByTestId("lista-impedimentos");
    expect(filasDe(screen.getByTestId("lista-impedimentos"), "fila-impedimento-")).toEqual([`fila-impedimento-${I.i2}`]);
    await user.selectOptions(screen.getByLabelText("Célula"), ID.celTarjetas);
    expect(await screen.findByTestId("estado-vacio-filtros-impedimentos")).toHaveTextContent("No hay impedimentos con esos filtros");
    expect(screen.queryByText("Tu equipo no tiene bloqueos")).not.toBeInTheDocument();
  });

  it("con Certificaciones caída el riesgo se marca parcial, se mantiene el fijado y se informa el orden por días [E4-F02-T08]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, "/qe/impedimentos");
    await screen.findByTestId("lista-impedimentos");
    // I2 sigue en ALTO porque los impedimentos solos ya lo alcanzan (D68), pero se marca como cálculo parcial.
    const i2 = within(screen.getByTestId(`fila-impedimento-${I.i2}`)).getByTestId("semaforo-riesgo");
    expect(i2).toHaveAttribute("data-nivel", "ALTO");
    expect(i2).toHaveTextContent("Cálculo parcial");
    expect(within(screen.getByTestId(`fila-impedimento-${I.i3}`)).getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
    expect(screen.getByTestId("aviso-orden-por-dias")).toHaveTextContent("Ordenamos solo por días abiertos");
    expect(screen.getByTestId("contador-abiertos")).toHaveTextContent("3");
  });

  it("si Impedimentos no responde la pantalla muestra error con «Reintentar», nunca una lista vacía", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(QE1, "/qe/impedimentos");
    expect(await screen.findByTestId("estado-error-impedimentos")).toBeInTheDocument();
    expect(screen.queryByTestId("estado-vacio-impedimentos")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Reintentar" }).length).toBeGreaterThan(0);
  });

  it("«Abrir» lleva al detalle con el impedimento resaltado [E4-F02-T10]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/impedimentos");
    await user.click(await screen.findByTestId(`boton-abrir-impedimento-${I.i2}`));
    expect(await screen.findByTestId("hdu-bloqueada")).toBeInTheDocument();
    expect(screen.getByTestId(`impedimento-${I.i2}`)).toHaveClass("impedimento--resaltado");
  });

  it("el QE supervisor que no es responsable ve «Solo lectura» [E4-F03-T10]", async () => {
    hdus.find((h) => h.id === ID.hdu1)!.qeResponsableId = ID.qe2;
    await abrirComo(QE1, "/qe/impedimentos");
    const fila = await screen.findByTestId(`fila-impedimento-${I.i2}`);
    expect(within(fila).getByTestId("texto-solo-lectura")).toHaveTextContent("Solo lectura");
  });

  it("el menú del QE tiene «Impedimentos» y queda activo también en Riesgo por HDU", async () => {
    await abrirComo(QE1, "/qe/impedimentos/riesgo");
    await screen.findByTestId("pagina-qe-riesgo");
    const nav = screen.getByRole("navigation", { name: "Portal" });
    expect(within(nav).getByRole("link", { name: "Impedimentos" })).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByRole("navigation", { name: "Secciones de impedimentos" })).getByTestId("pestana-riesgo")).toHaveAttribute("aria-current", "page");
  });
});

describe("/qe/impedimentos/riesgo [E4-F04#3]", () => {
  it("ordena por riesgo, impedimentos abiertos y código, y filtra por nivel [E4-F04-T06]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/impedimentos/riesgo");
    const tabla = await screen.findByTestId("lista-riesgo");
    expect(filasDe(tabla, "fila-riesgo-")).toEqual([ID.hdu1, ID.hdu5, ID.hdu3, ID.hdu6, ID.hdu2].map((id) => `fila-riesgo-${id}`));
    expect(within(screen.getByTestId(`celda-riesgo-${ID.hdu6}`)).getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
    expect(screen.getByTestId(`fila-riesgo-${ID.hdu6}`)).toHaveTextContent("Fijado");
    expect(screen.queryByTestId(`fila-riesgo-${ID.hdu4}`)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Nivel"), "ALTO");
    await waitFor(() => expect(filasDe(screen.getByTestId("lista-riesgo"), "fila-riesgo-")).toEqual([`fila-riesgo-${ID.hdu1}`, `fila-riesgo-${ID.hdu5}`]));
  });

  it("un nivel sin HDU dice «No hay HDU con ese nivel de riesgo» [E4-F04-T07]", async () => {
    await abrirComo(QE2, "/qe/impedimentos/riesgo");
    expect(await screen.findByTestId("estado-vacio-riesgo")).toHaveTextContent("No tienes HDU en tu ámbito");
  });

  it("con Certificaciones caída: el fijado se ve, el resto dice «No disponible» y el filtro por nivel deja la lista indisponible", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, "/qe/impedimentos/riesgo");
    await screen.findByTestId("lista-riesgo");
    expect(within(screen.getByTestId(`celda-riesgo-${ID.hdu6}`)).getByTestId("semaforo-riesgo")).toHaveAttribute("data-nivel", "MEDIO");
    expect(within(screen.getByTestId(`celda-riesgo-${ID.hdu2}`)).getByTestId("estado-indisponible-riesgo")).toBeInTheDocument();
    expect(within(screen.getByTestId(`fila-riesgo-${ID.hdu1}`)).getByTestId("estado-indisponible-avance")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("aviso-orden-por-dias")).toBeInTheDocument();
  });

  it("filtro por nivel con Certificaciones caída: lista indisponible", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(QE1, "/qe/impedimentos/riesgo?nivel=ALTO");
    expect(await screen.findByTestId("estado-indisponible-riesgo")).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("lista-riesgo")).not.toBeInTheDocument();
  });
});

describe("Acceso por rol a las pantallas del QE [E4-F02-T09]", () => {
  const cuentas = ["jonathan.choque@quality360.local", "luis.soto@quality360.local", "admin@quality360.local", "andrea.mora@quality360.local"];
  const rutas = ["/qe/impedimentos", "/qe/impedimentos/riesgo"];
  const combinaciones = cuentas.flatMap((c) => rutas.map((r) => [c, r] as const));
  it.each(combinaciones)("%s en %s ve acceso denegado", async (correo, ruta) => {
    await abrirComo(correo, ruta);
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    expect(screen.queryByTestId("pagina-qe-impedimentos")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pagina-qe-riesgo")).not.toBeInTheDocument();
  });
});
