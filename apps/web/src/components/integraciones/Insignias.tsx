import {
  ETIQUETAS_ORIGEN_HDU,
  INFO_ACCION_VISTA_PREVIA,
  INFO_CONEXION,
  INFO_RESULTADO_EJECUCION,
  INFO_RESULTADO_FILA,
  textoAdvertencia,
} from "@/lib/mensajesIntegracion";
import type { AccionVistaPrevia, EstadoConexionJira, OrigenHdu, ResultadoEjecucion, ResultadoFila } from "@/types/dominio";

/** Resultado de una ejecución: glifo + palabra + tono (el color nunca es el único canal). */
export function InsigniaResultado({ resultado, testId }: { resultado: ResultadoEjecucion; testId?: string }) {
  const info = INFO_RESULTADO_EJECUCION[resultado];
  return (
    <span className={`badge-resultado badge-resultado--${info.tono}`} data-testid={testId} data-resultado={resultado}>
      <span aria-hidden="true">{info.glifo}</span> {info.etiqueta}
    </span>
  );
}

export function InsigniaFilaEjecucion({ resultado }: { resultado: ResultadoFila }) {
  const info = INFO_RESULTADO_FILA[resultado];
  return (
    <span className={`badge-resultado badge-resultado--${info.tono}`} data-resultado={resultado}>
      <span aria-hidden="true">{info.glifo}</span> {info.etiqueta}
    </span>
  );
}

export function InsigniaAccionVistaPrevia({ accion }: { accion: AccionVistaPrevia }) {
  const info = INFO_ACCION_VISTA_PREVIA[accion];
  return (
    <span className={`badge-resultado badge-resultado--${info.tono}`} data-accion={accion}>
      <span aria-hidden="true">{info.glifo}</span> {info.etiqueta}
    </span>
  );
}

/** Origen de una HDU: insignia neutra, sin color de significado (D108). */
export function InsigniaOrigen({ origen }: { origen: OrigenHdu }) {
  return <span className="badge-origen">Origen: {ETIQUETAS_ORIGEN_HDU[origen]}</span>;
}

export function ChipConexion({ estado }: { estado: EstadoConexionJira }) {
  const info = INFO_CONEXION[estado];
  return (
    <span className={`chip-conexion chip-conexion--${info.clase}`} data-testid="chip-conexion" data-estado={estado}>
      <span aria-hidden="true">{info.glifo}</span> {info.etiqueta}
    </span>
  );
}

/** Advertencias de una fila como chips con `!` y texto. */
export function ChipsAdvertencias({ advertencias }: { advertencias: readonly string[] }) {
  if (advertencias.length === 0) return null;
  return (
    <ul className="chips-advertencia" aria-label="Advertencias">
      {advertencias.map((codigo) => (
        <li key={codigo} className="chip-advertencia">
          <span aria-hidden="true">!</span> {textoAdvertencia(codigo)}
        </li>
      ))}
    </ul>
  );
}
