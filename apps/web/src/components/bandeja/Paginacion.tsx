import { TAMANOS_PAGINA } from "@/lib/filtrosUrl";

interface Props {
  clave: string;
  etiqueta: string;
  total: number;
  pagina: number;
  tamano: number;
  onPagina: (pagina: number) => void;
  onTamano?: (tamano: number) => void;
}

/** Paginación del servidor (25 por defecto, máx. 100). Los botones son `type="button"` (el Auditor no tiene submit). */
export function Paginacion({ clave, etiqueta, total, pagina, tamano, onPagina, onTamano }: Props) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = Math.min(total, pagina * tamano);
  return (
    <nav className="paginacion" aria-label={`Paginación de ${etiqueta}`} data-testid={`paginacion-${clave}`}>
      <span>
        Mostrando {desde}–{hasta} de {total}
      </span>
      <span className="paginacion__botones">
        <button
          type="button"
          className="boton boton--secundario"
          data-testid={`pagina-anterior-${clave}`}
          disabled={pagina <= 1}
          onClick={() => onPagina(pagina - 1)}
        >
          ◀ Anterior
        </button>
        <span>
          Página {pagina} de {paginas}
        </span>
        <button
          type="button"
          className="boton boton--secundario"
          data-testid={`pagina-siguiente-${clave}`}
          disabled={pagina >= paginas}
          onClick={() => onPagina(pagina + 1)}
        >
          Siguiente ▶
        </button>
      </span>
      {onTamano && total > TAMANOS_PAGINA[0] ? (
        <span className="paginacion__tamano">
          <label htmlFor={`tamano-${clave}`}>Filas por página </label>
          <select
            id={`tamano-${clave}`}
            data-testid={`selector-tamano-${clave}`}
            value={tamano}
            onChange={(evento) => onTamano(Number(evento.target.value))}
          >
            {TAMANOS_PAGINA.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
        </span>
      ) : null}
    </nav>
  );
}
