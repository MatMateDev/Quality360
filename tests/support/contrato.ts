import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse } from "yaml";
import { RAIZ_REPO } from "./env";

/**
 * Validación de respuestas contra `contracts/*.yaml` (fuente de verdad, no los bundles de `dist/`).
 * Carga los documentos fuente (comun, organizacion, certificaciones, gateway e impedimentos) como esquemas JSON (OpenAPI 3.1 usa JSON Schema 2020-12) y resuelve
 * los `$ref` entre archivos (`./comun.v1.yaml#/components/schemas/X`). Las `additionalProperties: false`
 * del contrato se respetan, así que un campo no declarado en la respuesta es un incumplimiento.
 */
const BASE = "https://quality360.local/contracts/";
const ARCHIVOS = ["comun.v1.yaml", "organizacion.v1.yaml", "certificaciones.v1.yaml", "gateway.v1.yaml", "impedimentos.v1.yaml"] as const;
export type ArchivoContrato = (typeof ARCHIVOS)[number] extends `${infer N}.v1.yaml` ? N : never;

let ajv: Ajv2020 | undefined;

function instancia(): Ajv2020 {
  if (ajv) return ajv;
  ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  for (const archivo of ARCHIVOS) {
    const documento = parse(readFileSync(path.join(RAIZ_REPO, "contracts", archivo), "utf8")) as Record<string, unknown>;
    ajv.addSchema({ ...documento, $id: `${BASE}${archivo}` });
  }
  return ajv;
}

/** Devuelve los errores de validación (vacío = cumple) del cuerpo contra un esquema de `components.schemas`. */
export function erroresContrato(archivo: ArchivoContrato, esquema: string, cuerpo: unknown): string[] {
  const validador = instancia().getSchema(`${BASE}${archivo}.v1.yaml#/components/schemas/${esquema}`);
  if (!validador) throw new Error(`No existe el esquema ${esquema} en contracts/${archivo}.v1.yaml`);
  if (validador(cuerpo)) return [];
  return (validador.errors ?? []).slice(0, 8).map((e) => `${e.instancePath || "/"} ${e.message ?? ""} ${JSON.stringify(e.params)}`);
}

/** Por defecto los esquemas compartidos viven en `comun.v1.yaml`. */
export function cumpleContrato(esquema: string, cuerpo: unknown, archivo: ArchivoContrato = "comun"): { ok: boolean; errores: string[] } {
  const errores = erroresContrato(archivo, esquema, cuerpo);
  return { ok: errores.length === 0, errores };
}
