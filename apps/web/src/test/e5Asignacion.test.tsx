import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import {
  textoCuerpoConfirmar,
  textoDescartadas,
  textoFalta,
  textoRechazoFila,
  textoResumenConfirmacion,
  textoSeAplico,
  textoSeIncluyeron,
} from "@/lib/mensajesAsignacion";
import { EJ, detalles, ejecucionBase, estadoConsulta, modoE5 } from "@/mocks/dataE5";
import { hdus } from "@/mocks/data";
import { registrar } from "@/mocks/handlersE5";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";
const QE1 = "jose.seguel@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

async function consultar(modo: typeof modoE5.consulta = "exitosa") {
  const user = userEvent.setup();
  modoE5.consulta = modo;
  await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
  await user.click(await screen.findByTestId("boton-consultar-jira"));
  await screen.findByTestId("consulta-abierta");
  return user;
}

const fila = (codigo: string) => screen.findByTestId(`fila-${codigo}`);
const estadoFila = (el: HTMLElement) => within(el).getByTestId("estado-fila").textContent;

async function asignarFila(user: ReturnType<typeof userEvent.setup>, codigo: string, celula = "Clientes", qe = "Jose Seguel", analista = "Jonathan Choque") {
  const f = await fila(codigo);
  await user.selectOptions(within(f).getByTestId("selector-celula"), celula);
  await waitFor(() => expect(within(f).getByTestId("selector-sprint")).not.toBeDisabled());
  await user.selectOptions(within(f).getByTestId("selector-qe"), qe);
  await waitFor(() => expect(within(f).getByTestId("selector-analista")).not.toBeDisabled());
  await waitFor(() => expect(within(f).getByTestId("selector-analista")).toHaveTextContent(analista));
  await user.selectOptions(within(f).getByTestId("selector-analista"), analista);
}

describe("E5-F05 · revisión", () => {
  it("cuatro grupos con sus filas, cambios y fila creada a mano [E5-F05-T01, T02]", async () => {
    await consultar("con-cambios");
    expect(screen.getByTestId("total-grupo-nuevas")).toHaveTextContent("(1)");
    expect(screen.getByTestId("total-grupo-cambiaron")).toHaveTextContent("(2)");
    expect(screen.getByTestId("total-grupo-sin-cambios")).toHaveTextContent("(8)");
    expect(screen.getByTestId("total-grupo-con-error")).toHaveTextContent("(1)");
    const cambio = await screen.findByTestId("fila-QTY-1");
    expect(cambio).toHaveTextContent("Título: Recuperar clave → Recuperar clave de acceso");
    expect(cambio).toHaveTextContent("Prioridad: Media → Crítica");
    const manual = screen.getByTestId("fila-QTY-2");
    expect(within(manual).getByTestId("chip-creada-a-mano")).toBeInTheDocument();
    expect(within(manual).getByTestId("nota-creada-a-mano")).toHaveTextContent("Al actualizar pasará a figurar como Jira");
    // «Sin cambios» está cerrado; «Con error» abierto con su nota.
    expect(screen.getByTestId("boton-grupo-sin-cambios")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("grupo-con-error")).toHaveTextContent("Estas filas no se pueden importar desde Jira");
  });

  it("filtro por texto en el servidor", async () => {
    const user = await consultar();
    await fila("QTY-3");
    await user.type(screen.getByTestId("filtro-texto-nuevas"), "QTY-7");
    await waitFor(() => expect(screen.queryByTestId("fila-QTY-3")).not.toBeInTheDocument());
    expect(screen.getByTestId("fila-QTY-7")).toBeInTheDocument();
  });
});

