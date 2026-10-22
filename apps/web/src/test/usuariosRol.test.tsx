import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";

async function filaDe(id: string) {
  return within(await screen.findByTestId(`fila-usuario-${id}`));
}

describe("Usuarios: rol y células en una sola operación [E7-F07 · D42, D43, D44]", () => {
  it("el cambio de rol a Líder QA muestra las células, resume el cambio y se envía en UNA llamada [E7-F07-T01]", async () => {
    const user = userEvent.setup();
    const llamadas: { url: string; cuerpo: unknown }[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "PUT") llamadas.push({ url: new URL(request.url).pathname, cuerpo: await request.clone().json() });
    });
    await abrirComo(ADMIN, "/admin/usuarios");

    await user.click((await filaDe(ID.qa2)).getByRole("button", { name: "Cambiar rol" }));
    const dialogo = within(await screen.findByRole("dialog", { name: /Cambiar rol de Ana Pérez/ }));
    // 5 roles, en el orden del diseño.
    expect(within(dialogo.getByLabelText("Nuevo rol")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Analista QA",
      "QE",
      "Líder QA",
      "Administrador",
      "Auditor",
    ]);
    // Sin Líder, no hay lista de células.
    expect(dialogo.queryByTestId("selector-celulas")).not.toBeInTheDocument();

    await user.selectOptions(dialogo.getByLabelText("Nuevo rol"), "LIDER_QA");
    expect(await dialogo.findByTestId("aviso-lider-sin-celulas")).toHaveTextContent("no verá ninguna HDU");
    await user.click(dialogo.getByTestId(`celula-opcion-${ID.celPagos}`));
    await user.click(dialogo.getByTestId(`celula-opcion-${ID.celClientes}`));
    expect(dialogo.getByTestId("contador-celulas-seleccionadas")).toHaveTextContent("2 seleccionadas");
    expect(dialogo.getByTestId("resumen-cambio-rol")).toHaveTextContent("Cambiará de Analista QA a Líder QA. Células que tendrá: Clientes, Pagos.");

    await user.click(dialogo.getByRole("button", { name: "Confirmar cambio" }));
    expect(await screen.findByTestId("mensaje-exito-usuarios")).toHaveTextContent("Ana Pérez ahora es Líder QA con Clientes, Pagos.");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe(`/v1/usuarios/${ID.qa2}/rol`);
    expect(llamadas[0]!.cuerpo).toEqual({ rol: "LIDER_QA", celulaIds: expect.arrayContaining([ID.celPagos, ID.celClientes]) });
    expect(screen.queryByTestId("aviso-parcial")).not.toBeInTheDocument();
    await waitFor(async () => expect((await filaDe(ID.qa2)).getByTestId(`celulas-usuario-${ID.qa2}`)).toHaveTextContent("ClientesPagos"));
    server.events.removeAllListeners();
  });

  it("con rol Auditor no aparece la lista de células [E7-F07-T03]", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/usuarios");
    await user.click((await filaDe(ID.qa2)).getByRole("button", { name: "Cambiar rol" }));
    const dialogo = within(await screen.findByRole("dialog"));
    await user.selectOptions(dialogo.getByLabelText("Nuevo rol"), "AUDITOR");
    expect(dialogo.queryByTestId("selector-celulas")).not.toBeInTheDocument();
    expect(dialogo.getByTestId("resumen-cambio-rol")).toHaveTextContent("Cambiará de Analista QA a Auditor.");
  });

  it("el 409 con células vigentes explica qué quitar y ofrece «Quitar células»; no hay cambios parciales [E7-F07-T02]", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/usuarios");
    await user.click((await filaDe(ID.lider1)).getByRole("button", { name: "Cambiar rol" }));
    const dialogo = within(await screen.findByRole("dialog"));
    await user.selectOptions(dialogo.getByLabelText("Nuevo rol"), "AUDITOR");
    await user.click(dialogo.getByRole("button", { name: "Confirmar cambio" }));

    const error = await dialogo.findByTestId("error-cambio-rol");
    expect(error).toHaveTextContent("Antes de cambiar el rol de Luis Soto debes quitarle sus células (Clientes, Pagos).");
    expect(error).toHaveTextContent("No se aplicó ningún cambio.");

    await user.click(dialogo.getByTestId("boton-quitar-celulas"));
    const celulas = within(await screen.findByRole("dialog", { name: /Células de Luis Soto/ }));
    await waitFor(() => expect(celulas.getByTestId("contador-celulas-seleccionadas")).toHaveTextContent("0 seleccionadas"));
    expect(celulas.getByTestId("resumen-cambio-celulas")).toHaveTextContent("Luis Soto dejará de ver las HDU de Clientes, Pagos.");
    await user.click(celulas.getByRole("button", { name: "Quitar y guardar" }));
    expect(await screen.findByTestId("mensaje-exito-usuarios")).toHaveTextContent("Luis Soto ya no tiene células a cargo.");
    await waitFor(async () => expect((await filaDe(ID.lider1)).getByTestId(`celulas-usuario-${ID.lider1}`)).toHaveTextContent("Sin células"));
  });

  it("el 409 de un QE informa todas las relaciones a la vez, con un enlace a cada HDU abierta para reasignarla [D43]", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/usuarios");
    await user.click((await filaDe(ID.qe1)).getByRole("button", { name: "Cambiar rol" }));
    const dialogo = within(await screen.findByRole("dialog"));
    await user.selectOptions(dialogo.getByLabelText("Nuevo rol"), "AUDITOR");
    await user.click(dialogo.getByRole("button", { name: "Confirmar cambio" }));

    expect(await dialogo.findByTestId("relacion-analistas")).toHaveTextContent("Jonathan Choque");
    expect(dialogo.getByTestId("relacion-hdu-abiertas")).toHaveTextContent("debes reasignar sus 5 HDU abiertas");
    for (const id of [ID.hdu1, ID.hdu2, ID.hdu3, ID.hdu5, ID.hdu6]) {
      expect(dialogo.getByTestId(`enlace-hdu-abierta-${id}`)).toHaveAttribute("href", `/hdu/${id}#asignacion`);
    }
    expect(dialogo.queryByTestId("enlace-hdu-abierta-" + ID.hdu4)).not.toBeInTheDocument();
    expect(dialogo.getAllByRole("link", { name: "Ir a Supervisión" })[0]).toHaveAttribute("href", `/admin/supervision?qe=${ID.qe1}`);
  });

  it("Esc cierra el diálogo y devuelve el foco al botón que lo abrió", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/usuarios");
    const boton = (await filaDe(ID.qa2)).getByRole("button", { name: "Cambiar rol" });
    await user.click(boton);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(boton).toHaveFocus();
  });

  it("?usuario=<id> resalta la fila y abre el diálogo de células con su historial [E7-F05-T03, D44]", async () => {
    await abrirComo(ADMIN, `/admin/usuarios?usuario=${ID.lider1}`);
    const fila = await screen.findByTestId(`fila-usuario-${ID.lider1}`);
    expect(fila).toHaveAttribute("aria-current", "true");
    expect(fila).toHaveClass("fila-usuario--seleccionada");
    const dialogo = within(await screen.findByRole("dialog", { name: "Células de Luis Soto" }));
    expect(await dialogo.findByTestId("celulas-vigentes")).toHaveTextContent("Clientes, Pagos");
    const historial = await dialogo.findByTestId("historial-celulas-lider");
    expect(within(historial).getByText("Historial (3)")).toBeInTheDocument();
    expect(within(historial).getByTestId(`historial-celula-${ID.celTarjetas}`)).toHaveTextContent(/Tarjetas · desde .* hasta .* · asignó Valentina Rojas/);
    // Sin diferencias, «Guardar células» está deshabilitado.
    expect(dialogo.getByRole("button", { name: "Guardar células" })).toBeDisabled();
  });

  it("?usuario= con un Líder sin células permite asignarlas y confirma [E7-F05-T03]", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, `/admin/usuarios?usuario=${ID.lider2}`);
    const dialogo = within(await screen.findByRole("dialog", { name: "Células de Paula Vega" }));
    await user.click(await dialogo.findByTestId(`celula-opcion-${ID.celTarjetas}`));
    expect(dialogo.getByTestId("resumen-cambio-celulas")).toHaveTextContent("Se agregará Tarjetas.");
    await user.click(dialogo.getByRole("button", { name: "Guardar células" }));
    expect(await screen.findByTestId("mensaje-exito-usuarios")).toHaveTextContent("Paula Vega ahora tiene a cargo Tarjetas.");
  });

  it("?usuario= con un id inexistente muestra un aviso, no un error [D44]", async () => {
    await abrirComo(ADMIN, "/admin/usuarios?usuario=00000000-0000-4000-8000-000000000999");
    expect(await screen.findByTestId("aviso-usuario-no-encontrado")).toHaveTextContent("No encontramos al usuario indicado");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByTestId(`fila-usuario-${ID.admin}`)).toBeInTheDocument();
  });

  it("?nuevo=1 abre «Nuevo usuario» y, con rol Líder QA, permite guardar sin células con aviso [E7-F07-T05]", async () => {
    const user = userEvent.setup();
    let cuerpo: unknown;
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname === "/v1/usuarios") cuerpo = await request.clone().json();
    });
    await abrirComo(ADMIN, "/admin/usuarios?nuevo=1");
    const dialogo = within(await screen.findByRole("dialog", { name: "Nuevo usuario" }));
    await user.type(dialogo.getByLabelText("Nombre"), "Rosa Lider");
    await user.type(dialogo.getByLabelText("Correo"), "rosa.lider@quality360.local");
    await user.selectOptions(dialogo.getByLabelText("Rol"), "LIDER_QA");
    expect(dialogo.getByTestId("aviso-lider-sin-celulas")).toBeInTheDocument();
    await user.click(dialogo.getByRole("button", { name: "Crear" }));
    expect(await screen.findByTestId("mensaje-exito-usuarios")).toHaveTextContent("Rosa Lider se registró como Líder QA.");
    expect(cuerpo).toEqual({ nombre: "Rosa Lider", correo: "rosa.lider@quality360.local", rol: "LIDER_QA", celulaIds: [] });
    server.events.removeAllListeners();
  });

  it("?rol=LIDER_QA filtra el listado y muestra las células de cada líder [E7-F05-T02]", async () => {
    await abrirComo(ADMIN, "/admin/usuarios?rol=LIDER_QA");
    expect(await screen.findByTestId(`fila-usuario-${ID.lider1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`fila-usuario-${ID.lider2}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`fila-usuario-${ID.qa1}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`celulas-usuario-${ID.lider2}`)).toHaveTextContent("Sin células");
    expect(screen.getByTestId(`boton-celulas-${ID.lider1}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Rol")).toHaveValue("LIDER_QA");
  });

  it("buscar por nombre o correo filtra, y el total y la paginación se muestran", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/usuarios");
    await screen.findByTestId(`fila-usuario-${ID.qa1}`);
    expect(screen.getByTestId("paginacion-usuarios")).toHaveTextContent(/Mostrando 1–10 de 10/);
    await user.type(screen.getByLabelText("Buscar por nombre o correo"), "andrea");
    await waitFor(() => expect(screen.queryByTestId(`fila-usuario-${ID.qa1}`)).not.toBeInTheDocument());
    expect(await screen.findByTestId(`fila-usuario-${ID.auditor}`)).toBeInTheDocument();
    expect(screen.getByTestId("total-usuarios")).toHaveTextContent("1 usuarios");
  });

  it("un 403 del servidor al cambiar el rol no muestra datos y deja el mensaje del API", async () => {
    const user = userEvent.setup();
    server.use(
      http.put(`${env.gatewayUrl}/v1/usuarios/${ID.qa2}/rol`, () =>
        HttpResponse.json({ codigo: "ACCESO_DENEGADO", mensaje: "No tienes acceso a este recurso.", traceId: "t", detalles: [] }, { status: 403 }),
      ),
    );
    await abrirComo(ADMIN, "/admin/usuarios");
    await user.click((await filaDe(ID.qa2)).getByRole("button", { name: "Cambiar rol" }));
    const dialogo = within(await screen.findByRole("dialog"));
    await user.selectOptions(dialogo.getByLabelText("Nuevo rol"), "QE");
    await user.click(dialogo.getByRole("button", { name: "Confirmar cambio" }));
    expect(await dialogo.findByTestId("error-cambio-rol")).toHaveTextContent("No tienes acceso a este recurso.");
  });
});
