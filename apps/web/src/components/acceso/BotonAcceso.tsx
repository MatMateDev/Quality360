import type { ReactNode } from "react";
import { Cargando } from "./Iconos";

interface PropsBotonAcceso {
  ocupado: boolean;
  /** Texto en reposo, p. ej. «Ingresar». */
  texto: string;
  /** Texto mientras trabaja, p. ej. «Ingresando…». */
  textoOcupado: string;
  /** Elemento `role="status"` (solo para lectores de pantalla) que anuncia el progreso. */
  indicador?: ReactNode;
}

/**
 * Botón principal de envío. Ocupado: queda deshabilitado con `aria-busy`, spinner y texto dentro del
 * botón, de modo que el formulario no cambia de alto y no puede enviarse dos veces.
 */
export function BotonAcceso({ ocupado, texto, textoOcupado, indicador }: PropsBotonAcceso) {
  return (
    <>
      <button type="submit" className="acceso-boton" disabled={ocupado} aria-busy={ocupado}>
        {ocupado ? (
          <>
            <Cargando />
            {textoOcupado}
          </>
        ) : (
          texto
        )}
      </button>
      {indicador}
    </>
  );
}
