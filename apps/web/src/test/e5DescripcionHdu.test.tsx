import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ID } from "@/mocks/data";
import { origenesHdu } from "@/mocks/dataE5";
import { abrirComo } from "./renderApp";

const QE1 = "jose.seguel@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";
const ANALISTA = "jonathan.choque@quality360.local";

describe("E5 · Descripción y origen en /hdu/:id [D108]", () => {
  it("HDU de Jira: origen, texto plano sin interpretar y «Abrir en Jira» seguro", async () => {
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    const seccion = await screen.findByTestId("seccion-descripcion-hdu");
    expect(within(seccion).getByTestId("hdu-origen")).toHaveTextContent("Origen: Jira");
    const descripcion = within(seccion).getByTestId("hdu-descripcion");
    expect(descripcion).toHaveTextContent("Como usuario quiero activar la verificación en dos pasos.");
    // Texto plano: las etiquetas HTML se ven como texto y la URL no se convierte en enlace.
    expect(descripcion).toHaveTextContent("<b>etiquetas</b>");
    expect(descripcion.querySelector("b")).toBeNull();
    expect(descripcion.querySelector("a")).toBeNull();
    expect(descripcion).toHaveClass("descripcion-hdu");
    expect(within(seccion).getByTestId("nota-origen-hdu")).toHaveTextContent("Este texto viene de Jira. Una nueva sincronización puede actualizar el título, la descripción y la prioridad.");
    const enlace = within(seccion).getByTestId("enlace-abrir-en-jira");
    expect(enlace).toHaveAttribute("href", "https://su-empresa.atlassian.net/browse/PAGOS-1042");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("queda después del checklist y antes de los impedimentos, sin mover lo certificado", async () => {
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    const seccion = await screen.findByTestId("seccion-descripcion-hdu");
    const certificado = document.getElementById("certificado")!;
    const impedimentos = await screen.findByTestId("seccion-impedimentos");
    expect(certificado.compareDocumentPosition(seccion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(seccion.compareDocumentPosition(impedimentos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("HDU manual sin descripción: «Esta HDU no tiene descripción» y origen Manual, sin nota ni enlace", async () => {
    await abrirComo(QE1, `/hdu/${ID.hdu2}`);
    const seccion = await screen.findByTestId("seccion-descripcion-hdu");
    expect(within(seccion).getByTestId("hdu-origen")).toHaveTextContent("Origen: Manual");
    expect(within(seccion).getByTestId("estado-vacio-descripcion")).toHaveTextContent("Esta HDU no tiene descripción");
    expect(within(seccion).queryByTestId("nota-origen-hdu")).not.toBeInTheDocument();
    expect(within(seccion).queryByTestId("enlace-abrir-en-jira")).not.toBeInTheDocument();
  });

  it("HDU de un archivo: la nota habla del archivo y no hay enlace a Jira", async () => {
    await abrirComo(AUDITOR, `/hdu/${ID.hdu3}`);
    const seccion = await screen.findByTestId("seccion-descripcion-hdu");
    expect(within(seccion).getByTestId("hdu-origen")).toHaveTextContent("Origen: CSV");
    expect(within(seccion).getByTestId("nota-origen-hdu")).toHaveTextContent("Este texto viene de un archivo.");
    expect(within(seccion).queryByTestId("enlace-abrir-en-jira")).not.toBeInTheDocument();
  });

  it("HDU cerrada de Jira: la nota dice que Jira no la modificará", async () => {
    origenesHdu.set(ID.hdu4, { descripcion: "Cerrada", origen: "JIRA", claveExterna: "PAGOS-1", urlExterna: null });
    await abrirComo(QE1, `/hdu/${ID.hdu4}`);
    expect(await screen.findByTestId("nota-origen-hdu")).toHaveTextContent("Esta HDU está cerrada: Jira no la modificará.");
  });

  it("una URL que no es web no se muestra como enlace", async () => {
    origenesHdu.set(ID.hdu1, { descripcion: "x", origen: "JIRA", claveExterna: "X-1", urlExterna: "javascript:alert(1)" });
    await abrirComo(QE1, `/hdu/${ID.hdu1}`);
    await screen.findByTestId("seccion-descripcion-hdu");
    expect(screen.queryByTestId("enlace-abrir-en-jira")).not.toBeInTheDocument();
  });

  it("si el API no trae origen la sección no se renderiza (no se confunde con «Manual»)", async () => {
    // hdu5 simula un servidor sin los campos aditivos.
    await abrirComo(QE1, `/hdu/${ID.hdu5}`);
    await screen.findByTestId("enlace-volver-bandeja");
    expect(screen.queryByTestId("seccion-descripcion-hdu")).not.toBeInTheDocument();
  });

  it("el Analista asignado también ve la descripción (es información, no acción)", async () => {
    await abrirComo(ANALISTA, `/hdu/${ID.hdu1}`);
    expect(await screen.findByTestId("seccion-descripcion-hdu")).toBeInTheDocument();
  });
});
