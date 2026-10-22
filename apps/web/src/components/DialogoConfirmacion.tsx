import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  abierto: boolean;
  titulo: string;
  children?: ReactNode;
  etiquetaConfirmar?: string;
  etiquetaCancelar?: string;
  peligro?: boolean;
  deshabilitado?: boolean;
  /** `false` evita que un clic en el fondo cierre el diálogo (hay cambios sin guardar). */
  cerrarAlClicFuera?: boolean;
  /** `data-testid` del contenedor del diálogo. */
  testId?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

const FOCALIZABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo de confirmación reutilizado por desactivar usuario, cambiar rol, reasignar QE y reasignar analista.
 * Accesible: `aria-labelledby` único, Esc cierra, el foco queda atrapado y vuelve al control que lo abrió.
 */
export function DialogoConfirmacion({
  abierto,
  titulo,
  children,
  etiquetaConfirmar = "Confirmar",
  etiquetaCancelar = "Cancelar",
  peligro = false,
  deshabilitado = false,
  cerrarAlClicFuera = true,
  testId,
  onConfirmar,
  onCancelar,
}: Props) {
  const idTitulo = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const cancelarRef = useRef(onCancelar);
  cancelarRef.current = onCancelar;

  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const primero = contenedor.current?.querySelector<HTMLElement>("input, select, textarea, button");
    primero?.focus();
    return () => {
      if (anterior && document.contains(anterior)) anterior.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  function manejarTeclado(evento: React.KeyboardEvent) {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      cancelarRef.current();
      return;
    }
    if (evento.key !== "Tab" || !contenedor.current) return;
    const elementos = Array.from(contenedor.current.querySelectorAll<HTMLElement>(FOCALIZABLES));
    if (elementos.length === 0) return;
    const primero = elementos[0]!;
    const ultimo = elementos[elementos.length - 1]!;
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  return (
    <div className="capa-dialogo" onClick={cerrarAlClicFuera ? onCancelar : undefined}>
      <div
        ref={contenedor}
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        data-testid={testId}
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={manejarTeclado}
      >
        <h2 id={idTitulo}>{titulo}</h2>
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
