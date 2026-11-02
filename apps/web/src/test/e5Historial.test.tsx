import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { EJ, modoE5 } from "@/mocks/dataE5";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";
const QE1 = "jose.seguel@quality360.local";
const LIDER = "luis.soto@quality360.local";
const ANALISTA = "jonathan.choque@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

const idsFilas = () =>
  within(screen.getByTestId("lista-ejecuciones"))
    .getAllByRole("row")
    .map((f) => f.getAttribute("data-testid"))
    .filter((t): t is string => Boolean(t?.startsWith("fila-ejecucion-")));

const R = (id: string) => `fila-ejecucion-${id}`;

describe("E5-F04 · historial de ejecuciones", () => {
  it("«Última ejecución» y «Última completada» [E5-F04-T01, D121]", async () => {
    await abrirComo(ADMIN, "/admin/integraciones/historial");
    const ultima = await screen.findByTestId("tarjeta-ultima-ejecucion");
    expect(within(ultima).getByText("Fallida")).toBeInTheDocument();
    expect(ultima).toHaveTextContent("Jira (QTY)");
    expect(ultima).toHaveTextContent("Valentina Rojas (Administrador)");
    expect(ultima).toHaveTextContent("Jira no está disponible por ahora.");
    const completada = screen.getByTestId("tarjeta-ultima-completada");
    expect(completada).toHaveTextContent("Con errores");
    expect(completada).toHaveTextContent("CSV (historias-con-errores.csv)");
    expect(completada).toHaveTextContent("Creadas2");
    expect(completada).toHaveTextContent("Con error7");
  });

  it("lista ordenada por fecha, con filtros y orden en la URL [E5-F04-T02]", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/integraciones/historial");
    await screen.findByTestId("lista-ejecuciones");
    expect(idsFilas()).toEqual([R(EJ.jiraFallida), R(EJ.csvErrores), R(EJ.csvOk), R(EJ.jiraErrores)]);
    expect(screen.getByTestId("total-historial")).toHaveTextContent("4 resultados");
    await user.selectOptions(screen.getByTestId("filtro-origen"), "CSV");
    await waitFor(() => expect(idsFilas()).toEqual([R(EJ.csvErrores), R(EJ.csvOk)]));
    await user.selectOptions(screen.getByTestId("filtro-origen"), "");
    await user.selectOptions(screen.getByTestId("filtro-resultado"), "FALLIDA");
    await waitFor(() => expect(idsFilas()).toEqual([R(EJ.jiraFallida)]));
    await user.click(screen.getByTestId("boton-limpiar-filtros"));
    await waitFor(() => expect(idsFilas().length).toBe(4));
    await user.click(within(screen.getByTestId("lista-ejecuciones")).getByRole("button", { name: /Fecha/ }));
    await waitFor(() => expect(idsFilas()).toEqual([R(EJ.jiraErrores), R(EJ.csvOk), R(EJ.csvErrores), R(EJ.jiraFallida)]));
  });

  it("sin coincidencias con filtros: mensaje propio, distinto del vacío sin filtros", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/integraciones/historial");
    await screen.findByTestId("lista-ejecuciones");
    await user.selectOptions(screen.getByTestId("filtro-resultado"), "INTERRUMPIDA");
    expect(await screen.findByTestId("estado-vacio-filtros-historial")).toHaveTextContent("No hay ejecuciones con esos filtros");
    expect(screen.queryByTestId("estado-vacio-historial")).not.toBeInTheDocument();
  });

  it("detalle de una importación con errores y filtro «solo filas con error» [E5-F04-T03]", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/integraciones/historial");
    await user.click(await screen.findByTestId(`boton-ver-detalle-${EJ.csvErrores}`));
    const detalle = await screen.findByTestId("detalle-ejecucion");
    expect(within(detalle).getByRole("heading", { level: 2, name: /Ejecución del/ })).toHaveFocus();
    expect(await screen.findByTestId("lista-detalle-ejecucion")).toBeInTheDocument();
    expect(screen.getByTestId("total-detalle-ejecucion")).toHaveTextContent("9 filas");
    expect(detalle).toHaveTextContent("Huella");
    expect(detalle).toHaveTextContent("Quality360 guarda la huella y el nombre del archivo, no su contenido.");
    expect(within(screen.getByTestId("lista-detalle-ejecucion")).queryByText(/Referencia de Jira/)).not.toBeInTheDocument();
    await user.click(screen.getByTestId("filtro-solo-errores"));
    await waitFor(() => expect(screen.getByTestId("total-detalle-ejecucion")).toHaveTextContent("7 filas"));
    expect(within(screen.getByTestId("fila-detalle-4")).getByText("La prioridad no es válida")).toBeInTheDocument();
    expect(within(screen.getByTestId("fila-detalle-5")).getByText("El código no es válido")).toBeInTheDocument();
    // Volver conserva los filtros y devuelve el foco a la fila de origen.
    await user.click(screen.getByTestId("enlace-volver-historial"));
    expect(await screen.findByTestId("lista-ejecuciones")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId(`boton-ver-detalle-${EJ.csvErrores}`)).toHaveFocus());
  });

  it("detalle de una sincronización: advertencias y «Referencia de Jira (no se guarda)» [E5-F04-T04]", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, `/admin/integraciones/historial?ejecucion=${EJ.jiraErrores}`);
    const tabla = await screen.findByTestId("lista-detalle-ejecucion");
    expect(within(tabla).getByText("Referencia de Jira (no se guarda)")).toBeInTheDocument();
    expect(screen.getByTestId("total-detalle-ejecucion")).toHaveTextContent("11 filas");
    expect(within(screen.getByTestId("fila-detalle-1")).getByText("Estado: En curso · Responsable: Ana")).toBeInTheDocument();
    expect(within(screen.getByTestId("fila-detalle-3")).getByText("Sprint no encontrado: se usó el de respaldo")).toBeInTheDocument();
    expect(within(screen.getByTestId("fila-detalle-11")).getByText("El título es obligatorio")).toBeInTheDocument();
    expect(screen.getByTestId("detalle-ejecucion")).toHaveTextContent("Esperas por límite de tasa");
    expect(screen.getByTestId("detalle-ejecucion")).toHaveTextContent("2 (1,0 s y 1,0 s)");
    await user.click(screen.getByTestId("filtro-solo-errores"));
    await waitFor(() => expect(screen.getByTestId("total-detalle-ejecucion")).toHaveTextContent("1 fila"));
  });

  it("error global del detalle: el Administrador ve enlaces y no el texto del servidor", async () => {
    await abrirComo(ADMIN, `/admin/integraciones/historial?ejecucion=${EJ.jiraFallida}`);
    const error = await screen.findByTestId("error-ejecucion");
    expect(error).toHaveAttribute("data-codigo", "JIRA_NO_DISPONIBLE");
    expect(within(error).getByTestId("enlace-importar-archivo")).toBeInTheDocument();
    expect(await screen.findByTestId("estado-vacio-detalle-ejecucion")).toHaveTextContent("Esta ejecución no registró filas");
    expect(within(screen.getByTestId("res-leidas")).getByText("0")).toBeInTheDocument();
  });

  it("el QE ve las mismas ejecuciones pero las sugerencias son solo texto y no hay escritura [E5-F04-T05, T06]", async () => {
    await abrirComo(QE1, "/qe/integraciones");
    expect(await screen.findByTestId("pagina-qe-integraciones")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-solo-lectura")).toHaveTextContent("Vista de solo lectura. Aquí ves lo que se sincronizó o importó");
    expect(screen.getByTestId("nota-integraciones-qe")).toHaveTextContent("Asignar analista");
    await screen.findByTestId("lista-ejecuciones");
    expect(idsFilas().length).toBe(4);
    expect(screen.queryByTestId("boton-sincronizar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("selector-archivo")).not.toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
    expect(document.querySelector("button[type=submit]")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`boton-ver-detalle-${EJ.jiraFallida}`));
    const error = await screen.findByTestId("error-ejecucion");
    expect(within(error).queryByRole("link")).not.toBeInTheDocument();
    expect(error).toHaveTextContent("Importar un archivo");
  });

  it("QE: filas de HDU fuera de su ámbito se ocultan y se cuentan; las filas con error van sin título [D106, D126]", async () => {
    await abrirComo(QE1, `/qe/integraciones?ejecucion=${EJ.csvErrores}`);
    const tabla = await screen.findByTestId("lista-detalle-ejecucion");
    expect(screen.getByTestId("filas-ocultas")).toHaveTextContent("1 fila de HDU fuera de tu ámbito");
    expect(within(tabla).getByText("ARC-10")).toBeInTheDocument();
    expect(within(tabla).queryByText("ARC-11")).not.toBeInTheDocument();
    expect(within(tabla).queryByText("Fila inválida 0")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("fila-detalle-4")).getByText("La prioridad no es válida")).toBeInTheDocument();
    expect(screen.getByTestId("total-detalle-ejecucion")).toHaveTextContent("8 filas");
  });

  it("el Auditor tiene la sexta pestaña «Integraciones» en solo lectura, sin envío de formularios [E5-F04-T07]", async () => {
    const user = userEvent.setup();
    await abrirComo(AUDITOR, "/auditor/integraciones");
    await screen.findByTestId("lista-ejecuciones");
    expect(screen.getByTestId("pestana-integraciones")).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByRole("navigation", { name: "Secciones del Auditor" })).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "HDU",
      "Certificados",
      "Bitácora de checklist",
      "Auditoría de usuarios",
      "Impedimentos",
      "Integraciones",
    ]);
    expect(screen.getAllByTestId("aviso-solo-lectura").length).toBe(1);
    expect(document.querySelector("button[type=submit]")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    await user.click(screen.getByTestId(`boton-ver-detalle-${EJ.jiraErrores}`));
    expect(await screen.findByTestId("lista-detalle-ejecucion")).toBeInTheDocument();
    expect(document.querySelector("button[type=submit]")).toBeNull();
    expect(screen.queryByRole("link", { name: /Ir a Sincronizar/ })).not.toBeInTheDocument();
  });

  it("sin ejecuciones: vacío neutro, no un error [E5-F04-T09]", async () => {
    modoE5.historial = "vacio";
    await abrirComo(ADMIN, "/admin/integraciones/historial");
    expect(await screen.findByTestId("estado-vacio-historial")).toHaveTextContent("Aún no se ha sincronizado ni importado nada");
    expect(screen.getByTestId("estado-vacio-ultima-ejecucion")).toHaveTextContent("Aún no se ha sincronizado ni importado nada");
    expect(screen.getByTestId("estado-vacio-ultima-completada")).toHaveTextContent("Aún no hay ejecuciones completadas");
    expect(screen.queryByTestId("estado-error-historial")).not.toBeInTheDocument();
  });

  it("Integraciones caído: «No disponible» con Reintentar en cada bloque, nunca «0» [E5-F04-T10]", async () => {
    const user = userEvent.setup();
    modoE5.historial = "indisponible";
    modoE5.ultimaEjecucion = "indisponible";
    await abrirComo(QE1, "/qe/integraciones");
    const lista = await screen.findByTestId("estado-indisponible-historial");
    expect(lista).toHaveTextContent("No disponible");
    expect(await screen.findByTestId("estado-indisponible-ultima-ejecucion")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("estado-indisponible-ultima-completada")).toBeInTheDocument();
    expect(screen.queryByTestId("tarjeta-ultima-ejecucion")).not.toBeInTheDocument();
    // El resto del portal del QE sigue.
    expect(screen.getByRole("navigation", { name: "Portal" })).toBeInTheDocument();
    modoE5.historial = "ok";
    modoE5.ultimaEjecucion = "ok";
    await user.click(within(lista).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByTestId("lista-ejecuciones")).toBeInTheDocument();
  });

  it("las dos tarjetas y la tabla tienen estado propio: si la tabla falla, las tarjetas se conservan", async () => {
    modoE5.historial = "error";
    await abrirComo(ADMIN, "/admin/integraciones/historial");
    expect(await screen.findByTestId("estado-error-historial")).toBeInTheDocument();
    expect(await screen.findByTestId("tarjeta-ultima-ejecucion")).toBeInTheDocument();
    expect(screen.queryByTestId("estado-indisponible-historial")).not.toBeInTheDocument();
  });

  it("el detalle falla solo en sus filas: la cabecera y el resumen se conservan", async () => {
    modoE5.detalle = "indisponible";
    await abrirComo(ADMIN, `/admin/integraciones/historial?ejecucion=${EJ.csvOk}`);
    expect(await screen.findByTestId("estado-indisponible-detalle-ejecucion")).toHaveTextContent("No disponible");
    expect(screen.getByTestId("resumen-ejecucion")).toBeInTheDocument();
  });

  it("una ejecución inexistente o ajena muestra el mismo mensaje a todos los roles", async () => {
    await abrirComo(ADMIN, "/admin/integraciones/historial?ejecucion=00000000-0000-4000-8000-000000000000");
    expect(await screen.findByTestId("estado-vacio-ejecucion")).toHaveTextContent("No encontramos esa ejecución o no tienes acceso a ella");
  });

  it("una ejecución ajena para el QE (403) usa el mismo mensaje", async () => {
    await abrirComo(QE1, "/qe/integraciones?ejecucion=00000000-0000-4000-8000-000000000000");
    expect(await screen.findByTestId("estado-vacio-ejecucion")).toHaveTextContent("No encontramos esa ejecución o no tienes acceso a ella");
  });
});

