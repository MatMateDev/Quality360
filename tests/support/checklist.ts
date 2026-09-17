import type { APIRequestContext } from "@playwright/test";
import { api, iniciarSesion, type Sesion } from "./api";
import { env } from "./env";
import { crearHdu, obtenerCatalogos, type HduCreada } from "./fixtures";
import { codigoHduUnico } from "./unique";
import { USUARIOS_SEMILLA } from "./usuarios";

/**
 * Entregables del checklist E3, en su orden obligatorio (D15, D17). Espejo de
 * `ClaveEntregable` en `contracts/comun.v1.yaml`.
 */
export const ORDEN_ENTREGABLES = [
  "PLAN_PRUEBAS",
  "DASHBOARD",
  "CASOS_PRUEBA",
  "APROBACION_CASOS",
  "EJECUCION",
  "EVIDENCIAS",
  "DEFECTOS",
  "APROBACION_UAT",
  "CERTIFICADO",
  "CIERRE_PRUEBAS",
] as const;
export type ClaveEntregable = (typeof ORDEN_ENTREGABLES)[number];

export const NOMBRES_ENTREGABLE: Record<ClaveEntregable, string> = {
  PLAN_PRUEBAS: "Plan de pruebas",
  DASHBOARD: "Dashboard",
  CASOS_PRUEBA: "Casos de prueba",
  APROBACION_CASOS: "Aprobación de casos de prueba",
  EJECUCION: "Ejecución",
  EVIDENCIAS: "Evidencias",
  DEFECTOS: "Defectos gestionados",
  APROBACION_UAT: "Aprobación UAT",
  CERTIFICADO: "Certificado",
  CIERRE_PRUEBAS: "Cierre de pruebas",
};

export interface HduConEquipo {
  hdu: HduCreada;
  sesionCarla: Sesion;
  sesionAna: Sesion;
}

/**
 * HDU propia de la prueba (regla de aislamiento), creada por Carla (QE) y
 * asignada a Ana (analista de su equipo vigente): la pareja que pide la
 * consigna de E3 para no tocar la semilla ni otros usuarios/HDU.
 */
export async function crearHduAsignadaAAna(request: APIRequestContext, prefijo: string): Promise<HduConEquipo> {
  const [sesionCarla, sesionAna] = await Promise.all([
    iniciarSesion(USUARIOS_SEMILLA.carla.correo, env.contrasenaDemo),
    iniciarSesion(USUARIOS_SEMILLA.ana.correo, env.contrasenaDemo),
  ]);
  const { celula, sprint } = await obtenerCatalogos(request, sesionCarla.accessToken);
  const hdu = await crearHdu(request, sesionCarla.accessToken, { codigo: codigoHduUnico(prefijo), celulaId: celula.id, sprintId: sprint.id });

  const asignacion = await api.put(request, `/v1/hdu/${hdu.id}/analista`, {
    token: sesionCarla.accessToken,
    body: { analistaId: sesionAna.userId },
  });
  if (asignacion.status !== 200) {
    throw new Error(`No fue posible asignar a Ana en la HDU ${hdu.codigo}: ${asignacion.status} ${JSON.stringify(asignacion.body)}`);
  }
  return { hdu, sesionCarla, sesionAna };
}

/** Marca un entregable con evidencia de enlace (E3-F02#1), como el analista asignado. */
export async function marcarConEnlace(
  request: APIRequestContext,
  tokenAnalista: string,
  hduId: string,
  clave: ClaveEntregable,
  url = "https://evidencia.quality360.local/prueba",
) {
  const respuesta = await api.post(request, `/v1/hdu/${hduId}/entregables/${clave}/marcar`, {
    token: tokenAnalista,
    body: { evidencia: { tipo: "ENLACE", url } },
  });
  if (respuesta.status !== 200) {
    throw new Error(`No fue posible marcar ${clave} en ${hduId}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  }
  return respuesta.body;
}

/** Aprueba un entregable por aprobar (E3-F03#1), como el QE responsable. */
export async function aprobarEntregable(request: APIRequestContext, tokenQe: string, hduId: string, clave: ClaveEntregable) {
  const respuesta = await api.post(request, `/v1/hdu/${hduId}/entregables/${clave}/aprobar`, { token: tokenQe });
  if (respuesta.status !== 200) {
    throw new Error(`No fue posible aprobar ${clave} en ${hduId}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
  }
  return respuesta.body;
}

/**
 * Marca y aprueba, en orden, los primeros `cantidad` entregables (1 a 8) por
 * API: ayuda mínima para llegar a «N aprobados» sin gastar más escrituras de
 * las necesarias (consigna de la Ola 3, límite de 30 escrituras/min del
 * gateway).
 */
export async function avanzarChecklist(request: APIRequestContext, equipo: HduConEquipo, cantidad: number): Promise<void> {
  for (const clave of ORDEN_ENTREGABLES.slice(0, cantidad)) {
    await marcarConEnlace(request, equipo.sesionAna.accessToken, equipo.hdu.id, clave);
    await aprobarEntregable(request, equipo.sesionCarla.accessToken, equipo.hdu.id, clave);
  }
}

/** PDF mínimo válido en memoria, para `setInputFiles` sin depender de un archivo en disco. */
export function pdfDePrueba(nombre = "evidencia-prueba.pdf"): { name: string; mimeType: "application/pdf"; buffer: Buffer } {
  const contenido =
    "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF";
  return { name: nombre, mimeType: "application/pdf", buffer: Buffer.from(contenido, "utf-8") };
}
