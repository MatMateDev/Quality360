import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * Jira Cloud simulado para la certificación de E5 (dueño: q360-qa; backlog e5-integracion-jira.md, sección 10.1).
 * Servidor HTTP de Node sin dependencias. Imita solo lo que usa Integraciones: myself, project/{CLAVE}, field y search/jql.
 * El control (`/__control`, `/__reset`, `/__issues`, `/__solicitudes`) es del arnés y no exige autenticación.
 * Nunca registra el valor del token: solo si la autenticación coincidía.
 */
export const CORREO_VALIDO = "admin@quality360.local";
export const TOKEN_VALIDO = "q360-token-valido-AB12";
export const TOKEN_NUEVO = "q360-token-nuevo-CD34";
const TOKENS_VALIDOS = new Set([TOKEN_VALIDO, TOKEN_NUEVO]);

/** `LIMITE_SIEMPRE` es una extensión de QA al backlog: 429 persistente en todas las rutas (la prueba de conexión no usa search/jql). */
export type ModoJira =
  | "NORMAL" | "LIMITE" | "LIMITE_PAGINA_2" | "LIMITE_SIEMPRE" | "LENTO" | "RETARDO_1S" | "CAIDO"
  | "TOKEN_REVOCADO" | "SIN_PERMISO" | "RESPUESTA_INVALIDA";

interface Issue {
  key: string;
  tipo: string;
  summary: string;
  description: unknown;
  priority: string | null;
  sprints: Array<{ name: string; state: string; startDate?: string; endDate?: string }>;
  status: string;
  assignee: string | null;
  /** Etiquetas de Jira (p. ej. `celula-pagos`); vacío por defecto. */
  labels?: string[];
  /** Detalle de E5 (D196-D199): como en Jira, solo se devuelven si el `fields` de la búsqueda los pide. */
  created?: string | null;
  updated?: string | null;
  duedate?: string | null;
  resolutiondate?: string | null;
  parent?: { key: string; summary: string; tipo: string; nivel?: number } | null;
  /** Valor ADF del campo personalizado «Acceptance Criteria». */
  criterios?: unknown;
}

/** Id del campo personalizado «Acceptance Criteria» que expone `/field` (D199). */
export const CAMPO_CRITERIOS = "customfield_10050";

export interface SolicitudRegistrada {
  metodo: string;
  ruta: string;
  consulta: Record<string, string>;
  autenticacionValida: boolean;
  fecha: string;
  /** Tamaño en bytes de la respuesta (peso de la página, D196). */
  bytes?: number;
}

const parrafo = (texto: string) => ({ type: "paragraph", content: [{ type: "text", text: texto }] });
const adf = (...parrafos: string[]) => ({ type: "doc", version: 1, content: parrafos.map(parrafo) });

function crearIssue(key: string, tipo: string, summary: string, description: unknown, priority: string | null, sprints: Issue["sprints"] = []): Issue {
  return { key, tipo, summary, description, priority, sprints, status: "En progreso", assignee: "Persona Jira" };
}

