import { useDetalleImpedimento } from "@/api/impedimentos";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_ACCION_IMPEDIMENTO, ETIQUETAS_ESTADO_IMPEDIMENTO, ETIQUETAS_ROL, type AccionImpedimentoRegistro } from "@/types/dominio";
import { BloqueDatos, type EstadoDatos } from "../bandeja/Estructura";

/** «Registró el impedimento»: el texto fijo de REGISTRAR se muestra como frase (diseño E4 §2.2). */
function textoAccion(a: AccionImpedimentoRegistro): string {
  return a.tipo === "REGISTRAR" ? "Registró el impedimento" : ETIQUETAS_ACCION_IMPEDIMENTO[a.tipo];
}

function transicion(a: AccionImpedimentoRegistro): string {
  if (a.tipo === "SEGUIMIENTO") return `Sigue ${ETIQUETAS_ESTADO_IMPEDIMENTO[a.estado].toLowerCase()}`;
  const antes = a.estadoAnterior ? ETIQUETAS_ESTADO_IMPEDIMENTO[a.estadoAnterior] : "—";
  return `${antes} → ${ETIQUETAS_ESTADO_IMPEDIMENTO[a.estado]}`;
}

/**
 * Historial de un impedimento, del más antiguo al más reciente (D82). Se pide al abrir el disclosure. Siempre hay
 * al menos la acción REGISTRAR, así que no existe el estado vacío.
 */
export function HistorialImpedimento({ id }: { id: string }) {
  const consulta = useDetalleImpedimento(id, true);
  let estado: EstadoDatos = "ok";
  if (consulta.isError) estado = consulta.error instanceof ErrorApi && consulta.error.status === 503 ? "indisponible" : "error";
  else if (consulta.isLoading || !consulta.data) estado = "cargando";

  return (
    <div id={`historial-impedimento-${id}`} data-testid={`historial-impedimento-${id}`}>
      <BloqueDatos clave={`historial-impedimento-${id}`} estado={estado} onReintentar={() => consulta.refetch()}>
        <ul className="historial-lista">
          {consulta.data?.acciones.map((a, indice) => (
            <li key={a.id} className="historial-item" data-testid={`accion-impedimento-${id}-${indice}`}>
              <time dateTime={a.fecha}>{formatearFecha(a.fecha)}</time>
              <p>
                <strong>{textoAccion(a)}</strong> · {a.actor.nombre} ({ETIQUETAS_ROL[a.actor.rol]}) · {transicion(a)}
              </p>
              {a.detalle ? (
                <p>
                  Responsable: {a.detalle.responsableAnterior.nombre} → {a.detalle.responsableNuevo.nombre}
                </p>
              ) : null}
              {a.tipo !== "REGISTRAR" && a.comentario ? <p>«{a.comentario}»</p> : null}
            </li>
          ))}
        </ul>
      </BloqueDatos>
    </div>
  );
}
