import type { APIRequestContext } from "@playwright/test";
import { api, iniciarSesion, type RespuestaApi, type Sesion } from "./api";
import { fijarContrasena } from "./adminIdentidad";
import { conOrganizacion } from "./db";
import { env } from "./env";
import { correoUnico, nombreUnico } from "./unique";

/**
 * Soporte de la certificación de E7 · Bandejas por rol (dueño: q360-qa).
 *
 * Los usuarios y las HDU son las del fixture de la sección 3 de
 * `docs/backlog/e7-bandejas-por-rol.md`, cargado con `npm run seed:e7`
 * (`<clave>@quality360.local`, contraseña de demo, HDU `E7-H1`..`E7-H8`).
 *
 * Aislamiento: ninguna prueba muta a un usuario o una HDU del fixture. Las que
 * escriben crean sus propias entidades (usuarios `qa.*`, HDU con código único) y
 * las dejan desactivadas.
 */

export type ClaveE7 = "adm1" | "qe1" | "qe2" | "ana1" | "ana2" | "ana3" | "ana4" | "lid1" | "lid2" | "aud1" | "inact1";
export type RolE7 = "ANALISTA_QA" | "QE" | "LIDER_QA" | "ADMINISTRADOR" | "AUDITOR";

export const USUARIOS_E7: Record<ClaveE7, { correo: string; rol: RolE7; portal: string }> = {
  adm1: { correo: "adm1@quality360.local", rol: "ADMINISTRADOR", portal: "/admin" },
  qe1: { correo: "qe1@quality360.local", rol: "QE", portal: "/qe" },
  qe2: { correo: "qe2@quality360.local", rol: "QE", portal: "/qe" },
  ana1: { correo: "ana1@quality360.local", rol: "ANALISTA_QA", portal: "/qa" },
  ana2: { correo: "ana2@quality360.local", rol: "ANALISTA_QA", portal: "/qa" },
  ana3: { correo: "ana3@quality360.local", rol: "ANALISTA_QA", portal: "/qa" },
  ana4: { correo: "ana4@quality360.local", rol: "ANALISTA_QA", portal: "/qa" },
  lid1: { correo: "lid1@quality360.local", rol: "LIDER_QA", portal: "/lider" },
  lid2: { correo: "lid2@quality360.local", rol: "LIDER_QA", portal: "/lider" },
  aud1: { correo: "aud1@quality360.local", rol: "AUDITOR", portal: "/auditor" },
  inact1: { correo: "inact1@quality360.local", rol: "QE", portal: "/qe" },
};

/** Los 5 roles con un usuario representativo (los de la matriz de acceso cruzado). */
export const ROLES_MATRIZ = [
  { clave: "ana1", rol: "ANALISTA_QA", portal: "/qa", bandeja: "analista", rutaPropia: "/qa", rutasPortal: ["/qa", "/qa/hdu"] },
  { clave: "qe1", rol: "QE", portal: "/qe", bandeja: "qe", rutaPropia: "/qe", rutasPortal: ["/qe", "/qe/equipo", "/qe/aprobaciones"] },
  { clave: "lid1", rol: "LIDER_QA", portal: "/lider", bandeja: "lider", rutaPropia: "/lider", rutasPortal: ["/lider"] },
  { clave: "adm1", rol: "ADMINISTRADOR", portal: "/admin", bandeja: "admin", rutaPropia: "/admin", rutasPortal: ["/admin", "/admin/usuarios", "/admin/supervision"] },
  { clave: "aud1", rol: "AUDITOR", portal: "/auditor", bandeja: "auditor", rutaPropia: "/auditor", rutasPortal: ["/auditor", "/auditor/certificados"] },
] as const;

/** Portales de cada rol (una ruta representativa por portal ajeno en la matriz 5 x 4). */
export const RUTA_REPRESENTATIVA: Record<string, string> = {
  "/qa": "/qa",
  "/qe": "/qe",
  "/lider": "/lider",
  "/admin": "/admin",
  "/auditor": "/auditor",
};

const sesiones = new Map<string, Promise<Sesion>>();

/** Sesión real (password grant) de un usuario del fixture, reutilizada dentro del proceso. */
export function sesionE7(clave: ClaveE7): Promise<Sesion> {
  let sesion = sesiones.get(clave);
  if (!sesion) {
    sesion = iniciarSesion(USUARIOS_E7[clave].correo, env.contrasenaDemo);
    sesiones.set(clave, sesion);
  }
  return sesion;
}

export async function tokenE7(clave: ClaveE7): Promise<string> {
  return (await sesionE7(clave)).accessToken;
}

export interface HduE7 {
  id: string;
  codigo: string;
  titulo: string;
  estado: string;
  celula: { id: string; nombre: string };
  qeResponsable: { id: string; nombre: string; correo: string };
  analista: { id: string; nombre: string; correo: string } | null;
}

export const CODIGOS_H = ["E7-H1", "E7-H2", "E7-H3", "E7-H4", "E7-H5", "E7-H6", "E7-H7", "E7-H8"] as const;
export type CodigoH = (typeof CODIGOS_H)[number];

