import { useState } from "react";
import { textoFalta } from "@/lib/mensajesAsignacion";
import { ETIQUETAS_PRIORIDAD, type ItemConsulta } from "@/types/dominio";
import { ChipsAdvertencias } from "./Insignias";
import { SeccionAsignacion } from "./SeccionAsignacion";
import { useAsignacionFila } from "./useAsignacionFila";

interface Props {
  item: ItemConsulta;
  consultaId: string;
  seleccionada: boolean;
  onSeleccion: (id: string, valor: boolean) => void;
  onAnunciar: (mensaje: string) => void;
  /** Devuelve `true` si el error ya se resolvió a nivel de la consulta (cerrada, reemplazada, sin permiso). */
  onErrorDeConsulta: (error: unknown) => boolean;
  /** La `version` que devolvió el servidor tras una edición propia (para detectar cambios ajenos antes de confirmar). */
  onVersion?: (version: number) => void;
  soloLectura?: boolean;
  /** Abre el panel de detalle de esta fila (E5-F06). */
  onVerDetalle?: (item: ItemConsulta) => void;
  /** La fila quedó creada con «Confirmar asignación»: el grupo mueve el foco a la siguiente. */
  alCrear?: (item: ItemConsulta) => void;
}

/**
 * Tarjeta-fila de una fila «Nueva» (diseño base §4.3 y §4.6; detalle §3): cabecera con «Ver detalle», cuatro selectores,
 * aviso de asignación automática, estado por texto y «Confirmar asignación». Guarda por cambio.
 */
export function TarjetaFilaNueva({ item, consultaId, seleccionada, onSeleccion, onAnunciar, onErrorDeConsulta, onVersion, soloLectura = false, onVerDetalle, alCrear }: Props) {
  const fila = useAsignacionFila({ item, consultaId, onAnunciar, onErrorDeConsulta, onVersion, alCrear });
  const [ampliado, setAmpliado] = useState(false);
  const codigo = item.codigo ?? "—";
  const creada = item.aplicada;

  function alternarMarca(marcar: boolean) {
    if (!item.marcable && marcar) {
      onAnunciar(item.faltantes.length > 0 ? textoFalta(item.faltantes) : "Esta fila no se puede incluir.");
      return;
    }
    void fila.enviar({ itemIds: [item.id], marcada: marcar });
  }

  const clase = `fila-asignacion fila-asignacion--${fila.estado.clase === "lista" ? (item.marcada ? "marcada" : "lista") : fila.estado.clase}`;
  const descripcion = item.descripcion?.trim();
  const titulo = item.titulo ?? "";
  const largo = titulo.length > 140;

  return (
    <li
      id={`fila-${codigo}`}
      className={clase}
      data-testid={`fila-${codigo}`}
      data-completa={item.completa ? "true" : "false"}
      data-marcada={item.marcada ? "true" : "false"}
      data-estado={fila.estado.dataEstado}
      aria-busy={fila.ocupado || fila.confirmando || undefined}
    >
      <div className="fila-asignacion__cabecera">
        <label className="fila-asignacion__seleccionar">
          <input type="checkbox" data-testid="casilla-seleccionar" checked={seleccionada && !creada} disabled={soloLectura || creada} onChange={(e) => onSeleccion(item.id, e.target.checked)} />
          <span>Seleccionar</span>
          <span className="sr-only"> {codigo}</span>
        </label>
        <button type="button" className="codigo-boton" data-testid={`boton-codigo-${codigo}`} onClick={() => onVerDetalle?.(item)} aria-label={`${codigo}: ver detalle`}>
          <strong className="codigo">{codigo}</strong>
        </button>
        <span className={`texto-largo fila-asignacion__titulo${largo && !ampliado ? " fila-asignacion__titulo--recortado" : ""}`}>{titulo}</span>
        <span className="fila-asignacion__prioridad">Prioridad: {item.prioridad ? ETIQUETAS_PRIORIDAD[item.prioridad] : "Sin prioridad"}</span>
        {onVerDetalle ? (
          <button type="button" className="boton boton--secundario" data-testid="boton-ver-detalle" aria-label={`Ver detalle de ${codigo}`} onClick={() => onVerDetalle(item)}>
            Ver detalle
          </button>
        ) : null}
      </div>
      {largo ? (
        <button type="button" className="boton boton--terciario" aria-expanded={ampliado} onClick={() => setAmpliado((v) => !v)}>
          {ampliado ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
      <p className="fila-asignacion__meta">
        <span className="texto-largo">Sprint en Jira: {item.sprintJira ?? "—"}</span> <span className="chip-grupo chip-grupo--nuevas">+ Nueva</span>{" "}
        <span className="chip-grupo">{item.origenHdu === "MANUAL" && item.yaAsignada ? "Creada a mano" : "Creada por Jira"}</span>
        <ChipsAdvertencias advertencias={item.advertencias.filter((x) => x !== "SPRINT_NO_ENCONTRADO")} />
      </p>
      {descripcion ? (
        <details className="fila-asignacion__descripcion">
          <summary data-testid={`boton-ver-descripcion-${codigo}`}>Ver descripción</summary>
          <p className="texto-largo texto-plano">{descripcion}</p>
        </details>
      ) : null}

      <SeccionAsignacion fila={fila} origen="tarjeta" soloLectura={soloLectura} onAlternarMarca={alternarMarca} />
    </li>
  );
}