function datosBase(): Map<string, Issue> {
  const m = new Map<string, Issue>();
  const poner = (i: Issue) => m.set(i.key, i);
  poner(crearIssue("QTY-1", "Story", "Login con doble factor", adf("Como usuario quiero activar 2FA"), "High", [{ name: "E5 Sprint 2", state: "active", endDate: "2099-01-01T00:00:00.000Z" }]));
  poner(crearIssue("QTY-2", "Story", "Recuperar contraseña", adf("Primer párrafo de la descripción.", "Segundo párrafo de la descripción."), "Medium", [{ name: "E5 Sprint 1", state: "future" }]));
  poner(crearIssue("QTY-3", "Historia", "Exportar reporte mensual", null, "Highest", [{ name: "Sprint Externo 9", state: "closed", endDate: "2020-01-01T00:00:00.000Z" }]));
  poner(crearIssue("QTY-4", "Story", "Filtrar por fecha", adf("Texto corto"), "Low"));
  poner(crearIssue("QTY-5", "Story", "Notificaciones push", adf("Texto corto"), null));
  poner(crearIssue("QTY-6", "Story", "Modo oscuro", adf("Texto corto"), "Urgentísima"));
  poner(crearIssue("QTY-7", "Bug", "Error en login", adf("Texto"), "High"));
  poner(crearIssue("QTY-8", "Story", "T".repeat(250), adf("Texto"), "Medium"));
  poner(crearIssue("QTY-9", "Story", "Descripción larga", adf("D".repeat(1500)), "Medium"));
  poner(crearIssue("QTY-10", "Story", "Perfil de usuario", null, "Lowest"));
  poner(crearIssue("QTY-11", "Story", "", adf("Texto"), "High"));
  poner(crearIssue("QTY-12", "Story", "Búsqueda global", adf("Texto"), "Medium", [
    { name: "Sprint Externo 9", state: "closed", endDate: "2020-01-01T00:00:00.000Z" },
    { name: "E5 Sprint 1", state: "active", endDate: "2099-01-01T00:00:00.000Z" },
  ]));
  for (let n = 1; n <= 230; n += 1) poner(crearIssue(`BIG-${n}`, "Story", `Historia grande ${n}`, adf(`Descripción ${n}`), "Medium"));
  for (let n = 1; n <= 100; n += 1) poner(crearIssue(`EXACTO-${n}`, "Story", `Historia exacta ${n}`, adf(`Descripción ${n}`), "Medium"));
  for (let n = 1; n <= 520; n += 1) poner(crearIssue(`ENORME-${n}`, "Story", `Historia enorme ${n}`, adf(`Descripción ${n}`), "Medium"));
  return m;
}

const texto = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const heading = (t: string, level = 2) => ({ type: "heading", attrs: { level }, content: [texto(t)] });
const lista = (...items: string[]) => ({ type: "bulletList", content: items.map((i) => ({ type: "listItem", content: [parrafo(i)] })) });
const docAdf = (...bloques: unknown[]) => ({ type: "doc", version: 1, content: bloques });

/** 20 KB de ADF hostil: HTML ejecutable como texto, enlace `javascript:`, `media`, macros, tabla con `=cmd` y control. */
function descripcionHostil(): unknown {
  const relleno = Array.from({ length: 40 }, (_, i) => parrafo(`Línea ${i + 1}: ` + "x".repeat(480)));
  return docAdf(
    parrafo("<script>window.__xss = 1; document.title = 'xss'</script>"),
    parrafo("<b>negrita</b> y <img src=x onerror=\"window.__xss=2\"> y <a href=\"javascript:alert(1)\">enlace html</a>"),
    { type: "paragraph", content: [texto("enlace javascript", [{ type: "link", attrs: { href: "javascript:alert(3)" } }]), texto(" y "), texto("enlace http", [{ type: "link", attrs: { href: "https://ejemplo.test/ok" } }])] },
    { type: "mediaSingle", attrs: { layout: "center" }, content: [{ type: "media", attrs: { id: "abc", type: "file", collection: "x" } }] },
    { type: "bodiedExtension", attrs: { extensionType: "com.atlassian.confluence.macro.core", extensionKey: "code" }, content: [parrafo("contenido de la macro")] },
    { type: "table", content: [{ type: "tableRow", content: [
      { type: "tableHeader", content: [parrafo("Campo")] }, { type: "tableHeader", content: [parrafo("Valor")] }] },
      { type: "tableRow", content: [{ type: "tableCell", content: [parrafo("=cmd|' /C calc'!A0")] }, { type: "tableCell", content: [parrafo("fin")] }] }] },
    { type: "orderedList", content: [{ type: "listItem", content: [parrafo("primero")] }, { type: "listItem", content: [parrafo("segundo")] }] },
    parrafo("control\u0007\u0000 incluido"),
    ...relleno,
  );
}

