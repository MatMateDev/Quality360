import type { ReactNode } from "react";
import { TarjetaMetrica } from "../TarjetaMetrica";
import type { ContadorBandeja } from "./tiposBloque";

interface ConsultaMinima {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

interface Props {
  consulta: ConsultaMinima;
  /** `tarjeta-<id>`. */
  id: string;
  /** `contador-<clave>`. */
  clave: string;
  titulo: string;
  contador: ContadorBandeja | undefined;
  atencion?: boolean;
  detalle?: (valor: number) => ReactNode;
}

/**
 * Contador de bandeja con sus cuatro estados: cargando, error, `indisponible` («No disponible», nunca `0`)
 * y `ok` (el `0` es un dato válido).
 */
export function TarjetaContador({ consulta, id, clave, titulo, contador, atencion, detalle }: Props) {
  if (consulta.isError) return <TarjetaMetrica id={id} clave={clave} titulo={titulo} estado="error" onReintentar={() => consulta.refetch()} />;
  if (consulta.isLoading) return <TarjetaMetrica id={id} clave={clave} titulo={titulo} estado="cargando" />;
  // Una respuesta sin este contador (servicio de otra versión) no es un 0: se informa como no disponible.
  if (!contador) return <TarjetaMetrica id={id} clave={clave} titulo={titulo} estado="indisponible" mensajeIndisponible="No disponible" onReintentar={() => consulta.refetch()} />;
  if (contador.estado !== "ok") {
    return <TarjetaMetrica id={id} clave={clave} titulo={titulo} estado="indisponible" mensajeIndisponible="No disponible" onReintentar={() => consulta.refetch()} />;
  }
  const valor = contador.datos.valor;
  return <TarjetaMetrica id={id} clave={clave} titulo={titulo} estado="ok" valor={valor} atencion={atencion} detalle={detalle?.(valor)} />;
}
