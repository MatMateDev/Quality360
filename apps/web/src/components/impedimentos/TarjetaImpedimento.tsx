import { useId, useState } from "react";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_ROL, ETIQUETAS_TIPO_IMPEDIMENTO, type Impedimento, type OperacionImpedimento } from "@/types/dominio";
import { HistorialImpedimento } from "./HistorialImpedimento";
import { DiasAbierto, InsigniaEstadoImpedimento, InsigniaNuevo } from "./Insignias";

interface Props {
  impedimento: Impedimento;
  resaltado?: boolean;
  /** Abre el diálogo de la operación; el botón existe solo si el servidor la permite (D75). */
  onOperacion: (operacion: OperacionImpedimento, impedimento: Impedimento, disparador: HTMLElement) => void;
}

/**
 * Impedimento en el detalle de HDU (diseño E4 §2.2): título, tipo, descripción, metadatos, acciones y el historial
 * desplegable. Los botones salen de `operacionesPermitidas`: el portal no deduce la relación con la HDU (D75).
 */
export function TarjetaImpedimento({ impedimento: i, resaltado = false, onOperacion }: Props) {
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const idTitulo = `titulo-impedimento-${i.id}`;
  const idPanelHistorial = useId();
  const permitidas = new Set(i.operacionesPermitidas);
  const resuelto = i.estado === "RESUELTO";
  const reabierto = i.abiertoDesde !== i.fechaRegistro;

  const boton = (operacion: OperacionImpedimento, segmento: string, texto: string, accesible: string) =>
    permitidas.has(operacion) ? (
      <button
        type="button"
        className="boton boton--secundario"
        data-testid={`boton-${segmento}-${i.id}`}
        aria-label={`${accesible}: ${i.titulo}`}
        onClick={(evento) => onOperacion(operacion, i, evento.currentTarget)}
      >
        {texto}
      </button>
    ) : null;

  return (
    <li id={`impedimento-${i.id}`} data-testid={`impedimento-${i.id}`} className={`impedimento impedimento--${i.estado.toLowerCase()}${resaltado ? " impedimento--resaltado" : ""}`}>
      <article aria-labelledby={idTitulo}>
        <div className="impedimento__cabecera">
          <h3 id={idTitulo} tabIndex={-1}>
            {i.titulo}
          </h3>
          <div className="impedimento__insignias">
            <InsigniaEstadoImpedimento estado={i.estado} id={i.id} />
            {i.esNuevo ? <InsigniaNuevo /> : null}
            <DiasAbierto dias={i.diasAbierto} resuelto={resuelto} />
          </div>
        </div>
        <p className="impedimento__tipo">{ETIQUETAS_TIPO_IMPEDIMENTO[i.tipo]}</p>
        <p className="impedimento__descripcion">{i.descripcion}</p>
        <dl className="impedimento__meta">
          <div>
            <dt>Responsable</dt>
            <dd>
              {i.responsable.nombre}
              {i.responsable.externo ? " (externo)" : ""}
            </dd>
          </div>
          <div>
            <dt>Registrado por</dt>
            <dd>
              {i.creadoPor.nombre} · {ETIQUETAS_ROL[i.creadoPor.rol]}
            </dd>
          </div>
          <div>
            <dt>{reabierto ? "Abierto de nuevo desde" : "Abierto desde"}</dt>
            <dd>
              <time dateTime={i.abiertoDesde}>{formatearFecha(i.abiertoDesde)}</time>
            </dd>
          </div>
          {reabierto ? (
            <div>
              <dt>Registrado el</dt>
              <dd>
                <time dateTime={i.fechaRegistro}>{formatearFecha(i.fechaRegistro)}</time>
              </dd>
            </div>
          ) : null}
          {i.fechaResolucion ? (
            <div>
              <dt>Resuelto el</dt>
              <dd>
                <time dateTime={i.fechaResolucion}>{formatearFecha(i.fechaResolucion)}</time>
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="impedimento__acciones">
          {boton("RESOLVER", "resolver", "Resolver", "Resolver impedimento")}
          {boton("ESCALAR", "escalar", i.estado === "ESCALADO" ? "Escalar a otro" : "Escalar", i.estado === "ESCALADO" ? "Escalar a otro destino el impedimento" : "Escalar impedimento")}
          {boton("SEGUIMIENTO", "seguimiento", "Agregar seguimiento", "Agregar seguimiento a")}
          {boton("REABRIR", "reabrir", "Reabrir", "Reabrir impedimento")}
          <span className="espaciador" />
          <button
            type="button"
            className="boton boton--secundario"
            data-testid={`boton-ver-historial-${i.id}`}
            aria-expanded={historialAbierto}
            aria-controls={idPanelHistorial}
            aria-label={`${historialAbierto ? "Ocultar" : "Ver"} historial de: ${i.titulo}`}
            onClick={() => setHistorialAbierto((v) => !v)}
          >
            <span aria-hidden="true">{historialAbierto ? "▾" : "▸"}</span> {historialAbierto ? "Ocultar historial" : "Ver historial"}
          </button>
        </div>
        <div id={idPanelHistorial} hidden={!historialAbierto}>
          {historialAbierto ? <HistorialImpedimento id={i.id} /> : null}
        </div>
      </article>
    </li>
  );
}
