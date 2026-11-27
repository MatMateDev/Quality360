import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrirComo } from "./renderApp";

/**
 * D209 · Diseño de las bandejas: logo de Quality360 arriba a la izquierda, accesos rápidos en el encabezado y
 * contadores agrupados por tema. Los testids y textos certificados no cambian (los cubren las demás pruebas).
 */
const ANALISTA = "jonathan.choque@quality360.local";
const QE = "jose.seguel@quality360.local";
const ADMIN = "admin@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

/** Títulos de los grupos de contadores, en orden de aparición. */
async function titulosDeGrupos(): Promise<string[]> {
  await screen.findAllByRole("heading", { level: 2 });
  return Array.from(document.querySelectorAll(".grupo-contadores > h2")).map((h) => h.textContent ?? "");
}

describe("Diseño de las bandejas [D209]", () => {
  it("la barra superior abre con el logo y la marca «Quality360», antes de la sesión y del menú", async () => {
    await abrirComo(QE, "/qe");
    const barra = await screen.findByRole("banner");
    const marca = within(barra).getByRole("link", { name: "Quality360" });
    const icono = marca.querySelector("img");
    // El ícono es decorativo: el nombre accesible es el texto de la marca.
    expect(icono).not.toBeNull();
    expect(icono).toHaveAttribute("alt", "");
    // La marca es el primer enlace de la barra (arriba a la izquierda); el menú del portal va después.
    expect(within(barra).getAllByRole("link")[0]).toBe(marca);
    expect(within(barra).getByRole("navigation", { name: "Portal" })).toBeInTheDocument();
    expect(within(barra).getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("Analista: el acceso rápido va en el encabezado y los contadores en «Mi asignación», «Mi trabajo» e «Impedimentos»", async () => {
    await abrirComo(ANALISTA, "/qa");
    const accesos = await screen.findByRole("navigation", { name: "Accesos rápidos" });
    expect(within(accesos).getByRole("link", { name: "Ver mis HDU" })).toHaveAttribute("href", "/qa/hdu");
    expect(screen.queryByRole("heading", { name: "Accesos rápidos" })).not.toBeInTheDocument();
    expect(await titulosDeGrupos()).toEqual(["Mi asignación", "Mi trabajo", "Impedimentos"]);
  });

  it("QE: accesos rápidos en el encabezado; pendientes y equipo arriba; impedimentos junto a su lista", async () => {
    await abrirComo(QE, "/qe");
    const accesos = await screen.findByRole("navigation", { name: "Accesos rápidos" });
    expect(within(accesos).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Ver equipo",
      "Ver historias supervisadas",
      "Aprobaciones pendientes",
    ]);
    expect(within(accesos).getByTestId("enlace-aprobaciones-pendientes")).toHaveAttribute("href", "/qe/aprobaciones");
    expect(await titulosDeGrupos()).toEqual(["Mis pendientes", "Mi equipo", "Impedimentos y riesgo"]);
    // El resumen de equipo (E1-F03) sube junto a los contadores de acción, antes de «Requiere mi acción».
    const equipo = await screen.findByTestId("tarjeta-equipo");
    const requiere = screen.getByRole("heading", { name: "Requiere mi acción" });
    expect(equipo.compareDocumentPosition(requiere) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Administrador: «Registrar usuario» es la acción principal del encabezado y los grupos siguen el orden de lectura", async () => {
    await abrirComo(ADMIN, "/admin");
    const accesos = await screen.findByRole("navigation", { name: "Accesos rápidos" });
    expect(within(accesos).getByRole("link", { name: "Registrar usuario" })).toHaveClass("boton--primario");
    expect(within(accesos).getByRole("link", { name: "Gestionar usuarios" })).toHaveAttribute("href", "/admin/usuarios");
    expect(within(accesos).getByRole("link", { name: "Gestionar supervisión" })).toHaveAttribute("href", "/admin/supervision");
    expect(await titulosDeGrupos()).toEqual(["Usuarios", "Supervisión y organización", "Impedimentos y riesgo"]);
    expect(screen.getByText("Solo consulta. Los gestiona el QE responsable de cada HDU.")).toBeInTheDocument();
  });

  it("Administrador [D224]: estado, pendientes, impedimentos y, al final, el historial de cambios", async () => {
    await abrirComo(ADMIN, "/admin");
    await screen.findByTestId("lista-pendientes");
    await screen.findByTestId("lista-ultimos-cambios");
    const bandeja = screen.getByTestId("bandeja-admin");
    const secciones = Array.from(bandeja.querySelectorAll(".grupo-contadores > h2, .panel-cabecera h2, .panel-cabecera h3")).map(
      (h) => h.textContent,
    );
    expect(secciones).toEqual([
      "Usuarios",
      "Supervisión y organización",
      "Pendientes de configuración",
      "Impedimentos y riesgo",
      "Impedimentos escalados a mí",
      "Últimos cambios",
    ]);
    // Simetría: usuarios y supervisión comparten la franja con el mismo peso y tres tarjetas cada uno.
    const franja = Array.from(bandeja.querySelectorAll(".franja-resumen > .grupo-contadores"));
    expect(franja).toHaveLength(2);
    for (const grupo of franja) {
      expect(grupo.getAttribute("style")).toMatch(/--q360-peso:\s*3/);
      expect(grupo.querySelectorAll(".tarjetas-resumen > .tarjeta-resumen")).toHaveLength(3);
    }
    // «HDU totales» acompaña a los contadores de riesgo, y no quedan columnas de anchos distintos.
    expect(screen.getByTestId("contador-hdu-total").closest(".grupo-contadores")?.querySelector("h2")).toHaveTextContent("Impedimentos y riesgo");
    expect(bandeja.querySelector(".tema-bandeja, .rejilla-bandeja")).toBeNull();
  });

  it("Auditor: los seis contadores quedan en «Registros», «Actividad reciente» e «Impedimentos», sin accesos de escritura", async () => {
    await abrirComo(AUDITOR, "/auditor");
    await screen.findByTestId("bandeja-auditor");
    expect(await titulosDeGrupos()).toEqual(["Registros", "Actividad reciente", "Impedimentos"]);
    expect(screen.queryByRole("navigation", { name: "Accesos rápidos" })).not.toBeInTheDocument();
  });
});
