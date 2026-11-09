import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { codigoDeEscritura, esSinRespuesta } from "@/api/integraciones";
import { ErrorApi } from "@/lib/httpClient";
import { textoAsignadas, textoEstaTanda, textoFilas, textoHistorias, textoLimiteTasa, textoNoAbierta, textoRevisar } from "@/lib/mensajesConsulta";
import { estadoConsulta, modoE5 } from "@/mocks/dataE5";
import { vencerConsultaAbierta } from "@/mocks/handlersConsulta";
import { abrirComo, renderApp } from "./renderApp";

const ADMIN = "admin@quality360.local";
const QE1 = "jose.seguel@quality360.local";
const ANALISTA = "jonathan.choque@quality360.local";
const LIDER = "luis.soto@quality360.local";
const AUDITOR = "andrea.mora@quality360.local";
const TEXTO_DEL_SERVIDOR = "TEXTO-DEL-SERVIDOR-QUE-EL-PORTAL-NO-DEBE-MOSTRAR";

async function abrirConsultar() {
  await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
  return screen.findByTestId("boton-consultar-jira");
}

const cifra = (clave: string) => screen.getByTestId(`res-${clave}`).querySelector("dd")?.textContent;
const contador = (clave: string) => screen.getByTestId(`contador-${clave}`).querySelector("dd")?.textContent;