describe("E5-F05 · asignación por fila", () => {
  it("célula, QE y analista: sprint propuesto por Jira, estado y guardado persistente [E5-F05-T03]", async () => {
    const user = await consultar();
    const f = await fila("QTY-3");
    expect(estadoFila(f)).toContain("Sin asignar");
    await asignarFila(user, "QTY-3");
    await waitFor(() => expect(estadoFila(screen.getByTestId("fila-QTY-3"))).toContain("Lista"));
    const lista = screen.getByTestId("fila-QTY-3");
    expect(lista).toHaveAttribute("data-completa", "true");
    expect(within(lista).getByTestId("selector-sprint")).toHaveValue(within(lista).getByRole("option", { name: "E5 Sprint 1" }).getAttribute("value"));
    expect(within(lista).getByTestId("chip-sprint-origen")).toHaveTextContent("Sprint de Jira");
    // La asignación vive en el servidor.
    expect(estadoConsulta.items.find((i) => i.codigo === "QTY-3")?.completa).toBe(true);
  });

  it("sin sprint en Jira usa el de respaldo; elegirlo a mano quita el chip [E5-F05-T04]", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    await user.selectOptions(within(f).getByTestId("selector-celula"), "Clientes");
    expect(await within(f).findByTestId("chip-sprint-respaldo")).toHaveTextContent("Sprint de respaldo");
    await user.selectOptions(within(f).getByTestId("selector-sprint"), "E5 Sprint 2");
    await waitFor(() => expect(within(screen.getByTestId("fila-QTY-1")).queryByTestId("chip-sprint-respaldo")).not.toBeInTheDocument());
  });

  it("célula sin sprint propuesto: «Incompleta (falta: …)» y la inclusión deshabilitada con motivo [E5-F05-T05, T14]", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    await user.selectOptions(within(f).getByTestId("selector-celula"), "Pagos");
    await waitFor(() => expect(estadoFila(screen.getByTestId("fila-QTY-1"))).toContain("Incompleta (falta: QE, analista y sprint)"));
    const actualizada = screen.getByTestId("fila-QTY-1");
    expect(within(actualizada).getByTestId("selector-sprint")).toHaveValue("");
    expect(within(actualizada).getByTestId("casilla-marcar")).toHaveAttribute("aria-disabled", "true");
    expect(within(actualizada).getByTestId("motivo-marcar-QTY-1")).toHaveTextContent("Falta: QE, analista y sprint");
  });

  it("el analista depende del QE y solo lista a su equipo [E5-F05-T08, T09]", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    expect(within(f).getByTestId("selector-analista")).toBeDisabled();
    await user.selectOptions(within(f).getByTestId("selector-qe"), "Jose Seguel");
    await waitFor(() => expect(within(screen.getByTestId("fila-QTY-1")).getByTestId("selector-analista")).toHaveTextContent("Jonathan Choque"));
    const opciones = within(screen.getByTestId("fila-QTY-1")).getByTestId("selector-analista").querySelectorAll("option");
    expect([...opciones].map((o) => o.textContent)).toEqual(["Elige…", "Camila Rojas", "Jonathan Choque"]);
    // El selector de QE solo trae QE.
    const qes = [...within(screen.getByTestId("fila-QTY-1")).getByTestId("selector-qe").querySelectorAll("option")].map((o) => o.textContent);
    expect(qes).not.toContain("Valentina Rojas");
    // Un QE sin analistas lo dice y bloquea la inclusión.
    await user.selectOptions(within(screen.getByTestId("fila-QTY-1")).getByTestId("selector-qe"), "Constanza Díaz");
    expect(await screen.findByTestId("ayuda-sin-analistas")).toHaveTextContent("Este QE no supervisa analistas activos. Elige otro QE.");
    expect(within(screen.getByTestId("fila-QTY-1")).getByTestId("casilla-marcar")).toHaveAttribute("aria-disabled", "true");
  });

  it("cambiar el QE limpia el analista y lo pide del equipo nuevo [E5-F05-T06]", async () => {
    const user = await consultar();
    await asignarFila(user, "QTY-3");
    const f = screen.getByTestId("fila-QTY-3");
    await user.selectOptions(within(f).getByTestId("selector-qe"), "Constanza Díaz");
    await waitFor(() => expect(within(screen.getByTestId("fila-QTY-3")).getByTestId("selector-analista")).toHaveValue(""));
    expect(estadoFila(screen.getByTestId("fila-QTY-3"))).toContain("falta: analista");
    await waitFor(() => expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("Se limpió el analista: elige uno del equipo de Constanza Díaz."));
  });

  it("422 de una fila: el error queda bajo el selector y el valor vuelve", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    server.use(
      http.patch(`${env.gatewayUrl}/v1/integraciones/jira/consultas/:id/items`, () =>
        HttpResponse.json({ codigo: "CATALOGO_INVALIDO", mensaje: "x", detalles: [{ campo: "celulaId", codigo: "CATALOGO_INVALIDO", mensaje: "x" }] }, { status: 422 }),
      ),
    );
    await user.selectOptions(within(f).getByTestId("selector-celula"), "Clientes");
    expect(await within(f).findByTestId("error-celulaId-QTY-1")).toHaveTextContent("La célula no existe o está inactiva.");
    expect(within(f).getByTestId("selector-celula")).toHaveAttribute("aria-invalid", "true");
    expect(within(f).getByTestId("selector-celula")).toHaveValue("");
  });

  it("fallo de red al guardar: «Reintentar» por fila", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    server.use(http.patch(`${env.gatewayUrl}/v1/integraciones/jira/consultas/:id/items`, () => HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x" }, { status: 500 }), { once: true }));
    await user.selectOptions(within(f).getByTestId("selector-celula"), "Clientes");
    await user.click(await within(f).findByTestId("boton-reintentar-fila-QTY-1"));
    await waitFor(() => expect(within(screen.getByTestId("fila-QTY-1")).getByTestId("selector-celula")).not.toHaveValue(""));
  });
});