let cacheHdu: Promise<Record<CodigoH, HduE7>> | undefined;

/** Las 8 HDU del fixture por código (`E7-H1`..`E7-H8`), con la lectura global del Auditor. */
export function hduFixture(request: APIRequestContext): Promise<Record<CodigoH, HduE7>> {
  cacheHdu ??= (async () => {
    const token = await tokenE7("aud1");
    const todas = await listarHduE7(request, token);
    const mapa = {} as Record<CodigoH, HduE7>;
    for (const codigo of CODIGOS_H) {
      const hdu = todas.find((h) => h.codigo === codigo);
      if (!hdu) throw new Error(`Falta la HDU ${codigo} del fixture: ejecuta npm run seed:e7.`);
      mapa[codigo] = hdu;
    }
    return mapa;
  })();
  return cacheHdu;
}

/** Recorre todas las páginas de GET /v1/hdu (el listado no tiene búsqueda por texto) con el token indicado. */
export async function listarHduE7(request: APIRequestContext, token: string, query = ""): Promise<HduE7[]> {
  const items: HduE7[] = [];
  for (let pagina = 1; ; pagina += 1) {
    const r = await api.get<{ items: HduE7[]; total: number }>(request, `/v1/hdu?pagina=${pagina}&tamanoPagina=100${query ? `&${query}` : ""}`, { token });
    if (r.status !== 200) throw new Error(`No se pudo listar HDU: ${r.status} ${JSON.stringify(r.body)}`);
    items.push(...r.body.items);
    if (items.length >= r.body.total || r.body.items.length === 0) return items;
  }
}

export interface Bloque<T> {
  fuente: string;
  estado: "ok" | "indisponible";
  datos?: T;
}

export function valorContador(bloque: Bloque<{ valor: number }> | undefined): number | undefined {
  return bloque?.datos?.valor;
}

/** Códigos de los elementos de una lista de HDU de bandeja, ignorando HDU ajenas al fixture. */
export function codigosFixture(items: Array<{ codigo: string }>): string[] {
  return items.map((i) => i.codigo).filter((c) => c.startsWith("E7-H")).sort();
}

export const CONTRASENA = env.contrasenaDemo;

export interface UsuarioNuevo {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  activo: boolean;
}

