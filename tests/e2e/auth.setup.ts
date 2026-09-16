import path from "node:path";
import { test as setup } from "@playwright/test";
import { env } from "../support/env";
import { esperarPortal, iniciarSesionUI } from "../support/ui";
import { USUARIOS_SEMILLA } from "../support/usuarios";

const DIRECTORIO_AUTH = path.join(import.meta.dirname, "..", ".auth");

const ROLES_A_PREPARAR = ["patricia", "carla", "marcos", "sofia", "ana", "beatriz", "diego", "elena", "francisco"] as const;

for (const clave of ROLES_A_PREPARAR) {
  setup(`sesión guardada · ${clave}`, async ({ page }) => {
    const usuario = USUARIOS_SEMILLA[clave];
    await iniciarSesionUI(page, usuario.correo, env.contrasenaDemo);
    await esperarPortal(page, usuario.rol);
    await page.context().storageState({ path: path.join(DIRECTORIO_AUTH, `${clave}.json`) });
  });
}
