import { forwardRef } from "react";
import { SemaforoRiesgo } from "@/components/impedimentos/SemaforoRiesgo";
import type { SemaforoCelula } from "@/types/dominio";
import { SemaforoCelda, claseColor, claveSemaforo } from "./SemaforoCelda";

interface Props {
  celula: SemaforoCelula;
  seleccionada: boolean;
  onVerDetalle: () => void;
}

/** Tarjeta de célula del semáforo (E6-F02). `data-color` y `tarjeta-celula-<celulaId>` son los del backlog (D191). */
export const TarjetaCelula = forwardRef<HTMLButtonElement, Props>(function TarjetaCelula({ celula, seleccionada, onVerDetalle }, ref) {
  const clave = claveSemaforo(celula);
  const nombre = celula.celula.nombre;
  const conDatos = clave === "ROJO" || clave === "AMARILLO" || clave === "VERDE";
  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <>
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </>
  );

  return (
    <article
      className={`tarjeta-celula tarjeta-celula--${claseColor(clave)}${seleccionada ? " tarjeta-celula--seleccionada" : ""}`}
      data-testid={`tarjeta-celula-${celula.celula.id}`}
      data-color={clave}
    >
      <h3>{nombre}</h3>
      <SemaforoCelda clave={clave} alMenos={celula.alMenos === "AMARILLO"} />

      {clave === "ROJO" && celula.calculoParcial ? (
        <p className="mensaje-aviso" role="note" data-testid="aviso-calculo-parcial">
          Cálculo parcial: hay un factor rojo confirmado, pero faltan datos de avance para evaluar el resto.
        </p>
      ) : null}
      {clave === "NO_DISPONIBLE" ? (
        <p className="campo-ayuda">
          No pudimos calcular el riesgo de esta célula. No se asume que esté en orden.
          {celula.alMenos === "AMARILLO" ? " Ya hay un factor amarillo confirmado." : ""}
        </p>
      ) : null}

      {clave === "SIN_HDU" ? (
        <p>Sin HDU en tu ámbito</p>
      ) : (
        <dl>
          {fila("Riesgo máximo", conDatos && celula.riesgoMaximo ? <SemaforoRiesgo nivel={celula.riesgoMaximo} /> : conDatos ? "—" : "—")}
          {fila("Impedimentos abiertos", conDatos ? (celula.impedimentosAbiertos ?? "—") : "—")}
          {fila("Impedimentos escalados", conDatos ? (celula.impedimentosEscalados ?? "—") : "—")}
        </dl>
      )}

      {clave !== "SIN_HDU" ? (
        <>
          <button
            ref={ref}
            type="button"
            className="boton boton--secundario"
            data-testid={`boton-ver-detalle-${celula.celula.id}`}
            aria-expanded={seleccionada}
            aria-controls="lista-drilldown"
            onClick={onVerDetalle}
          >
            Ver HDU de {nombre}
          </button>
          {seleccionada ? <span className="campo-ayuda"> Detalle abierto</span> : null}
        </>
      ) : null}
    </article>
  );
});
