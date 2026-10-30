import { forwardRef } from "react";
import { formatearTamano } from "@/lib/textosEjecucion";

interface Props {
  archivo: { nombre: string; tamano: number } | null;
  deshabilitado: boolean;
  /** Cambia para vaciar el `<input>` al quitar el archivo (un mismo archivo puede volver a elegirse). */
  claveInput: number;
  onElegir: (archivo: File) => void;
  onQuitar: () => void;
}

/**
 * Selector nativo de archivo (sin zona de arrastre: lo que el teclado no pueda igualar no se agrega). Muestra el
 * nombre y el tamaño y permite quitarlo.
 */
export const SelectorArchivo = forwardRef<HTMLInputElement, Props>(function SelectorArchivo({ archivo, deshabilitado, claveInput, onElegir, onQuitar }, ref) {
  return (
    <div className="campo">
      <label htmlFor="selector-archivo">Archivo CSV o JSON</label>
      <input
        key={claveInput}
        ref={ref}
        id="selector-archivo"
        data-testid="selector-archivo"
        type="file"
        accept=".csv,.json"
        disabled={deshabilitado}
        aria-describedby="ayuda-selector-archivo"
        onChange={(evento) => {
          const elegido = evento.target.files?.[0];
          if (elegido) onElegir(elegido);
        }}
      />
      <span className="campo-ayuda" id="ayuda-selector-archivo">
        CSV (separador , o ;) o JSON. UTF-8. Máximo 1 MB y 500 filas.
      </span>
      {archivo ? (
        <div className="archivo-seleccionado">
          <span data-testid="archivo-seleccionado">
            <span className="celda-titulo-corta" title={archivo.nombre}>
              {archivo.nombre}
            </span>{" "}
            · {formatearTamano(archivo.tamano)}
          </span>
          <button type="button" className="boton boton--secundario" data-testid="boton-quitar-archivo" disabled={deshabilitado} onClick={onQuitar}>
            Quitar archivo
          </button>
        </div>
      ) : null}
    </div>
  );
});
