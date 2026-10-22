import path from "node:path";
import { test as setup } from "@playwright/test";
import { env } from "../support/env";
import { api } from "../support/api";
import { USUARIOS_E7, tokenE7, type ClaveE7 } from "../support/e7";
import { iniciarSesionUI } from "../support/ui";
import { expect } from "@playwright/test";

const DIRECTORIO_AUTH = path.join(import.meta.dirname, "..", ".auth");

/** Sesión real por la UI de cada usuario del fixture E7 (no se guarda INACT1: no puede entrar). */
const CLAVES = ["adm1", "qe1", "qe2", "ana1", "ana2", "ana3", "ana4", "lid1", "lid2", "aud1"] as const satisfies readonly ClaveE7[];

for (const clave of CLAVES) {
  setup(`sesión guardada E7 · ${clave}`, async ({ page }) => {
    const usuario = USUARIOS_E7[clave];
    await iniciarSesionUI(page, usuario.correo, env.contrasenaDemo);
    await expect(page).toHaveURL(new RegExp(`${usuario.portal}$`), { timeout: 15_000 });
    await page.context().storageState({ path: path.join(DIRECTORIO_AUTH, `e7-${clave}.json`) });
  });
}

/**
 * Limpieza previa del entorno compartido. Las pruebas de E7 (y las de E1 a E3) crean usuarios propios con correo
 * `qa.<prefijo>-...@quality360.local`; si una corrida anterior se interrumpió o no los desactivó, quedan activos
 * (algunos con células) y llenan los pendientes de configuración del Administrador (la bandeja solo muestra 25, ver
 * DEF-E7-07) y distorsionan sus contadores. Se liberan sus células y se desactivan antes de empezar. No toca a los
 * usuarios del fixture E7 (`adm1`, `qe1`... ) ni a los de la semilla MVP.
 */
setup("limpieza de usuarios de prueba residuales (qa.*@quality360.local)", async ({ request }) => {
  setup.setTimeout(400_000);
  const adm = await tokenE7("adm1");
  const vistos = new Set<string>();
  for (let pagina = 1; pagina <= 30; pagina += 1) {
    const r = await api.get<{ items: Array<{ id: string; correo: string; activo: boolean; rol: string; celulasVigentes?: unknown[] }>; total: number }>(
      request, `/v1/usuarios?q=${encodeURIComponent("qa.")}&pagina=${pagina}&tamanoPagina=100`, { token: adm });
    if (r.status !== 200 || r.body.items.length === 0) break;
    for (const u of r.body.items.filter((x) => x.correo.startsWith("qa.") && !vistos.has(x.id))) {
      vistos.add(u.id);
      // Usuarios con correo fijo (p. ej. los que reutiliza E1-F10 con obtenerOCrearUsuario) deben quedar activos: no se tocan
      // y, si una limpieza anterior los desactivó, se reactivan.
      if (!/-\d{13}-\d+-\d+@/.test(u.correo)) {
        if (!u.activo) await api.patch(request, `/v1/usuarios/${u.id}`, { token: adm, body: { activo: true } });
        continue;
      }
      if (u.rol === "LIDER_QA" && (u.celulasVigentes?.length ?? 0) > 0) {
        await api.put(request, `/v1/usuarios/${u.id}/celulas-lider`, { token: adm, body: { celulaIds: [] } });
      }
      if (u.activo) await api.patch(request, `/v1/usuarios/${u.id}`, { token: adm, body: { activo: false } });
    }
    if (pagina * 100 >= r.body.total) break;
  }
});
