import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import type { FiltrosIndicadores } from "@/api/indicadores";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import type { OpcionesFiltroIndicadores, Rol } from "@/types/dominio";

/** Lo que la página común comparte con cada pestaña (diseño E6 §2.4 y §12.1). */
export interface ContextoIndicadores {
  rol: Rol;
  /** Líder y Auditor: los controles de escritura no existen (D39). */
  soloLectura: boolean;
  /** Prefijo de ruta del rol (`/qe/indicadores`). */
  base: string;
  filtros: FiltrosUrl;
  opciones: UseQueryResult<OpcionesFiltroIndicadores>;
  /** La pestaña activa informa la hora del servidor de sus datos y si está cargando (para «Datos al…» y «Exportar»). */
  informarVista: (vista: { generadoEn: string | null; cargando: boolean }) => void;
}

export function useContextoIndicadores(): ContextoIndicadores {
  return useOutletContext<ContextoIndicadores>();
}

/** Lee los filtros de la URL con las claves del contrato. */
export function filtrosDeUrl(filtros: FiltrosUrl): FiltrosIndicadores {
  return {
    celulaId: filtros.get("celula") || undefined,
    sprintId: filtros.get("sprint") || undefined,
    desde: filtros.get("desde") || undefined,
    hasta: filtros.get("hasta") || undefined,
  };
}

/** Informa a la página común el estado de la vista; se limpia al desmontar. */
export function useInformarVista(generadoEn: string | null | undefined, cargando: boolean): void {
  const { informarVista } = useContextoIndicadores();
  useEffect(() => {
    informarVista({ generadoEn: generadoEn ?? null, cargando });
  }, [informarVista, generadoEn, cargando]);
  useEffect(() => () => informarVista({ generadoEn: null, cargando: true }), [informarVista]);
}
