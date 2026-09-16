import { expect, test } from "@playwright/test";
import { api, iniciarSesion } from "../support/api";
import { env } from "../support/env";
import { USUARIOS_SEMILLA } from "../support/usuarios";

test.describe("E1-B01 · Validación de credenciales y acceso activo", () => {
  test("[E1-B01#1] credenciales válidas de un usuario activo crean una sesión utilizable", async ({ request }) => {
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo);
    expect(sesion.accessToken).toBeTruthy();

    const perfil = await api.get(request, "/v1/me", { token: sesion.accessToken });
    expect(perfil.status).toBe(200);
    expect(perfil.body).toMatchObject({ correo: USUARIOS_SEMILLA.carla.correo, rol: "QE" });
  });

  test("[E1-B01#2] un usuario desactivado con credenciales correctas es rechazado sin revelar si el correo existe", async ({ request }) => {
    // Gabriela está desactivada en Organización, pero su cuenta de Supabase Auth
    // sigue siendo válida: el proveedor de identidad la autentica igual.
    const sesion = await iniciarSesion(USUARIOS_SEMILLA.gabriela.correo, env.contrasenaDemo);
    expect(sesion.accessToken).toBeTruthy();

    // Es Organización, a través del gateway, quien rechaza el acceso (D4):
    // toda solicitud protegida con ese token vigente es denegada.
    const perfil = await api.get(request, "/v1/me", { token: sesion.accessToken });
    expect(perfil.status).toBe(403);
    expect(perfil.body).toMatchObject({ codigo: "ACCESO_DENEGADO" });
    // Mensaje genérico: el mismo que el de credenciales incorrectas, sin
    // mencionar que la cuenta existe pero está inactiva.
    expect((perfil.body as { mensaje: string }).mensaje).not.toMatch(/inactiv|desactiv/i);

    const usuarios = await api.get(request, "/v1/usuarios", { token: sesion.accessToken });
    expect(usuarios.status).toBe(403);
  });

  test("[E1-B01#3] intentos repetidos con credenciales incorrectas no revelan si el correo existe", async ({}) => {
    // Protección de fuerza bruta: Supabase Auth local (infrastructure/supabase),
    // fuera del gateway (x-escenarios-sin-operacion de contracts/gateway.v1.yaml).
    // Se verifica aquí la propiedad observable desde este servicio: la
    // respuesta es idéntica y genérica exista o no la cuenta, en varios intentos seguidos.
    const correoExistente = USUARIOS_SEMILLA.patricia.correo;
    const correoInexistente = `no-existe-${Date.now()}@quality360.local`;

    const respuestas: Array<{ status: number; body: unknown }> = [];
    for (let intento = 0; intento < 5; intento += 1) {
      const correo = intento % 2 === 0 ? correoExistente : correoInexistente;
      const respuesta = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: env.supabaseAnonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: correo, password: "contrasena-incorrecta-de-prueba" }),
      });
      respuestas.push({ status: respuesta.status, body: await respuesta.json() });
    }

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(400);
      expect((respuesta.body as { error_code: string }).error_code).toBe("invalid_credentials");
    }
    // Ninguna respuesta distingue si el correo existía.
    const mensajes = new Set(respuestas.map((r) => JSON.stringify(r.body)));
    expect(mensajes.size).toBe(1);
  });
});
