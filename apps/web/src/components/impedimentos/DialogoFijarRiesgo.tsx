import { useState } from "react";
import { useFijarRiesgo } from "@/api/riesgo";
import { ErrorApi } from "@/lib/httpClient";
import { ETIQUETAS_NIVEL_RIESGO, GLIFO_NIVEL_RIESGO, NIVELES_RIESGO, type NivelRiesgo, type ResultadoCambioRiesgo } from "@/types/dominio";
import { DialogoConfirmacion } from "../DialogoConfirmacion";
import { CampoTextoContador } from "./CampoTextoContador";
import { MENSAJE_ERROR_ACCION, MENSAJE_HDU_CERRADA, MENSAJE_SIN_PERMISO } from "./tiposImpedimentos";

interface Props {
  hduId: string;
  /** Nivel preseleccionado («Usar el sugerido»). */
  nivelInicial?: NivelRiesgo | null;
  sugerido: NivelRiesgo | null;
  onCerrar: () => void;
  onGuardado: (resultado: ResultadoCambioRiesgo) => void;
  onDesactualizado: (mensaje: string) => void;
}

/** Fijar el nivel (E4-F04#1): tres radios con forma y palabra, y justificación obligatoria (máx. 500). */
export function DialogoFijarRiesgo({ hduId, nivelInicial = null, sugerido, onCerrar, onGuardado, onDesactualizado }: Props) {
  const fijar = useFijarRiesgo(hduId);
  const [nivel, setNivel] = useState<NivelRiesgo | "">(nivelInicial ?? "");
  const [justificacion, setJustificacion] = useState("");
  const [errorNivel, setErrorNivel] = useState<string | null>(null);
  const [errorJustificacion, setErrorJustificacion] = useState<string | null>(null);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  async function guardar() {
    setErrorGlobal(null);
    const texto = justificacion.trim();
    const en = nivel ? null : "Elige un nivel";
    const ej = texto.length === 0 ? "La justificación es obligatoria" : texto.length > 500 ? "Máximo 500 caracteres" : null;
    setErrorNivel(en);
    setErrorJustificacion(ej);
    if (en || ej || !nivel) return;
    try {
      onGuardado(await fijar.mutateAsync({ nivel, justificacion: texto }));
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 409 && error.codigo === "HDU_CERRADA") onDesactualizado(MENSAJE_HDU_CERRADA);
      else if (error instanceof ErrorApi && error.status === 403) onDesactualizado(MENSAJE_SIN_PERMISO);
      else if (error instanceof ErrorApi && error.status === 422) setErrorJustificacion("La justificación es obligatoria");
      else setErrorGlobal(MENSAJE_ERROR_ACCION);
    }
  }

  return (
    <DialogoConfirmacion
      abierto
      titulo="Fijar nivel de riesgo"
      etiquetaConfirmar={fijar.isPending ? "Guardando…" : "Guardar nivel"}
      deshabilitado={fijar.isPending}
      testId="form-riesgo"
      cerrarAlClicFuera={false}
      onConfirmar={() => void guardar()}
      onCancelar={onCerrar}
    >
      <fieldset className="opciones-riesgo" aria-describedby={errorNivel ? "error-nivel-riesgo" : undefined}>
        <legend>
          Nivel<span aria-hidden="true"> *</span>
          <span className="sr-only"> (obligatorio)</span>
        </legend>
        {NIVELES_RIESGO.map((n) => (
          <label key={n}>
            <input type="radio" name="nivel-riesgo" value={n} data-testid={`riesgo-opcion-${n}`} checked={nivel === n} onChange={() => setNivel(n)} />
            <span aria-hidden="true">{GLIFO_NIVEL_RIESGO[n]}</span> {ETIQUETAS_NIVEL_RIESGO[n]}
          </label>
        ))}
      </fieldset>
      {errorNivel ? (
        <p className="campo-error" id="error-nivel-riesgo" data-testid="error-nivel-riesgo">
          {errorNivel}
        </p>
      ) : null}
      <p className="campo-ayuda">Sugerencia del sistema: {sugerido ? ETIQUETAS_NIVEL_RIESGO[sugerido] : "No disponible"}</p>
      <CampoTextoContador
        id="campo-justificacion-riesgo"
        testId="campo-justificacion-riesgo"
        testIdError="error-justificacion-riesgo"
        etiqueta="Justificación"
        obligatorio
        multilinea
        filas={3}
        max={500}
        sinTope
        valor={justificacion}
        onCambio={setJustificacion}
        error={errorJustificacion}
      />
      {errorGlobal ? (
        <p className="mensaje-error-global" role="alert" data-testid="error-accion-impedimento">
          {errorGlobal}
        </p>
      ) : null}
    </DialogoConfirmacion>
  );
}
