import { useEffect, useId, useState } from "react";
import type { FiltrosUrl } from "@/lib/filtrosUrl";

export interface OpcionFiltro {
  valor: string;
  etiqueta: string;
}

export interface CampoFiltro {
  /** Clave en la query string (`celula`, `estado`, `q`…). */
  clave: string;
  /** `id` del control (`filtro-celula`…). */
  id: string;
  etiqueta: string;
  tipo: "select" | "texto" | "fecha" | "casilla";
  opciones?: OpcionFiltro[];
  /** Texto de la opción vacía de un select. */
  vacio?: string;
}

interface Props {
  filtros: FiltrosUrl;
  campos: CampoFiltro[];
  /** Clave de la bandeja para `total-<clave>`. */
  clave: string;
  /** Si se indica, se muestra «N resultados» con `role="status"`. */
  total?: number;
  etiquetaPlural?: string;
}

function BuscadorTexto({ campo, valor, onCambio }: { campo: CampoFiltro; valor: string; onCambio: (valor: string) => void }) {
  const [local, setLocal] = useState(valor);
  useEffect(() => setLocal(valor), [valor]);
  useEffect(() => {
    if (local === valor) return;
    const temporizador = setTimeout(() => onCambio(local), 300);
    return () => clearTimeout(temporizador);
  }, [local, valor, onCambio]);
  return (
    <input
      id={campo.id}
      data-testid={campo.id}
      type="search"
      value={local}
      onChange={(evento) => setLocal(evento.target.value)}
    />
  );
}

/**
 * Barra de filtros sincronizada con la URL: se aplican al cambiar (la búsqueda con 300 ms de espera), no es un
 * `<form>` ni hay `button[type=submit]`. Muestra chips de filtros activos, «Limpiar filtros» y el recuento.
 */
export function BarraFiltros({ filtros, campos, clave, total, etiquetaPlural = "resultados" }: Props) {
  const [plegado, setPlegado] = useState(true);
  const idPanel = useId();

  const activos = campos
    .map((campo) => {
      const valor = filtros.get(campo.clave);
      if (!valor) return null;
      const opcion = campo.opciones?.find((o) => o.valor === valor);
      if (campo.tipo === "select" && !opcion) return null;
      const texto = campo.tipo === "casilla" ? campo.etiqueta : `${campo.etiqueta}: ${opcion?.etiqueta ?? valor}`;
      return { campo, texto };
    })
    .filter((x): x is { campo: CampoFiltro; texto: string } => x !== null);

  return (
    <div>
      <button
        type="button"
        className="boton boton--secundario filtros-toggle"
        data-testid="boton-filtros"
        aria-expanded={!plegado}
        aria-controls={idPanel}
        onClick={() => setPlegado((v) => !v)}
      >
        Filtros ({activos.length})
      </button>
      <div className={`filtros${plegado ? " filtros--plegado" : ""}`} id={idPanel} role="group" aria-label="Filtros">
        {campos.map((campo) => {
          const valor = filtros.get(campo.clave);
          if (campo.tipo === "casilla") {
            return (
              <div className="campo" key={campo.clave}>
                <label htmlFor={campo.id}>
                  <input
                    id={campo.id}
                    data-testid={campo.id}
                    type="checkbox"
                    checked={valor === "1"}
                    onChange={(evento) => filtros.set({ [campo.clave]: evento.target.checked ? "1" : undefined })}
                  />{" "}
                  {campo.etiqueta}
                </label>
              </div>
            );
          }
          return (
            <div className="campo" key={campo.clave}>
              <label htmlFor={campo.id}>{campo.etiqueta}</label>
              {campo.tipo === "select" ? (
                <select
                  id={campo.id}
                  data-testid={campo.id}
                  value={campo.opciones?.some((o) => o.valor === valor) ? valor : ""}
                  onChange={(evento) => filtros.set({ [campo.clave]: evento.target.value || undefined })}
                >
                  <option value="">{campo.vacio ?? "Todos"}</option>
                  {campo.opciones?.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </select>
              ) : campo.tipo === "fecha" ? (
                <input
                  id={campo.id}
                  data-testid={campo.id}
                  type="date"
                  value={valor}
                  onChange={(evento) => filtros.set({ [campo.clave]: evento.target.value || undefined })}
                />
              ) : (
                <BuscadorTexto campo={campo} valor={valor} onCambio={(v) => filtros.set({ [campo.clave]: v || undefined })} />
              )}
            </div>
          );
        })}
      </div>

      <div className="filtros-resumen">
        {activos.length > 0 ? (
          <ul className="chips" aria-label="Filtros activos">
            {activos.map(({ campo, texto }) => (
              <li className="chip" key={campo.clave}>
                {texto}
                <button
                  type="button"
                  className="chip--quitar"
                  aria-label={`Quitar filtro ${texto}`}
                  onClick={() => filtros.set({ [campo.clave]: undefined })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {activos.length > 0 ? (
          <button
            type="button"
            className="boton boton--secundario"
            data-testid="boton-limpiar-filtros"
            onClick={() => filtros.limpiar(campos.map((c) => c.clave))}
          >
            Limpiar filtros
          </button>
        ) : null}
        {total !== undefined ? (
          <p role="status" data-testid={`total-${clave}`} style={{ margin: 0 }}>
            {total} {total === 1 && etiquetaPlural === "resultados" ? "resultado" : etiquetaPlural}
          </p>
        ) : null}
      </div>
    </div>
  );
}

