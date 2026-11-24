/**
 * Arranque manual del Jira simulado (:4010) y del Atlassian simulado de OAuth (:4011), sin Playwright y sin descargar nada:
 * `npm run simulados:jira` desde la raíz (Node 24 ejecuta TypeScript directamente; por eso los imports llevan `.ts`).
 * Lee el Client ID y el secreto del `.env` local de Integraciones igual que las pruebas, y queda corriendo hasta Ctrl+C.
 * Dueño: q360-qa.
 */
import { iniciarAtlassianFalso } from "./atlassian-falso/servidor.ts";
import { iniciarJiraFalso } from "./jira-falso/servidor.ts";

const jira = await iniciarJiraFalso();
const atlassian = await iniciarAtlassianFalso();
console.log(`Jira simulado        http://127.0.0.1:${jira.puerto}`);
console.log(`Atlassian simulado   http://127.0.0.1:${atlassian.puerto}  (control: GET /__solicitudes, POST /__control, POST /__reset)`);
console.log("Quedan corriendo hasta Ctrl+C.");

let cerrando = false;
async function cerrar(): Promise<void> {
  if (cerrando) return;
  cerrando = true;
  await atlassian.cerrar();
  await jira.cerrar();
  process.exit(0);
}
process.on("SIGINT", () => void cerrar());
process.on("SIGTERM", () => void cerrar());
