// Únicas variables que llegan al front (D6, ADR 0006).
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? "",
  usarMocks: import.meta.env.VITE_USAR_MOCKS === "true",
};

/**
 * Nombres de las variables obligatorias que quedaron vacías al construir el portal.
 * Vite las incorpora en tiempo de build: si faltan, el portal no puede arrancar.
 * En modo mock no se exige ninguna.
 */
export function variablesFaltantes(valores: typeof env = env): string[] {
  if (valores.usarMocks) return [];
  const requeridas: Array<[string, string]> = [
    ["VITE_SUPABASE_URL", valores.supabaseUrl],
    ["VITE_SUPABASE_ANON_KEY", valores.supabaseAnonKey],
    ["VITE_GATEWAY_URL", valores.gatewayUrl],
  ];
  return requeridas.filter(([, valor]) => valor.trim() === "").map(([nombre]) => nombre);
}
