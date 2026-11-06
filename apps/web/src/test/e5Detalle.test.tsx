import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { modoE5 } from "@/mocks/dataE5";
import { ID_YA_ASIGNADA, vencerConsultaAbierta } from "@/mocks/handlersConsulta";
import { abrirComo } from "./renderApp";

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

async function abrirDetalle(user: ReturnType<typeof userEvent.setup>, codigo: string) {
  const f = await fila(codigo);
  await user.click(within(f).getByTestId("boton-ver-detalle"));
  return screen.findByTestId("panel-detalle-hdu");
}

describe("E5-F06 · panel de detalle de la HDU", () => {
  it("abre un diálogo modal con el foco en «Cerrar» y muestra los datos de Jira como texto [E5-F06-T01, T02]", async () => {
    const user = await consultar();
    const panel = await abrirDetalle(user, "QTY-1");
    expect(panel).toHaveAttribute("role", "dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAttribute("data-codigo", "QTY-1");
    expect(screen.getByTestId("boton-cerrar-detalle")).toHaveFocus();
    expect(await within(panel).findByTestId("detalle-estado")).toHaveTextContent("En curso");
    expect(within(panel).getByTestId("detalle-prioridad")).toHaveTextContent("High en Jira → Alta en Quality360");
    expect(within(panel).getByTestId("detalle-epica")).toHaveTextContent("QTY-100 · Autenticación");
    expect(within(panel).getByTestId("detalle-vacio-sprints")).toHaveTextContent("Sin sprint en Jira");
    expect(within(panel).getByTestId("detalle-responsable")).toHaveTextContent("Ana");
    expect(within(panel).getByTestId("detalle-etiquetas")).toHaveTextContent("seguridad");
    expect(within(panel).getByTestId("enlace-abrir-jira")).toHaveAttribute("href", "https://su-empresa.atlassian.net/browse/QTY-1");
    expect(within(panel).getByTestId("enlace-abrir-jira")).toHaveAttribute("rel", "noopener noreferrer");
    // El HTML de Jira se ve literal; solo http(s) es un enlace; la marca de contenido no mostrable va en cursiva.
    const descripcion = within(panel).getByTestId("detalle-descripcion");
    expect(descripcion).toHaveTextContent("<b>etiquetas</b>");
    expect(descripcion.querySelector("b")).toBeNull();
    expect(within(descripcion).getByRole("link")).toHaveAttribute("href", "https://ejemplo.com/ruta");
    expect(descripcion.querySelector("em.contenido-no-mostrable")).not.toBeNull();
    expect(within(panel).getByTestId("detalle-criterios")).toHaveTextContent("El segundo factor es obligatorio");
  });

  it("criterios vacíos y criterios tomados de la descripción son explícitos [E5-F06-T04, T05]", async () => {
    const user = await consultar();
    const panel2 = await abrirDetalle(user, "QTY-2");
    expect(await within(panel2).findByTestId("detalle-vacio-criterios")).toHaveTextContent("Sin criterios de aceptación en Jira");
    await user.click(within(panel2).getByTestId("boton-cerrar-detalle"));
    await waitFor(() => expect(screen.queryByTestId("panel-detalle-hdu")).not.toBeInTheDocument());
    const panel3 = await abrirDetalle(user, "QTY-3");
    await within(panel3).findByTestId("detalle-criterios");
    expect(within(panel3).getByText("Tomados de la descripción")).toBeInTheDocument();
    expect(within(panel3).getByTestId("detalle-sprints")).toHaveTextContent("E5 Sprint 1 (Activo");
  });

  it("texto largo: «Ver todo» con scroll interno alcanzable y aviso de recorte; 20 etiquetas y «+N más en Jira» [E5-F06-T06, T07]", async () => {
    modoE5.detalleItem = "largo";
    const user = await consultar();
    const panel = await abrirDetalle(user, "QTY-1");
    const descripcion = await within(panel).findByTestId("detalle-descripcion");
    expect(within(panel).getByTestId("aviso-texto-recortado")).toHaveTextContent("Texto recortado; ver completo en Jira");
    const ver = within(panel).getByTestId("boton-ver-todo-descripcion");
    expect(ver).toHaveAttribute("aria-expanded", "false");
    await user.click(ver);
    expect(ver).toHaveAttribute("aria-expanded", "true");
    expect(ver).toHaveTextContent("Ver menos");
    const region = within(descripcion).getByRole("region", { name: "Descripción completa de QTY-1" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("Texto expandido");
    // Más de 8 etiquetas se agrupan; el total de Jira mayor que las 20 guardadas se avisa.
    expect(within(panel).getByTestId("boton-mas-etiquetas")).toHaveTextContent("+12 más");
    expect(within(panel).getByTestId("detalle-etiquetas")).toHaveTextContent("+5 más en Jira");
  });

  it("error al cargar: alerta con «Reintentar» y la lista sigue usable [E5-F06-T08]", async () => {
    modoE5.detalleItem = "error";
    const user = await consultar();
    const panel = await abrirDetalle(user, "QTY-1");
    expect(await within(panel).findByTestId("error-detalle")).toHaveAttribute("role", "alert");
    expect(within(panel).getByTestId("error-detalle")).toHaveTextContent("No se pudo cargar el detalle");
    modoE5.detalleItem = "ok";
    await user.click(within(panel).getByTestId("boton-reintentar-detalle"));
    expect(await within(panel).findByTestId("detalle-estado")).toHaveTextContent("En curso");
    expect(within(panel).queryByTestId("error-detalle")).not.toBeInTheDocument();
  });

  it("consulta anterior al detalle: aviso informativo y se ve lo que hay de la fila [E5-F06-T09]", async () => {
    modoE5.detalleItem = "antiguo";
    const user = await consultar();
    const panel = await abrirDetalle(user, "QTY-1");
    expect(await within(panel).findByTestId("aviso-detalle-antiguo")).toHaveTextContent("Consulta anterior al detalle completo; consulta Jira de nuevo");
    expect(within(panel).getByTestId("detalle-resumen")).toHaveTextContent("Historia QTY-1");
    expect(within(panel).queryByTestId("error-detalle")).not.toBeInTheDocument();
    // DEF-E5D-01: se ve lo que hay de la fila.
    expect(within(panel).getByTestId("detalle-estado")).toHaveTextContent("En curso");
    expect(within(panel).getByTestId("detalle-prioridad")).toHaveTextContent("Alta");
    expect(within(panel).getByTestId("detalle-responsable")).toHaveTextContent("Ana");
    expect(within(panel).getByTestId("detalle-descripcion")).toHaveTextContent("Descripción de QTY-1.");
  });

  it("«Abrir en Jira» contiene su texto visible en el nombre accesible [DEF-E5D-04]", async () => {
    const user = await consultar();
    const panel = await abrirDetalle(user, "QTY-1");
    expect(await within(panel).findByTestId("enlace-abrir-jira")).toHaveAccessibleName("Abrir en Jira: QTY-1 (se abre en otra pestaña)");
  });

  it("Esc cierra y devuelve el foco a «Ver detalle» de la fila [E5-F06-T03]", async () => {
    const user = await consultar();
    await abrirDetalle(user, "QTY-2");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("panel-detalle-hdu")).not.toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByTestId("fila-QTY-2")).getByTestId("boton-ver-detalle")).toHaveFocus());
  });

  it("Anterior y Siguiente sin asignar cambian de HDU, anuncian y llevan el foco al título [E5-F06-T10]", async () => {
    const user = await consultar();
    const panel = await abrirDetalle(user, "QTY-1");
    expect(screen.getByTestId("boton-anterior")).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByTestId("boton-siguiente-sin-asignar"));
    await waitFor(() => expect(screen.getByTestId("panel-detalle-hdu")).toHaveAttribute("data-codigo", "QTY-2"));
    await waitFor(() => expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("Detalle de QTY-2"));
    expect(screen.getByRole("heading", { level: 2, name: /QTY-2/ })).toHaveFocus();
    await user.click(screen.getByTestId("boton-anterior"));
    await waitFor(() => expect(screen.getByTestId("panel-detalle-hdu")).toHaveAttribute("data-codigo", "QTY-1"));
    expect(panel).toBeInTheDocument();
  });

  it("una consulta vencida cierra el panel y deja el aviso de la consulta [E5-F06-T11]", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    vencerConsultaAbierta();
    await user.click(within(f).getByTestId("boton-ver-detalle"));
    expect(await screen.findByTestId("aviso-consulta-vencida")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("panel-detalle-hdu")).not.toBeInTheDocument());
  });

  it("el código de la fila también abre el detalle [E5-F06-T01]", async () => {
    const user = await consultar();
    await user.click(await screen.findByTestId("boton-codigo-QTY-4"));
    expect(await screen.findByTestId("panel-detalle-hdu")).toHaveAttribute("data-codigo", "QTY-4");
  });
});

