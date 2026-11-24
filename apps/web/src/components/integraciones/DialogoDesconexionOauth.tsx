import { useState } from "react";
import { useDesconectarOauth } from "@/api/integraciones";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { ErrorApi } from "@/lib/httpClient";
import { mensajeDeError } from "@/lib/mensajesIntegracion";

interface Props {
  abierto: boolean;
  onCancelar: () => void;
  /** La conexión se borró en el servidor. */
  onDesconectada: () => void;
  /** 409 `JIRA_OAUTH_SIN_CONEXION`: ya no había nada que desconectar; la tarjeta se recarga. */
  onSinConexion: () => void;
}

/**
 * `confirmar-desconexion` (diseño OAuth §3.4, D217). Foco inicial en «Cancelar» (la acción segura), Escape cancela y el
 * foco vuelve a `boton-desconectar-jira`. Desconectar borra las credenciales guardadas; no toca nada de lo importado.
 */
export function DialogoDesconexionOauth({ abierto, onCancelar, onDesconectada, onSinConexion }: Props) {
  const desconectar = useDesconectarOauth();
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (desconectar.isPending) return;
    setError(null);
    try {
      await desconectar.mutateAsync();
      onDesconectada();
    } catch (fallo) {
      if (fallo instanceof ErrorApi && fallo.status === 409 && fallo.codigo === "JIRA_OAUTH_SIN_CONEXION") {
        setError(mensajeDeError("JIRA_OAUTH_SIN_CONEXION"));
        onSinConexion();
      } else if (fallo instanceof ErrorApi && fallo.status === 403) {
        setError("Ya no tienes permiso para esta acción");
      } else {
        setError("No fue posible desconectar. Intenta nuevamente.");
      }
    }
  }

  function cancelar() {
    if (desconectar.isPending) return;
    setError(null);
    onCancelar();
  }

  return (
    <DialogoConfirmacion
      abierto={abierto}
      titulo="Desconectar de Jira"
      rol="alertdialog"
      peligro
      etiquetaConfirmar={desconectar.isPending ? "Desconectando…" : "Sí, desconectar"}
      deshabilitado={desconectar.isPending}
      cerrarAlClicFuera={false}
      testId="confirmar-desconexion"
      testIdConfirmar="boton-confirmar-desconexion"
      testIdCancelar="boton-cancelar-desconexion"
      onConfirmar={() => void confirmar()}
      onCancelar={cancelar}
    >
      <p>Se borrarán las credenciales guardadas en Quality360. Mientras no vuelvas a conectar, no se podrá consultar ni sincronizar con Jira.</p>
      <p>Para quitar el permiso en Atlassian, revoca la app desde tu cuenta.</p>
      <p>Lo ya importado no se borra.</p>
      {error ? (
        <p className="mensaje-error-global" role="alert" data-testid="error-desconexion">
          {error}
        </p>
      ) : null}
    </DialogoConfirmacion>
  );
}

/** Texto fijo del éxito (diseño OAuth §9.2). */
export const TEXTO_DESCONEXION_HECHA = "Se desconectó de Jira. Las credenciales guardadas se borraron.";

