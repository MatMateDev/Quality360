import { ETIQUETAS_ROL, type Rol } from "@/types/dominio";

/** Claves que el portal nunca muestra, aunque el API las enviara (E1-B12#3, E7-F06-T04). */
const CLAVE_SENSIBLE = /password|contrasena|token|secret/i;

/** Campos auditables que el portal sabe describir (lista blanca de D48). */
const ETIQUETA_CAMPO: Record<string, string> = {
  rol: "Rol",
  nombre: "Nombre",
  correo: "Correo",
  activo: "Estado de acceso",
  supervisor: "Supervisor",
  celulas: "Células",
};

function textoValor(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (clave === "rol" && typeof valor === "string") return ETIQUETAS_ROL[valor as Rol] ?? valor;
  if (clave === "activo") return valor ? "Activo" : "Inactivo";
  if (Array.isArray(valor)) return valor.length === 0 ? "sin células" : valor.map((v) => (typeof v === "object" ? "…" : String(v))).join(", ");
  if (typeof valor === "object") return "…";
  return String(valor);
}

/**
 * «Rol: Analista QA → Líder QA» en lenguaje natural (no JSON). Solo describe campos de la lista blanca y nunca
 * una clave que contenga `password`, `token` o `secret`.
 */
export function describirCambios(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null): string[] {
  const claves = new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})]);
  const lineas: string[] = [];
  for (const clave of claves) {
    if (CLAVE_SENSIBLE.test(clave) || !(clave in ETIQUETA_CAMPO)) continue;
    const a = antes && clave in antes ? textoValor(clave, antes[clave]) : null;
    const d = despues && clave in despues ? textoValor(clave, despues[clave]) : null;
    lineas.push(a !== null && d !== null ? `${ETIQUETA_CAMPO[clave]}: ${a} → ${d}` : `${ETIQUETA_CAMPO[clave]}: ${d ?? a}`);
  }
  return lineas;
}

/** Valores de la bitácora de checklist (`estado`, `completado`…) como texto, sin claves sensibles. */
export function describirValor(valor: Record<string, unknown> | null): string {
  if (!valor) return "—";
  const partes = Object.entries(valor)
    .filter(([clave]) => !CLAVE_SENSIBLE.test(clave))
    .map(([clave, v]) => `${clave}: ${typeof v === "object" ? "…" : String(v)}`);
  return partes.length ? partes.join(", ") : "—";
}