describe("E5-F05 · asignación en grupo", () => {
  async function seleccionar(user: ReturnType<typeof userEvent.setup>, codigos: string[]) {
    for (const c of codigos) await user.click(within(await fila(c)).getByTestId("casilla-seleccionar"));
  }

  it("seleccionar → aplicar célula, QE y analista → quedan listas e incluidas [E5-F05-T06]", async () => {
    const user = await consultar();
    await fila("QTY-1");
    expect(screen.getByTestId("boton-aplicar-grupo")).toHaveTextContent("Aplicar a 0 filas");
    await seleccionar(user, ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]);
    expect(screen.getByTestId("conteo-seleccion")).toHaveTextContent("Se aplicará a 4 filas seleccionadas.");
    const panel = screen.getByTestId("panel-asignar-grupo");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-celula"), "Clientes");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-qe"), "Jose Seguel");
    await waitFor(() => expect(within(panel).getByTestId("grupo-selector-analista")).toHaveTextContent("Jonathan Choque"));
    await user.selectOptions(within(panel).getByTestId("grupo-selector-analista"), "Jonathan Choque");
    expect(within(panel).getByTestId("casilla-incluir-al-aplicar")).toBeChecked();
    await user.click(screen.getByTestId("boton-aplicar-grupo"));
    await waitFor(() => expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("Se aplicó a 4 filas. 4 quedaron listas e incluidas."));
    for (const c of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) {
      await waitFor(() => expect(screen.getByTestId(`fila-${c}`)).toHaveAttribute("data-marcada", "true"));
    }
    expect(screen.getByTestId("fila-QTY-5")).toHaveAttribute("data-completa", "false");
    expect(screen.getByTestId("contador-incluidas")).toHaveTextContent("4");
    // Las seleccionadas siguen seleccionadas; «Quitar selección» las limpia.
    expect(screen.getByTestId("conteo-seleccion")).toHaveTextContent("4 filas seleccionadas");
    await user.click(screen.getByTestId("boton-quitar-seleccion"));
    expect(screen.getByTestId("boton-aplicar-grupo")).toHaveTextContent("Aplicar a 0 filas");
  });

  it("aplicación parcial: alerta con las filas rechazadas y su motivo [E5-F05-T07]", async () => {
    const user = await consultar();
    await seleccionar(user, ["QTY-1", "QTY-2"]);
    server.use(
      http.patch(`${env.gatewayUrl}/v1/integraciones/jira/consultas/:id/items`, ({ request }) =>
        request.json().then(() =>
          HttpResponse.json({
            aplicadas: 0,
            marcadas: 0,
            incompletas: 0,
            rechazadas: [
              { itemId: "a", codigo: "QTY-1", campo: "analistaId", motivo: "ANALISTA_FUERA_DE_EQUIPO" },
              { itemId: "b", codigo: "QTY-2", campo: "analistaId", motivo: "ANALISTA_FUERA_DE_EQUIPO" },
            ],
            desmarcadas: [],
            version: 1,
            items: [],
          }),
        ),
      ),
    );
    const panel = screen.getByTestId("panel-asignar-grupo");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-celula"), "Clientes");
    await user.click(screen.getByTestId("boton-aplicar-grupo"));
    const alerta = await screen.findByTestId("alerta-rechazadas");
    expect(alerta).toHaveAttribute("role", "alert");
    expect(alerta).toHaveTextContent("No se pudo aplicar a 2 filas");
    expect(alerta).toHaveTextContent("QTY-1 · El analista no pertenece al equipo de ese QE.");
    expect(alerta).toHaveTextContent("Las demás filas se actualizaron. Estas filas no cambiaron.");
    expect(alerta).toHaveFocus();
  });

  it("«Seleccionar las N filas del grupo» actúa sobre todo el grupo, incluso fuera de la página [E5-F05-T24]", async () => {
    const user = await consultar("incompleta");
    await fila("BIG-1");
    await user.click(screen.getByTestId("casilla-seleccionar-grupo"));
    await user.click(await screen.findByTestId("boton-seleccionar-todo-el-grupo"));
    expect(screen.getByTestId("boton-aplicar-grupo")).toHaveTextContent("Aplicar a 100 filas");
    const panel = screen.getByTestId("panel-asignar-grupo");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-celula"), "Clientes");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-qe"), "Jose Seguel");
    await waitFor(() => expect(within(panel).getByTestId("grupo-selector-analista")).toHaveTextContent("Jonathan Choque"));
    await user.selectOptions(within(panel).getByTestId("grupo-selector-analista"), "Jonathan Choque");
    await user.click(screen.getByTestId("boton-aplicar-grupo"));
    await waitFor(() => expect(estadoConsulta.items.filter((i) => i.completa).length).toBe(100));
    expect(screen.getByTestId("contador-asignadas")).toHaveTextContent("100");
  });

  it("«Incluir todas las listas» marca solo las listas e informa las incompletas [E5-F05-T14]", async () => {
    const user = await consultar();
    await seleccionar(user, ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]);
    const panel = screen.getByTestId("panel-asignar-grupo");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-celula"), "Clientes");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-qe"), "Jose Seguel");
    await waitFor(() => expect(within(panel).getByTestId("grupo-selector-analista")).toHaveTextContent("Jonathan Choque"));
    await user.selectOptions(within(panel).getByTestId("grupo-selector-analista"), "Jonathan Choque");
    await user.click(within(panel).getByTestId("casilla-incluir-al-aplicar"));
    await user.click(screen.getByTestId("boton-aplicar-grupo"));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-1")).toHaveAttribute("data-completa", "true"));
    expect(screen.getByTestId("fila-QTY-1")).toHaveAttribute("data-marcada", "false");
    await user.click(screen.getByTestId("boton-marcar-todas"));
    await waitFor(() => expect(screen.getByTestId("anuncios-consulta")).toHaveTextContent("Se incluyeron 4 filas. 6 siguen incompletas."));
    await waitFor(() => expect(screen.getByTestId("fila-QTY-1")).toHaveAttribute("data-marcada", "true"));
  });
});

