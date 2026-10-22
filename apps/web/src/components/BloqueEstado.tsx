export type EstadoBloque = "cargando" | "error" | "vacio" | "indisponible";

interface Props {
  /** Identifica el bloque dentro de la pantalla (p.ej. "equipo", "hdu-qe", "usuarios-admin"). */
  id: string;
  estado: EstadoBloque;
  mensaje?: string;
  onReintentar?: () => void;
  /** `exito` es el vacío positivo (p.ej. «No hay pendientes de configuración»). */
  tono?: "exito";
}

const MENSAJES: Record<EstadoBloque, string> = {
  cargando: "Cargando…",
  error: "Ocurrió un error al consultar la información.",
  vacio: "No hay información para mostrar.",
  indisponible: "Esta información no está disponible en este momento.",
};

/**
 * Los cuatro estados visibles de un bloque de datos (regla no negociable #4):
 * cargando, error, vacío (consulta exitosa sin resultados) e indisponible
 * (fuente caída). Un bloque indisponible nunca muestra `0`.
 */
export function BloqueEstado({ id, estado, mensaje, onReintentar, tono }: Props) {
  return (
    <div
      className={`bloque-estado bloque-estado--${estado}${tono === "exito" ? " bloque-estado--exito" : ""}`}
      data-testid={`bloque-${id}-${estado}`}
      role={estado === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <p>
        {estado === "indisponible" ? (
          <span aria-hidden="true" className="bloque-estado__icono">
            {"⛔ "}
          </span>
        ) : null}
        {mensaje ?? MENSAJES[estado]}
      </p>
      {(estado === "error" || estado === "indisponible") && onReintentar ? (
        <button type="button" className="boton boton--secundario" onClick={onReintentar}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
