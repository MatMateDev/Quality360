// E5 OAuth · textos por código y por método (FO1, FO7) y estado del chip.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ErrorIntegracion } from "@/components/integraciones/ErrorIntegracion";
import { estadoChip } from "@/lib/estadoConexion";
import { etiquetaPermiso, mensajeDeError } from "@/lib/mensajesIntegracion";
import { configuracionVacia, estadoConfig, oauthConectada, oauthPendienteSitio, oauthReconexion } from "@/mocks/dataE5";
import type { ConfiguracionJira } from "@/types/dominio";

const conf = (parcial: Partial<ConfiguracionJira>): ConfiguracionJira => ({ ...estadoConfig.actual, ...parcial });

describe("mensajes por código y método", () => {
  it("con API token los textos de sin permiso y proyecto no encontrado son los certificados (E5-F01-T04)", () => {
    expect(mensajeDeError("JIRA_SIN_PERMISO")).toBe("La cuenta de Jira no tiene permiso para leer este proyecto.");
    expect(mensajeDeError("JIRA_SIN_PERMISO", { metodo: "API_TOKEN" })).toBe("La cuenta de Jira no tiene permiso para leer este proyecto.");
    expect(mensajeDeError("JIRA_PROYECTO_NO_ENCONTRADO", { metodo: "API_TOKEN" })).toBe("No encontramos el proyecto en Jira.");
  });

  it("con OAuth hablan de la cuenta conectada", () => {
    expect(mensajeDeError("JIRA_SIN_PERMISO", { metodo: "OAUTH" })).toBe("La cuenta de Jira conectada no tiene permiso para leer este proyecto.");
    expect(mensajeDeError("JIRA_PROYECTO_NO_ENCONTRADO", { metodo: "OAUTH" })).toBe(
      "No encontramos el proyecto. Revisa la clave; también puede ser que la cuenta de Jira conectada no tenga permiso para verlo.",
    );
  });

  it("traduce los permisos faltantes y muestra tal cual uno desconocido", () => {
    expect(etiquetaPermiso("read:jira-work")).toBe("Ver datos de issues");
    expect(etiquetaPermiso("read:jira-user")).toBe("Ver perfil del usuario");
    expect(etiquetaPermiso("offline_access")).toBe("Mantener la conexión");
    expect(mensajeDeError("JIRA_OAUTH_PERMISOS_INSUFICIENTES", { permisosFaltantes: ["read:jira-work", "read:confluence-x"] })).toBe(
      "Faltan permisos en Atlassian: Ver datos de issues, read:confluence-x. Acepta todos los permisos solicitados.",
    );
  });

  it("los códigos nuevos tienen mensaje fijo del portal", () => {
    expect(mensajeDeError("JIRA_RECONEXION_NECESARIA")).toBe("La conexión con Jira venció. Vuelve a conectar con Jira.");
    expect(mensajeDeError("JIRA_OAUTH_SIN_CONEXION")).toBe("No hay una conexión pendiente.");
    expect(mensajeDeError("JIRA_OAUTH_SITIO_NO_VALIDO")).toBe("El sitio elegido no es válido.");
    expect(mensajeDeError("JIRA_OAUTH_CODIGO_INVENTADO")).toBe("No pudimos completar la operación con Jira.");
  });
});

describe("ErrorIntegracion con la reconexión necesaria", () => {
  it("el Administrador ve ⚠, el texto fijo y «Ir a Conexión»", () => {
    render(
      <MemoryRouter>
        <ErrorIntegracion testId="error-sincronizacion" codigo="JIRA_RECONEXION_NECESARIA" titulo="No se pudo sincronizar" sugerencias={["IR_A_CONEXION", "IMPORTAR_ARCHIVO"]} acciones={{ irAConexion: "/admin/integraciones", importarArchivo: "/admin/integraciones/importar" }} />
      </MemoryRouter>,
    );
    const error = screen.getByTestId("error-sincronizacion");
    expect(error).toHaveAttribute("data-codigo", "JIRA_RECONEXION_NECESARIA");
    expect(error).toHaveTextContent("⚠ No se pudo sincronizar");
    expect(screen.getByTestId("enlace-ir-conexion")).toHaveAttribute("href", "/admin/integraciones");
    expect(screen.queryByTestId("aviso-administrador-reconexion")).not.toBeInTheDocument();
  });

  it("el QE y el Auditor ven el texto, sin enlace, y se les pide avisar a un Administrador", () => {
    render(
      <MemoryRouter>
        <ErrorIntegracion testId="error-ejecucion" codigo="JIRA_RECONEXION_NECESARIA" sugerencias={["IR_A_CONEXION", "IMPORTAR_ARCHIVO"]} avisarAdministrador enfocar={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByTestId("aviso-administrador-reconexion")).toHaveTextContent("Avisa a un Administrador para que vuelva a conectar con Jira.");
  });
});

describe("estado del chip (decisiones-mvp, «Chip de la conexión»)", () => {
  it("aplica la primera regla que cumpla", () => {
    expect(estadoChip(conf({ metodo: "API_TOKEN", estadoConexion: "FALLIDA" }))).toBe("fallo");
    expect(estadoChip(conf({ metodo: "API_TOKEN", oauth: oauthConectada() }))).toBe("conectado-api-token");
    expect(estadoChip(configuracionVacia())).toBe("sin-conectar");
    expect(estadoChip(conf({ metodo: "OAUTH", oauth: null }))).toBe("sin-conectar");
    expect(estadoChip(conf({ metodo: "OAUTH", oauth: oauthReconexion() }))).toBe("reconexion-necesaria");
    expect(estadoChip(conf({ metodo: "OAUTH", oauth: oauthConectada({ descifrable: false }) }))).toBe("reconexion-necesaria");
    expect(estadoChip(conf({ metodo: null, oauth: oauthPendienteSitio() }))).toBe("falta-sitio");
    expect(estadoChip(conf({ metodo: "OAUTH", oauth: oauthConectada(), estadoConexion: "FALLIDA" }))).toBe("fallo");
    expect(estadoChip(conf({ metodo: "OAUTH", oauth: oauthConectada(), estadoConexion: "OK" }))).toBe("conectado-oauth");
    expect(estadoChip(conf({ metodo: null, oauth: oauthConectada() }))).toBe("conectado-oauth");
  });
});
