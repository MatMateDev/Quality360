import { iniciarAtlassianFalso, type AtlassianFalso } from "./atlassian-falso/servidor";
import { iniciarJiraFalso, type JiraFalso } from "./jira-falso/servidor";

/**
 * Arranca, para toda la corrida de Playwright, el Jira falso (:4010) y el Atlassian falso de OAuth (:4011, E5 OAuth).
 * Si un puerto ya está ocupado se reutiliza el que esté escuchando. El Atlassian falso lee el Client ID y el secreto del `.env` de Integraciones
 * al recibir cada petición, así que arranca aunque ese archivo aún no exista.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  let jira: JiraFalso | undefined;
  let atlassian: AtlassianFalso | undefined;
  for (const [nombre, arrancar] of [
    ["Jira falso", async () => { jira = await iniciarJiraFalso(); }],
    ["Atlassian falso", async () => { atlassian = await iniciarAtlassianFalso(); }],
  ] as const) {
    try {
      await arrancar();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw new Error(`No arrancó el ${nombre}: ${String(e)}`);
    }
  }
  return async () => {
    await atlassian?.cerrar();
    await jira?.cerrar();
  };
}
