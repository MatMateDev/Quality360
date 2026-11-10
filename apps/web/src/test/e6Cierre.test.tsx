import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { ID, hdus } from "@/mocks/data";
import { estadoE6 } from "@/mocks/dataE6";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const QE2 = "constanza.diaz@quality360.local";
const LIDER = "luis.soto@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";
const ADMIN = "admin@quality360.local";
const ANALISTA = "camila.rojas@quality360.local";

const JUSTIFICACION = "El alcance se redujo y los entregables 2 a 10 ya no aplican al proyecto.";

/** HDU2 (QE1 responsable, sin impedimentos abiertos) llevada a PENDIENTE_CIERRE con 7 de 10 aprobados. */
function prepararH2() {
  const h = hdus.find((x) => x.id === ID.hdu2)!;
  h.estado = "PENDIENTE_CIERRE";
  h.simularChecklistIncompleto = true;
}

/** HDU3 (QE1 responsable) con un impedimento abierto (I1). */
function prepararH3() {
  hdus.find((x) => x.id === ID.hdu3)!.simularChecklistIncompleto = true;
}

async function abrirDialogo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId("boton-cerrar-excepcion"));
  return screen.findByTestId("dialogo-cierre-excepcion");
}

describe("Cierre con excepción en /hdu/:id [E6-F05]", () => {
  it("el botón existe desde que se abre el detalle y el cuadro lista los pendientes con su contador [E6-F05-T01]", async () => {
    prepararH2();
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    expect(await screen.findByRole("button", { name: "Pasar a Cerrada" })).toBeInTheDocument();
    const dialogo = await abrirDialogo(user);
    expect(within(dialogo).getByTestId("resumen-pendientes-cierre")).toHaveTextContent("Quedan 3 entregables sin aprobar:");
    expect(within(within(dialogo).getByTestId("lista-pendientes-cierre")).getAllByRole("listitem")).toHaveLength(3);
    expect(within(dialogo).getByText("No se emitirá certificado y la HDU no podrá reabrirse.")).toBeInTheDocument();
    expect(within(dialogo).getByTestId("contador-justificacion-cierre")).toHaveTextContent("0/500");
    expect(within(dialogo).getByLabelText(/Justificación/)).toHaveFocus();
  });

  it("valida al pulsar: vacío, 19 caracteres y tope de 500; la HDU sigue en Pendiente de cierre [E6-F05-T02]", async () => {
    prepararH2();
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    const dialogo = await abrirDialogo(user);
    const campo = within(dialogo).getByLabelText(/Justificación/);
    await user.click(within(dialogo).getByTestId("boton-confirmar-cierre-excepcion"));
    expect(await within(dialogo).findByTestId("error-justificacion-cierre")).toHaveTextContent("La justificación es obligatoria");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    await user.type(campo, "a".repeat(19));
    await user.click(within(dialogo).getByTestId("boton-confirmar-cierre-excepcion"));
    expect(await within(dialogo).findByTestId("error-justificacion-cierre")).toHaveTextContent("La justificación debe tener entre 20 y 500 caracteres");
    expect(campo).toHaveAttribute("maxlength", "500");
    expect(hdus.find((h) => h.id === ID.hdu2)!.estado).toBe("PENDIENTE_CIERRE");
  });

  it("confirmar cierra la HDU y deja la constancia, la insignia y el evento en el historial [E6-F05-T03]", async () => {
    prepararH2();
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    const dialogo = await abrirDialogo(user);
    await user.type(within(dialogo).getByLabelText(/Justificación/), JUSTIFICACION);
    await user.click(within(dialogo).getByTestId("boton-confirmar-cierre-excepcion"));
    const bloque = await screen.findByTestId("cierre-excepcion");
    expect(within(bloque).getByRole("heading", { level: 2 })).toHaveTextContent("Cerrada con excepción: 7 de 10 entregables aprobados");
    expect(within(bloque).getByTestId("cierre-justificacion")).toHaveTextContent(JUSTIFICACION);
    expect(bloque).toHaveTextContent("Jose Seguel");
    expect(screen.getByTestId("mensaje-exito")).toHaveTextContent("HDU cerrada con excepción. Quedó registrada tu justificación.");
    expect(screen.getByTestId("insignia-cierre-excepcion")).toBeInTheDocument();
    expect(screen.queryByTestId("dialogo-cierre-excepcion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-cerrar-excepcion")).not.toBeInTheDocument();
    expect(screen.getByText("No hay transiciones disponibles desde el estado actual.")).toBeInTheDocument();
    await waitFor(() => expect(within(bloque).getByRole("heading", { level: 2 })).toHaveFocus());
    const justificacion = await screen.findByTestId("historial-justificacion");
    expect(justificacion).toHaveTextContent(JUSTIFICACION);
    expect(screen.getByTestId("historial-cierre-excepcion")).toHaveTextContent("Cierre con excepción");
  });

  it("la HDU cerrada con excepción no ofrece certificado ni reapertura y conserva el checklist [E6-F05-T04]", async () => {
    prepararH2();
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    const dialogo = await abrirDialogo(user);
    await user.type(within(dialogo).getByLabelText(/Justificación/), JUSTIFICACION);
    await user.click(within(dialogo).getByTestId("boton-confirmar-cierre-excepcion"));
    const bloque = await screen.findByTestId("cierre-excepcion");
    expect(within(bloque).getByTestId("sin-certificado")).toHaveTextContent("Sin certificado");
    expect(within(bloque).getByTestId("cierre-pendientes").children).toHaveLength(3);
    expect(screen.queryByTestId("boton-generar-certificado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pasar a|reabrir (la )?HDU/i })).not.toBeInTheDocument();
    expect(await screen.findByTestId("panel-checklist")).toBeInTheDocument();
  });

  it.each([
    ["Líder QA", LIDER],
    ["Auditor", AUDITOR],
  ])("%s ve la constancia y el evento, sin botones de acción [E6-F05-T05]", async (_rol, correo) => {
    prepararH2();
    hdus.find((h) => h.id === ID.hdu2)!.estado = "CERRADA";
    estadoE6.cierres.set(ID.hdu2, { aprobados: 7, pendientes: ["EVIDENCIAS", "DEFECTOS", "CIERRE_PRUEBAS"], justificacion: JUSTIFICACION, actorId: ID.qe1, fecha: "2026-11-04T15:20:00Z" });
    await abrirComo(correo, `/hdu/${ID.hdu2}`);
    const bloque = await screen.findByTestId("cierre-excepcion");
    expect(within(bloque).getByTestId("cierre-justificacion")).toHaveTextContent(JUSTIFICACION);
    expect(await screen.findByTestId("historial-justificacion")).toHaveTextContent(JUSTIFICACION);
    expect(screen.queryByTestId("boton-cerrar-excepcion")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pasar a/ })).not.toBeInTheDocument();
  });

  it.each([
    ["Analista de la HDU", ANALISTA, ID.hdu3, false],
    ["Líder QA", LIDER, ID.hdu3, false],
    ["Auditor", AUDITOR, ID.hdu3, false],
    ["Administrador", ADMIN, ID.hdu3, false],
    ["QE fuera de ámbito", QE2, ID.hdu3, true],
  ])("%s no ve el botón; el QE ajeno recibe acceso denegado [E6-F05-T06]", async (_rol, correo, hduId, denegado) => {
    prepararH3();
    await abrirComo(correo, `/hdu/${hduId}`);
    if (denegado) {
      expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    } else {
      await screen.findByRole("heading", { level: 1 });
      await screen.findByTestId("panel-checklist");
    }
    expect(screen.queryByTestId("boton-cerrar-excepcion")).not.toBeInTheDocument();
  });

  it("con impedimentos abiertos el cuadro sigue abierto con lo escrito y enlaza el impedimento [E6-F05-T07]", async () => {
    prepararH3();
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu3}`);
    const dialogo = await abrirDialogo(user);
    await user.type(within(dialogo).getByLabelText(/Justificación/), JUSTIFICACION);
    await user.click(within(dialogo).getByTestId("boton-confirmar-cierre-excepcion"));
    const error = await within(dialogo).findByTestId("error-hdu-bloqueada");
    expect(error).toHaveTextContent("No se puede cerrar la HDU: tiene 1 impedimento abierto o escalado");
    expect(within(error).getByRole("link")).toHaveTextContent("Ambiente QA no responde");
    expect(within(dialogo).getByLabelText(/Justificación/)).toHaveValue(JUSTIFICACION);
    // El enlace cierra el cuadro y conserva el borrador.
    await user.click(within(error).getByRole("link"));
    expect(screen.queryByTestId("dialogo-cierre-excepcion")).not.toBeInTheDocument();
    const reabierto = await abrirDialogo(user);
    expect(within(reabierto).getByLabelText(/Justificación/)).toHaveValue(JUSTIFICACION);
    expect(hdus.find((h) => h.id === ID.hdu3)!.estado).toBe("PENDIENTE_CIERRE");
  });

  it("el cierre normal con el checklist completo sigue siendo «Pasar a Cerrada», sin justificación [E6-F05-T08]", async () => {
    hdus.find((h) => h.id === ID.hdu3)!.simularChecklistCompleto = true;
    estadoE6.cierres.clear();
    await abrirComo(QE1, `/hdu/${ID.hdu3}`);
    expect(await screen.findByRole("button", { name: "Pasar a Cerrada" })).toBeInTheDocument();
    expect(screen.queryByTestId("boton-cerrar-excepcion")).not.toBeInTheDocument();
  });

  it("sin poder verificar el checklist, el botón informa y no abre el cuadro [E6-F05-T09]", async () => {
    // La HDU no trae el checklist (Certificaciones caída): el botón se muestra pero no se adivinan pendientes.
    server.use(
      http.get(`${env.gatewayUrl}/v1/hdu/${ID.hdu3}`, () =>
        HttpResponse.json({
          id: ID.hdu3,
          codigo: "CLIENTES-2001",
          titulo: "Actualización de datos personales",
          celula: { id: ID.celClientes, nombre: "Clientes" },
          sprint: { id: ID.sprint18, nombre: "Sprint 2026-18" },
          prioridad: "MEDIA",
          estado: "PENDIENTE_CIERRE",
          estadoActualizadoEn: "2026-09-10T15:00:00Z",
          qeResponsable: { id: ID.qe1, nombre: "Jose Seguel", correo: QE1 },
          analista: null,
          creadoEn: "2026-08-20T09:00:00Z",
          creadoPor: { tipo: "USUARIO", id: ID.qe1, nombre: "Jose Seguel" },
          transicionesPermitidas: ["CERRADA", "EN_EJECUCION"],
          permisos: { cambiarEstado: true, asignarAnalista: true, cerrarConExcepcion: true },
          checklist: { fuente: "certificaciones.checklist", estado: "indisponible" },
        }),
      ),
    );
    simularFuentes({ certificaciones: false });
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu3}`);
    await user.click(await screen.findByTestId("boton-cerrar-excepcion"));
    expect(await screen.findByTestId("error-checklist-no-disponible")).toHaveTextContent("No pudimos verificar el checklist de la HDU");
    expect(screen.queryByTestId("dialogo-cierre-excepcion")).not.toBeInTheDocument();
    expect(hdus.find((h) => h.id === ID.hdu3)!.estado).toBe("PENDIENTE_CIERRE");
  });

  it("«Pasar a Cerrada» con el checklist incompleto conserva el rechazo certificado y avisa que puede cerrar con excepción [E6-F05-T10]", async () => {
    prepararH2();
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    await user.click(await screen.findByRole("button", { name: "Pasar a Cerrada" }));
    expect(await screen.findByTestId("error-checklist-incompleto")).toHaveTextContent("el checklist de entregables está incompleto");
    expect(screen.getByTestId("aviso-puede-cerrar-excepcion")).toHaveTextContent("Como QE responsable puedes cerrarla con excepción");
    expect(screen.getAllByTestId("boton-cerrar-excepcion")).toHaveLength(1);
  });

  it("un 403 del servidor al confirmar cierra el cuadro con el aviso de permiso retirado", async () => {
    prepararH2();
    server.use(http.post(`${env.gatewayUrl}/v1/hdu/${ID.hdu2}/estado`, () => HttpResponse.json({ codigo: "ACCESO_DENEGADO", mensaje: "no", traceId: "t", detalles: [] }, { status: 403 })));
    const user = userEvent.setup();
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    const dialogo = await abrirDialogo(user);
    await user.type(within(dialogo).getByLabelText(/Justificación/), JUSTIFICACION);
    await user.click(within(dialogo).getByTestId("boton-confirmar-cierre-excepcion"));
    expect(await screen.findByTestId("mensaje-aviso")).toHaveTextContent("Ya no tienes permiso para esta acción");
    expect(screen.queryByTestId("dialogo-cierre-excepcion")).not.toBeInTheDocument();
  });
});