describe("E5-F07 · alerta «ya asignada»", () => {
  it("la fila ya asignada trae la alerta como nota, solo lectura, sin confirmar y con «Ir a la HDU» [E5-F07-T05]", async () => {
    const user = await consultar("con-ya-asignada");
    const f = await fila("QTY-5");
    expect(f).toHaveAttribute("data-estado", "ya-asignada");
    const alerta = within(f).getByTestId("alerta-hdu-ya-asignada");
    expect(alerta).toHaveAttribute("role", "note");
    expect(alerta).toHaveAttribute("data-qe", "Jose Seguel");
    expect(alerta).toHaveAttribute("data-analista", "");
    expect(alerta).toHaveAttribute("data-id-historia", ID_YA_ASIGNADA);
    expect(alerta).toHaveTextContent("Esta HDU ya fue asignada a Jose Seguel / sin Analista");
    expect(alerta).toHaveTextContent("No se puede reasignar desde la consulta. Para cambiar el QE o el analista, hazlo en la gestión de HDU.");
    expect(within(alerta).getByTestId("enlace-ir-a-hdu")).toHaveAttribute("href", `/hdu/${ID_YA_ASIGNADA}`);
    expect(within(f).getByTestId("estado-fila")).toHaveTextContent("Ya asignada");
    expect(within(f).queryByTestId("boton-confirmar-asignacion")).not.toBeInTheDocument();
    expect(within(f).queryByTestId("casilla-marcar")).not.toBeInTheDocument();
    expect(within(f).queryByTestId("selector-qe")).not.toBeInTheDocument();
    expect(within(f).getByTestId("datos-lectura")).toHaveTextContent("Jose Seguel");
    expect(screen.getAllByTestId("contador-ya-asignadas")[0]).toHaveTextContent("1 ya asignada");
    // La alerta compacta de «Cambiaron» comparte el texto.
    const cambio = await screen.findByTestId("fila-QTY-6");
    expect(within(cambio).getByTestId("alerta-hdu-ya-asignada")).toHaveTextContent("Esta HDU ya fue asignada a Jose Seguel / Jonathan Choque");
    expect(user).toBeDefined();
  });

  it("el panel la muestra arriba, completa, y la sección Asignación queda sin botón [E5-F07-T06]", async () => {
    const user = await consultar("con-ya-asignada");
    const panel = await abrirDetalle(user, "QTY-5");
    const alerta = within(panel).getByTestId("alerta-hdu-ya-asignada");
    expect(alerta).toHaveTextContent("No se puede reasignar desde la consulta");
    expect(within(panel).queryByTestId("boton-confirmar-asignacion")).not.toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Asignación" })).toBeInTheDocument();
    // Va antes que las demás secciones en el DOM.
    const encabezados = [...panel.querySelectorAll("h2, h3, [data-testid='alerta-hdu-ya-asignada']")];
    expect(encabezados.indexOf(alerta)).toBeLessThan(encabezados.findIndex((e) => e.textContent === "Asignación"));
  });
});
