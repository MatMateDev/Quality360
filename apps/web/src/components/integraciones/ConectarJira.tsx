import { useCallback, useState } from "react";
import { iniciarConexionOauth } from "@/api/integraciones";
import { ErrorApi } from "@/lib/httpClient";
import { navegador } from "@/lib/navegacion";
import { ErrorIntegracion } from "./ErrorIntegracion";

/** Estados del botón «Conectar con Jira» (diseño OAuth §2.3): siempre el mismo `button`, con `data-estado`. */
export type EstadoBotonConectar = "disponible" | "no-disponible" | "en-curso";

/** Por qué falló `oauth/iniciar` (diseño OAuth §2.4). */
export type CodigoErrorInicio = "JIRA_OAUTH_NO_CONFIGURADO" | "LLAVE_CIFRADO_NO_DISPONIBLE" | "OAUTH_SIN_PERMISO" | "OAUTH_NO_ABRIO";

export interface ConexionOauth {
  estado: EstadoBotonConectar;
  error: CodigoErrorInicio | null;
  /** Llama a `oauth/iniciar` y navega a la `urlAutorizacion` que devuelve el servidor. Se ignora si no está `disponible`. */
  iniciar: () => Promise<void>;
}

/**
 * Flujo de «Conectar con Jira» y «Reconectar». El portal nunca arma la dirección de Atlassian ni la `redirect_uri`
 * (D210): navega con `location.assign` a lo que devuelve el servidor y no lo guarda en ninguna parte.
 */
export function useIniciarOauth(oauthDisponible: boolean, alFaltarLlave?: () => void): ConexionOauth {
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<CodigoErrorInicio | null>(null);
  const [sinConfigurar, setSinConfigurar] = useState(false);

  const estado: EstadoBotonConectar = !oauthDisponible || sinConfigurar ? "no-disponible" : enCurso ? "en-curso" : "disponible";

  const iniciar = useCallback(async () => {
    // El clic se ignora en `no-disponible` y en `en-curso`: evita el doble envío.
    if (estado !== "disponible") return;
    setError(null);
    setEnCurso(true);
    try {
      const inicio = await iniciarConexionOauth();
      navegador.ir(inicio.urlAutorizacion);
    } catch (fallo) {
      setEnCurso(false);
      if (fallo instanceof ErrorApi && fallo.status === 503 && fallo.codigo === "JIRA_OAUTH_NO_CONFIGURADO") {
        setSinConfigurar(true);
        setError("JIRA_OAUTH_NO_CONFIGURADO");
      } else if (fallo instanceof ErrorApi && fallo.status === 503 && fallo.codigo === "LLAVE_CIFRADO_NO_DISPONIBLE") {
        setError("LLAVE_CIFRADO_NO_DISPONIBLE");
        alFaltarLlave?.();
      } else if (fallo instanceof ErrorApi && fallo.status === 403) {
        setError("OAUTH_SIN_PERMISO");
      } else {
        setError("OAUTH_NO_ABRIO");
      }
    }
  }, [estado, alFaltarLlave]);

  return { estado, error, iniciar };
}

interface PropsBoton {
  testId?: string;
  texto: string;
  estado: EstadoBotonConectar;
  secundario?: boolean;
  describedBy?: string;
  onClick: () => void;
}

/**
 * `aria-disabled` y NO `disabled` (D216): el botón sigue en el orden de tabulación y el lector lee su motivo
 * (`aria-describedby`). Pulsar o Enter no hace nada en `no-disponible` ni en `en-curso`.
 */
export function BotonConectarJira({ testId = "boton-conectar-jira", texto, estado, secundario = false, describedBy, onClick }: PropsBoton) {
  const inactivo = estado !== "disponible";
  return (
    <button
      type="button"
      className={`boton ${secundario ? "boton--secundario" : "boton--primario"} boton-conectar boton-conectar--${estado}`}
      data-testid={testId}
      data-estado={estado}
      aria-disabled={inactivo ? "true" : undefined}
      aria-busy={estado === "en-curso" ? "true" : undefined}
      aria-describedby={estado === "no-disponible" ? describedBy : undefined}
      onClick={() => {
        if (!inactivo) onClick();
      }}
    >
      {estado === "en-curso" ? (
        <>
          <span className="indicador-giro" aria-hidden="true" /> Conectando…
        </>
      ) : (
        texto
      )}
    </button>
  );
}

/** `error-oauth` al iniciar (diseño OAuth §2.4). Para `JIRA_OAUTH_NO_CONFIGURADO` el resto del texto y la acción están en el aviso fijo del panel. */
export function ErrorInicioOauth({ codigo }: { codigo: CodigoErrorInicio }) {
  return (
    <ErrorIntegracion
      testId="error-oauth"
      codigo={codigo}
      titulo="No se pudo conectar con Jira"
      pie={codigo === "LLAVE_CIFRADO_NO_DISPONIBLE" ? "Avisa al responsable del despliegue." : undefined}
    />
  );
}
