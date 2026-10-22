import type { ReactNode } from "react";
import { BloqueEstado, type EstadoBloque } from "./BloqueEstado";

interface Props {
  id: string;
  titulo: string;
  estado: "ok" | EstadoBloque;
  valor?: string | number;
  onReintentar?: () => void;
  /**
   * Clave del contador de bandeja: agrega `contador-<clave>` al valor y `estado-indisponible-<clave>`
   * (o `estado-error-<clave>`) al estado, sin tocar el `tarjeta-<id>` certificado.
   */
  clave?: string;
  /** Valor > 0 que implica trabajo pendiente: borde y texto «Requiere atención» (nunca solo color). */
  atencion?: boolean;
  /** Nodo bajo el valor: desglose, «en N HDU»… */
  detalle?: ReactNode;
  /** Texto corto del estado indisponible en contadores de bandeja («No disponible»). Por defecto, el mensaje certificado. */
  mensajeIndisponible?: string;
}

/**
 * Tarjeta de resumen. Un valor `ok` en 0 es un dato válido; `indisponible` nunca muestra `0`
 * (muestra «No disponible», D34).
 */
export function TarjetaMetrica({ id, titulo, estado, valor, onReintentar, clave, atencion = false, detalle, mensajeIndisponible }: Props) {
  const mostrarAtencion = atencion && estado === "ok" && Number(valor) > 0;
  return (
    <article
      className={`tarjeta-resumen${mostrarAtencion ? " tarjeta-resumen--atencion" : ""}`}
      data-testid={`tarjeta-${id}`}
      aria-busy={estado === "cargando"}
    >
      <span className="tarjeta-resumen__titulo">{titulo}</span>
      {estado === "ok" ? (
        <>
          <strong className="tarjeta-resumen__valor" data-testid={clave ? `contador-${clave}` : undefined}>
            {valor}
          </strong>
          {detalle ? <div className="tarjeta-resumen__detalle">{detalle}</div> : null}
          {mostrarAtencion ? <span className="tarjeta-resumen__atencion">▲ Requiere atención</span> : null}
        </>
      ) : estado === "indisponible" ? (
        <div data-testid={clave ? `estado-indisponible-${clave}` : undefined}>
          <BloqueEstado id={id} estado="indisponible" mensaje={mensajeIndisponible} onReintentar={onReintentar} />
        </div>
      ) : (
        <div data-testid={clave ? `estado-${estado}-${clave}` : undefined}>
          <BloqueEstado id={id} estado={estado} onReintentar={onReintentar} />
        </div>
      )}
    </article>
  );
}
