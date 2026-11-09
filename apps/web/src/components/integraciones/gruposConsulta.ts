import type { GrupoConsulta } from "@/types/dominio";

export interface DefinicionGrupo {
  grupo: GrupoConsulta;
  clave: "nuevas" | "cambiaron" | "sin-cambios" | "con-error";
  titulo: string;
}

export const GRUPOS: DefinicionGrupo[] = [
  { grupo: "NUEVA", clave: "nuevas", titulo: "Nuevas" },
  { grupo: "CAMBIO", clave: "cambiaron", titulo: "Cambiaron en Jira" },
  { grupo: "SIN_CAMBIOS", clave: "sin-cambios", titulo: "Sin cambios" },
  { grupo: "CON_ERROR", clave: "con-error", titulo: "Con error" },
];
