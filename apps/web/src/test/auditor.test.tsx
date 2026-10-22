import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { ID } from "@/mocks/data";
import { simularFuentes } from "@/mocks/dataE7";
import { server } from "@/mocks/server";
import { abrirComo, renderApp } from "./renderApp";

const AUDITOR = "andrea.mora@quality360.local";
const LIDER = "luis.soto@quality360.local";

let urlsCreadas: Blob[] = [];

beforeEach(() => {
  urlsCreadas = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    urlsCreadas.push(blob);
    return "blob:prueba";
  });
  URL.revokeObjectURL = vi.fn();
  // jsdom no implementa la navegación de un <a download>.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Bandeja del Auditor [E7-F06]", () => {
  it("/auditor muestra la pestaña HDU sin redirigir, con contadores y solo lectura [E7-F06-T01]", async () => {
    await abrirComo(AUDITOR, "/auditor");
    expect(await screen.findByTestId("bandeja-auditor")).toBeInTheDocument();
    expect(screen.getByTestId("aviso-solo-lectura")).toHaveTextContent("Puedes consultar y exportar, no modificar.");
    expect(await screen.findByTestId("contador-hdu-total")).toHaveTextContent("6");
    expect(screen.getByTestId("contador-certificados")).toHaveTextContent("2");
    expect(screen.getByTestId("contador-eventos-7d")).toHaveTextContent("3");
    expect(screen.getByTestId("contador-cambios-usuarios-7d")).toHaveTextContent("3");
    expect(screen.getByTestId("pestana-hdu")).toHaveAttribute("aria-current", "page");
    expect(await screen.findByTestId(`fila-hdu-${ID.hdu4}`)).toBeInTheDocument();
    expect(screen.getByTestId("total-auditor-hdu")).toHaveTextContent("6 resultados");
  });

  it("ninguna pantalla del Auditor tiene <form> ni button[type=submit] [E7-F06-T07]", async () => {
    await abrirComo(AUDITOR, "/auditor/hdu");
    cleanup();
    for (const ruta of ["/auditor/hdu", "/auditor/certificados", "/auditor/bitacora", "/auditor/auditoria-usuarios"]) {
      const { container, unmount } = renderApp(ruta);
      await screen.findByTestId("bandeja-auditor");
      await waitFor(() => expect(screen.queryByTestId(/^estado-cargando/)).not.toBeInTheDocument());
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelector('button[type="submit"]')).toBeNull();
      expect(container.querySelector("button:not([type])")).toBeNull();
      unmount();
    }
  });

  it("Certificados: huella completa, validez y verificación en pestaña nueva [E7-F06-T02]", async () => {
    await abrirComo(AUDITOR, "/auditor/certificados");
    expect(await screen.findByTestId("lista-certificados")).toBeInTheDocument();
    expect(screen.getByTestId("pestana-certificados")).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByTestId("texto-huella")[0]).toHaveTextContent(/^[0-9a-f]{64}$/);
    expect(screen.getAllByText("Válido").length).toBe(2);
    const enlace = screen.getByTestId("enlace-verificar-Q360-0001");
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    expect(enlace).toHaveTextContent("Verificar (se abre en una pestaña nueva)");
    expect(screen.getByTestId("boton-descargar-pdf-Q360-0001")).toBeInTheDocument();
  });

  it("Bitácora: acciones en infinitivo y filtro por acción [E7-F06-T03]", async () => {
    const user = userEvent.setup();
    await abrirComo(AUDITOR, "/auditor/bitacora");
    const tabla = await screen.findByTestId("lista-bitacora");
    expect(within(tabla).getByText("Rechazar")).toBeInTheDocument();
    expect(within(tabla).getByText("Certificar")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Acción"), "RECHAZAR");
    await waitFor(() => expect(screen.getByTestId("total-bitacora")).toHaveTextContent("1 resultado"));
  });

  it("Auditoría de usuarios: cambios en lenguaje natural y jamás claves sensibles [E7-F06-T04]", async () => {
    await abrirComo(AUDITOR, "/auditor/auditoria-usuarios");
    const tabla = await screen.findByTestId("lista-auditoria-usuarios");
    expect(within(tabla).getByText("Rol: Analista QA → Líder QA")).toBeInTheDocument();
    expect(within(tabla).getByText("Células: sin células → Pagos, Clientes")).toBeInTheDocument();
    const texto = document.body.textContent ?? "";
    for (const prohibido of ["secreto-no-mostrar", "tok-no-mostrar", "password", "accessToken", "{", "}"]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("una pestaña sin resultados dice «No hay registros con esos filtros» y deshabilita Exportar CSV [E7-F06-T05]", async () => {
    await abrirComo(AUDITOR, "/auditor/auditoria-usuarios?operacion=EXPORTAR");
    expect(await screen.findByTestId("estado-vacio-filtros-auditoria-usuarios")).toHaveTextContent("No hay registros con esos filtros");
    const boton = screen.getByTestId("boton-exportar-csv");
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription("No hay registros con esos filtros");
  });

  it("Exportar CSV descarga lo filtrado con petición autenticada y avisa el resultado [E7-F06-T06]", async () => {
    const user = userEvent.setup();
    let autorizacion: string | null = null;
    let consulta = "";
    server.use(
      http.get(`${env.gatewayUrl}/v1/auditor/exportaciones/auditoria-usuarios`, ({ request }) => {
        autorizacion = request.headers.get("Authorization");
        consulta = new URL(request.url).search;
        return new HttpResponse("﻿id;fecha\r\n1;2026-10-20", {
          headers: { "Content-Type": "text/csv; charset=utf-8", "X-Q360-Filas": "1", "Content-Disposition": 'attachment; filename="auditoria-usuarios-2026-10-21.csv"' },
        });
      }),
    );
    await abrirComo(AUDITOR, "/auditor/auditoria-usuarios?operacion=CAMBIAR_ROL");
    await screen.findByTestId("lista-auditoria-usuarios");
    expect(screen.getByTestId("ayuda-exportar")).toHaveTextContent("Se exportarán 1 fila con los filtros aplicados");

    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-ok")).toHaveTextContent("Se descargó auditoria-usuarios-2026-10-21.csv (1 fila)");
    expect(autorizacion).toMatch(/^Bearer /);
    expect(consulta).toContain("operacion=CAMBIAR_ROL");
    expect(consulta).not.toContain("pagina");
    expect(urlsCreadas).toHaveLength(1);
  });

  it("422 EXPORTACION_EXCEDE_LIMITE muestra el aviso y lleva el foco al primer filtro [E7-F06-T06]", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${env.gatewayUrl}/v1/auditor/exportaciones/hdu`, () =>
        HttpResponse.json({ codigo: "EXPORTACION_EXCEDE_LIMITE", mensaje: "x", traceId: "t", detalles: [] }, { status: 422 }),
      ),
    );
    await abrirComo(AUDITOR, "/auditor");
    await screen.findByTestId(`fila-hdu-${ID.hdu1}`);
    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-excede")).toHaveTextContent("La exportación supera las 50.000 filas. Acota los filtros.");
    expect(screen.getByLabelText("Célula")).toHaveFocus();
  });

  it("un 503 al exportar da un error con «Reintentar»", async () => {
    const user = userEvent.setup();
    simularFuentes({ certificaciones: false });
    await abrirComo(AUDITOR, "/auditor/auditoria-usuarios");
    await screen.findByTestId("lista-auditoria-usuarios");
    server.use(http.get(`${env.gatewayUrl}/v1/auditor/exportaciones/auditoria-usuarios`, () => new HttpResponse(null, { status: 503 })));
    await user.click(screen.getByTestId("boton-exportar-csv"));
    expect(await screen.findByTestId("estado-exportacion-error")).toHaveTextContent("No pudimos generar el archivo. Intenta de nuevo.");
    expect(within(screen.getByTestId("estado-exportacion-error").parentElement!).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("con Certificaciones caída, Bitácora y Certificados dicen «No disponible» y las otras pestañas cargan [E7-F06-T08]", async () => {
    simularFuentes({ certificaciones: false });
    await abrirComo(AUDITOR, "/auditor/bitacora");
    expect(await screen.findByTestId("estado-indisponible-bitacora")).toHaveTextContent("No disponible");
    expect(within(screen.getByTestId("estado-indisponible-bitacora")).getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByTestId("boton-exportar-csv")).toBeDisabled();
    expect(await screen.findByTestId("estado-indisponible-certificados")).toBeInTheDocument();
    expect(screen.getByTestId("contador-cambios-usuarios-7d")).toHaveTextContent("3");

    await userEvent.click(screen.getByTestId("pestana-auditoria-usuarios"));
    expect(await screen.findByTestId("lista-auditoria-usuarios")).toBeInTheDocument();
  });

  it("el Líder no entra a /auditor [E7-F06-T07]", async () => {
    await abrirComo(LIDER, "/auditor");
    expect(await screen.findByTestId("acceso-denegado")).toBeInTheDocument();
  });
});

describe("Detalle de HDU en solo lectura [E7-F04, E7-F06]", () => {
  it("el Auditor ve el aviso, el enlace de vuelta y ningún control de escritura", async () => {
    await abrirComo(AUDITOR, `/hdu/${ID.hdu1}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Validación de transferencias" })).toBeInTheDocument();
    expect(screen.getByTestId("aviso-solo-lectura")).toBeInTheDocument();
    expect(screen.getByTestId("enlace-volver-bandeja")).toHaveAttribute("href", "/auditor");
    expect(screen.queryByText(/Reasignar|Asignar analista|Cambiar estado|Generar certificado|Pasar a/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("boton-reasignar-qe")).not.toBeInTheDocument();
    expect(await screen.findByTestId("checklist-solo-lectura")).toBeInTheDocument();
  });

  it("el Líder solo abre HDU de sus células; otra célula da acceso denegado de recurso [E7-F04-T06]", async () => {
    await abrirComo(LIDER, `/hdu/${ID.hdu4}`);
    const denegado = await screen.findByTestId("acceso-denegado");
    expect(denegado).toHaveTextContent("No tienes acceso a este recurso.");
    expect(denegado).not.toHaveTextContent("TARJETAS");
  });

  it("el Líder con la HDU de su célula ve el aviso y puede volver a su bandeja", async () => {
    await abrirComo(LIDER, `/hdu/${ID.hdu1}`);
    expect(await screen.findByTestId("aviso-solo-lectura")).toBeInTheDocument();
    expect(screen.getByTestId("enlace-volver-bandeja")).toHaveAttribute("href", "/lider");
  });
});
