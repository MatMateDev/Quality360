import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { codigoDeEscritura, esSinRespuesta } from "@/api/integraciones";
import { ErrorApi } from "@/lib/httpClient";
import { modoE5 } from "@/mocks/dataE5";
import { abrirComo } from "./renderApp";

const ADMIN = "admin@quality360.local";
const TEXTO_DEL_SERVIDOR = "TEXTO-DEL-SERVIDOR-QUE-EL-PORTAL-NO-DEBE-MOSTRAR";

async function abrirSincronizar() {
  await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
  return screen.findByTestId("boton-sincronizar");
}

const contador = (clave: string) => screen.getByTestId(`res-${clave}`).querySelector("dd")?.textContent;

describe("E5-F02 · pestaña Sincronizar", () => {
  it("sincroniza: espera indeterminada, resultado con los seis contadores y las listas bajo demanda [E5-F02-T01]", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "con-errores";
    const boton = await abrirSincronizar();
    await user.click(boton);
    expect(await screen.findByTestId("estado-sincronizando")).toHaveTextContent("Puede tardar hasta unos 10 segundos");
    expect(screen.getByTestId("estado-sincronizando")).toHaveTextContent("No se puede cancelar");
    expect(screen.getByTestId("boton-sincronizar")).toBeDisabled();
    expect(screen.getByTestId("boton-sincronizar")).toHaveTextContent("Sincronizando…");
    const resultado = await screen.findByTestId("resultado-sincronizacion");
    expect(within(resultado).getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "CON_ERRORES");
    expect(contador("leidas")).toBe("11");
    expect(contador("creadas")).toBe("10");
    expect(contador("actualizadas")).toBe("0");
    expect(contador("omitidas")).toBe("0");
    expect(contador("con-error")).toBe("1");
    expect(contador("advertencias")).toBe("5");
    expect(screen.getByTestId("res-advertencias")).toHaveTextContent("(informativo, no suma)");
    expect(screen.getByTestId("aviso-limite-tasa")).toHaveTextContent("Jira pidió esperar 2 veces; se reintentó.");
    // Listas: creadas y con error abiertas, 25 por vez.
    const creadas = await screen.findByTestId("lista-hdu-creadas");
    expect(creadas.querySelectorAll('[data-testid^="fila-resultado-"]').length).toBe(10);
    const errores = await screen.findByTestId("lista-filas-con-error");
    expect(errores).toHaveTextContent("QTY-11");
    expect(errores).toHaveTextContent("El título es obligatorio");
    expect(screen.queryByTestId("boton-seccion-omitidas")).not.toBeInTheDocument();
  });

  it("dos sincronizaciones sin cambios: «Sin cambios» y 0 creadas [E5-F02-T04]", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "sin-cambios";
    await user.click(await abrirSincronizar());
    expect(await screen.findByTestId("mensaje-sin-cambios")).toHaveTextContent("Sin cambios: Jira no tiene historias nuevas ni modificadas");
    expect(screen.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
    expect(contador("creadas")).toBe("0");
    expect(contador("omitidas")).toBe("5");
  });

  it("Jira caído: error con el mensaje del portal, Reintentar e «Importar un archivo»; no se muestra texto del servidor [E5-F02-T05]", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "fallida";
    await user.click(await abrirSincronizar());
    const error = await screen.findByTestId("error-sincronizacion");
    expect(error).toHaveAttribute("data-codigo", "JIRA_NO_DISPONIBLE");
    expect(error).toHaveTextContent("Jira no está disponible por ahora.");
    expect(error).toHaveTextContent("no se creó ninguna HDU");
    expect(within(error).getByTestId("enlace-importar-archivo")).toHaveAttribute("href", "/admin/integraciones/importar");
    expect(within(error).getByTestId("boton-reintentar-sincronizacion")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TEXTO_DEL_SERVIDOR);
    expect(document.body.textContent).not.toContain("Basic");
    // «Reintentar» vuelve a ejecutar.
    modoE5.sincronizacion = "exitosa";
    await user.click(within(error).getByTestId("boton-reintentar-sincronizacion"));
    expect((await screen.findByTestId("resultado-ejecucion")).getAttribute("data-resultado")).toBe("EXITOSA");
  });

  it("credencial inválida: Ir a Conexión como acción principal y también Importar un archivo [E5-F02-T06]", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "fallida-credencial";
    await user.click(await abrirSincronizar());
    const error = await screen.findByTestId("error-sincronizacion");
    expect(error).toHaveAttribute("data-codigo", "JIRA_CREDENCIAL_INVALIDA");
    const enlaces = within(error).getAllByRole("link");
    expect(enlaces.map((a) => a.textContent)).toEqual(["Ir a Conexión", "Importar un archivo"]);
    expect(within(error).getByTestId("enlace-ir-conexion")).toHaveAttribute("href", "/admin/integraciones");
  });

  it("Organización caída: reintentar y NUNCA «Importar un archivo» (D117)", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "fallida-organizacion";
    await user.click(await abrirSincronizar());
    const error = await screen.findByTestId("error-sincronizacion");
    expect(error).toHaveAttribute("data-codigo", "ORGANIZACION_NO_DISPONIBLE");
    expect(within(error).queryByTestId("enlace-importar-archivo")).not.toBeInTheDocument();
    expect(within(error).getByTestId("boton-reintentar-sincronizacion")).toBeInTheDocument();
  });

  it("incompleta por el tope de 100: aviso y «Continuar» con lo procesado [E5-F02-T07]", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "incompleta";
    await user.click(await abrirSincronizar());
    const aviso = await screen.findByTestId("aviso-incompleta");
    expect(aviso).toHaveTextContent("Se procesaron 100 historias; quedan más en Jira.");
    expect(aviso).toHaveTextContent("Las ejecuciones anteriores quedan en el Historial");
    const continuar = await screen.findByTestId("boton-continuar");
    expect(continuar).toHaveAttribute("aria-describedby", "aviso-incompleta");
    expect(contador("creadas")).toBe("100");
    modoE5.sincronizacion = "exitosa";
    await user.click(continuar);
    await waitFor(() => expect(screen.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA"));
    // Una vez completo, el botón desaparece.
    await waitFor(() => expect(screen.queryByTestId("boton-continuar")).not.toBeInTheDocument());
  });

  it("incompleta por límite de tasa usa su propio texto", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "incompleta-tasa";
    await user.click(await abrirSincronizar());
    expect(await screen.findByTestId("aviso-incompleta")).toHaveTextContent("Jira pidió esperar demasiado. Se procesaron 50 historias; continúa más tarde o importa un archivo.");
  });

  it("ejecución ajena en curso: aviso, botón deshabilitado y 409 al pulsar [E5-F02-T09]", async () => {
    modoE5.sincronizacion = "en-curso";
    const boton = await abrirSincronizar();
    expect(await screen.findByTestId("aviso-en-curso")).toHaveTextContent("Ya hay una sincronización en curso.");
    expect(boton).toBeDisabled();
  });

  it("409 INTEGRACION_EN_CURSO al pulsar muestra el mismo aviso", async () => {
    const user = userEvent.setup();
    const boton = await abrirSincronizar();
    expect(boton).toBeEnabled();
    modoE5.sincronizacion = "en-curso";
    await user.click(boton);
    expect(await screen.findByTestId("aviso-en-curso")).toBeInTheDocument();
  });

  it("sin configuración: estado vacío con enlace a Conexión y sin botón de sincronizar [E5-F02-T10]", async () => {
    modoE5.configuracion = "vacia";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    const vacio = await screen.findByTestId("estado-vacio-jira");
    expect(vacio).toHaveTextContent("Configura la conexión con Jira antes de sincronizar");
    expect(within(vacio).getByRole("link", { name: "Ir a Conexión" })).toHaveAttribute("href", "/admin/integraciones");
    expect(screen.queryByTestId("boton-sincronizar")).not.toBeInTheDocument();
  });

  it("Integraciones caído: «No disponible» y no «0» ni «Sin cambios»", async () => {
    modoE5.configuracion = "indisponible";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    expect(await screen.findByTestId("estado-indisponible-sincronizacion")).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("boton-sincronizar")).not.toBeInTheDocument();
  });

  it("sin la llave de cifrado no hay botón y se explica", async () => {
    modoE5.configuracion = "sin-llave";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    expect(await screen.findByTestId("aviso-integracion-deshabilitada")).toBeInTheDocument();
    expect(screen.queryByTestId("boton-sincronizar")).not.toBeInTheDocument();
  });

  it("«Vincular» muestra su aviso y cambia lo que se pide; sin vincular, sugiere activarlo [D99]", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "vincular-sugerido";
    await abrirSincronizar();
    expect(screen.getByTestId("casilla-vincular")).not.toBeChecked();
    await user.click(screen.getByTestId("boton-sincronizar"));
    expect(await screen.findByTestId("aviso-vincular-sugerido")).toHaveTextContent("2 historias se omitieron porque ya existen como HDU creadas a mano");
    await user.click(screen.getByTestId("casilla-vincular"));
    expect(screen.getByTestId("aviso-vincular-activo")).toBeInTheDocument();
    await user.click(screen.getByTestId("boton-sincronizar"));
    await waitFor(() => expect(contador("actualizadas")).toBe("2"));
    expect(screen.queryByTestId("aviso-vincular-sugerido")).not.toBeInTheDocument();
  });

  it("respuesta cortada (504): SIN_RESPUESTA, consulta el estado y muestra la ejecución encontrada [D115]", async () => {
    const user = userEvent.setup();
    modoE5.sincronizacion = "sin-respuesta";
    await user.click(await abrirSincronizar());
    const error = await screen.findByTestId("error-sincronizacion");
    expect(error).toHaveAttribute("data-codigo", "SIN_RESPUESTA");
    expect(error).toHaveTextContent("No recibimos respuesta del servidor. La operación pudo haberse completado: revisa el Historial antes de reintentar.");
    expect(within(error).getByRole("link", { name: "Ver en el Historial" })).toHaveAttribute("href", "/admin/integraciones/historial");
    // El estado trae la ejecución que sí terminó.
    expect(await screen.findByTestId("resultado-sincronizacion")).toBeInTheDocument();
    expect(screen.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
  });
});

