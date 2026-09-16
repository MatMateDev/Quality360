import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let cliente: SupabaseClient | null = null;

/** Cliente único de Supabase Auth (D3, D6). Se crea solo cuando hace falta: en modo mock nunca se instancia. */
export function obtenerClienteSupabase(): SupabaseClient {
  cliente ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return cliente;
}
