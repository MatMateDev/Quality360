import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AccesoDenegado } from "@/components/AccesoDenegado";
import { BloqueEstado } from "@/components/BloqueEstado";
import { ErrorApi } from "@/lib/httpClient";

export type EstadoConsulta = "cargando" | "error" | "indisponible" | "denegado" | "ok";

/**
 * Reglas de red de E6 §10.3: 503 `SERVICIO_NO_DISPONIBLE` o falla de red al leer = no disponible; otro 5xx = error;
 * 403 = acceso denegado. Mientras se vuelve a pedir (cambio de filtro) cuenta como cargando: nunca se mezclan
 * cifras del filtro anterior con las del nuevo (§1.7).
 */
export function estadoDeConsulta(q: UseQueryResult<unknown>): EstadoConsulta {
  if (q.isError) {
    const e = q.error;
    if (e instanceof ErrorApi && e.status === 403) return "denegado";
    if (e instanceof ErrorApi && e.status === 503) return "indisponible";
    return "error";
  }
  if (q.isPending || q.isPlaceholderData) return "cargando";
  return "ok";
}

interface Props {
  clave: string;
  consulta: UseQueryResult<unknown>;
  /** Contenido cuando la consulta salió bien. */
  children: ReactNode;
  esqueleto?: ReactNode;
}

/** Cuatro estados de un bloque: cargando, error, indisponible y acceso denegado; el vacío lo decide cada pantalla. */
export function BloqueConsulta({ clave, consulta, children, esqueleto }: Props) {
  const estado = estadoDeConsulta(consulta);
  if (estado === "ok") return <>{children}</>;
  if (estado === "denegado") return <AccesoDenegado variante="seccion" />;
  if (estado === "cargando") {
    return (
      <div data-testid={`estado-cargando-${clave}`} aria-busy="true">
        <BloqueEstado id={clave} estado="cargando" />
        {esqueleto ?? (
          <div aria-hidden="true">
            <span className="esqueleto-fila" />
            <span className="esqueleto-fila" />
            <span className="esqueleto-fila" />
          </div>
        )}
      </div>
    );
  }
  return (
    <div data-testid={`estado-${estado}-${clave}`}>
      <BloqueEstado
        id={clave}
        estado={estado}
        mensaje={estado === "indisponible" ? "No disponible" : "No pudimos consultar los indicadores. Intenta nuevamente."}
        onReintentar={() => void consulta.refetch()}
      />
    </div>
  );
}

/** Mensaje de «sin datos» (consulta exitosa sin resultados): sin cifras, sin «0 %». */
export function SinDatos({ mensaje, onLimpiar }: { mensaje: string; onLimpiar?: () => void }) {
  return (
    <div data-testid="estado-sin-datos">
      <BloqueEstado id="indicadores-sin-datos" estado="vacio" mensaje={mensaje} />
      {onLimpiar ? (
        <button type="button" className="boton boton--secundario" onClick={onLimpiar}>
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}

/** Aviso único `role="status"` cuando una fuente cayó (varias tarjetas lo comparten). */
export function AvisoFuenteNoDisponible({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="mensaje-aviso aviso-fuente" role="status" data-testid="aviso-fuente-no-disponible">
      <span data-testid="mensaje-aviso">{mensaje}</span>{" "}
      <button type="button" className="boton boton--secundario" onClick={onReintentar}>
        Reintentar
      </button>
    </div>
  );
}
