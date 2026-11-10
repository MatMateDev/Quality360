import { useEffect, useRef } from "react";
import { useChecklist } from "@/api/checklist";
import { formatearFechaHoraChile } from "@/lib/formato";
import { ETIQUETAS_ROL, type CierreExcepcionHdu } from "@/types/dominio";

/** Insignia junto al estado, para verlo sin bajar a la constancia (E6 §9.2). */
export function InsigniaCierreExcepcion() {
  return (
    <span className="insignia-cierre-excepcion" data-testid="insignia-cierre-excepcion">
      <span aria-hidden="true">◐ </span>Cerrada con excepción
    </span>
  );
}

interface Props {
  hduId: string;
  cierre: CierreExcepcionHdu;
  /** Tras cerrar con éxito el foco pasa al título: el botón que abrió el cuadro ya no existe. */
  enfocar: boolean;
}

/**
 * Constancia del cierre con excepción (E6-F05, D173–D175): solo lectura para todos los roles que ven el detalle.
 * La justificación es texto plano con `pre-wrap`; nunca HTML. Sin controles de certificado ni de reapertura.
 */
export function BloqueCierreExcepcion({ hduId, cierre, enfocar }: Props) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const checklist = useChecklist(hduId);
  useEffect(() => {
    if (enfocar) titulo.current?.focus();
  }, [enfocar]);

  const nombres = new Map((checklist.data?.entregables ?? []).map((e) => [e.clave, e] as const));
  const emitidoAntes = Boolean(checklist.data?.certificado);

  return (
    <section className="bloque-cierre-excepcion" data-testid="cierre-excepcion" aria-labelledby="titulo-cierre-excepcion">
      <h2 id="titulo-cierre-excepcion" ref={titulo} tabIndex={-1}>
        <span aria-hidden="true">◐ </span>
        Cerrada con excepción: {cierre.aprobados} de 10 entregables aprobados
      </h2>
      {emitidoAntes ? (
        <p data-testid="certificado-previo">Certificado emitido antes del cierre: sigue vigente.</p>
      ) : (
        <p>
          <span className="insignia-sin-certificado" data-testid="sin-certificado">
            <span aria-hidden="true">✕ </span>Sin certificado
          </span>{" "}
          Esta HDU se cerró sin completar el checklist. No tiene certificado y no puede reabrirse.
        </p>
      )}
      <h3>Justificación</h3>
      <blockquote data-testid="cierre-justificacion">{cierre.justificacion}</blockquote>
      <p>
        <strong>Cerrada por</strong> {cierre.actor.nombre} · {ETIQUETAS_ROL[cierre.actorRol]} · <strong>Fecha</strong>{" "}
        <time dateTime={cierre.fecha}>{formatearFechaHoraChile(cierre.fecha)}</time>
      </p>
      {cierre.pendientes.length > 0 ? (
        <>
          <h3>Entregables pendientes al cerrar ({cierre.pendientes.length})</h3>
          <ul className="lista-pendientes-cierre" data-testid="cierre-pendientes">
            {cierre.pendientes.map((clave) => {
              const e = nombres.get(clave);
              return <li key={clave}>{e ? `${String(e.orden).padStart(2, "0")} ${e.nombre}` : clave}</li>;
            })}
          </ul>
          <a href="#certificado">Ver en el checklist</a>
        </>
      ) : null}
    </section>
  );
}