describe("mapeo de SIN_RESPUESTA [D115]", () => {
  const error = (status: number, codigo: string) => new ErrorApi(status, { codigo: codigo as never, mensaje: "x", traceId: "t", detalles: [] });

  it("502, 504 y 503 SERVICIO_NO_DISPONIBLE no dicen si la operación se completó", () => {
    expect(esSinRespuesta(error(502, "ERROR_INTERNO"))).toBe(true);
    expect(esSinRespuesta(error(504, "ERROR_INTERNO"))).toBe(true);
    expect(esSinRespuesta(error(503, "SERVICIO_NO_DISPONIBLE"))).toBe(true);
    expect(codigoDeEscritura(error(504, "ERROR_INTERNO"))).toBe("SIN_RESPUESTA");
  });

  it("un error de red o de lectura del cuerpo también", () => {
    expect(esSinRespuesta(new TypeError("Failed to fetch"))).toBe(true);
    expect(esSinRespuesta(new SyntaxError("Unexpected token <"))).toBe(true);
    expect(esSinRespuesta(new DOMException("timeout", "TimeoutError"))).toBe(true);
  });

  it("los errores del servidor con código propio no son SIN_RESPUESTA", () => {
    expect(esSinRespuesta(error(409, "INTEGRACION_EN_CURSO"))).toBe(false);
    expect(esSinRespuesta(error(409, "JIRA_NO_CONFIGURADO"))).toBe(false);
    expect(esSinRespuesta(error(503, "LLAVE_CIFRADO_NO_DISPONIBLE"))).toBe(false);
    expect(esSinRespuesta(error(403, "ACCESO_DENEGADO"))).toBe(false);
    expect(codigoDeEscritura(error(409, "INTEGRACION_EN_CURSO"))).toBe("INTEGRACION_EN_CURSO");
  });
});
