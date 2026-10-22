import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type DireccionOrden = "asc" | "desc";

export interface OrdenUrl {
  columna: string;
  direccion: DireccionOrden;
}

export const TAMANOS_PAGINA = [25, 50, 100] as const;

/** Lee `columna:asc|desc`; un valor mal formado se ignora (nunca rompe la pantalla). */
export function leerOrden(valor: string | null): OrdenUrl | null {
  if (!valor) return null;
  const [columna, direccion] = valor.split(":");
  if (!columna || (direccion !== "asc" && direccion !== "desc")) return null;
  return { columna, direccion };
}

function entero(valor: string | null, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

/**
 * Filtros, orden, página y pestaña viven en la query string (diseño E7 §1.4): «atrás» y compartir el enlace
 * funcionan. Cambiar un filtro devuelve a la página 1. Los parámetros desconocidos se conservan y los
 * inválidos los descarta la conversión de `src/api/bandejas.ts`.
 */
export function useFiltrosUrl() {
  const [params, setParams] = useSearchParams();

  const get = useCallback((clave: string) => params.get(clave) ?? "", [params]);

  const set = useCallback(
    (cambios: Record<string, string | undefined>) => {
      setParams((previos) => {
        const siguientes = new URLSearchParams(previos);
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor) siguientes.set(clave, valor);
          else siguientes.delete(clave);
        }
        if (!("pagina" in cambios)) siguientes.delete("pagina");
        return siguientes;
      });
    },
    [setParams],
  );

  const limpiar = useCallback(
    (claves: string[]) => set(Object.fromEntries(claves.map((clave) => [clave, undefined]))),
    [set],
  );

  const orden = useMemo(() => leerOrden(params.get("orden")), [params]);
  const pagina = entero(params.get("pagina"), 1);
  const tamano = entero(params.get("tamano"), 25);

  return { params, get, set, limpiar, orden, pagina, tamano };
}

export type FiltrosUrl = ReturnType<typeof useFiltrosUrl>;

export function hayFiltrosActivos(filtros: FiltrosUrl, claves: string[]): boolean {
  return claves.some((clave) => filtros.get(clave) !== "");
}