/** Issues del detalle de E5 (QTY-15 a QTY-18); se cargan con `POST /__detalle` para no mover los conteos de QTY de las pruebas certificadas. */
function datosDetalle(): Issue[] {
  const hostil: Issue = { ...crearIssue("QTY-15", "Story", "Detalle hostil con 20 KB", descripcionHostil(), "High", [{ name: "E5 Sprint 2", state: "active", startDate: "2026-11-03T09:00:00.000Z", endDate: "2099-01-01T00:00:00.000Z" }]), labels: ["seguridad", "<b>html</b>"] };
  const vacia: Issue = { ...crearIssue("QTY-16", "Story", "Detalle vacío", null, "Medium"), assignee: null, labels: [], created: null, updated: null, duedate: null, resolutiondate: null, parent: null, criterios: null };
  const completa: Issue = {
    ...crearIssue("QTY-17", "Story", "Detalle completo con doble factor", docAdf(parrafo("Como usuario quiero activar un segundo factor."), lista("Debe enviar un código", "Debe expirar en 5 minutos")), "Highest", [
      { name: "E5 Sprint Pasado", state: "closed", startDate: "2026-09-01T09:00:00.000Z", endDate: "2026-09-15T18:00:00.000Z" },
      { name: "E5 Sprint 2", state: "active", startDate: "2026-11-03T09:00:00.000Z", endDate: "2099-01-01T00:00:00.000Z" },
      { name: "E5 Sprint 3", state: "future", startDate: "2099-01-02T09:00:00.000Z" },
    ]),
    assignee: "Rosa Pérez",
    labels: Array.from({ length: 25 }, (_, i) => `etiqueta-${i + 1}`),
    created: "2026-10-01T10:00:00.000-0300",
    updated: "2026-11-04T18:30:00.000-0300",
    duedate: "2026-12-15",
    resolutiondate: "2026-11-20T12:00:00.000-0300",
    parent: { key: "QTY-100", summary: "Autenticación", tipo: "Epic", nivel: 1 },
    criterios: docAdf(parrafo("Dado un usuario con 2FA activo"), parrafo("Cuando ingresa un código vencido"), parrafo("Entonces ve el error y puede pedir otro")),
  };
  const conEncabezado: Issue = {
    ...crearIssue("QTY-18", "Story", "Criterios solo en la descripción", docAdf(
      parrafo("Contexto de la historia."),
      heading("Criterios de aceptación"),
      lista("El botón queda deshabilitado sin datos", "El error se anuncia por voz"),
      heading("Notas técnicas"),
      parrafo("Nada que ver con los criterios."),
    ), "Low"),
  };
  return [hostil, vacia, completa, conEncabezado];
}

/** Proyecto `PESADO` (100 issues con 20 KB de descripción) para medir el peso de la página y la tanda con Jira lento (E5-B06 #8). */
function datosPesados(): Issue[] {
  const grande = docAdf(...Array.from({ length: 40 }, (_, i) => parrafo(`Párrafo ${i + 1}: ` + "p".repeat(480))));
  return Array.from({ length: 100 }, (_, n) => ({ ...crearIssue(`PESADO-${n + 1}`, "Story", `Historia pesada ${n + 1}`, grande, "Medium"), created: "2026-10-01T10:00:00.000-0300", updated: "2026-11-04T18:30:00.000-0300" }));
}

const PROYECTOS: Record<string, string> = { QTY: "Quality Tracker", BIG: "Proyecto grande", EXACTO: "Proyecto exacto", VACIO: "Proyecto vacío", ENORME: "Proyecto enorme", PESADO: "Proyecto pesado" };

export interface JiraFalso {
  puerto: number;
  cerrar: () => Promise<void>;
}

