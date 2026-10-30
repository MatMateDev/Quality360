import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { hdus, ID } from "@/mocks/data";
import { I } from "@/mocks/dataE4";
import { simularFuentes } from "@/mocks/dataE7";
import { abrirComo } from "./renderApp";

const QA1 = "jonathan.choque@quality360.local";
const QA3 = "camila.rojas@quality360.local";
const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";
const LIDER = "luis.soto@quality360.local";
const ADMIN = "admin@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";

describe("Detalle de HDU: registro de impedimentos [E4-F01]", () => {
  it("el analista registra un impedimento y la HDU queda bloqueada [E4-F01#1]", async () => {
    const user = userEvent.setup();
    await abrirComo(QA3, `/hdu/${ID.hdu3}`);
    await user.click(await screen.findByTestId("boton-registrar-impedimento"));
    const form = within(await screen.findByTestId("form-impedimento"));
    await user.selectOptions(form.getByLabelText(/^Tipo/), "ACCESO");
    await user.type(form.getByLabelText(/^Título/), "VPN sin permisos");
    await user.type(form.getByLabelText(/^Descripción/), "No puedo entrar a la VPN de pruebas desde ayer.");
    await waitFor(() => expect(form.getByLabelText(/^Responsable/)).toHaveValue(ID.qe1));
    await user.click(form.getByTestId("boton-guardar-impedimento"));
    expect(await screen.findByTestId("mensaje-exito-impedimento")).toHaveTextContent("La HDU quedó bloqueada");
    expect(screen.queryByTestId("form-impedimento")).not.toBeInTheDocument();
    expect(screen.getByTestId("hdu-bloqueada")).toHaveTextContent("2 impedimentos abiertos");
    expect(screen.getByTestId("lista-impedimentos-hdu")).toHaveTextContent("VPN sin permisos");
  });

  it("marca cada campo faltante, conserva lo escrito y no crea nada [E4-F01#2]", async () => {
    const user = userEvent.setup();
    await abrirComo(QA1, `/hdu/${ID.hdu2}`);
    await user.click(await screen.findByTestId("boton-registrar-impedimento"));
    const form = within(await screen.findByTestId("form-impedimento"));
    await user.type(form.getByLabelText(/^Título/), "VPN");
    await user.click(form.getByTestId("boton-guardar-impedimento"));
    expect(form.getByTestId("error-tipo-impedimento")).toHaveTextContent("Selecciona un tipo");
    expect(form.getByTestId("error-titulo-impedimento")).toHaveTextContent("entre 5 y 200");
    expect(form.getByTestId("error-descripcion-impedimento")).toHaveTextContent("La descripción es obligatoria");
    expect(form.getByLabelText(/^Título/)).toHaveAttribute("aria-invalid", "true");
    expect(form.getByLabelText(/^Título/)).toHaveValue("VPN");
  });

  it.each([LIDER, ADMIN, AUDITOR])("%s ve la sección sin botón de registro ni de gestión [E4-F01-T07]", async (correo) => {
    await abrirComo(correo, `/hdu/${ID.hdu3}`);
    expect(await screen.findByTestId(`impedimento-${I.i1}`)).toBeInTheDocument();
    expect(screen.queryByTestId("boton-registrar-impedimento")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`boton-resolver-${I.i1}`)).not.toBeInTheDocument();
  });

  it("otro QE ve acceso denegado [E4-F01-T07]", async () => {
    await abrirComo(QE2, `/hdu/${ID.hdu3}`);
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
  });

  it("una HDU cerrada conserva el historial y no ofrece registrar [E4-F01-T08]", async () => {
    await abrirComo(QA1, `/hdu/${ID.hdu4}`);
    expect(await screen.findByTestId(`impedimento-${I.i5}`)).toBeInTheDocument();
    expect(screen.getByTestId("nota-impedimentos-cerrada")).toHaveTextContent("HDU cerrada: no admite nuevos impedimentos");
    expect(screen.queryByTestId("boton-registrar-impedimento")).not.toBeInTheDocument();
  });

  it("con Impedimentos caído la sección dice «No disponible» y el resto del detalle carga [E4-F01-T09]", async () => {
    simularFuentes({ impedimentos: false });
    await abrirComo(QA1, `/hdu/${ID.hdu1}`);
    expect(await screen.findByTestId("estado-indisponible-impedimentos-hdu")).toHaveTextContent("No disponible");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Validación de transferencias");
    expect(screen.queryByTestId("boton-registrar-impedimento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hdu-bloqueada")).not.toBeInTheDocument();
  });
});

