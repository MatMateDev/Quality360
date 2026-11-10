import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { estadoE6 } from "@/mocks/dataE6";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";
const LIDER = "luis.soto@quality360.local";
const ADMIN = "admin@quality360.local";

const respuestaTendencia = (series: unknown[], extra: Record<string, unknown> = {}) =>
  http.get(`${env.gatewayUrl}/v1/indicadores/tendencia`, () =>
    HttpResponse.json({ generadoEn: "2026-11-04T15:20:00Z", filtros: { celulaId: null, sprintId: null }, sinDatos: series.length === 0, motivoSinDatos: series.length === 0 ? "SIN_HISTORIAL" : null, totalSeries: series.length, series, ...extra }),
  );

const serie = (celula: string, sprint: string, puntos: Array<[string, number, number]>, cerrado = false) => ({
  celula: { id: ID.celPagos, nombre: celula },
  sprint: { id: ID.sprint19, nombre: sprint, inicio: "2026-09-14", fin: "2026-09-27", cerrado },
  puntos: puntos.map(([fecha, cumplimiento, hduTotal]) => ({ fecha, cumplimiento, hduTotal })),
});

describe("Tendencia [E6-F04]", () => {
  it("una serie por (célula, sprint) rotulada «Célula · Sprint», con gráfica, leyenda, resumen y tabla [E6-F04-T01][E6-F04-T02]", async () => {
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    const grafica = await screen.findByTestId("grafica-tendencia");
    expect(grafica).toHaveAttribute("role", "img");
    expect(grafica).toHaveAttribute("aria-labelledby");
    expect(grafica).toHaveAttribute("aria-describedby");
    expect(grafica).toHaveAttribute("tabindex", "0");
    expect(within(grafica).getAllByTestId("punto-tendencia")).toHaveLength(5);
    const leyenda = screen.getByTestId("leyenda-tendencia");
    expect(within(leyenda).getAllByRole("listitem")).toHaveLength(2);
    expect(leyenda).toHaveTextContent("Pagos · Sprint 2026-19 (último: 40 % el 17-09)");
    expect(screen.getByTestId("resumen-tendencia")).toHaveTextContent("Pagos · Sprint 2026-19: 3 días de historial, de 30 % (15-09) a 40 % (17-09), 10 puntos más.");
    const tabla = screen.getByTestId("tabla-tendencia");
    expect(within(tabla).getByRole("columnheader", { name: /Pagos · Sprint 2026-19/ })).toBeInTheDocument();
    expect(within(tabla).getAllByRole("row")).toHaveLength(1 + 5);
    expect(screen.getByTestId("nota-madrugada")).toHaveTextContent("madrugada");
  });

  it("filtrar por célula deja solo su serie en orden de fecha; los huecos se marcan «Sin snapshot» [E6-F04-T01]", async () => {
    await abrirComo(QE1, `/qe/indicadores/tendencia?celula=${ID.celPagos}`);
    const tabla = await screen.findByTestId("tabla-tendencia");
    const filas = within(tabla).getAllByRole("row").slice(1);
    expect(filas.map((f) => within(f).getAllByRole("cell")[0]!.textContent)).toEqual(["30 % · 1 HDU", "30 % · 1 HDU", "40 % · 1 HDU"]);
    expect(within(screen.getByTestId("leyenda-tendencia")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("un día sin snapshot corta la línea y la tabla lo dice [E6-F04-T06]", async () => {
    server.use(respuestaTendencia([serie("Pagos", "S-12", [["2026-10-12", 30, 1], ["2026-10-14", 40, 1]])]));
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    const grafica = await screen.findByTestId("grafica-tendencia");
    expect(grafica.querySelectorAll("polyline")).toHaveLength(0);
    expect(within(grafica).getAllByTestId("punto-tendencia")).toHaveLength(2);
    expect(screen.getByTestId("resumen-tendencia")).toHaveTextContent("con 1 día sin snapshot (13-10)");
  });

  it("días consecutivos se unen con una línea [E6-F04-T01]", async () => {
    server.use(respuestaTendencia([serie("Pagos", "S-12", [["2026-10-12", 30, 1], ["2026-10-13", 30, 1], ["2026-10-14", 40, 1]])]));
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    const grafica = await screen.findByTestId("grafica-tendencia");
    expect(grafica.querySelectorAll("polyline")).toHaveLength(1);
  });

  it("sin historial dice «Aún no hay historial» y no dibuja gráfica, tabla ni valores [E6-F04-T05]", async () => {
    server.use(respuestaTendencia([]));
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    expect(await screen.findByTestId("aviso-sin-historial")).toHaveTextContent("Aún no hay historial");
    expect(screen.queryByTestId("grafica-tendencia")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tabla-tendencia")).not.toBeInTheDocument();
  });

  it("un solo día de historial dibuja el punto y avisa [E6-F04-T07]", async () => {
    server.use(respuestaTendencia([serie("Pagos", "S-12", [["2026-10-12", 30, 1]])]));
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    expect(await screen.findByTestId("aviso-un-solo-dia")).toHaveTextContent("Aún hay un solo día de historial");
    expect(within(screen.getByTestId("grafica-tendencia")).getAllByTestId("punto-tendencia")).toHaveLength(1);
  });

  it("con más de 6 series muestra el aviso del tope", async () => {
    const seis = Array.from({ length: 6 }, (_, i) => serie(`C${i}`, "S", [["2026-10-12", 10 * i, 1]]));
    server.use(respuestaTendencia(seis, { totalSeries: 9 }));
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    expect(await screen.findByTestId("mensaje-aviso")).toHaveTextContent("Mostrando 6 de 9 series");
  });

  it("filtro sin coincidencias dice «No hay historial para esos filtros»", async () => {
    await abrirComo(QE1, `/qe/indicadores/tendencia?desde=2027-01-01`);
    expect(await screen.findByTestId("estado-sin-datos")).toHaveTextContent("No hay historial para esos filtros");
  });

  it("una fecha final anterior a la inicial muestra el error y no consulta", async () => {
    let consultas = 0;
    server.use(http.get(`${env.gatewayUrl}/v1/indicadores/tendencia`, () => (consultas += 1, HttpResponse.json({}))));
    await abrirComo(QE1, "/qe/indicadores/tendencia?desde=2026-10-10&hasta=2026-10-01");
    expect(await screen.findByTestId("error-rango-fechas")).toHaveTextContent("La fecha final debe ser igual o posterior a la inicial");
    expect(consultas).toBe(0);
  });

  it("«Ajustar escala» queda en la URL y rotula el eje", async () => {
    await abrirComo(QE1, "/qe/indicadores/tendencia?escala=1");
    expect(await screen.findByText(/Escala ajustada: 30 % a 55 %/)).toBeInTheDocument();
  });

  it("el gráfico se recorre con flechas y muestra el globo del punto", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    const grafica = await screen.findByTestId("grafica-tendencia");
    grafica.focus();
    await user.keyboard("{ArrowRight}");
    expect(await screen.findByTestId("globo-tendencia")).toHaveTextContent(/·\s\d{2}-\d{2}-2026 · \d+ % · \d HDU/);
  });

  it("un QE sin HDU ve «Aún no tienes HDU en tu ámbito»", async () => {
    await abrirComo(QE2, "/qe/indicadores/tendencia");
    expect(await screen.findByTestId("estado-sin-datos")).toHaveTextContent("Aún no tienes HDU en tu ámbito");
  });

  it("el Líder ve la historia de sus células sin controles de edición", async () => {
    await abrirComo(LIDER, "/lider/indicadores/tendencia");
    expect(await screen.findByTestId("grafica-tendencia")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-solo-lectura")).toBeInTheDocument();
  });

  it("si el servicio falla muestra error con «Reintentar» y nunca una gráfica con ceros", async () => {
    estadoE6.indicadoresCaido = true;
    await abrirComo(QE1, "/qe/indicadores/tendencia");
    const e = await screen.findByTestId("estado-error-tendencia");
    expect(within(e).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByTestId("grafica-tendencia")).not.toBeInTheDocument();
  });
});

describe("Exportar CSV y PDF [E6-F04]", () => {
  const descargas: string[] = [];
  beforeEach(() => {
    descargas.length = 0;
    URL.createObjectURL = vi.fn(() => "blob:prueba");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push(this.download);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("descarga el PDF de la pestaña activa con el nombre del servidor [E6-F04-T03]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    await user.click(screen.getByTestId("boton-exportar"));
    await user.click(screen.getByTestId("boton-exportar-pdf"));
    expect(await screen.findByTestId("estado-exportacion-ok")).toHaveTextContent("Se descargó quality360-indicadores-cumplimiento-20261104.pdf");
    expect(descargas).toEqual(["quality360-indicadores-cumplimiento-20261104.pdf"]);
  });

  it("la ayuda describe la pestaña y los filtros; el CSV se descarga [E6-F04-T04]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/qe/indicadores/semaforo?celula=${ID.celPagos}`);
    await screen.findByTestId(`tarjeta-celula-${ID.celPagos}`);
    expect(screen.getByTestId("ayuda-exportar")).toHaveTextContent("Se exportará la pestaña Semáforo con los filtros aplicados (Célula: Pagos)");
    await user.click(screen.getByTestId("boton-exportar"));
    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-ok")).toHaveTextContent("quality360-indicadores-semaforo-20261104.csv");
  });

  it("Esc cierra el panel y devuelve el foco al disparador", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    await user.click(screen.getByTestId("boton-exportar"));
    expect(screen.getByTestId("boton-exportar")).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("boton-exportar-csv")).not.toBeInTheDocument();
    expect(screen.getByTestId("boton-exportar")).toHaveFocus();
  });

  it("con Impedimentos caído el Semáforo no se exporta y se explica [E6-F04-T08]", async () => {
    simularFuentes({ impedimentos: false });
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores/semaforo");
    await screen.findByTestId(`tarjeta-celula-${ID.celPagos}`);
    await user.click(screen.getByTestId("boton-exportar"));
    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-error")).toHaveTextContent("No se pudo generar el reporte: hay datos no disponibles");
    expect(descargas).toHaveLength(0);
  });

  it("422 por exceso de filas pide acotar (CSV) o usar CSV (PDF)", async () => {
    estadoE6.exportacionExcede = true;
    const user = userEvent.setup();
    await abrirComo(QE1, "/qe/indicadores");
    await screen.findByTestId("indicador-totales");
    await user.click(screen.getByTestId("boton-exportar"));
    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-error")).toHaveTextContent("El reporte tiene demasiadas filas. Acota los filtros.");
    await user.click(screen.getByTestId("boton-exportar"));
    await user.click(screen.getByTestId("boton-exportar-pdf"));
    await waitFor(() => expect(screen.getByTestId("estado-exportacion-error")).toHaveTextContent("Usa CSV."));
  });

  it("un archivo sin datos se descarga e indica que no hay datos", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/qe/indicadores?celula=${ID.celPagos}&sprint=${ID.sprint18}`);
    await screen.findByTestId("estado-sin-datos");
    await user.click(screen.getByTestId("boton-exportar"));
    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-ok")).toHaveTextContent("no hay datos para los filtros aplicados");
  });

  it("el Administrador no tiene botón de exportar ni acceso al dashboard [E6-F04-T09]", async () => {
    await abrirComo(ADMIN, "/qe/indicadores");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    expect(screen.queryByTestId("boton-exportar")).not.toBeInTheDocument();
  });
});
