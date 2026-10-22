import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { OrdenUrl } from "@/lib/filtrosUrl";

export interface Columna<T> {
  id: string;
  titulo: string;
  /** Si es verdadero, el encabezado es un botón con `aria-sort`. */
  ordenable?: boolean;
  render: (item: T) => ReactNode;
}

interface Props<T> {
  /** `data-testid` de la tabla, p. ej. `lista-mis-hdu`. */
  testId: string;
  caption: string;
  columnas: Columna<T>[];
  items: T[];
  clave: (item: T) => string;
  testIdFila?: (item: T) => string;
  /** Si se indica, toda la fila es clicable y navega allí (el enlace del código sigue siendo el tope de tab). */
  hrefFila?: (item: T) => string;
  resaltar?: (item: T) => boolean;
  orden?: OrdenUrl | null;
  onOrden?: (columna: string, direccion: "asc" | "desc") => void;
  /** Cambia cuando cambia la página: el foco pasa al caption (§1.4). */
  focoPagina?: number;
}

/**
 * Tabla genérica de bandeja: `caption`, `scope="col"`, columnas ordenables con `aria-sort`, fila navegable y
 * modo apilable ≤ 640 px (con roles ARIA repuestos para no perder la semántica de tabla).
 */
export function TablaBandeja<T>({ testId, caption, columnas, items, clave, testIdFila, hrefFila, resaltar, orden, onOrden, focoPagina }: Props<T>) {
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const captionRef = useRef<HTMLHeadingElement>(null);
  const idTitulo = useId();
  const primeraVez = useRef(true);

  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    captionRef.current?.focus();
  }, [focoPagina]);

  function alternar(columna: string) {
    const direccion = orden?.columna === columna && orden.direccion === "asc" ? "desc" : "asc";
    onOrden?.(columna, direccion);
  }

  function abrirFila(evento: MouseEvent, item: T) {
    if (!hrefFila) return;
    if ((evento.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    navigate(hrefFila(item), { state: { desde: `${ubicacion.pathname}${ubicacion.search}` } });
  }

  return (
    <div className="tabla-contenedor">
      {/* El foco al paginar va a este encabezado, fuera de la tabla (un caption con tabindex rompe aria-required-children). */}
      <h3 className="sr-only" id={idTitulo} ref={captionRef} tabIndex={-1}>
        {caption}
      </h3>
      <table className="tabla--apilable" data-testid={testId} role="table" aria-labelledby={idTitulo}>
        <thead role="rowgroup">
          <tr role="row">
            {columnas.map((columna) => {
              const activa = orden?.columna === columna.id;
              const sort = columna.ordenable ? (activa ? (orden!.direccion === "asc" ? "ascending" : "descending") : "none") : undefined;
              return (
                <th key={columna.id} scope="col" role="columnheader" aria-sort={sort} className={columna.ordenable ? "th-ordenable" : undefined}>
                  {columna.ordenable ? (
                    <button type="button" onClick={() => alternar(columna.id)}>
                      {columna.titulo}
                      <span aria-hidden="true">{activa ? (orden!.direccion === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  ) : (
                    columna.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((item) => (
            <tr
              key={clave(item)}
              role="row"
              data-testid={testIdFila?.(item)}
              className={[hrefFila ? "fila-navegable" : "", resaltar?.(item) ? "fila-resaltada" : ""].filter(Boolean).join(" ") || undefined}
              onClick={hrefFila ? (evento) => abrirFila(evento, item) : undefined}
            >
              {columnas.map((columna) => (
                <td key={columna.id} role="cell" data-label={columna.titulo}>
                  {columna.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