describe("E5-F02 · pestaña Consultar Jira", () => {
  it("la pestaña se llama «Consultar Jira» y sin consulta muestra el estado vacío [E5-F02 #1]", async () => {
    await abrirConsultar();
    expect(screen.getByTestId("pestana-sincronizar")).toHaveTextContent("Sincronizar");
    expect(screen.getByRole("heading", { name: "Sincronizar con Jira" })).toBeInTheDocument();
    expect(screen.getByText(/No crea ni modifica HDU hasta que confirmes/)).toBeInTheDocument();
    expect(await screen.findByTestId("estado-vacio-consulta")).toHaveTextContent("Aún no hay una consulta abierta.");
    expect(screen.queryByTestId("casilla-vincular")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-continuar-consulta")).not.toBeInTheDocument();
  });

  it("consulta: espera indeterminada, cifras de la tanda y consulta abierta con vencimiento [E5-F02-T01]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "con-errores";
    const boton = await abrirConsultar();
    await user.click(boton);
    expect(await screen.findByTestId("estado-consultando")).toHaveTextContent("Puede tardar hasta unos 10 segundos");
    expect(screen.getByTestId("estado-consultando")).toHaveTextContent("No se puede cancelar");
    expect(screen.getByTestId("boton-consultar-jira")).toBeDisabled();
    expect(screen.getByTestId("boton-consultar-jira")).toHaveTextContent("Consultando…");
    const resultado = await screen.findByTestId("resultado-consulta");
    expect(within(resultado).getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "CON_ERRORES");
    expect(cifra("leidas")).toBe("11");
    expect(cifra("nuevas")).toBe("10");
    expect(cifra("cambiaron")).toBe("0");
    expect(cifra("sin-cambios")).toBe("0");
    expect(cifra("con-error")).toBe("1");
    expect(cifra("advertencias")).toBe("4");
    expect(screen.getByTestId("res-advertencias")).toHaveTextContent("(informativo, no suma)");
    expect(screen.getByTestId("aviso-limite-tasa")).toHaveTextContent("Jira pidió esperar 2 veces; se reintentó.");
    expect(resultado).toHaveTextContent("Consulta completa. 1 fila no se puede importar; las demás quedaron para revisión.");
    expect(screen.getByTestId("enlace-revisar-consulta")).toHaveTextContent("Revisar y asignar (10 nuevas)");
    const abierta = await screen.findByTestId("consulta-abierta");
    expect(abierta).toHaveAttribute("data-estado", "ABIERTA");
    expect(abierta).toHaveAttribute("data-version", "1");
    expect(screen.getByTestId("consulta-vence")).toHaveTextContent("vence el");
    expect(contador("nuevas")).toBe("10");
    expect(contador("con-error")).toBe("1");
    expect(screen.queryByTestId("estado-vacio-consulta")).not.toBeInTheDocument();
    // Consultar no crea ni modifica HDU: sin nada marcado, confirmar queda deshabilitado.
    expect(screen.getByTestId("boton-confirmar")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("boton-confirmar")).toHaveTextContent("Confirmar marcadas (0)");
  });

  it("«Revisar y asignar» mueve el foco a la consulta abierta [diseño §3.2]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "exitosa";
    await user.click(await abrirConsultar());
    await user.click(await screen.findByTestId("enlace-revisar-consulta"));
    expect(screen.getByRole("heading", { name: "Consulta abierta" })).toHaveFocus();
  });

  it("nueva, cambiaron, sin cambios y con error se separan en la tanda [E5-F02-T03]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "con-cambios";
    await user.click(await abrirConsultar());
    await screen.findByTestId("resultado-consulta");
    expect(cifra("nuevas")).toBe("1");
    expect(cifra("cambiaron")).toBe("2");
    expect(cifra("sin-cambios")).toBe("8");
    expect(cifra("con-error")).toBe("1");
    expect(screen.getByTestId("enlace-revisar-consulta")).toHaveTextContent("Revisar y asignar (1 nueva)");
  });

  it("sin novedades: mensaje, 0 nuevas y ninguna consulta abierta que revisar [E5-F02-T04]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "sin-novedades";
    await user.click(await abrirConsultar());
    expect(await screen.findByTestId("mensaje-sin-novedades")).toHaveTextContent("Sin novedades: todas las historias de Jira ya están en Quality360 sin cambios");
    expect(screen.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
    expect(cifra("nuevas")).toBe("0");
    expect(cifra("cambiaron")).toBe("0");
    expect(cifra("sin-cambios")).toBe("5");
    expect(screen.queryByTestId("enlace-revisar-consulta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-confirmar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consulta-abierta")).not.toBeInTheDocument();
    expect(screen.getByTestId("estado-vacio-consulta")).toBeInTheDocument();
  });

  it("Jira caído: error con el mensaje del portal, «Consultar de nuevo» e «Importar un archivo»; la abierta se conserva [E5-F02-T05]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "exitosa";
    await user.click(await abrirConsultar());
    await screen.findByTestId("consulta-abierta");
    modoE5.consulta = "fallida";
    await user.click(screen.getByTestId("boton-consultar-jira"));
    const dialogo = await screen.findByTestId("dialogo-reemplazar");
    await user.click(within(dialogo).getByTestId("boton-reemplazar-consulta"));
    const error = await screen.findByTestId("error-consulta");
    expect(error).toHaveAttribute("data-codigo", "JIRA_NO_DISPONIBLE");
    expect(error).toHaveTextContent("Jira no está disponible por ahora.");
    expect(error).toHaveTextContent("no se guardó ninguna consulta nueva");
    expect(error).toHaveTextContent("La consulta que tenías abierta se conserva.");
    expect(within(error).getByTestId("enlace-importar-archivo")).toHaveAttribute("href", "/admin/integraciones/importar");
    expect(document.body.textContent).not.toContain(TEXTO_DEL_SERVIDOR);
    expect(document.body.textContent).not.toContain("Basic");
    // La consulta A sigue abierta con sus filas.
    expect(screen.getByTestId("consulta-abierta")).toBeInTheDocument();
    expect(estadoConsulta.consulta?.estado).toBe("ABIERTA");
    expect(estadoConsulta.items).toHaveLength(10);
    // «Consultar de nuevo» vuelve a intentarlo (y vuelve a pedir el reemplazo).
    modoE5.consulta = "exitosa";
    await user.click(within(error).getByTestId("boton-reintentar-consulta"));
    expect(await screen.findByTestId("dialogo-reemplazar")).toBeInTheDocument();
  });

  it("credencial inválida: Ir a Conexión como acción y el token no aparece [E5-F02-T06]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "fallida-credencial";
    await user.click(await abrirConsultar());
    const error = await screen.findByTestId("error-consulta");
    expect(error).toHaveAttribute("data-codigo", "JIRA_CREDENCIAL_INVALIDA");
    expect(within(error).getAllByRole("link").map((a) => a.textContent)).toEqual(["Ir a Conexión", "Importar un archivo"]);
    expect(within(error).getByTestId("enlace-ir-conexion")).toHaveAttribute("href", "/admin/integraciones");
    expect(document.body.textContent).not.toContain(TEXTO_DEL_SERVIDOR);
    expect(screen.queryByTestId("consulta-abierta")).not.toBeInTheDocument();
  });

  it("Organización caída: reintentar y NUNCA «Importar un archivo» (D117)", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "fallida-organizacion";
    await user.click(await abrirConsultar());
    const error = await screen.findByTestId("error-consulta");
    expect(error).toHaveAttribute("data-codigo", "ORGANIZACION_NO_DISPONIBLE");
    expect(within(error).queryByTestId("enlace-importar-archivo")).not.toBeInTheDocument();
    expect(within(error).getByTestId("boton-reintentar-consulta")).toHaveTextContent("Consultar de nuevo");
  });

  it("429 sin lectura útil: mensaje fijo, espera sugerida y el botón no se bloquea", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "fallida-tasa";
    await user.click(await abrirConsultar());
    const error = await screen.findByTestId("error-consulta");
    expect(error).toHaveAttribute("data-codigo", "JIRA_LIMITE_DE_TASA");
    expect(error).toHaveTextContent("Jira pidió esperar demasiado. Reintenta en unos minutos.");
    expect(error).toHaveTextContent("Espera unos minutos antes de reintentar.");
    expect(screen.getByTestId("boton-consultar-jira")).toBeEnabled();
  });

  it("tanda incompleta: «Continuar consulta» acumula 100, 200 y 230 y desaparece al terminar [E5-F02-T07]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "incompleta";
    await user.click(await abrirConsultar());
    const aviso = await screen.findByTestId("aviso-incompleta");
    expect(aviso).toHaveTextContent("Se leyeron 100 historias; quedan más en Jira.");
    expect(aviso).toHaveTextContent("Lo que ya leíste y asignaste se conserva.");
    expect(cifra("leidas")).toBe("100");
    const continuar = await screen.findByTestId("boton-continuar-consulta");
    expect(continuar).toHaveAttribute("aria-describedby", "aviso-incompleta");
    await user.click(continuar);
    await waitFor(() => expect(cifra("leidas")).toBe("200"));
    expect(screen.getByTestId("texto-esta-tanda")).toHaveTextContent("Esta tanda: 100 historias.");
    await user.click(await screen.findByTestId("boton-continuar-consulta"));
    await waitFor(() => expect(cifra("leidas")).toBe("230"));
    expect(screen.getByTestId("texto-esta-tanda")).toHaveTextContent("Esta tanda: 30 historias.");
    expect(screen.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
    await waitFor(() => expect(screen.queryByTestId("boton-continuar-consulta")).not.toBeInTheDocument());
    expect(await screen.findByTestId("consulta-abierta")).toBeInTheDocument();
    expect(contador("nuevas")).toBe("230");
  });

  it("«Continuar consulta» sobrevive a una recarga: sale de la consulta, no del resultado [E5-F02 #5]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "incompleta";
    await user.click(await abrirConsultar());
    await screen.findByTestId("consulta-abierta");
    // Recarga: se vuelve a montar la página con la consulta ya guardada.
    cleanup();
    renderApp("/admin/integraciones/sincronizar");
    expect(await screen.findByTestId("boton-continuar-consulta")).toBeInTheDocument();
    expect(screen.queryByTestId("resultado-consulta")).not.toBeInTheDocument();
  });

  it.each([
    ["incompleta-tasa", "Jira pidió esperar demasiado. Se leyeron 50 historias; continúa más tarde o importa un archivo."],
    ["incompleta-tiempo", "Se alcanzó el tiempo máximo. Se leyeron 40 historias; continúa la consulta para leer el resto."],
  ] as const)("incompleta (%s) usa su propio texto", async (modo, texto) => {
    const user = userEvent.setup();
    modoE5.consulta = modo;
    await user.click(await abrirConsultar());
    expect(await screen.findByTestId("aviso-incompleta")).toHaveTextContent(texto);
    expect(await screen.findByTestId("boton-continuar-consulta")).toBeInTheDocument();
  });

  it("al llegar a 500 filas el aviso lo dice y no hay «Continuar consulta»", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "tope";
    await user.click(await abrirConsultar());
    for (let i = 0; i < 4; i += 1) {
      await user.click(await screen.findByTestId("boton-continuar-consulta"));
      await waitFor(() => expect(cifra("leidas")).toBe(String((i + 2) * 100)));
    }
    expect(screen.getByTestId("aviso-incompleta")).toHaveTextContent("La consulta llegó a 500 filas. Confirma lo que corresponda y consulta de nuevo para traer el resto.");
    await waitFor(() => expect(screen.queryByTestId("boton-continuar-consulta")).not.toBeInTheDocument());
  });

  it("ejecución ajena en curso: aviso y botón deshabilitado [E5-F02-T09]", async () => {
    modoE5.consulta = "en-curso";
    const boton = await abrirConsultar();
    expect(await screen.findByTestId("aviso-en-curso")).toHaveTextContent("Ya hay una consulta o confirmación en curso.");
    expect(boton).toBeDisabled();
  });

  it("409 INTEGRACION_EN_CURSO al pulsar muestra el mismo aviso y no registra ejecución [E5-F02-T09]", async () => {
    const user = userEvent.setup();
    const boton = await abrirConsultar();
    expect(boton).toBeEnabled();
    modoE5.consulta = "en-curso";
    await user.click(boton);
    expect(await screen.findByTestId("aviso-en-curso")).toBeInTheDocument();
    expect(estadoConsulta.consulta).toBeNull();
  });

  it("reemplazo: el diálogo trae nombre, fecha y filas asignadas; cancelar no llama a Jira [E5-F02-T10]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "exitosa";
    await user.click(await abrirConsultar());
    const primera = await screen.findByTestId("consulta-abierta");
    const idPrimera = estadoConsulta.consulta?.id;
    expect(primera).toBeInTheDocument();
    const llamadas = estadoConsulta.llamadasJira;
    await user.click(screen.getByTestId("boton-consultar-jira"));
    const dialogo = await screen.findByTestId("dialogo-reemplazar");
    expect(dialogo).toHaveTextContent("Ya hay una consulta abierta");
    expect(screen.getByTestId("texto-reemplazo")).toHaveTextContent(/Ya hay una consulta abierta de Valentina Rojas del .+ sin filas asignadas\. Si la reemplazas, se pierden las asignaciones\./);
    // El foco entra en «Cancelar» y cancelar no llega a Jira ni toca la consulta.
    expect(within(dialogo).getByTestId("boton-cancelar-dialogo")).toHaveFocus();
    await user.click(within(dialogo).getByTestId("boton-cancelar-dialogo"));
    expect(screen.queryByTestId("dialogo-reemplazar")).not.toBeInTheDocument();
    expect(estadoConsulta.llamadasJira).toBe(llamadas);
    expect(estadoConsulta.consulta?.id).toBe(idPrimera);
    // Reemplazar crea una consulta nueva y deja la anterior como «Reemplazada».
    await user.click(screen.getByTestId("boton-consultar-jira"));
    await user.click(within(await screen.findByTestId("dialogo-reemplazar")).getByTestId("boton-reemplazar-consulta"));
    await waitFor(() => expect(estadoConsulta.consulta?.id).not.toBe(idPrimera));
    expect(estadoConsulta.ultimaCerrada?.estado).toBe("REEMPLAZADA");
    expect(estadoConsulta.ultimaCerrada?.id).toBe(idPrimera);
    expect(estadoConsulta.llamadasJira).toBe(llamadas + 1);
  });

  it("sin configuración: estado vacío con enlace a Conexión y sin botón de consultar [E5-F02-T11]", async () => {
    modoE5.configuracion = "vacia";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    const vacio = await screen.findByTestId("estado-vacio-jira");
    expect(vacio).toHaveTextContent("Configura la conexión con Jira antes de consultar");
    expect(within(vacio).getByRole("link", { name: "Ir a Conexión" })).toHaveAttribute("href", "/admin/integraciones");
    expect(screen.queryByTestId("boton-consultar-jira")).not.toBeInTheDocument();
  });

  it("Integraciones caído: «No disponible» y no «0» ni «Sin novedades»", async () => {
    modoE5.configuracion = "indisponible";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    expect(await screen.findByTestId("estado-indisponible-sincronizacion")).toHaveTextContent("No disponible");
    expect(screen.queryByTestId("boton-consultar-jira")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mensaje-sin-novedades")).not.toBeInTheDocument();
  });

  it("la consulta abierta caída es «indisponible», no vacía ni cero", async () => {
    modoE5.lecturaConsulta = "indisponible";
    await abrirConsultar();
    expect(await screen.findByTestId("estado-indisponible-consulta")).toBeInTheDocument();
    expect(screen.queryByTestId("estado-vacio-consulta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consulta-abierta")).not.toBeInTheDocument();
    modoE5.lecturaConsulta = "error";
    cleanup();
    renderApp("/admin/integraciones/sincronizar");
    expect(await screen.findByTestId("estado-error-consulta")).toBeInTheDocument();
  });

  it("sin la llave de cifrado no hay botón y se explica", async () => {
    modoE5.configuracion = "sin-llave";
    await abrirComo(ADMIN, "/admin/integraciones/sincronizar");
    expect(await screen.findByTestId("aviso-integracion-deshabilitada")).toBeInTheDocument();
    expect(screen.queryByTestId("boton-consultar-jira")).not.toBeInTheDocument();
  });

  it("consulta vencida: aviso al cargar y el botón consulta sin diálogo [diseño §7.4]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "exitosa";
    await user.click(await abrirConsultar());
    await screen.findByTestId("consulta-abierta");
    vencerConsultaAbierta();
    await user.click(screen.getByTestId("boton-actualizar-consulta"));
    expect(await screen.findByTestId("aviso-consulta-vencida")).toHaveTextContent("La consulta venció. Consulta Jira de nuevo.");
    expect(screen.queryByTestId("consulta-abierta")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("boton-consultar-jira"));
    expect(screen.queryByTestId("dialogo-reemplazar")).not.toBeInTheDocument();
    expect(await screen.findByTestId("resultado-consulta")).toBeInTheDocument();
  });

  it("respuesta cortada (504): SIN_RESPUESTA, relee el estado y muestra la tanda encontrada [D115]", async () => {
    const user = userEvent.setup();
    modoE5.consulta = "sin-respuesta";
    await user.click(await abrirConsultar());
    const error = await screen.findByTestId("error-consulta");
    expect(error).toHaveAttribute("data-codigo", "SIN_RESPUESTA_CONSULTA");
    expect(error).toHaveTextContent("No recibimos respuesta del servidor. La consulta pudo haberse completado: revisa el Historial antes de reintentar.");
    expect(within(error).getByRole("link", { name: "Ver en el Historial" })).toHaveAttribute("href", "/admin/integraciones/historial");
    expect(await screen.findByTestId("resultado-consulta")).toBeInTheDocument();
    expect(screen.getByTestId("resultado-ejecucion")).toHaveAttribute("data-resultado", "EXITOSA");
    expect(await screen.findByTestId("consulta-abierta")).toBeInTheDocument();
  });
});

