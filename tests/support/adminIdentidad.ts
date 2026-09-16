import { env } from "./env";

/**
 * Fija la contraseña de un usuario recién invitado, con la Admin API de
 * Supabase Auth (`service_role`), para poder iniciar sesión como él en una
 * única prueba de caja blanca (E1-B08#2: necesita un administrador propio de
 * la prueba, autenticable, para intentar quitarse el último rol de
 * administrador sin tocar la sesión de Patricia). El `service_role_key` se
 * lee de `services/organizacion/.env` (no versionado) solo en memoria.
 */
export async function fijarContrasena(userId: string, contrasena: string): Promise<void> {
  if (!env.supabaseServiceRoleKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (services/organizacion/.env) para fijar la contraseña de prueba.");
  }
  const respuesta = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: env.supabaseServiceRoleKey,
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: contrasena, email_confirm: true }),
  });
  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`No fue posible fijar la contraseña de prueba para ${userId}: ${respuesta.status} ${texto}`);
  }
}
