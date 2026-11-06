import { createContext, useContext } from "react";

/** Estado de la consulta abierta que las filas necesitan sin recibirlo por props en cada nivel. */
interface ContextoConsulta {
  /** Hay una confirmación grupal en curso: «Confirmar asignación» queda `aria-disabled` con su motivo (diseño §4.4). */
  loteEnCurso: boolean;
}

export const ContextoConsultaAbierta = createContext<ContextoConsulta>({ loteEnCurso: false });

export function useContextoConsulta(): ContextoConsulta {
  return useContext(ContextoConsultaAbierta);
}
