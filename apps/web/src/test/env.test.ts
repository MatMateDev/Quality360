import { describe, expect, it } from "vitest";
import { variablesFaltantes } from "../lib/env";

describe("Configuración del portal: variablesFaltantes", () => {
  const completa = {
    supabaseUrl: "https://proyecto.supabase.co",
    supabaseAnonKey: "clave-publicable",
    gatewayUrl: "https://gateway.ejemplo",
    usarMocks: false,
  };

  it("no reporta nada con la configuración completa", () => {
    expect(variablesFaltantes(completa)).toEqual([]);
  });

  it("lista las variables vacías o solo con espacios", () => {
    expect(variablesFaltantes({ ...completa, supabaseUrl: "", gatewayUrl: "  " })).toEqual([
      "VITE_SUPABASE_URL",
      "VITE_GATEWAY_URL",
    ]);
  });

  it("en modo mock no exige variables", () => {
    expect(variablesFaltantes({ ...completa, supabaseUrl: "", supabaseAnonKey: "", gatewayUrl: "", usarMocks: true })).toEqual([]);
  });
});
