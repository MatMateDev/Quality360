// D210 · la captura del retorno de Atlassian ocurre ANTES de que exista el cliente de Supabase.
import fuenteMain from "../main.tsx?raw";
import fuenteCaptura from "../lib/capturaRetornoOauth.ts?raw";
import { describe, expect, it, vi } from "vitest";
import {
  capturarRetornoOauth,
  descartarRetornoOauth,
  hayRetornoOauthPendiente,
  reiniciarCapturaRetornoOauth,
  tomarAvisoSesionCerrada,
  tomarRetornoOauth,
} from "@/lib/capturaRetornoOauth";
import { RUTA_RETORNO_OAUTH } from "@/lib/rutasIntegraciones";

function historialFalso() {
  const llamadas: Array<{ estado: unknown; url: unknown }> = [];
  return { llamadas, historial: { state: { idx: 7 }, replaceState: (estado: unknown, _t: string, url?: string | URL | null) => llamadas.push({ estado, url }) } };
}

describe("captura del retorno de Atlassian [D210]", () => {
  it("lee code y state, limpia la dirección conservando el estado del historial y entrega los valores una sola vez", () => {
    const { llamadas, historial } = historialFalso();
    expect(capturarRetornoOauth({ pathname: RUTA_RETORNO_OAUTH, search: "?code=ABC123&state=EST456", hash: "" }, historial)).toBe(true);
    expect(llamadas).toEqual([{ estado: { idx: 7 }, url: RUTA_RETORNO_OAUTH }]);
    expect(hayRetornoOauthPendiente()).toBe(true);
    expect(tomarRetornoOauth()).toEqual({ code: "ABC123", state: "EST456", error: undefined });
    expect(tomarRetornoOauth()).toBeNull();
    expect(hayRetornoOauthPendiente()).toBe(false);
  });

  it("?error=access_denied&error_description=…: toma solo error y state, descarta la descripción y limpia antes de Supabase", () => {
    const { llamadas, historial } = historialFalso();
    capturarRetornoOauth({ pathname: RUTA_RETORNO_OAUTH, search: "?error=access_denied&error_description=User+denied&state=EST", hash: "" }, historial);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toBe(RUTA_RETORNO_OAUTH);
    const captura = tomarRetornoOauth();
    expect(captura).toEqual({ error: "access_denied", state: "EST", code: undefined });
    expect(JSON.stringify(captura)).not.toContain("denied access");
    expect(Object.keys(captura ?? {})).not.toContain("error_description");
  });

  it("acepta la barra final de la ruta", () => {
    const { historial } = historialFalso();
    expect(capturarRetornoOauth({ pathname: `${RUTA_RETORNO_OAUTH}/`, search: "?code=x&state=y", hash: "" }, historial)).toBe(true);
  });

  it("en cualquier otra ruta no lee ni toca la dirección", () => {
    const { llamadas, historial } = historialFalso();
    for (const pathname of ["/", "/login", "/admin/integraciones", "/restablecer-contrasena"]) {
      expect(capturarRetornoOauth({ pathname, search: "?error=access_denied&error_description=x&code=c&state=s", hash: "#access_token=t" }, historial)).toBe(false);
    }
    expect(llamadas).toHaveLength(0);
    expect(hayRetornoOauthPendiente()).toBe(false);
  });

  it("en la ruta de retorno sin parámetros no hay nada pendiente y no reescribe la dirección", () => {
    const { llamadas, historial } = historialFalso();
    capturarRetornoOauth({ pathname: RUTA_RETORNO_OAUTH, search: "", hash: "" }, historial);
    expect(llamadas).toHaveLength(0);
    expect(hayRetornoOauthPendiente()).toBe(false);
  });

  it("nunca escribe en localStorage ni en sessionStorage", () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    const { historial } = historialFalso();
    capturarRetornoOauth({ pathname: RUTA_RETORNO_OAUTH, search: "?code=secreto-1&state=secreto-2", hash: "" }, historial);
    tomarRetornoOauth();
    expect(local).not.toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toMatch(/secreto-/);
  });

  it("sin sesión se descarta y queda la marca para avisar una sola vez en Conexión", () => {
    const { historial } = historialFalso();
    capturarRetornoOauth({ pathname: RUTA_RETORNO_OAUTH, search: "?code=c&state=s", hash: "" }, historial);
    expect(descartarRetornoOauth()).toBe(true);
    expect(tomarRetornoOauth()).toBeNull();
    expect(tomarAvisoSesionCerrada()).toBe(true);
    expect(tomarAvisoSesionCerrada()).toBe(false);
    // Sin nada capturado no hay aviso.
    reiniciarCapturaRetornoOauth();
    expect(descartarRetornoOauth()).toBe(false);
    expect(tomarAvisoSesionCerrada()).toBe(false);
  });
});

describe("orden de carga [D210]", () => {
  it("main.tsx importa la captura en primer lugar, antes que React, la app y Supabase", () => {
    const importaciones = [...fuenteMain.matchAll(/^import\s+(?:[^"']*from\s+)?["']([^"']+)["'];?$/gm)].map((m) => m[1]);
    expect(importaciones[0]).toBe("./lib/capturaRetornoOauth");
  });

  it("el módulo de captura no importa Supabase ni nada que lo cree", () => {
    const importaciones = [...fuenteCaptura.matchAll(/^import\s+(?:[^"']*from\s+)?["']([^"']+)["'];?$/gm)].map((m) => m[1]);
    expect(importaciones).toEqual(["./rutasIntegraciones"]);
  });

  it("importar la app y sus rutas no crea el cliente de Supabase", async () => {
    vi.resetModules();
    const crear = vi.fn();
    vi.doMock("@supabase/supabase-js", () => ({ createClient: crear }));
    await import("@/lib/capturaRetornoOauth");
    await import("@/App");
    await import("@/routes/router");
    expect(crear).not.toHaveBeenCalled();
    vi.doUnmock("@supabase/supabase-js");
    vi.resetModules();
  });
});
