// Únicas variables que llegan al front (D6, ADR 0006).
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? "",
  usarMocks: import.meta.env.VITE_USAR_MOCKS === "true",
};
