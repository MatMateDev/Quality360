import { BloqueEstado, type EstadoBloque } from "./BloqueEstado";

interface Props {
  id: string;
  titulo: string;
  estado: "ok" | EstadoBloque;
  valor?: string | number;
  onReintentar?: () => void;
}

/** Tarjeta de resumen del panel de inicio. Un valor `ok` en 0 es un dato válido; `indisponible` nunca muestra `0`. */
export function TarjetaMetrica({ id, titulo, estado, valor, onReintentar }: Props) {
  return (
    <article className="tarjeta-resumen" data-testid={`tarjeta-${id}`}>
      <span className="tarjeta-resumen__titulo">{titulo}</span>
      {estado === "ok" ? (
        <strong className="tarjeta-resumen__valor">{valor}</strong>
      ) : (
        <BloqueEstado id={id} estado={estado} onReintentar={onReintentar} />
      )}
    </article>
  );
}
