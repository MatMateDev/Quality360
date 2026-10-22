import { useId, useState } from "react";
import type { CatalogoRef } from "@/types/dominio";

interface Props {
  celulas: CatalogoRef[];
  seleccionadas: string[];
  onChange: (ids: string[]) => void;
  /** Con 0 seleccionadas se muestra el aviso de que el líder no verá ninguna HDU. */
  avisarSinCelulas?: boolean;
}

/**
 * Selección de las células a cargo de un Líder QA: `fieldset` con buscador y casillas, contador
 * `aria-live` y aviso con 0 seleccionadas. Los marcados se conservan al filtrar.
 */
export function SelectorCelulas({ celulas, seleccionadas, onChange, avisarSinCelulas = true }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const idBuscador = useId();
  const visibles = celulas.filter((c) => c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  function alternar(id: string) {
    onChange(seleccionadas.includes(id) ? seleccionadas.filter((x) => x !== id) : [...seleccionadas, id]);
  }

  return (
    <fieldset className="selector-celulas" data-testid="selector-celulas">
      <legend>Células a cargo</legend>
      <div className="campo">
        <label htmlFor={idBuscador}>Buscar célula</label>
        <input id={idBuscador} data-testid="buscador-celulas" type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} />
      </div>
      <p aria-live="polite" data-testid="contador-celulas-seleccionadas">
        {seleccionadas.length} {seleccionadas.length === 1 ? "seleccionada" : "seleccionadas"}
      </p>
      <div className="selector-celulas__opciones">
        {visibles.map((celula) => (
          <label key={celula.id}>
            <input
              type="checkbox"
              data-testid={`celula-opcion-${celula.id}`}
              checked={seleccionadas.includes(celula.id)}
              onChange={() => alternar(celula.id)}
            />
            {celula.nombre}
          </label>
        ))}
        {visibles.length === 0 ? <span>No hay células con ese nombre.</span> : null}
      </div>
      {avisarSinCelulas && seleccionadas.length === 0 ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-lider-sin-celulas">
          Este líder no verá ninguna HDU hasta que le asignes células.
        </p>
      ) : null}
    </fieldset>
  );
}