export async function iniciarJiraFalso(puerto = Number(process.env.JIRA_FALSO_PUERTO ?? 4010)): Promise<JiraFalso> {
  let issues = datosBase();
  let modo: ModoJira = "NORMAL";
  let busquedas = 0;
  let solicitudes: SolicitudRegistrada[] = [];
  /** `/field` lista «Acceptance Criteria» (D199); `POST /__campos {criterios:false}` lo quita para probar el sitio sin ese campo. */
  let criteriosEnField = true;

  const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const numero = (key: string) => Number(key.slice(key.lastIndexOf("-") + 1));
  const proyectoDe = (key: string) => key.slice(0, key.lastIndexOf("-"));

  function autenticado(req: IncomingMessage): { valida: boolean; token: string } {
    const cab = req.headers.authorization ?? "";
    if (!cab.startsWith("Basic ")) return { valida: false, token: "" };
    const [correo, ...resto] = Buffer.from(cab.slice(6), "base64").toString("utf8").split(":");
    const token = resto.join(":");
    return { valida: correo === CORREO_VALIDO && TOKENS_VALIDOS.has(token), token };
  }

  const json = (res: ServerResponse, estado: number, cuerpo: unknown, cab: Record<string, string> = {}) => {
    const texto = JSON.stringify(cuerpo);
    const ultima = solicitudes[solicitudes.length - 1];
    if (ultima && ultima.bytes === undefined) ultima.bytes = Buffer.byteLength(texto, "utf8");
    res.writeHead(estado, { "Content-Type": "application/json", ...cab });
    res.end(texto);
  };

  function issueJson(i: Issue, campoSprint: string, pedidos: Set<string>) {
    const pide = (campo: string) => pedidos.has(campo);
    return {
      id: String(numero(i.key)),
      key: i.key,
      fields: {
        summary: i.summary,
        description: i.description,
        priority: i.priority === null ? null : { name: i.priority },
        issuetype: { name: i.tipo },
        status: { name: i.status },
        assignee: i.assignee === null ? null : { displayName: i.assignee },
        labels: i.labels ?? [],
        [campoSprint]: i.sprints.length === 0 ? null : i.sprints.map((s, idx) => ({ id: idx + 1, name: s.name, state: s.state, ...(s.startDate ? { startDate: s.startDate } : {}), ...(s.endDate ? { endDate: s.endDate } : {}) })),
        // Como Jira, solo lo que el `fields` de la búsqueda pide (si no, no viajan ni pesan).
        ...(pide("created") ? { created: i.created ?? null } : {}),
        ...(pide("updated") ? { updated: i.updated ?? null } : {}),
        ...(pide("duedate") ? { duedate: i.duedate ?? null } : {}),
        ...(pide("resolutiondate") ? { resolutiondate: i.resolutiondate ?? null } : {}),
        ...(pide("parent") ? { parent: i.parent ? { key: i.parent.key, fields: { summary: i.parent.summary, issuetype: { name: i.parent.tipo, ...(i.parent.nivel !== undefined ? { hierarchyLevel: i.parent.nivel } : {}) } } } : undefined } : {}),
        ...(pide(CAMPO_CRITERIOS) ? { [CAMPO_CRITERIOS]: i.criterios ?? null } : {}),
      },
    };
  }

  function buscar(consulta: URLSearchParams) {
    const jql = consulta.get("jql") ?? "";
    const proyecto = /project\s*=\s*([A-Z][A-Z0-9_]*)/.exec(jql)?.[1] ?? "";
    const tipos = /issuetype\s+in\s*\(([^)]*)\)/.exec(jql)?.[1]?.split(",").map((t) => t.trim().replace(/^"|"$/g, "")) ?? null;
    const despues = /key\s*>\s*"([^"]+)"/.exec(jql)?.[1];
    let lista = [...issues.values()].filter((i) => proyectoDe(i.key) === proyecto);
    if (tipos) lista = lista.filter((i) => tipos.includes(i.tipo));
    if (despues) lista = lista.filter((i) => proyectoDe(despues) === proyecto && numero(i.key) > numero(despues));
    lista.sort((a, b) => numero(a.key) - numero(b.key));
    const token = consulta.get("nextPageToken");
    const inicio = token ? Number(Buffer.from(token, "base64url").toString("utf8")) : 0;
    const max = Math.min(Number(consulta.get("maxResults") ?? 50), 50);
    const pagina = lista.slice(inicio, inicio + max);
    const pedidos = new Set((consulta.get("fields") ?? "").split(",").map((f) => f.trim()).filter(Boolean));
    const campoSprint = [...pedidos].find((f) => f.startsWith("customfield_") && f !== CAMPO_CRITERIOS) ?? "customfield_10020";
    const hayMas = inicio + max < lista.length;
    return {
      issues: pagina.map((i) => issueJson(i, campoSprint, pedidos)),
      ...(hayMas ? { nextPageToken: Buffer.from(String(inicio + max)).toString("base64url") } : {}),
      isLast: !hayMas,
    };
  }

  const servidor: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${puerto}`);
    const ruta = url.pathname;
    const cuerpoCrudo = await new Promise<string>((ok) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => ok(b));
    });

    // ---- Control del arnés (sin autenticación)
    if (ruta.startsWith("/__")) {
      if (ruta === "/__control" && req.method === "POST") {
        const d = JSON.parse(cuerpoCrudo || "{}") as { modo?: ModoJira };
        modo = d.modo ?? "NORMAL";
        busquedas = 0;
        return json(res, 200, { modo });
      }
      if (ruta === "/__reset" && req.method === "POST") {
        issues = datosBase();
        modo = "NORMAL";
        busquedas = 0;
        solicitudes = [];
        criteriosEnField = true;
        return json(res, 200, { ok: true });
      }
      // Detalle de E5: QTY-15 a QTY-18 y el proyecto PESADO (100 issues de 20 KB) se cargan a pedido.
      if (ruta === "/__detalle" && req.method === "POST") {
        const d = JSON.parse(cuerpoCrudo || "{}") as { pesado?: boolean };
        for (const i of datosDetalle()) issues.set(i.key, i);
        if (d.pesado) for (const i of datosPesados()) issues.set(i.key, i);
        return json(res, 200, { ok: true });
      }
      if (ruta === "/__campos" && req.method === "POST") {
        const d = JSON.parse(cuerpoCrudo || "{}") as { criterios?: boolean };
        criteriosEnField = d.criterios !== false;
        return json(res, 200, { criterios: criteriosEnField });
      }
      if (ruta === "/__solicitudes" && req.method === "GET") return json(res, 200, solicitudes);
      if (ruta === "/__solicitudes" && req.method === "DELETE") {
        solicitudes = [];
        return json(res, 200, { ok: true });
      }
      const m = /^\/__issues\/([A-Z][A-Z0-9_]*-\d+)$/.exec(ruta);
      if (m && req.method === "PUT") {
        const d = JSON.parse(cuerpoCrudo || "{}") as Partial<Issue>;
        const base = issues.get(m[1]) ?? crearIssue(m[1], "Story", "", null, null);
        issues.set(m[1], {
          ...base,
          ...(d.tipo !== undefined ? { tipo: d.tipo } : {}),
          ...(d.summary !== undefined ? { summary: d.summary } : {}),
          ...(d.description !== undefined ? { description: d.description } : {}),
          ...(d.priority !== undefined ? { priority: d.priority } : {}),
          ...(d.sprints !== undefined ? { sprints: d.sprints } : {}),
          ...(d.labels !== undefined ? { labels: d.labels } : {}),
          ...(d.status !== undefined ? { status: d.status } : {}),
          ...(d.assignee !== undefined ? { assignee: d.assignee } : {}),
          ...(d.created !== undefined ? { created: d.created } : {}),
          ...(d.updated !== undefined ? { updated: d.updated } : {}),
          ...(d.duedate !== undefined ? { duedate: d.duedate } : {}),
          ...(d.resolutiondate !== undefined ? { resolutiondate: d.resolutiondate } : {}),
          ...(d.parent !== undefined ? { parent: d.parent } : {}),
          ...(d.criterios !== undefined ? { criterios: d.criterios } : {}),
        });
        return json(res, 200, { ok: true });
      }
      if (m && req.method === "DELETE") {
        issues.delete(m[1]);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: "control desconocido" });
    }

    // ---- API de Jira
    const consulta = Object.fromEntries(url.searchParams.entries());
    const auth = autenticado(req);
    solicitudes.push({ metodo: req.method ?? "GET", ruta, consulta, autenticacionValida: auth.valida, fecha: new Date().toISOString() });
    const esBusqueda = ruta === "/rest/api/3/search/jql";
    if (esBusqueda) busquedas += 1;

    if (modo === "LENTO") await dormir(5000);
    if (modo === "RETARDO_1S" && esBusqueda) await dormir(1000);
    if (modo === "CAIDO") return json(res, 503, { message: "Servicio no disponible" });
    if (modo === "TOKEN_REVOCADO") return json(res, 401, { message: `Credenciales rechazadas para el token ${auth.token}` });
    if (modo === "RESPUESTA_INVALIDA") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end("<html>esto no es JSON</html>");
    }
    if (modo === "LIMITE_SIEMPRE") return json(res, 429, { message: "Rate limited" }, { "Retry-After": "1" });
    if (esBusqueda) {
      if (modo === "LIMITE" && busquedas <= 2) return json(res, 429, { message: "Rate limited" }, { "Retry-After": "1" });
      if (modo === "LIMITE_PAGINA_2" && url.searchParams.has("nextPageToken")) return json(res, 429, { message: "Rate limited" }, { "Retry-After": "1" });
      if (modo === "SIN_PERMISO") return json(res, 403, { message: "Sin permiso" });
    }
    // Extensión de QA: SIN_PERMISO también niega la lectura del proyecto (la prueba de conexión no usa search/jql).
    if (modo === "SIN_PERMISO" && ruta.startsWith("/rest/api/3/project/")) return json(res, 403, { message: "Sin permiso" });
    if (!auth.valida) return json(res, 401, { message: "No autenticado" });

    if (ruta === "/rest/api/3/myself") return json(res, 200, { accountId: "falso-001", displayName: "Admin Jira Falso" });
    const p = /^\/rest\/api\/3\/project\/([^/]+)$/.exec(ruta);
    if (p) {
      const clave = decodeURIComponent(p[1]);
      return PROYECTOS[clave] ? json(res, 200, { key: clave, name: PROYECTOS[clave] }) : json(res, 404, { message: "No existe" });
    }
    if (ruta === "/rest/api/3/field") {
      return json(res, 200, [
        { id: "summary", name: "Summary", custom: false },
        { id: "customfield_10020", name: "Sprint", schema: { type: "array", items: "json", custom: "com.pyxis.greenhopper.jira:gh-sprint", customId: 10020 } },
        ...(criteriosEnField ? [{ id: CAMPO_CRITERIOS, name: "Acceptance Criteria", custom: true, schema: { type: "string", custom: "com.atlassian.jira.plugin.system.customfieldtypes:textarea", customId: 10050 } }] : []),
      ]);
    }
    if (esBusqueda) return json(res, 200, buscar(url.searchParams));
    return json(res, 404, { message: "Ruta no simulada" });
  });

  await new Promise<void>((ok, fallo) => {
    servidor.once("error", fallo);
    servidor.listen(puerto, "127.0.0.1", () => ok());
  });
  return { puerto, cerrar: () => new Promise<void>((ok) => { servidor.closeAllConnections?.(); servidor.close(() => ok()); }) };
}

/** Arranque manual: `node --experimental-strip-types tests/support/jira-falso/servidor.ts` (útil para la prueba manual y el axe). */
