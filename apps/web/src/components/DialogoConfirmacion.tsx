import type { ReactNode } from "react";

interface Props {
  abierto: boolean;
  titulo: string;
  children?: ReactNode;
  etiquetaConfirmar?: string;
  etiquetaCancelar?: string;
  peligro?: boolean;
  deshabilitado?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Diálogo de confirmación reutilizado por desactivar usuario, cambiar rol, reasignar QE y reasignar analista. */
export function DialogoConfirmacion({
  abierto,
  titulo,
  children,
  etiquetaConfirmar = "Confirmar",
  etiquetaCancelar = "Cancelar",
  peligro = false,
  deshabilitado = false,
  onConfirmar,
  onCancelar,
}: Props) {
  if (!abierto) return null;

  return (
    <div className="capa-dialogo" onClick={onCancelar}>
      <div
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-dialogo-confirmacion"
        onClick={(evento) => evento.stopPropagation()}
      >
        <h2 id="titulo-dialogo-confirmacion">{titulo}</h2>
        {children}
        <div className="dialogo-acciones">
          <button type="button" className="boton boton--secundario" onClick={onCancelar}>
            {etiquetaCancelar}
          </button>
          <button
            type="button"
            className={`boton ${peligro ? "boton--peligro" : "boton--primario"}`}
            onClick={onConfirmar}
            disabled={deshabilitado}
          >
            {etiquetaConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
