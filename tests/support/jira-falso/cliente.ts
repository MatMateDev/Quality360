import type { ModoJira, SolicitudRegistrada } from "./servidor";

/** Cliente del control del Jira falso (puerto 4010). Dueño: q360-qa. */
export const JIRA_FALSO = process.env.JIRA_FALSO_URL ?? "http://127.0.0.1:4010";

async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<any> {
  const r = await fetch(`${JIRA_FALSO}${ruta}`, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`Jira falso ${metodo} ${ruta}: ${r.status}`);
  return r.json();
}

export const jiraFalso = {
  modo: (modo: ModoJira) => pedir("POST", "/__control", { modo }),
  reset: () => pedir("POST", "/__reset"),
  issue: (clave: string, datos: Record<string, unknown>) => pedir("PUT", `/__issues/${clave}`, datos),
  borrarIssue: (clave: string) => pedir("DELETE", `/__issues/${clave}`),
  solicitudes: (): Promise<SolicitudRegistrada[]> => pedir("GET", "/__solicitudes"),
  limpiarSolicitudes: () => pedir("DELETE", "/__solicitudes"),
};