describe("E5-F02 · permisos por rol [E5-F02-T12]", () => {
  it.each([
    ["QE", QE1, "/admin/integraciones/sincronizar"],
    ["Analista", ANALISTA, "/admin/integraciones/sincronizar"],
    ["Líder", LIDER, "/admin/integraciones/sincronizar"],
    ["Auditor", AUDITOR, "/admin/integraciones/sincronizar"],
  ])("%s no ve la consulta en %s", async (_rol, correo, ruta) => {
    await abrirComo(correo, ruta);
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
    expect(screen.queryByTestId("boton-consultar-jira")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consulta-abierta")).not.toBeInTheDocument();
  });

  it("la historia del QE y la del Auditor no traen botones de consulta", async () => {
    await abrirComo(QE1, "/qe/integraciones");
    expect(await screen.findByTestId("pagina-qe-integraciones")).toBeInTheDocument();
    expect(screen.queryByTestId("boton-consultar-jira")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consulta-abierta")).not.toBeInTheDocument();
  });
});

describe("textos de la consulta: plurales por función", () => {
  it("filas, historias y asignadas", () => {
    expect(textoFilas(1)).toBe("1 fila");
    expect(textoFilas(0)).toBe("0 filas");
    expect(textoHistorias(1)).toBe("1 historia");
    expect(textoHistorias(230)).toBe("230 historias");
    expect(textoAsignadas(0)).toBe("sin filas asignadas");
    expect(textoAsignadas(1)).toBe("con 1 fila asignada");
    expect(textoAsignadas(3)).toBe("con 3 filas asignadas");
  });

  it("esperas de Jira, tanda y revisar", () => {
    expect(textoLimiteTasa(1)).toBe("Jira pidió esperar 1 vez; se reintentó.");
    expect(textoLimiteTasa(2)).toBe("Jira pidió esperar 2 veces; se reintentó.");
    expect(textoEstaTanda(1)).toBe("Esta tanda: 1 historia.");
    expect(textoRevisar(1, 0)).toBe("Revisar y asignar (1 nueva)");
    expect(textoRevisar(10, 2)).toBe("Revisar y asignar (10 nuevas)");
    expect(textoRevisar(0, 3)).toBe("Revisar los cambios (3)");
    expect(textoRevisar(0, 0)).toBeNull();
  });

  it("CONSULTA_NO_ABIERTA según el estado", () => {
    expect(textoNoAbierta("CONFIRMADA")).toBe("Esta consulta ya se confirmó.");
    expect(textoNoAbierta("REEMPLAZADA", { nombre: "Ana" })).toBe("Esta consulta fue reemplazada por Ana.");
    expect(textoNoAbierta("DESCARTADA")).toBe("Esta consulta se descartó.");
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

  it("los errores del servidor con código propio no son SIN_RESPUESTA", () => {
    expect(esSinRespuesta(error(409, "CONSULTA_ABIERTA"))).toBe(false);
    expect(esSinRespuesta(error(409, "INTEGRACION_EN_CURSO"))).toBe(false);
    expect(esSinRespuesta(error(410, "CONSULTA_VENCIDA"))).toBe(false);
    expect(codigoDeEscritura(error(409, "CONSULTA_ABIERTA"))).toBe("CONSULTA_ABIERTA");
  });
});