/** Crea un usuario propio de la prueba (cualquiera de los 5 roles) y le fija contraseña si se pide. */
export async function crearUsuarioE7(
  request: APIRequestContext,
  tokenAdmin: string,
  rol: RolE7,
  opciones: { prefijo?: string; celulaIds?: string[]; conContrasena?: boolean } = {},
): Promise<UsuarioNuevo & { contrasena: string }> {
  const prefijo = opciones.prefijo ?? rol.toLowerCase();
  const correo = correoUnico(prefijo);
  const respuesta = await api.post<UsuarioNuevo>(request, "/v1/usuarios", {
    token: tokenAdmin,
    body: { nombre: nombreUnico(`QA E7 ${prefijo}`), correo, rol, ...(opciones.celulaIds ? { celulaIds: opciones.celulaIds } : {}) },
  });
  if (respuesta.status !== 201) {
    throw new Error(`No se pudo crear el usuario ${correo} (${rol}): ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  }
  if (opciones.conContrasena) await fijarContrasena(respuesta.body.id, CONTRASENA);
  return { ...respuesta.body, contrasena: CONTRASENA };
}

export async function sesionDe(correo: string): Promise<Sesion> {
  return iniciarSesion(correo, CONTRASENA);
}

/** Desactiva un usuario propio de la prueba para no dejar pendientes de configuración (best effort). */
export async function desactivarUsuario(request: APIRequestContext, tokenAdmin: string, id: string): Promise<void> {
  // Un Líder desactivado conserva sus células vigentes (DEF-E7-04): se liberan antes para no dejar células «con líder» fantasma.
  const u = await api.get<{ rol: string; celulasVigentes?: unknown[] }>(request, `/v1/usuarios/${id}`, { token: tokenAdmin });
  if (u.status === 200 && u.body.rol === "LIDER_QA" && (u.body.celulasVigentes?.length ?? 0) > 0) {
    await api.put(request, `/v1/usuarios/${id}/celulas-lider`, { token: tokenAdmin, body: { celulaIds: [] } });
  }
  await api.patch(request, `/v1/usuarios/${id}`, { token: tokenAdmin, body: { activo: false } });
}

export interface CelulaRef {
  id: string;
  nombre: string;
}

/** Células del fixture por nombre (`CEL-A`, `CEL-B`, `CEL-C`). */
export async function celulasFixture(request: APIRequestContext): Promise<Record<"CEL-A" | "CEL-B" | "CEL-C", CelulaRef>> {
  const token = await tokenE7("adm1");
  const r = await api.get<{ items: CelulaRef[] }>(request, "/v1/catalogos/celulas", { token });
  const por = Object.fromEntries(r.body.items.map((c) => [c.nombre, c]));
  for (const n of ["CEL-A", "CEL-B", "CEL-C"]) if (!por[n]) throw new Error(`Falta la célula ${n} del fixture.`);
  return por as Record<"CEL-A" | "CEL-B" | "CEL-C", CelulaRef>;
}

/** Cuenta, directamente en la base de Organización, los datos de referencia contra los que se contrastan los contadores. */
export async function contarOrganizacion() {
  return conOrganizacion(async (c) => {
    const q = async (sql: string, params: unknown[] = []) => Number((await c.query(sql, params)).rows[0].n);
    return {
      usuariosActivos: await q(`SELECT count(*) n FROM organizacion.usuario WHERE activo`),
      usuariosInactivos: await q(`SELECT count(*) n FROM organizacion.usuario WHERE NOT activo`),
      porRol: Object.fromEntries(
        (
          await c.query(
            `SELECT r.nombre, count(*) n FROM organizacion.usuario u JOIN organizacion.rol r ON r.id_rol = u.id_rol WHERE u.activo GROUP BY r.nombre`,
          )
        ).rows.map((f) => [f.nombre as string, Number(f.n)]),
      ) as Record<string, number>,
      hduTotal: await q(`SELECT count(*) n FROM organizacion.historia_usuario`),
      analistasSinQe: await q(
        `SELECT count(*) n FROM organizacion.usuario u JOIN organizacion.rol r ON r.id_rol = u.id_rol
         WHERE u.activo AND r.nombre = 'ANALISTA_QA'
           AND NOT EXISTS (SELECT 1 FROM organizacion.supervision s WHERE s.id_supervisado = u.id_usuario AND s.fecha_hasta IS NULL)`,
      ),
      lideresSinCelulas: await q(
        `SELECT count(*) n FROM organizacion.usuario u JOIN organizacion.rol r ON r.id_rol = u.id_rol
         WHERE u.activo AND r.nombre = 'LIDER_QA'
           AND NOT EXISTS (SELECT 1 FROM organizacion.celula_lider cl WHERE cl.id_usuario = u.id_usuario AND cl.fecha_hasta IS NULL)`,
      ),
    };
  });
}

/** HDU de las células vigentes de un usuario, directamente en la base (oráculo independiente del endpoint). */
export async function hduDeCelulasDe(correo: string) {
  return conOrganizacion(async (c) => {
    const r = await c.query(
      `SELECT h.codigo, h.estado, h.analista_id IS NULL AS sin_analista
         FROM organizacion.historia_usuario h
        WHERE h.id_celula IN (SELECT cl.id_celula FROM organizacion.celula_lider cl
                                JOIN organizacion.usuario u ON u.id_usuario = cl.id_usuario
                               WHERE u.email = $1 AND cl.fecha_hasta IS NULL)`,
      [correo],
    );
    return r.rows as Array<{ codigo: string; estado: string; sin_analista: boolean }>;
  });
}

/** Cuerpo de error del gateway, con su forma común. */
export interface ErrorApi {
  codigo: string;
  mensaje: string;
  traceId?: string;
  detalles?: unknown[];
}

export function esErrorApi(r: RespuestaApi): boolean {
  const b = r.body as Partial<ErrorApi> | undefined;
  return typeof b?.codigo === "string" && typeof b?.mensaje === "string";
}

/** Normaliza el cuerpo de un 403 para compararlo entre combinaciones (sin traceId). */
export function cuerpoSinTrace(r: RespuestaApi): string {
  const { traceId: _t, ...resto } = (r.body ?? {}) as Record<string, unknown>;
  return JSON.stringify(resto);
}

/** PDF mínimo en memoria para evidencias de archivo. */
export const PDF_MINIMO = Buffer.from("%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF", "utf-8");

/** Marca un entregable con un archivo como evidencia: solicita la URL firmada, sube el PDF y marca (E3-F02#1). */
export async function marcarConArchivo(request: APIRequestContext, tokenAnalista: string, hduId: string, clave: string): Promise<RespuestaApi> {
  const solicitud = await api.post<{ ruta: string; urlSubida: string; token: string }>(request, `/v1/hdu/${hduId}/entregables/${clave}/evidencias`, {
    token: tokenAnalista,
    body: { nombreArchivo: "evidencia-e7.pdf", tipoContenido: "application/pdf", tamanoBytes: PDF_MINIMO.length },
  });
  if (solicitud.status !== 201) throw new Error(`No se pudo solicitar la subida: ${solicitud.status} ${JSON.stringify(solicitud.body)}`);
  const subida = await fetch(solicitud.body.urlSubida, { method: "PUT", headers: { "Content-Type": "application/pdf", "x-upsert": "false" }, body: PDF_MINIMO });
  if (!subida.ok) throw new Error(`No se pudo subir el archivo: ${subida.status} ${await subida.text()}`);
  return api.post(request, `/v1/hdu/${hduId}/entregables/${clave}/marcar`, {
    token: tokenAnalista,
    body: { evidencia: { tipo: "ARCHIVO", ruta: solicitud.body.ruta, nombreArchivo: "evidencia-e7.pdf" } },
  });
}
