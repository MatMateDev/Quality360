import { useCelulas, useSprints } from "@/api/catalogos";
import { ESTADOS_HDU, ETIQUETAS_ESTADO_HDU } from "@/types/dominio";
import type { OpcionFiltro } from "./BarraFiltros";

/** Opciones de los selectores de célula, sprint y estado (los mismos catálogos que el resto del portal). */
export function useOpcionesCatalogo() {
  const celulas = useCelulas();
  const sprints = useSprints();
  const opcionesCelula: OpcionFiltro[] = celulas.data?.items.map((c) => ({ valor: c.id, etiqueta: c.nombre })) ?? [];
  const opcionesSprint: OpcionFiltro[] = sprints.data?.items.map((s) => ({ valor: s.id, etiqueta: s.nombre })) ?? [];
  const opcionesEstado: OpcionFiltro[] = ESTADOS_HDU.map((e) => ({ valor: e, etiqueta: ETIQUETAS_ESTADO_HDU[e] }));
  return { opcionesCelula, opcionesSprint, opcionesEstado };
}
