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

describe("Usuarios: cambio de rol en una sola operación [E7-F07 · D42, D43, D44, D208]", () => {
  it("el selector ofrece los 4 roles, resume el cambio y lo envía en UNA llamada, solo con el rol [E7-F07-T02, D208]", async () => {
    const user = userEvent.setup();
    const llamadas: { url: string; cuerpo: unknown }[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "PUT") llamadas.push({ url: new URL(request.url).pathname, cuerpo: await request.clone().json() });
    });
    await abrirComo(ADMIN, "/admin/usuarios");

    await user.click((await filaDe(ID.qa2)).getByRole("button", { name: "Cambiar rol" }));
    const dialogo = within(await screen.findByRole("dialog", { name: /Cambiar rol de Ana Pérez/ }));
    // 4 roles, en el orden del diseño: el Líder QA se retiró (D208).
    expect(within(dialogo.getByLabelText("Nuevo rol")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Analista QA",
      "QE",
      "Administrador",
      "Auditor",
    ]);

    await user.selectOptions(dialogo.getByLabelText("Nuevo rol"), "AUDITOR");
    expect(dialogo.getByTestId("resumen-cambio-rol")).toHaveTextContent("Cambiará de Analista QA a Auditor.");
    await user.click(dialogo.getByRole("button", { name: "Confirmar cambio" }));

    expect(await screen.findByTestId("mensaje-exito-usuarios")).toHaveTextContent("Ana Pérez ahora es Auditor.");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe(`/v1/usuarios/${ID.qa2}/rol`);
    expect(llamadas[0]!.cuerpo).toEqual({ rol: "AUDITOR" });
    await waitFor(async () => expect(await screen.findByTestId(`fila-usuario-${ID.qa2}`)).toHaveTextContent("Auditor"));
    server.events.removeAllListeners();
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
    expect(dialogo.getByTestId("error-cambio-rol")).toHaveTextContent("No se aplicó ningún cambio.");
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

  it("?usuario=<id> resalta la fila indicada sin abrir ningún diálogo [D44]", async () => {
    await abrirComo(ADMIN, `/admin/usuarios?usuario=${ID.qa1}`);
    const fila = await screen.findByTestId(`fila-usuario-${ID.qa1}`);
    await waitFor(() => expect(fila).toHaveAttribute("aria-current", "true"));
    expect(fila).toHaveClass("fila-usuario--seleccionada");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("?usuario= con un id inexistente muestra un aviso, no un error [D44]", async () => {
    await abrirComo(ADMIN, "/admin/usuarios?usuario=00000000-0000-4000-8000-000000000999");
    expect(await screen.findByTestId("aviso-usuario-no-encontrado")).toHaveTextContent("No encontramos al usuario indicado");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByTestId(`fila-usuario-${ID.admin}`)).toBeInTheDocument();
  });

  it("?nuevo=1 abre «Nuevo usuario» y lo registra con el rol elegido, sin células [D44, D208]", async () => {
    const user = userEvent.setup();
    let cuerpo: unknown;
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname === "/v1/usuarios") cuerpo = await request.clone().json();
    });
    await abrirComo(ADMIN, "/admin/usuarios?nuevo=1");
    const dialogo = within(await screen.findByRole("dialog", { name: "Nuevo usuario" }));
    expect(within(dialogo.getByLabelText("Rol")).queryByRole("option", { name: "Líder QA" })).not.toBeInTheDocument();
    await user.type(dialogo.getByLabelText("Nombre"), "Rosa Auditora");
    await user.type(dialogo.getByLabelText("Correo"), "rosa.auditora@quality360.local");
    await user.selectOptions(dialogo.getByLabelText("Rol"), "AUDITOR");
    await user.click(dialogo.getByRole("button", { name: "Crear" }));
    expect(await screen.findByTestId("mensaje-exito-usuarios")).toHaveTextContent("Rosa Auditora se registró como Auditor.");
    expect(cuerpo).toEqual({ nombre: "Rosa Auditora", correo: "rosa.auditora@quality360.local", rol: "AUDITOR" });
    server.events.removeAllListeners();
  });

  it("?rol=AUDITOR filtra el listado [D44]", async () => {
    await abrirComo(ADMIN, "/admin/usuarios?rol=AUDITOR");
    expect(await screen.findByTestId(`fila-usuario-${ID.auditor}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`fila-usuario-${ID.qa1}`)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rol")).toHaveValue("AUDITOR");
  });

  it("un enlace antiguo con ?rol=LIDER_QA no filtra ni falla: muestra todos los usuarios [D208]", async () => {
    await abrirComo(ADMIN, "/admin/usuarios?rol=LIDER_QA");
    expect(await screen.findByTestId(`fila-usuario-${ID.qa1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`fila-usuario-${ID.auditor}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Rol")).toHaveValue("");
  });

  it("buscar por nombre o correo filtra, y el total y la paginación se muestran", async () => {
    const user = userEvent.setup();
    await abrirComo(ADMIN, "/admin/usuarios");
    await screen.findByTestId(`fila-usuario-${ID.qa1}`);
    expect(screen.getByTestId("paginacion-usuarios")).toHaveTextContent(/Mostrando 1–8 de 8/);
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
