import { useMemo, useRef } from "react";
import type { ItemBandejaHdu } from "@/types/dominio";
import type { OpcionFiltro } from "./BarraFiltros";

function aOpciones(m: Map<string, string>): OpcionFiltro[] {
  return [...m.entries()].map(([valor, etiqueta]) => ({ valor, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
}

/**
 * Opciones de un filtro por persona o recurso cuando no existe un catálogo para el rol (Líder y Auditor no
 * pueden llamar a `GET /v1/usuarios`, que es del Administrador). Se arman con lo que ya aparece en las filas
 * vistas y se acumulan mientras dura la pantalla. Es una brecha del contrato (se informa en el reporte).
 */
export function useOpcionesAcumuladas(pares: ReadonlyArray<readonly [string, string]> | undefined): OpcionFiltro[] {
  const acumulado = useRef(new Map<string, string>());
  return useMemo(() => {
    for (const [id, nombre] of pares ?? []) acumulado.current.set(id, nombre);
    return aOpciones(acumulado.current);
  }, [pares]);
}

/** QE responsable y Analista de las bandejas de HDU del Líder y del Auditor. */
export function useUsuariosOpciones(items: ItemBandejaHdu[] | undefined) {
  const qes = useMemo(() => items?.map((h) => [h.qeResponsable.id, h.qeResponsable.nombre] as const), [items]);
  const analistas = useMemo(
    () => items?.filter((h) => h.analista).map((h) => [h.analista!.id, h.analista!.nombre] as const),
    [items],
  );
  return { opcionesQe: useOpcionesAcumuladas(qes), opcionesAnalista: useOpcionesAcumuladas(analistas) };
}
