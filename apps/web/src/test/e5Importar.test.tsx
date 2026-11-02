import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { PLANTILLA_CSV } from "@/lib/mensajesIntegracion";
import { ejecuciones, modoE5 } from "@/mocks/dataE5";
import { server } from "@/mocks/server";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";
const CABECERA = "codigo,titulo,descripcion,prioridad\r\n";
const VALIDO = `${CABECERA}ARC-1,Alta de cliente,,ALTA\r\nARC-2,Baja de cliente,,MEDIA\r\nARC-3,"Consulta, con coma",,BAJA\r\nARC-4,Reporte,,CRITICA\r\n`;

const usuario = () => userEvent.setup({ applyAccept: false });

async function abrirImportar() {
  await abrirComo(ADMIN, "/admin/integraciones/importar");
  return screen.findByTestId("selector-archivo");
}

const csv = (contenido: string, nombre = "historias.csv") => new File([contenido], nombre, { type: "text/csv" });

describe("E5-F03 · pestaña Importar archivo", () => {
  it("archivo válido: vista previa (Crear 4), tabla en el orden del archivo e importación [E5-F03-T01]", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    expect(screen.getByTestId("pasos-importacion").querySelector('[aria-current="step"]')).toHaveTextContent("Elegir archivo");
    expect(screen.queryByTestId("boton-importar")).not.toBeInTheDocument();
    await user.upload(selector, csv(VALIDO));
    const previa = await screen.findByTestId("vista-previa");
    expect(within(screen.getByTestId("vp-crear")).getByText("4")).toBeInTheDocument();
    expect(within(screen.getByTestId("vp-con-error")).getByText("0")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-actualizar-campos")).toHaveTextContent("Al actualizar solo se modifican título, descripción y prioridad.");
    expect(screen.getByTestId("resumen-confirmacion")).toHaveTextContent("Se crearán 4 HDU, se actualizarán 0 y se omitirán 0. 0 filas tienen errores.");
    expect(screen.getByTestId("pasos-importacion").querySelector('[aria-current="step"]')).toHaveTextContent("Revisar la vista previa");
    expect(screen.getByTestId("archivo-seleccionado")).toHaveTextContent("historias.csv");
    const filas = within(previa).getAllByRole("row").filter((f) => f.getAttribute("data-testid")?.startsWith("fila-vista-previa-"));
    expect(filas.map((f) => f.getAttribute("data-testid"))).toEqual(["fila-vista-previa-2", "fila-vista-previa-3", "fila-vista-previa-4", "fila-vista-previa-5"]);
    expect(within(screen.getByTestId("fila-vista-previa-4")).getByText("Consulta, con coma")).toBeInTheDocument();

    await user.click(screen.getByTestId("boton-importar"));
    expect(await screen.findByTestId("estado-importando")).toHaveTextContent("Puede tardar hasta unos 10 segundos");
    expect(screen.getByTestId("boton-importar")).toBeDisabled();
    const resultado = await screen.findByTestId("resultado-importacion");
    expect(within(resultado).getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
    expect(within(screen.getByTestId("res-creadas")).getByText("4")).toBeInTheDocument();
    expect(screen.getByTestId("cabecera-archivo")).toHaveTextContent("historias.csv");
    expect(screen.getByTestId("cabecera-archivo")).toHaveTextContent("huella 9f86d081");
    expect(screen.getByTestId("boton-importar-otro")).toBeInTheDocument();
  });

  it("separador punto y coma con BOM: misma vista previa [E5-F03-T03]", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    await user.upload(selector, csv(`﻿${VALIDO.replaceAll(",", ";").replace('"Consulta; con coma"', '"Consulta, con coma"')}`));
    await screen.findByTestId("vista-previa");
    expect(within(screen.getByTestId("vp-crear")).getByText("4")).toBeInTheDocument();
  });

  it("falta una columna obligatoria: error de estructura sin botón de importar [E5-F03-T04]", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    await user.upload(selector, csv("codigo,descripcion\r\nARC-1,x\r\n", "sin-columna-titulo.csv"));
    const error = await screen.findByTestId("error-archivo");
    expect(error).toHaveAttribute("data-codigo", "COLUMNAS_FALTANTES");
    expect(error).toHaveTextContent("Faltan las columnas: titulo");
    expect(error).toHaveFocus();
    expect(screen.queryByTestId("boton-importar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vista-previa")).not.toBeInTheDocument();
    // El selector sigue visible para elegir otro archivo.
    expect(screen.getByTestId("selector-archivo")).toBeEnabled();
  });

  it("vacío, extensión no compatible y JSON ilegible [E5-F03-T05]", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    await user.upload(selector, csv("", "vacio.csv"));
    expect(await screen.findByTestId("error-archivo")).toHaveAttribute("data-codigo", "ARCHIVO_VACIO");
    let peticiones = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") peticiones += 1;
    });
    await user.upload(screen.getByTestId("selector-archivo"), new File(["x"], "hoja.xlsx"));
    await waitFor(() => expect(screen.getByTestId("error-archivo")).toHaveAttribute("data-codigo", "FORMATO_NO_SOPORTADO"));
    expect(screen.getByTestId("error-archivo")).toHaveTextContent("El formato no es compatible. Usa un archivo .csv o .json.");
    expect(peticiones).toBe(0);
    await user.upload(screen.getByTestId("selector-archivo"), new File(["{"], "roto.json", { type: "application/json" }));
    await waitFor(() => expect(screen.getByTestId("error-archivo")).toHaveAttribute("data-codigo", "ARCHIVO_ILEGIBLE"));
    server.events.removeAllListeners();
  });

  it("más de 1 MB se rechaza en el cliente y 501 filas en el servidor [E5-F03-T06]", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    let peticiones = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") peticiones += 1;
    });
    await user.upload(selector, csv(`${CABECERA}${"A".repeat(1_100_000)}`, "grande.csv"));
    await waitFor(() => expect(screen.getByTestId("error-archivo")).toHaveAttribute("data-codigo", "ARCHIVO_MUY_GRANDE"));
    expect(screen.getByTestId("error-archivo")).toHaveTextContent("El archivo supera el máximo de 1 MB.");
    expect(peticiones).toBe(0);
    server.events.removeAllListeners();
    const filas = Array.from({ length: 501 }, (_, i) => `ARC-${i + 1},Titulo ${i + 1},,`).join("\r\n");
    await user.upload(screen.getByTestId("selector-archivo"), csv(`${CABECERA}${filas}`, "501.csv"));
    await waitFor(() => expect(screen.getByTestId("error-archivo")).toHaveAttribute("data-codigo", "DEMASIADAS_FILAS"));
    expect(screen.getByTestId("error-archivo")).toHaveTextContent("máximo de 500 filas");
    expect(screen.queryByTestId("boton-importar")).not.toBeInTheDocument();
  });

  it("filas con error: vista previa con motivo, importa lo válido y el modo estricto no importa nada [E5-F03-T07, T08]", async () => {
    const user = usuario();
    const filas = ["ARC-10,Primera,,ALTA", "ARC-11,Urgente,,URGENTISIMA", "sin codigo,Algo,,ALTA", "ARC-12,Segunda,,MEDIA", "ARC-12,Repetida,,MEDIA", "ARC-14,,,ALTA"].join("\r\n");
    const contenido = `${CABECERA}${filas}\r\n`;
    const selector = await abrirImportar();
    await user.upload(selector, csv(contenido, "con-errores.csv"));
    await screen.findByTestId("vista-previa");
    expect(within(screen.getByTestId("vp-crear")).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByTestId("vp-con-error")).getByText("4")).toBeInTheDocument();
    expect(within(screen.getByTestId("fila-vista-previa-3")).getByText("La prioridad no es válida")).toBeInTheDocument();
    expect(within(screen.getByTestId("fila-vista-previa-4")).getByText("El código no es válido")).toBeInTheDocument();
    expect(within(screen.getByTestId("fila-vista-previa-6")).getByText("El código está repetido en el archivo")).toBeInTheDocument();
    // El filtro «Mostrar» acota por acción.
    await user.selectOptions(screen.getByTestId("filtro-vista-previa"), "ERROR");
    expect(screen.getByTestId("total-vista-previa")).toHaveTextContent("4 filas");
    await user.selectOptions(screen.getByTestId("filtro-vista-previa"), "");
    // Modo estricto: el aviso lo anticipa y «Importar» sigue habilitado (registra la ejecución FALLIDA).
    await user.click(screen.getByTestId("casilla-estricto"));
    expect(screen.getByTestId("aviso-estricto")).toHaveTextContent("Con el modo estricto no se importará nada porque hay 4 filas con error.");
    expect(screen.getByTestId("boton-importar")).toBeEnabled();
    await user.click(screen.getByTestId("boton-importar"));
    const error = await screen.findByTestId("error-archivo");
    expect(error).toHaveAttribute("data-codigo", "MODO_ESTRICTO");
    expect(error).toHaveTextContent("No se importó nada porque el modo estricto detectó 4 filas con error.");
    expect(within(screen.getByTestId("res-creadas")).getByText("0")).toBeInTheDocument();
    expect(within(screen.getByTestId("res-con-error")).getByText("4")).toBeInTheDocument();
    expect(screen.getByTestId("enlace-ver-detalle-ejecucion")).toBeInTheDocument();
  });

  it("modo normal con errores: «Con errores», creadas 2 y lista de filas con error [E5-F03-T07]", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    await user.upload(selector, csv(`${CABECERA}ARC-10,Primera,,ALTA\r\nARC-11,Urgente,,XX\r\nARC-12,Tercera,,\r\n`, "dos.csv"));
    await screen.findByTestId("vista-previa");
    await user.click(screen.getByTestId("boton-importar"));
    const resultado = await screen.findByTestId("resultado-importacion");
    expect(within(resultado).getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "CON_ERRORES");
    expect(await screen.findByTestId("lista-filas-con-error")).toHaveTextContent("La prioridad no es válida");
  });

  it("Cancelar descarta el archivo y no deja rastro en el historial [E5-F03-T11]", async () => {
    const user = usuario();
    const antes = ejecuciones.length;
    const selector = await abrirImportar();
    await user.upload(selector, csv(VALIDO));
    await screen.findByTestId("vista-previa");
    await user.click(screen.getByTestId("boton-cancelar-importacion"));
    expect(screen.queryByTestId("vista-previa")).not.toBeInTheDocument();
    expect(screen.queryByTestId("archivo-seleccionado")).not.toBeInTheDocument();
    expect(ejecuciones.length).toBe(antes);
  });

  it("cambiar «Vincular» vuelve a pedir la vista previa; el modo estricto no [diseño §6.3]", async () => {
    const user = usuario();
    let previas = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/archivos/vista-previa")) previas += 1;
    });
    const selector = await abrirImportar();
    await user.upload(selector, csv(VALIDO));
    await screen.findByTestId("vista-previa");
    expect(previas).toBe(1);
    await user.click(screen.getByTestId("casilla-estricto"));
    expect(previas).toBe(1);
    await user.click(screen.getByTestId("casilla-vincular"));
    await waitFor(() => expect(previas).toBe(2));
    expect(screen.getByTestId("aviso-vincular-activo")).toBeInTheDocument();
    server.events.removeAllListeners();
  });

  it("un valor que empieza con «=» se ve como texto, sin interpretarse", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    await user.upload(selector, csv(`${CABECERA}ARC-1,=SUMA(A1:A2),,ALTA\r\nARC-2,@usuario <b>negrita</b>,,\r\n`));
    const previa = await screen.findByTestId("vista-previa");
    expect(within(previa).getByText("=SUMA(A1:A2)")).toBeInTheDocument();
    expect(within(previa).getByText("@usuario <b>negrita</b>")).toBeInTheDocument();
    expect(previa.querySelector("b")).toBeNull();
  });

  it("la plantilla CSV se genera en el cliente con la fila de ejemplo [D119]", async () => {
    await abrirImportar();
    const enlace = screen.getByTestId("enlace-plantilla-csv");
    expect(enlace).toHaveAttribute("download", "plantilla-historias.csv");
    const contenido = decodeURIComponent(enlace.getAttribute("href")!.replace("data:text/csv;charset=utf-8,", ""));
    expect(contenido).toContain("codigo,titulo,descripcion,prioridad,celula,sprint,qe_correo");
    expect(contenido).toContain("EJEMPLO-1,Reemplaza esta fila");
    expect(PLANTILLA_CSV.startsWith("codigo,titulo")).toBe(true);
  });

  it("INCOMPLETA: «Importar el mismo archivo» usa el archivo en memoria hasta terminar [E5-F03-T14, D118]", async () => {
    const user = usuario();
    modoE5.importacion = "incompleta";
    const selector = await abrirImportar();
    await user.upload(selector, csv(VALIDO));
    await screen.findByTestId("vista-previa");
    await user.click(screen.getByTestId("boton-importar"));
    const aviso = await screen.findByTestId("aviso-incompleta");
    expect(aviso).toHaveTextContent("Se procesaron 2 de 4 filas por el límite de tiempo. Vuelve a importar el mismo archivo");
    expect(screen.queryByTestId("boton-continuar")).not.toBeInTheDocument();
    modoE5.importacion = "normal";
    await user.click(screen.getByTestId("boton-importar-de-nuevo"));
    await waitFor(() => expect(screen.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA"));
    expect(ejecuciones.filter((e) => e.archivo?.nombre === "historias.csv").length).toBe(2);
  });

  it("servicio caído al validar: «No disponible» con Reintentar y el archivo se conserva [diseño §9.1]", async () => {
    const user = usuario();
    server.use(http.post(`${env.gatewayUrl}/v1/integraciones/archivos/vista-previa`, () => HttpResponse.json({ codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "x", traceId: "t", detalles: [] }, { status: 503 })));
    const selector = await abrirImportar();
    await user.upload(selector, csv(VALIDO));
    const bloque = await screen.findByTestId("estado-indisponible-importar");
    expect(bloque).toHaveTextContent("No disponible");
    expect(screen.getByTestId("archivo-seleccionado")).toHaveTextContent("historias.csv");
    server.resetHandlers();
    await user.click(within(bloque).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByTestId("vista-previa")).toBeInTheDocument();
  });

  it("409 al importar: aviso de ejecución en curso [diseño §6.5]", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    await user.upload(selector, csv(VALIDO));
    await screen.findByTestId("vista-previa");
    modoE5.sincronizacion = "en-curso";
    await user.click(screen.getByTestId("boton-importar"));
    expect(await screen.findByTestId("aviso-en-curso")).toHaveTextContent("Ya hay una importación o sincronización en curso. Espera a que termine.");
    expect(screen.getByTestId("boton-importar")).toBeEnabled();
  });

  it("502 al importar: SIN_RESPUESTA y se muestra la ejecución encontrada [D115]", async () => {
    const user = usuario();
    modoE5.importacion = "sin-respuesta";
    const selector = await abrirImportar();
    await user.upload(selector, csv(VALIDO));
    await screen.findByTestId("vista-previa");
    await user.click(screen.getByTestId("boton-importar"));
    expect(await screen.findByTestId("resultado-importacion")).toBeInTheDocument();
  });

  it("«Importar otro archivo» limpia el estado y devuelve el foco al selector", async () => {
    const user = usuario();
    const selector = await abrirImportar();
    await user.upload(selector, csv(VALIDO));
    await screen.findByTestId("vista-previa");
    await user.click(screen.getByTestId("boton-importar"));
    await screen.findByTestId("resultado-importacion");
    await user.click(screen.getByTestId("boton-importar-otro"));
    expect(screen.queryByTestId("resultado-importacion")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("selector-archivo")).toHaveFocus());
  });
});
