import { iniciarJiraFalso, type JiraFalso } from "./servidor";

/** Arranca el Jira falso (4010) para toda la corrida de Playwright; si el puerto ya está ocupado, se reutiliza el que esté escuchando. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  let jira: JiraFalso | undefined;
  try {
    jira = await iniciarJiraFalso();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
  }
  return async () => {
    await jira?.cerrar();
  };
}