describe("E5-F05 · confirmar, descartar y vida de la consulta", () => {
  async function dejarListas(user: ReturnType<typeof userEvent.setup>) {
    for (const c of ["QTY-1", "QTY-2", "QTY-3", "QTY-4"]) await user.click(within(await fila(c)).getByTestId("casilla-seleccionar"));
    const panel = screen.getByTestId("panel-asignar-grupo");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-celula"), "Clientes");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-qe"), "Jose Seguel");
    await waitFor(() => expect(within(panel).getByTestId("grupo-selector-analista")).toHaveTextContent("Jonathan Choque"));
    await user.selectOptions(within(panel).getByTestId("grupo-selector-analista"), "Jonathan Choque");
    await user.click(screen.getByTestId("boton-aplicar-grupo"));
    await waitFor(() => expect(screen.getByTestId("contador-incluidas")).toHaveTextContent("4"));
    await waitFor(() => expect(screen.getByTestId("boton-confirmar")).toHaveTextContent("Confirmar marcadas (4)"));
  }

  it("sin filas incluidas, confirmar está deshabilitado con su ayuda [E5-F05-T14]", async () => {
    await consultar();
    const boton = screen.getByTestId("boton-confirmar");
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toHaveTextContent("Confirmar marcadas (0)");
    expect(screen.getByTestId("ayuda-confirmar")).toHaveTextContent("Marca al menos una fila");
    const user = userEvent.setup();
    await user.click(boton);
    expect(screen.queryByTestId("dialogo-confirmar-consulta")).not.toBeInTheDocument();
  });

  it("confirmar: diálogo, HDU creadas con su asignación, 6 descartadas y consulta confirmada [E5-F05-T10, T11]", async () => {
    const user = await consultar();
    const antes = hdus.length;
    await dejarListas(user);
    expect(screen.getByTestId("texto-confirmacion")).toHaveTextContent("Se crearán 4 HDU y no se actualizará ninguna. No se llamará a Jira. Las filas sin marcar se descartarán.");
    await user.click(screen.getByTestId("boton-confirmar"));
    const dialogo = await screen.findByTestId("dialogo-confirmar-consulta");
    expect(dialogo).toHaveTextContent("Se crearán 4 HDU y no se actualizará ninguna. No se llamará a Jira. Las 6 filas nuevas sin marcar se descartarán");
    expect(within(dialogo).getByTestId("boton-seguir-revisando")).toHaveFocus();
    await user.click(within(dialogo).getByTestId("boton-seguir-revisando"));
    expect(hdus.length).toBe(antes);
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(within(await screen.findByTestId("dialogo-confirmar-consulta")).getByTestId("boton-confirmar-dialogo"));
    const resultado = await screen.findByTestId("resultado-confirmacion");
    expect(within(resultado).getByTestId("res-creadas")).toHaveTextContent("4");
    expect(within(resultado).getByTestId("res-omitidas")).toHaveTextContent("0");
    expect(within(resultado).getByTestId("texto-descartadas")).toHaveTextContent("6 filas sin marcar no se crearon; consulta de nuevo para traerlas.");
    expect(hdus.length).toBe(antes + 4);
    const cerrada = await screen.findByTestId("consulta-abierta");
    await waitFor(() => expect(cerrada).toHaveAttribute("data-estado", "CONFIRMADA"));
    expect(screen.queryByTestId("boton-confirmar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("grupo-nuevas")).not.toBeInTheDocument();
    expect(screen.getByTestId("boton-consultar-jira")).not.toBeDisabled();
    expect(estadoConsulta.llamadasJira).toBe(1);
  });

  it("otra persona modificó la consulta: se avisa antes del diálogo y nada se crea [E5-F05-T18]", async () => {
    const user = await consultar();
    const antes = hdus.length;
    await dejarListas(user);
    // Otra persona cambia la consulta.
    estadoConsulta.consulta = { ...estadoConsulta.consulta!, version: estadoConsulta.consulta!.version + 1 };
    await user.click(screen.getByTestId("boton-confirmar"));
    expect(await screen.findByTestId("aviso-consulta-modificada")).toHaveTextContent("Otra persona modificó la consulta");
    expect(screen.queryByTestId("dialogo-confirmar-consulta")).not.toBeInTheDocument();
    expect(hdus.length).toBe(antes);
  });

  it("409 CONSULTA_MODIFICADA al confirmar: recarga y aviso asertivo [E5-F05-T18]", async () => {
    const user = await consultar();
    await dejarListas(user);
    server.use(
      http.post(`${env.gatewayUrl}/v1/integraciones/jira/consultas/:id/confirmaciones`, () =>
        HttpResponse.json({ codigo: "CONSULTA_MODIFICADA", mensaje: "x", consultaId: estadoConsulta.consulta!.id, estado: "ABIERTA", version: 99 }, { status: 409 }),
      ),
    );
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(within(await screen.findByTestId("dialogo-confirmar-consulta")).getByTestId("boton-confirmar-dialogo"));
    const aviso = await screen.findByTestId("aviso-consulta-modificada");
    expect(aviso).toHaveAttribute("role", "alert");
    expect(aviso).toHaveTextContent("No se creó ni se actualizó ninguna HDU.");
  });

  it("asignaciones que dejaron de ser válidas: alerta con las filas y ninguna HDU [E5-F05-T21]", async () => {
    const user = await consultar();
    const antes = hdus.length;
    await dejarListas(user);
    modoE5.confirmacion = "asignaciones-invalidas";
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(within(await screen.findByTestId("dialogo-confirmar-consulta")).getByTestId("boton-confirmar-dialogo"));
    const alerta = await screen.findByTestId("alerta-asignaciones-invalidas");
    expect(alerta).toHaveTextContent("No se creó ninguna HDU: 2 filas tienen una asignación que dejó de ser válida.");
    expect(alerta).toHaveTextContent("ya no está disponible");
    expect(hdus.length).toBe(antes);
    expect(screen.queryByTestId("resultado-confirmacion")).not.toBeInTheDocument();
  });

  it("confirmación incompleta: «Se aplicaron N de M» y «Continuar confirmación» [E5-F05-T23]", async () => {
    const user = await consultar();
    await dejarListas(user);
    modoE5.confirmacion = "incompleta";
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(within(await screen.findByTestId("dialogo-confirmar-consulta")).getByTestId("boton-confirmar-dialogo"));
    const aviso = await screen.findByTestId("aviso-incompleta");
    expect(aviso).toHaveTextContent("Se aplicaron 2 de 4.");
    expect(aviso).toHaveTextContent("La consulta sigue abierta");
    expect(screen.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "ABIERTA");
    modoE5.confirmacion = "normal";
    await user.click(screen.getByTestId("boton-continuar-confirmacion"));
    await waitFor(() => expect(screen.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "CONFIRMADA"));
    expect(screen.getByTestId("res-creadas")).toHaveTextContent("2");
  });

  it("Organización caída al confirmar: mensaje del portal y la consulta sigue abierta", async () => {
    const user = await consultar();
    await dejarListas(user);
    modoE5.confirmacion = "organizacion-caida";
    await user.click(screen.getByTestId("boton-confirmar"));
    await user.click(within(await screen.findByTestId("dialogo-confirmar-consulta")).getByTestId("boton-confirmar-dialogo"));
    expect(await screen.findByTestId("error-confirmacion")).toHaveTextContent("No pudimos guardar las HDU en este momento.");
    expect(screen.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "ABIERTA");
  });

  it("descartar: cancelar no cambia nada; confirmar deja la consulta «Descartada» [E5-F05-T17]", async () => {
    const user = await consultar();
    await user.click(screen.getByTestId("boton-descartar-consulta"));
    const dialogo = await screen.findByTestId("dialogo-descartar");
    expect(dialogo).toHaveTextContent("Se perderán las asignaciones y las filas marcadas. No se creará ni se modificará ninguna HDU.");
    expect(within(dialogo).getByTestId("boton-cancelar-dialogo")).toHaveFocus();
    await user.click(within(dialogo).getByTestId("boton-cancelar-dialogo"));
    expect(estadoConsulta.consulta?.estado).toBe("ABIERTA");
    await user.click(screen.getByTestId("boton-descartar-consulta"));
    await user.click(within(await screen.findByTestId("dialogo-descartar")).getByTestId("boton-descartar-confirmar"));
    await waitFor(() => expect(screen.getByTestId("consulta-abierta")).toHaveAttribute("data-estado", "DESCARTADA"));
    expect(screen.queryByTestId("grupo-nuevas")).not.toBeInTheDocument();
    expect(estadoConsulta.ultimaCerrada?.estado).toBe("DESCARTADA");
  });

  it("reemplazada por otra persona: aviso con su nombre y solo lectura [E5-F05-T16]", async () => {
    const user = await consultar();
    const actual = estadoConsulta.consulta!;
    estadoConsulta.ultimaCerrada = { ...actual, estado: "REEMPLAZADA", cerradaPor: { id: "x", nombre: "Otra Persona" } };
    estadoConsulta.consulta = null;
    estadoConsulta.items = [];
    await user.click(screen.getByTestId("boton-actualizar-consulta"));
    expect(await screen.findByTestId("aviso-consulta-reemplazada")).toHaveTextContent("Esta consulta fue reemplazada por Otra Persona.");
    expect(screen.queryByTestId("boton-confirmar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("selector-celula")).not.toBeInTheDocument();
  });

  /** Otra pestaña reemplazó la consulta: el servidor ya tiene una nueva y el PATCH responde 409 CONSULTA_NO_ABIERTA. */
  function reemplazarEnOtraPestana(conCerradaPor: boolean) {
    const patchs: string[] = [];
    server.use(
      http.patch(`${env.gatewayUrl}/v1/integraciones/jira/consultas/:id/items`, ({ params }) => {
        patchs.push(String(params.id));
        const vieja = estadoConsulta.consulta!;
        estadoConsulta.ultimaCerrada = { ...vieja, estado: "REEMPLAZADA", cerradaPor: { id: "x", nombre: "Otra Persona" } };
        estadoConsulta.consulta = { ...vieja, id: "consulta-nueva", creadaPor: { id: "x", nombre: "Otra Persona" } };
        return HttpResponse.json(
          { codigo: "CONSULTA_NO_ABIERTA", mensaje: "x", consultaId: vieja.id, estado: "REEMPLAZADA", ...(conCerradaPor ? { cerradaPor: { id: "x", nombre: "Otra Persona" } } : {}) },
          { status: 409 },
        );
      }),
    );
    return patchs;
  }

  it("409 CONSULTA_NO_ABIERTA al editar una fila: aviso de reemplazo, solo lectura y sin saltar a la consulta nueva [DEF-E5C-02]", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    reemplazarEnOtraPestana(true);
    await user.selectOptions(within(f).getByTestId("selector-celula"), "Clientes");
    expect(await screen.findByTestId("aviso-consulta-reemplazada")).toHaveTextContent("Esta consulta fue reemplazada por Otra Persona.");
    expect(screen.queryByTestId("selector-celula")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-confirmar")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("boton-ir-nueva-consulta"));
    await waitFor(() => expect(screen.queryByTestId("aviso-consulta-reemplazada")).not.toBeInTheDocument());
    expect(await screen.findByTestId("fila-QTY-1")).toBeInTheDocument();
  });

  it("409 CONSULTA_NO_ABIERTA sin cerradaPor en el cuerpo: usa a quien creó la consulta nueva [DEF-E5C-02]", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    reemplazarEnOtraPestana(false);
    await user.selectOptions(within(f).getByTestId("selector-celula"), "Clientes");
    expect(await screen.findByTestId("aviso-consulta-reemplazada")).toHaveTextContent("Esta consulta fue reemplazada por Otra Persona.");
  });

  it("409 CONSULTA_NO_ABIERTA al aplicar en grupo: mismo aviso [DEF-E5C-02]", async () => {
    const user = await consultar();
    await fila("QTY-1");
    await user.click(within(await fila("QTY-1")).getByTestId("casilla-seleccionar"));
    await user.click(within(await fila("QTY-2")).getByTestId("casilla-seleccionar"));
    const panel = screen.getByTestId("panel-asignar-grupo");
    await user.selectOptions(within(panel).getByTestId("grupo-selector-celula"), "Clientes");
    reemplazarEnOtraPestana(true);
    await user.click(screen.getByTestId("boton-aplicar-grupo"));
    expect(await screen.findByTestId("aviso-consulta-reemplazada")).toHaveTextContent("Esta consulta fue reemplazada por Otra Persona.");
    expect(screen.queryByTestId("panel-asignar-grupo")).not.toBeInTheDocument();
  });

  it("los guardados de una misma fila se encolan: no hay dos PATCH en vuelo [DEF-E5C-01]", async () => {
    const user = await consultar();
    const f = await fila("QTY-1");
    let enVuelo = 0;
    let maximo = 0;
    server.use(
      http.patch(`${env.gatewayUrl}/v1/integraciones/jira/consultas/:id/items`, async () => {
        enVuelo += 1;
        maximo = Math.max(maximo, enVuelo);
        await new Promise((r) => setTimeout(r, 80));
        enVuelo -= 1;
        return HttpResponse.json({ codigo: "ERROR_INTERNO", mensaje: "x" }, { status: 500 });
      }),
    );
    await user.selectOptions(within(f).getByTestId("selector-celula"), "Clientes");
    await user.selectOptions(within(f).getByTestId("selector-celula"), "");
    await waitFor(() => expect(within(screen.getByTestId("fila-QTY-1")).getByTestId("boton-reintentar-fila-QTY-1")).toBeInTheDocument());
    expect(maximo).toBe(1);
  });

  it("filas de la consulta caídas: «indisponible» y no cero", async () => {
    modoE5.lecturaConsulta = "ok";
    const user = await consultar();
    server.use(http.get(`${env.gatewayUrl}/v1/integraciones/jira/consultas/:id/items`, () => HttpResponse.json({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "x" }, { status: 503 })));
    await user.click(screen.getByTestId("boton-actualizar-consulta"));
    expect(await screen.findAllByText("No pudimos cargar las filas")).not.toHaveLength(0);
  });
});

describe("E5-F05 · permisos [E5-F05-T26]", () => {
  it("QE y Auditor no tienen la consulta abierta ni botones de escritura", async () => {
    modoE5.consulta = "exitosa";
    await abrirComo(QE1, "/qe/integraciones");
    await screen.findByTestId("pagina-qe-integraciones");
    expect(screen.queryByTestId("grupo-nuevas")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-confirmar")).not.toBeInTheDocument();
    expect(screen.getByTestId("nota-integraciones-qe")).toHaveTextContent("Las HDU que el Administrador crea desde Jira llegan asignadas.");
  });

  it("el Auditor tampoco", async () => {
    modoE5.consulta = "exitosa";
    await abrirComo(AUDITOR, "/auditor/integraciones");
    await screen.findByTestId("panel-integraciones");
    expect(screen.queryByTestId("consulta-abierta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-confirmar")).not.toBeInTheDocument();
  });
});

describe("E5-F04 #4 · fase en el historial", () => {
  function sembrar() {
    const consulta = registrar(ejecucionBase({ id: "f6000000-0000-4000-8000-000000000001", origen: "JIRA", resultado: "CON_ERRORES", fase: "CONSULTA", leidas: 11, nuevas: 10, conError: 1, iniciadaEn: "2026-11-02T10:20:00Z" }), []);
    const confirmacion = registrar(
      ejecucionBase({ id: "f6000000-0000-4000-8000-000000000002", origen: "JIRA", resultado: "EXITOSA", fase: "CONFIRMACION", leidas: 1, creadas: 1, iniciadaEn: "2026-11-02T10:42:00Z" }),
      [
        {
          fila: 1,
          codigo: "QTY-1",
          titulo: "Login",
          idHistoria: "d5000000-0000-4000-8000-000000000001",
          resultado: "CREADA",
          motivo: null,
          advertencias: [],
          cambios: null,
          referencia: null,
          asignacion: { celula: "Clientes", qe: "Jose Seguel", analista: "Jonathan Choque", sprint: "E5 Sprint 1" },
        },
      ],
    );
    return { consulta, confirmacion };
  }

  it("columna y filtro Fase; consulta con «—» y sus contadores; Directa para lo anterior", async () => {
    const { consulta, confirmacion } = sembrar();
    await abrirComo(ADMIN, "/admin/integraciones/historial");
    expect(await screen.findByTestId(`celda-fase-${consulta.id}`)).toHaveTextContent("Consulta");
    expect(screen.getByTestId(`celda-fase-${confirmacion.id}`)).toHaveTextContent("Confirmación");
    expect(screen.getByTestId(`celda-fase-${EJ.csvOk}`)).toHaveTextContent("Directa");
    expect(screen.getByTestId(`contadores-consulta-${consulta.id}`)).toHaveTextContent("10 nuevas · 0 cambiaron · 0 sin cambios");
    const fila = screen.getByTestId(`fila-ejecucion-${consulta.id}`);
    expect(within(fila).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId("filtro-fase"), "Confirmación");
    await waitFor(() => expect(screen.queryByTestId(`fila-ejecucion-${consulta.id}`)).not.toBeInTheDocument());
    expect(screen.getByTestId(`fila-ejecucion-${confirmacion.id}`)).toBeInTheDocument();
    expect(detalles.size).toBeGreaterThan(0);
  });

  it("detalle de confirmación con «Asignación»; detalle de consulta sin filas; QE en solo lectura [E5-F04-T12, T13]", async () => {
    const { consulta, confirmacion } = sembrar();
    const user = userEvent.setup();
    await abrirComo(ADMIN, `/admin/integraciones/historial?ejecucion=${confirmacion.id}`);
    expect(await screen.findByTestId("fase-ejecucion")).toHaveTextContent("Confirmación");
    expect(await screen.findByTestId("celda-asignacion-1")).toHaveTextContent("Clientes · Jose Seguel · Jonathan Choque · E5 Sprint 1");
    await user.click(screen.getByTestId("enlace-volver-historial"));
    await user.click(await screen.findByTestId(`boton-ver-detalle-${consulta.id}`));
    expect(await screen.findByTestId("nota-detalle-consulta")).toHaveTextContent("El detalle de una consulta está en Consultar Jira mientras esté abierta.");
    expect(screen.queryByTestId("lista-detalle-ejecucion")).not.toBeInTheDocument();
    expect(screen.getByTestId("res-nuevas")).toHaveTextContent("10");
  });

  it("el QE ve la fase del detalle sin enlaces de escritura [E5-F04-T13]", async () => {
    const { consulta } = sembrar();
    await abrirComo(QE1, `/qe/integraciones?ejecucion=${consulta.id}`);
    expect(await screen.findByTestId("fase-ejecucion")).toHaveTextContent("Consulta");
    expect(screen.queryByRole("link", { name: "Consultar Jira" })).not.toBeInTheDocument();
  });
});

describe("textos de asignación y confirmación: concordancia", () => {
  it("falta, aplicar, incluir y rechazos", () => {
    expect(textoFalta(["celulaId", "qeId", "analistaId", "sprintId"])).toBe("Falta: célula, QE, analista y sprint");
    expect(textoFalta(["analistaId"])).toBe("Falta: analista");
    expect(textoSeAplico(1, 1, true)).toBe("Se aplicó a 1 fila. 1 quedó lista e incluida.");
    expect(textoSeIncluyeron(1, 1)).toBe("Se incluyó 1 fila. 1 sigue incompleta.");
    expect(textoSeIncluyeron(4, 0)).toBe("Se incluyeron 4 filas.");
    expect(textoRechazoFila("ANALISTA_FUERA_DE_EQUIPO", "analistaId", undefined, { analista: "ANA1", qe: "QE2" })).toBe("ANA1 no pertenece al equipo de QE2.");
    expect(textoRechazoFila("ANALISTA_INVALIDO", "analistaId", undefined, { analista: "ANA3" })).toBe("ANA3 ya no está disponible.");
  });

  it("resumen y diálogo de confirmación", () => {
    expect(textoResumenConfirmacion(4, 1)).toBe("Se crearán 4 HDU y se actualizará 1. No se llamará a Jira. Las filas sin marcar se descartarán.");
    expect(textoResumenConfirmacion(1, 0)).toBe("Se creará 1 HDU y no se actualizará ninguna. No se llamará a Jira. Las filas sin marcar se descartarán.");
    expect(textoResumenConfirmacion(0, 2)).toContain("No se creará ninguna HDU y se actualizarán 2.");
    expect(textoCuerpoConfirmar(4, 1, 6, 1)).toBe("Se crearán 4 HDU y se actualizará 1. No se llamará a Jira. Las 6 filas nuevas y la fila de cambios sin marcar se descartarán: para traerlas tendrás que consultar Jira de nuevo.");
    expect(textoCuerpoConfirmar(1, 0, 0, 0)).toBe("Se creará 1 HDU y no se actualizará ninguna. No se llamará a Jira.");
    expect(textoDescartadas(1, { nuevas: 1, cambios: 0 })).toBe("1 fila sin marcar no se creó; consulta de nuevo para traerla.");
    expect(textoDescartadas(7, { nuevas: 6, cambios: 1 })).toBe("7 filas sin marcar no se procesaron; consulta de nuevo para traerlas.");
  });
});
