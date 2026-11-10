import { useState } from "react";
import { useCambiarEstadoHdu } from "@/api/hdu";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { CampoTextoContador } from "@/components/impedimentos/CampoTextoContador";
import { ErrorCierreBloqueado } from "@/components/impedimentos/ErrorCierreBloqueado";
import { ErrorApi } from "@/lib/httpClient";
import type { Entregable, ListaImpedimentosBloqueantes, ResultadoCambioEstado } from "@/types/dominio";

export const MIN_JUSTIFICACION = 20;
export const MAX_JUSTIFICACION = 500;

export type SalidaCierre =
  | { tipo: "cerrada"; resultado: ResultadoCambioEstado }
  | { tipo: "cambio-estado" }
  | { tipo: "sin-permiso" };

interface Props {
  abierto: boolean;
  hduId: string;
  /** Entregables no aprobados del checklist que el detalle ya consultó. */
  pendientes: Entregable[];
  /** Borrador conservado mientras la página siga abierta (3.3.7: no se pide reescribir). */
  borrador: string;
  onBorrador: (texto: string) => void;
  onCancelar: () => void;
  onSalida: (salida: SalidaCierre) => void;
}

type ErrorDialogo = { tipo: "bloqueo"; bloqueo: ListaImpedimentosBloqueantes | undefined } | { tipo: "mensaje"; texto: string; testId: string };

/**
 * Cierre con excepción (E6-F05, D173–D175): un solo paso con las consecuencias dichas en el cuerpo. La validación
 * ocurre al pulsar, no antes; los errores del servidor se traducen y nunca se muestra el texto crudo del API.
 */
export function DialogoCierreExcepcion({ abierto, hduId, pendientes, borrador, onBorrador, onCancelar, onSalida }: Props) {
  const cambiarEstado = useCambiarEstadoHdu(hduId);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [errorServidor, setErrorServidor] = useState<ErrorDialogo | null>(null);

  const cantidad = pendientes.length;

  async function confirmar() {
    const texto = borrador.trim();
    setErrorServidor(null);
    if (texto.length === 0) {
      setErrorCampo("La justificación es obligatoria");
      return;
    }
    if (texto.length < MIN_JUSTIFICACION || texto.length > MAX_JUSTIFICACION) {
      setErrorCampo("La justificación debe tener entre 20 y 500 caracteres");
      return;
    }
    setErrorCampo(null);
    try {
      const resultado = await cambiarEstado.mutateAsync({ estado: "CERRADA", justificacion: texto });
      onSalida({ tipo: "cerrada", resultado });
    } catch (error) {
      if (!(error instanceof ErrorApi)) {
        setErrorServidor({ tipo: "mensaje", texto: "No fue posible guardar. Intenta nuevamente.", testId: "error-accion-cierre" });
        return;
      }
      const cuerpo = error.cuerpo as { impedimentos?: ListaImpedimentosBloqueantes & { estado?: string } } | undefined;
      if (error.status === 409 && error.codigo === "HDU_BLOQUEADA") {
        setErrorServidor({ tipo: "bloqueo", bloqueo: cuerpo?.impedimentos });
      } else if (error.status === 409 && (error.codigo === "TRANSICION_INVALIDA" || error.codigo === "HDU_CERRADA")) {
        onSalida({ tipo: "cambio-estado" });
      } else if (error.status === 403) {
        onSalida({ tipo: "sin-permiso" });
      } else if (error.status === 422 && error.codigo === "JUSTIFICACION_REQUERIDA") {
        setErrorCampo("La justificación es obligatoria");
      } else if (error.status === 400 && error.detalles.some((d) => d.campo === "justificacion")) {
        setErrorCampo("La justificación debe tener entre 20 y 500 caracteres");
      } else if (error.status === 409 && error.codigo === "CHECKLIST_INCOMPLETO") {
        setErrorServidor({ tipo: "mensaje", texto: "No fue posible cerrar la HDU. Actualiza la página e intenta de nuevo.", testId: "error-accion-cierre" });
      } else if (error.status === 503 && cuerpo?.impedimentos?.estado === "indisponible") {
        setErrorServidor({ tipo: "mensaje", texto: "No pudimos verificar los impedimentos de la HDU. Intenta de nuevo en unos minutos.", testId: "error-impedimentos-no-disponible" });
      } else if (error.status === 503 || error.codigo === "CHECKLIST_NO_DISPONIBLE") {
        setErrorServidor({ tipo: "mensaje", texto: "No pudimos verificar el checklist de la HDU. Intenta de nuevo en unos minutos.", testId: "mensaje-error-global" });
      } else {
        setErrorServidor({ tipo: "mensaje", texto: "No fue posible guardar. Intenta nuevamente.", testId: "error-accion-cierre" });
      }
    }
  }

  function cancelar() {
    setErrorCampo(null);
    setErrorServidor(null);
    onCancelar();
  }

  return (
    <DialogoConfirmacion
      abierto={abierto}
      titulo="Cerrar con excepción"
      peligro
      cerrarAlClicFuera={false}
      etiquetaConfirmar={cambiarEstado.isPending ? "Guardando…" : "Cerrar con excepción"}
      deshabilitado={cambiarEstado.isPending}
      testId="dialogo-cierre-excepcion"
      testIdConfirmar="boton-confirmar-cierre-excepcion"
      onConfirmar={() => void confirmar()}
      onCancelar={cancelar}
    >
      <div
        onClick={(evento) => {
          // Un enlace a un impedimento cierra el cuadro (el borrador se conserva) y la página va a su tarjeta.
          if ((evento.target as HTMLElement).closest("a[href^='#impedimento']")) onCancelar();
        }}
      >
        <p data-testid="resumen-pendientes-cierre">
          {cantidad === 1 ? "Queda 1 entregable sin aprobar:" : `Quedan ${cantidad} entregables sin aprobar:`}
        </p>
        <ul className="lista-pendientes-cierre" data-testid="lista-pendientes-cierre">
          {pendientes.map((e) => (
            <li key={e.clave}>
              {String(e.orden).padStart(2, "0")} {e.nombre}
            </li>
          ))}
        </ul>
        <p>No se emitirá certificado y la HDU no podrá reabrirse.</p>
        <CampoTextoContador
          id="campo-justificacion-cierre"
          etiqueta="Justificación"
          valor={borrador}
          onCambio={(texto) => {
            onBorrador(texto);
            if (errorCampo) setErrorCampo(null);
          }}
          max={MAX_JUSTIFICACION}
          multilinea
          filas={4}
          obligatorio
          ayuda="Entre 20 y 500 caracteres. Explica por qué cierras la HDU sin completar el checklist. Quedará registrada con tu nombre y la fecha."
          error={errorCampo}
          errorAlerta
          testId="campo-justificacion-cierre"
          testIdContador="contador-justificacion-cierre"
          testIdError="error-justificacion-cierre"
        />
        {errorServidor?.tipo === "bloqueo" ? <ErrorCierreBloqueado bloqueo={errorServidor.bloqueo} /> : null}
        {errorServidor?.tipo === "mensaje" ? (
          <p className="mensaje-error-global" role="alert" data-testid={errorServidor.testId}>
            {errorServidor.texto}
          </p>
        ) : null}
      </div>
    </DialogoConfirmacion>
  );
}
