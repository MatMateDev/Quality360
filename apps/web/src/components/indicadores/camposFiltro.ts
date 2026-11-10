import type { CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { SIN_SPRINT, type OpcionesFiltroIndicadores } from "@/types/dominio";

export function campoCelula(opciones: OpcionesFiltroIndicadores | undefined): CampoFiltro {
  return {
    clave: "celula",
    id: "filtro-celula",
    etiqueta: "Célula",
    tipo: "select",
    vacio: "Todas las células",
    opciones: (opciones?.celulas ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre })),
  };
}

/** «Sin sprint» solo aparece si hay HDU sin sprint (D180); los sprints cerrados llevan «(cerrado)». */
export function campoSprint(opciones: OpcionesFiltroIndicadores | undefined): CampoFiltro {
  const sprints = (opciones?.sprints ?? []).map((s) => ({ valor: s.id, etiqueta: s.cerrado ? `${s.nombre} (cerrado)` : s.nombre }));
  if ((opciones?.hduSinSprint ?? 0) > 0) sprints.push({ valor: SIN_SPRINT, etiqueta: "Sin sprint" });
  return { clave: "sprint", id: "filtro-sprint", etiqueta: "Sprint", tipo: "select", vacio: "Todos los sprints", opciones: sprints };
}
