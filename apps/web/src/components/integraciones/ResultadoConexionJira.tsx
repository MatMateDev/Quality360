import type { ErrorIntegracion as ErrorIntegracionTipo } from "@/types/dominio";
import { ErrorIntegracion } from "./ErrorIntegracion";

/** Resultado de una prueba de la conexión, compartido por «Probar conexión» (tarjeta) y «Probar sin guardar» / «Probar y guardar» (formulario). */
export type ResultadoPrueba =
  | { tipo: "ok"; texto: string }
  | { tipo: "error"; error: ErrorIntegracionTipo; pie: string }
  | { tipo: "global"; texto: string }
  | { tipo: "permiso" };

/**
 * Un solo mensaje a la vez (diseño OAuth §3.3): el nuevo reemplaza al anterior. `JIRA_RECONEXION_NECESARIA` no se repite
 * aquí: la tarjeta pasa a «Reconexión necesaria» y su `aviso-reconexion` recibe el foco.
 */
export function ResultadoConexionJira({ resultado }: { resultado: ResultadoPrueba | null }) {
  if (!resultado) return null;
  if (resultado.tipo === "ok")
    return (
      <p className="mensaje-exito" role="status" data-testid="mensaje-conexion-ok">
        {resultado.texto}
      </p>
    );
  if (resultado.tipo === "error") {
    if (resultado.error.codigo === "JIRA_RECONEXION_NECESARIA") return null;
    return (
      <ErrorIntegracion
        testId="error-conexion"
        codigo={resultado.error.codigo}
        contexto={{ permisosFaltantes: resultado.error.permisosFaltantes }}
        titulo="No se pudo probar la conexión"
        sugerencias={resultado.error.sugerencias.filter((s) => s !== "IR_A_CONEXION" && s !== "IMPORTAR_ARCHIVO")}
        pie={resultado.pie}
      />
    );
  }
  if (resultado.tipo === "global")
    return (
      <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
        {resultado.texto}
      </p>
    );
  return (
    <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-permiso">
      Ya no tienes permiso para esta acción
    </p>
  );
}
