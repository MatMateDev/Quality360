import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ID } from "@/mocks/data";
import { I } from "@/mocks/dataE4";
import { simularFuentes } from "@/mocks/dataE7";
import { abrirComo } from "./renderApp";

const QA1 = "jonathan.choque@quality360.local";
const QA3 = "camila.rojas@quality360.local";
const QE1 = "jose.seguel@quality360.local";
const LIDER = "luis.soto@quality360.local";
const ADMIN = "admin@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

describe("Bandeja del Analista: impedimentos [E4-F01#3]", () => {
  it("contador, columna Bloqueo al final y filtro «Solo bloqueadas», sin riesgo (D73)", async () => {
    const user = userEvent.setup();
    await abrirComo(QA3, "/qa");
    expect(await screen.findByTestId("contador-impedimentos-abiertos")).toHaveTextContent("2");
    const fila = await screen.findByTestId(`fila-hdu-${ID.hdu3}`);
    expect(within(fila).getByTestId(`celda-bloqueo-${ID.hdu3}`)).toHaveTextContent("Bloqueada · 1");
    const encabezados = within(screen.getByTestId("lista-mis-hdu")).getAllByRole("columnheader").map((c) => c.textContent);
    expect(encabezados.at(-1)).toBe("Bloqueo");
    expect(encabezados).not.toContain("Riesgo");
    await user.click(screen.getByLabelText("Solo bloqueadas"));
    await waitFor(() => expect(screen.queryByTestId("estado-vacio-mis-hdu")).not.toBeInTheDocument());
    expect(screen.getByTestId("lista-mis-hdu").querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("con Impedimentos caído: contador y columna dicen «No disponible» y «Solo bloqueadas» deja la lista indisponible", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(QA1, "/qa");
    expect(await screen.findByTestId("estado-indisponible-impedimentos-abiertos")).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("contador-impedimentos-abiertos")).not.toBeInTheDocument();
    const fila = await screen.findByTestId(`fila-hdu-${ID.hdu1}`);
    expect(within(fila).getByTestId("estado-indisponible-bloqueo")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("contador-abiertas")).toHaveTextContent("2");
  });

  it("«Solo bloqueadas» con Impedimentos caído no simula un vacío", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(QA1, "/qa?solo-bloq=1");
    expect(await screen.findByTestId("estado-indisponible-mis-hdu")).toBeInTheDocument();
  });
});

describe("Bandeja del QE: impedimentos [E4-F01-T05]", () => {
  it("contadores, lista aparte con «Nuevo» y «Ver todos»; «Requiere mi acción» no suma filas", async () => {
    await abrirComo(QE1, "/qe");
    expect(await screen.findByTestId("contador-impedimentos-abiertos")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-impedimentos-nuevos")).toHaveTextContent("1");
    expect(screen.getByTestId("contador-hdu-riesgo-alto")).toHaveTextContent("2");
    const lista = await screen.findByTestId("lista-impedimentos");
    expect(within(lista).getByTestId(`fila-impedimento-${I.i1}`)).toHaveTextContent("Nuevo");
    expect(screen.getByTestId("enlace-ver-todos-impedimentos")).toHaveAttribute("href", "/qe/impedimentos");
    const acciones = await screen.findByTestId("lista-requiere-accion");
    expect(within(acciones).queryByText("Ambiente QA no responde")).not.toBeInTheDocument();
  });

  it("la fila «Cerrar HDU» con impedimento abierto lleva la insignia fuera del botón y después del texto [D81]", async () => {
    // CLIENTES-2001 (10 aprobados, sin cerrar) tiene el impedimento I1.
    await abrirComo(QE1, "/qe");
    const celda = await screen.findByTestId(`celda-accion-${ID.hdu3}`);
    expect(celda).toHaveTextContent("Cerrar HDU");
    const insignia = within(celda).getByTestId(`insignia-con-impedimento-${ID.hdu3}`);
    expect(insignia).toHaveTextContent("Con impedimento abierto");
    const boton = screen.getByTestId(`boton-accion-${ID.hdu3}-cerrar`);
    expect(boton).not.toContainElement(insignia);
    expect(boton).toHaveAccessibleName("Cerrar CLIENTES-2001");
    expect(celda.textContent!.indexOf("Cerrar HDU")).toBeLessThan(celda.textContent!.indexOf("Con impedimento abierto"));
  });

  it("sin bloqueos dice «Tu equipo no tiene bloqueos»", async () => {
    await abrirComo("constanza.diaz@quality360.local", "/qe");
    expect(await screen.findByTestId("estado-vacio-impedimentos")).toHaveTextContent("Tu equipo no tiene bloqueos");
  });

  it("con Impedimentos caído, los contadores y la lista dicen «No disponible» y el resto de la bandeja carga", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(QE1, "/qe");
    expect(await screen.findByTestId("estado-indisponible-impedimentos")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("estado-indisponible-hdu-riesgo-alto")).toBeInTheDocument();
    expect(await screen.findByTestId("contador-sin-analista")).toBeInTheDocument();
    expect(screen.queryByTestId(`insignia-con-impedimento-${ID.hdu3}`)).not.toBeInTheDocument();
  });
});