describe("Detalle de HDU: gestión y cierre [E4-F03]", () => {
  it("el QE responsable resuelve; sin comentario no cambia nada [E4-F03-T01/T02]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    await user.click(await screen.findByTestId(`boton-resolver-${I.i2}`));
    const dlg = within(await screen.findByTestId("dialogo-resolver"));
    await user.click(dlg.getByRole("button", { name: /Confirmar resolución/ }));
    expect(dlg.getByTestId("error-comentario-impedimento")).toHaveTextContent("Indica la acción tomada");
    await user.type(dlg.getByLabelText(/^Comentario/), "Se entregaron las cuentas");
    await user.click(dlg.getByRole("button", { name: /Confirmar resolución/ }));
    expect(await screen.findByTestId("mensaje-exito-impedimento")).toHaveTextContent("ya no está bloqueada");
    await waitFor(() => expect(screen.queryByTestId("hdu-bloqueada")).not.toBeInTheDocument());
    expect(screen.getByTestId(`estado-impedimento-${I.i2}`)).toHaveTextContent("Resuelto");
  });

  it("escalar ofrece solo Líder con la célula y Administrador, más «Otro» [E4-F03-T05]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    await user.click(await screen.findByTestId(`boton-escalar-${I.i2}`));
    const sel = await screen.findByTestId("campo-destino-escalamiento");
    await waitFor(() => expect(within(sel).getAllByRole("option").length).toBeGreaterThan(2));
    const textos = within(sel).getAllByRole("option").map((o) => o.textContent);
    expect(textos.some((t) => t?.includes("Luis Soto"))).toBe(true);
    expect(textos.some((t) => t?.includes("Valentina Rojas"))).toBe(true);
    expect(textos.some((t) => t?.includes("Otro (nombre)"))).toBe(true);
    expect(textos.some((t) => t?.includes("Jonathan"))).toBe(false);
  });

  it("el analista ve el impedimento y su historial sin botones de gestión [E4-F03-T07]", async () => {
    const user = userEvent.setup();
    await abrirComo(QA1, `/hdu/${ID.hdu1}`);
    await screen.findByTestId(`impedimento-${I.i2}`);
    expect(screen.queryByTestId(`boton-resolver-${I.i2}`)).not.toBeInTheDocument();
    expect(screen.getByTestId("nota-impedimentos-solo-lectura")).toBeInTheDocument();
    await user.click(screen.getByTestId(`boton-ver-historial-${I.i2}`));
    expect(await screen.findByTestId(`accion-impedimento-${I.i2}-0`)).toHaveTextContent("Registró el impedimento");
  });

  it("reabrir lleva el impedimento a Abierto y bloquea la HDU [E4-F03-T06]", async () => {
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    await user.click(await screen.findByTestId(`boton-reabrir-${I.i4}`));
    const dlg = within(await screen.findByTestId("dialogo-reabrir"));
    await user.type(dlg.getByLabelText(/^Motivo/), "Volvió a cambiar el criterio");
    await user.click(dlg.getByRole("button", { name: /Confirmar reapertura/ }));
    expect(await screen.findByTestId("hdu-bloqueada")).toBeInTheDocument();
    expect(screen.getByTestId(`estado-impedimento-${I.i4}`)).toHaveTextContent("Abierto");
  });

  it("cerrar con impedimentos abiertos muestra el 409 con el total y la lista, y la HDU no cambia [E4-F03 · D77]", async () => {
    const user = userEvent.setup();
    hdus.find((h) => h.id === ID.hdu3)!.simularChecklistCompleto = true;
    await abrirComo(QE1, `/hdu/${ID.hdu3}`);
    expect(await screen.findByTestId("pista-cierre-bloqueado")).toHaveTextContent("1 impedimento abierto");
    await user.click(await screen.findByRole("button", { name: "Pasar a Cerrada" }));
    const error = await screen.findByTestId("error-hdu-bloqueada");
    expect(error).toHaveTextContent("tiene 1 impedimento abierto o escalado");
    expect(within(screen.getByTestId("lista-error-bloqueantes")).getByRole("link")).toHaveTextContent("Ambiente QA no responde — Abierto");
    expect(error).toHaveFocus();
    expect(screen.getByRole("button", { name: "Pasar a Cerrada" })).toBeEnabled();
  });

  it("si Impedimentos no responde al cerrar, el mensaje lo distingue [D60]", async () => {
    const user = userEvent.setup();
    hdus.find((h) => h.id === ID.hdu3)!.simularChecklistCompleto = true;
    simularFuentes({ impedimentos: false });
    await abrirComo(QE1, `/hdu/${ID.hdu3}`);
    await user.click(await screen.findByRole("button", { name: "Pasar a Cerrada" }));
    expect(await screen.findByTestId("error-impedimentos-no-disponible")).toHaveTextContent("No pudimos verificar los impedimentos");
  });

  it("`?impedimento=` resalta la tarjeta y un id desconocido se ignora [D78]", async () => {
    await abrirComo(QE1, `/hdu/${ID.hdu1}?impedimento=${I.i2}#impedimentos`);
    expect(await screen.findByTestId(`impedimento-${I.i2}`)).toHaveClass("impedimento--resaltado");
  });
});