describe("acceso por rol a Integraciones [E5-F01-T09, E5-F04-T08]", () => {
  it.each([
    ["Líder", LIDER, "/admin/integraciones"],
    ["Analista", ANALISTA, "/admin/integraciones/historial"],
    ["QE", QE1, "/admin/integraciones"],
    ["Auditor", AUDITOR, "/admin/integraciones/importar"],
    ["Líder", LIDER, "/qe/integraciones"],
    ["Analista", ANALISTA, "/qe/integraciones"],
    ["Administrador", ADMIN, "/qe/integraciones"],
    ["QE", QE1, "/auditor/integraciones"],
    ["Líder", LIDER, "/auditor/integraciones"],
  ])("%s en %s ve acceso denegado con «Ir a mi bandeja»", async (_rol, correo, ruta) => {
    await abrirComo(correo, ruta);
    const denegado = await screen.findByTestId("acceso-denegado");
    expect(within(denegado).getByTestId("boton-ir-a-mi-bandeja")).toBeInTheDocument();
    expect(screen.queryByTestId("pagina-integraciones")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pagina-qe-integraciones")).not.toBeInTheDocument();
  });

  it.each([
    ["Administrador", ADMIN, "/admin", ["Bandeja", "Usuarios", "Supervisión", "Integraciones", "Perfil"]],
    ["QE", QE1, "/qe", ["Bandeja", "Equipo", "Historias supervisadas", "Impedimentos", "Integraciones", "Perfil"]],
    ["Líder", LIDER, "/lider", ["Bandeja", "Perfil"]],
    ["Analista", ANALISTA, "/qa", ["Bandeja", "Mis HDU", "Perfil"]],
    ["Auditor", AUDITOR, "/auditor", ["Bandeja", "Perfil"]],
  ])("menú del %s", async (_rol, correo, ruta, esperado) => {
    await abrirComo(correo, ruta);
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(esperado);
  });

  it("«Integraciones» queda activo en las cuatro pestañas del Administrador y las pestañas marcan la actual", async () => {
    await abrirComo(ADMIN, "/admin/integraciones/importar");
    const nav = await screen.findByRole("navigation", { name: "Portal" });
    expect(within(nav).getByRole("link", { name: "Integraciones" })).toHaveAttribute("aria-current", "page");
    const pestanas = screen.getByRole("navigation", { name: "Secciones de integraciones" });
    expect(within(pestanas).getAllByRole("link").map((a) => a.textContent)).toEqual(["Conexión", "Sincronizar", "Importar archivo", "Historial"]);
    expect(screen.getByTestId("pestana-importar")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("pestana-conexion")).not.toHaveAttribute("aria-current");
  });
});