describe("Bandeja del Líder: impedimentos [E4-F03-T04]", () => {
  it("contadores, lista con «Escalado a ti» primero, columnas Bloqueo y Riesgo, sin botones de gestión", async () => {
    await abrirComo(LIDER, "/lider");
    expect(await screen.findByTestId("contador-impedimentos-abiertos")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-hdu-bloqueadas")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-escalados-a-mi")).toHaveTextContent("1");
    const lista = await screen.findByTestId("lista-impedimentos");
    const filas = within(lista).getAllByRole("row").filter((f) => f.getAttribute("data-testid")?.startsWith("fila-impedimento-"));
    expect(filas[0]).toHaveAttribute("data-testid", `fila-impedimento-${I.i3}`);
    expect(within(filas[0]!).getByTestId("insignia-escalado-a-mi")).toHaveTextContent("Escalado a ti");
    expect(within(lista).queryByRole("button")).not.toBeInTheDocument();
    const fila = await screen.findByTestId(`fila-hdu-${ID.hdu1}`);
    expect(within(fila).getByTestId(`celda-bloqueo-${ID.hdu1}`)).toHaveTextContent("Bloqueada");
    expect(within(fila).getByTestId(`celda-riesgo-${ID.hdu1}`)).toHaveTextContent("Alto");
    expect(screen.getByLabelText("Solo bloqueadas")).toBeInTheDocument();
  });

  it("un impedimento escalado a un Administrador aparece en su bandeja sin botones [E4-F03-T11]", async () => {
    await abrirComo(ADMIN, "/admin");
    expect(await screen.findByTestId("contador-impedimentos-abiertos")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-hdu-bloqueadas")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-hdu-riesgo-alto")).toHaveTextContent("2");
    expect(await screen.findByTestId("estado-vacio-impedimentos-escalados")).toHaveTextContent("No tienes impedimentos escalados");
    expect(screen.getByTestId("tarjeta-impedimentos-abiertos")).not.toHaveTextContent("Requiere atención");
  });
});

describe("Pestaña «Impedimentos» del Auditor [E4-B04]", () => {
  it("quinta pestaña con dos vistas, contadores y exportación", async () => {
    const user = userEvent.setup();
    await abrirComo(AUDITOR, "/auditor");
    expect(await screen.findByTestId("contador-impedimentos-abiertos")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-hdu-bloqueadas")).toHaveTextContent("3");
    const pestanas = within(screen.getByRole("navigation", { name: "Secciones del Auditor" })).getAllByRole("link").map((a) => a.textContent);
    expect(pestanas).toEqual(["HDU", "Certificados", "Bitácora de checklist", "Auditoría de usuarios", "Impedimentos"]);
    await user.click(screen.getByTestId("pestana-impedimentos"));
    const tabla = await screen.findByTestId("lista-auditor-impedimentos");
    expect(tabla.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(screen.getByTestId("boton-exportar-csv")).toBeEnabled();
    expect(document.querySelector("button[type=submit], form")).toBeNull();
    await user.click(screen.getByTestId("vista-gestion"));
    const gestion = await screen.findByTestId("lista-auditor-gestion");
    expect(gestion.querySelectorAll("tbody tr")).toHaveLength(9);
    expect(within(gestion).getAllByTestId("semaforo-riesgo").length).toBeGreaterThan(0);
  });

  it("exporta con los filtros aplicados", async () => {
    const user = userEvent.setup();
    URL.createObjectURL = () => "blob:x";
    URL.revokeObjectURL = () => undefined;
    await abrirComo(AUDITOR, "/auditor/impedimentos?estado=RESUELTO");
    await screen.findByTestId("lista-auditor-impedimentos");
    expect(screen.getByTestId("ayuda-exportar")).toHaveTextContent("Se exportarán 2 filas");
    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-ok")).toHaveTextContent("quality360-impedimentos");
  });

  it("indisponible con «Reintentar», sin ocultar la pestaña", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(AUDITOR, "/auditor/impedimentos");
    expect(await screen.findByTestId("estado-indisponible-impedimentos")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("pestana-impedimentos")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("boton-exportar-csv")).toBeDisabled();
  });

  it("los demás roles ven acceso denegado en /auditor/impedimentos", async () => {
    await abrirComo(QE1, "/auditor/impedimentos");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
  });
});
