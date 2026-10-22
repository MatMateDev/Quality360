import { useEffect, useState } from "react";
import { useReasignarQeResponsable } from "@/api/hdu";
import { useUsuarios } from "@/api/usuarios";
import { ErrorApi } from "@/lib/httpClient";
import type { UsuarioResumen } from "@/types/dominio";
import { DialogoConfirmacion } from "./DialogoConfirmacion";

interface Props {
  abierto: boolean;
  hduId: string;
  codigo: string;
  qeActual: UsuarioResumen;
  onCerrar: () => void;
  /** Se llama con el nombre del QE nuevo cuando el servidor aplicó el cambio. */
  onReasignado: (nombreQeNuevo: string) => void;
}

const MOTIVO_MIN = 3;
const MOTIVO_MAX = 500;

/**
 * E7-B05 · «Reasignar QE responsable» (solo Administrador): selector de QE activos, motivo obligatorio y
 * confirmación. Muestra el mensaje del servidor ante 403, 409 `HDU_CERRADA` o 422 `QE_INVALIDO`.
 */
export function DialogoReasignarQe({ abierto, hduId, codigo, qeActual, onCerrar, onReasignado }: Props) {
  const qesQuery = useUsuarios({ rol: "QE", activo: true });
  const reasignar = useReasignarQeResponsable(hduId);
  const [qeId, setQeId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setQeId("");
      setMotivo("");
      setErrorMotivo(null);
      setErrorServidor(null);
    }
  }, [abierto]);

  const destinos = (qesQuery.data?.items ?? []).filter((qe) => qe.activo && qe.id !== qeActual.id);

  async function confirmar() {
    setErrorServidor(null);
    const texto = motivo.trim();
    if (!qeId) {
      setErrorServidor("Selecciona el QE que será responsable.");
      return;
    }
    if (texto.length < MOTIVO_MIN || texto.length > MOTIVO_MAX) {
      setErrorMotivo(`El motivo es obligatorio (entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres).`);
      return;
    }
    setErrorMotivo(null);
    try {
      const resultado = await reasignar.mutateAsync({ qeResponsableId: qeId, motivo: texto });
      onReasignado(resultado.qeNuevo.nombre);
      onCerrar();
    } catch (error) {
      setErrorServidor(error instanceof ErrorApi ? error.mensaje : "No fue posible reasignar el QE responsable.");
    }
  }

  return (
    <DialogoConfirmacion
      abierto={abierto}
      testId="dialogo-reasignar-qe"
      titulo={`Reasignar QE responsable de ${codigo}`}
      etiquetaConfirmar={reasignar.isPending ? "Guardando…" : "Confirmar"}
      deshabilitado={reasignar.isPending}
      onConfirmar={() => void confirmar()}
      onCancelar={onCerrar}
    >
      <p>
        QE actual: <strong>{qeActual.nombre}</strong>
      </p>
      <div className="campo">
        <label htmlFor="selector-qe-destino">QE responsable nuevo</label>
        <select id="selector-qe-destino" data-testid="selector-qe-destino" value={qeId} onChange={(evento) => setQeId(evento.target.value)}>
          <option value="">Selecciona un QE</option>
          {destinos.map((qe) => (
            <option key={qe.id} value={qe.id}>
              {qe.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="campo-motivo-reasignacion">Motivo de la reasignación</label>
        <textarea
          id="campo-motivo-reasignacion"
          data-testid="campo-motivo-reasignacion"
          rows={3}
          maxLength={MOTIVO_MAX}
          required
          value={motivo}
          aria-invalid={Boolean(errorMotivo)}
          aria-describedby={errorMotivo ? "error-motivo-reasignacion" : undefined}
          onChange={(evento) => setMotivo(evento.target.value)}
        />
        {errorMotivo ? (
          <p className="campo-error" id="error-motivo-reasignacion">
            {errorMotivo}
          </p>
        ) : null}
      </div>
      {errorServidor ? (
        <p className="campo-error" role="alert" data-testid="error-reasignar-qe">
          {errorServidor}
        </p>
      ) : null}
    </DialogoConfirmacion>
  );
}
