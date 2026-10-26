import { useId, useState } from "react";
import { useAccionImpedimento, useResponsablesImpedimento, type AccionImpedimento, type CuerpoAccionImpedimento } from "@/api/impedimentos";
import { ErrorApi } from "@/lib/httpClient";
import { ETIQUETAS_TIPO_IMPEDIMENTO, type Impedimento, type OperacionImpedimento, type ResultadoAccionImpedimento } from "@/types/dominio";
import { BloqueEstado } from "../BloqueEstado";
import { DialogoConfirmacion } from "../DialogoConfirmacion";
import { CampoTextoContador } from "./CampoTextoContador";
import { SelectorResponsable, VALOR_OTRO } from "./SelectorResponsable";
import { MENSAJE_ERROR_ACCION, MENSAJE_HDU_CERRADA, MENSAJE_SIN_PERMISO, MENSAJE_TRANSICION } from "./tiposImpedimentos";

interface Props {
  operacion: OperacionImpedimento;
  impedimento: Impedimento;
  hduId: string;
  onCerrar: () => void;
  onExito: (resultado: ResultadoAccionImpedimento, operacion: OperacionImpedimento) => void;
  /** El impedimento cambió o ya no se puede gestionar: el diálogo se cierra y la sección se recarga con este aviso. */
  onDesactualizado: (mensaje: string) => void;
}

const ACCION: Record<OperacionImpedimento, AccionImpedimento> = {
  RESOLVER: "resolver",
  ESCALAR: "escalar",
  REABRIR: "reabrir",
  SEGUIMIENTO: "seguimiento",
};

interface Textos {
  titulo: string;
  confirmar: string;
  etiquetaCampo: string;
  vacio: string;
  testId: string;
  idCampo: string;
  testIdCampo: string;
}

function textos(operacion: OperacionImpedimento, yaEscalado: boolean): Textos {
  switch (operacion) {
    case "RESOLVER":
      return { titulo: "Resolver impedimento", confirmar: "Confirmar resolución", etiquetaCampo: "Comentario", vacio: "Indica la acción tomada", testId: "dialogo-resolver", idCampo: "campo-comentario-resolver", testIdCampo: "campo-comentario-impedimento" };
    case "ESCALAR":
      return {
        titulo: yaEscalado ? "Escalar a otro destino" : "Escalar impedimento",
        confirmar: "Confirmar escalamiento",
        etiquetaCampo: "Comentario",
        vacio: "Indica por qué lo escalas",
        testId: "dialogo-escalar",
        idCampo: "campo-comentario-escalar",
        testIdCampo: "campo-comentario-impedimento",
      };
    case "REABRIR":
      return { titulo: "Reabrir impedimento", confirmar: "Confirmar reapertura", etiquetaCampo: "Motivo", vacio: "Indica el motivo", testId: "dialogo-reabrir", idCampo: "campo-motivo-reabrir", testIdCampo: "campo-motivo-reabrir" };
    default:
      return { titulo: "Agregar seguimiento", confirmar: "Guardar seguimiento", etiquetaCampo: "Comentario", vacio: "Escribe el seguimiento", testId: "dialogo-seguimiento", idCampo: "campo-comentario-seguimiento", testIdCampo: "campo-comentario-impedimento" };
  }
}

/**
 * Diálogo de resolver, escalar, reabrir y agregar seguimiento (E4-F03), sobre `DialogoConfirmacion` (Esc, foco
 * atrapado y devuelto). «Confirmar» no se deshabilita por vacío: la validación ocurre al pulsarlo (E4-F03-T02);
 * solo se deshabilita mientras guarda.
 */
export function DialogoAccionImpedimento({ operacion, impedimento, hduId, onCerrar, onExito, onDesactualizado }: Props) {
  const accion = useAccionImpedimento(impedimento.id, ACCION[operacion]);
  const yaEscalado = impedimento.estado === "ESCALADO";
  const t = textos(operacion, yaEscalado);
  const esEscalar = operacion === "ESCALAR";
  const candidatos = useResponsablesImpedimento(hduId, "ESCALAMIENTO", esEscalar);
  const idResumen = useId();

  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState("");
  const [nombreOtro, setNombreOtro] = useState("");
  const [errorTexto, setErrorTexto] = useState<string | null>(null);
  const [errorDestino, setErrorDestino] = useState<string | null>(null);
  const [errorOtro, setErrorOtro] = useState<string | null>(null);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  // «Escalar a otro» excluye al destino vigente (el servidor respondería 422 `RESPONSABLE_INVALIDO`).
  const lista = (candidatos.data?.items ?? []).filter((c) => !(yaEscalado && c.id === impedimento.responsable.id));
  const faltaLista = esEscalar && candidatos.isError;

  async function confirmar() {
    setErrorGlobal(null);
    const limpio = texto.trim();
    let invalido = false;
    setErrorTexto(null);
    setErrorDestino(null);
    setErrorOtro(null);
    if (esEscalar) {
      if (!destino) {
        setErrorDestino("Elige a quién escalarlo");
        invalido = true;
      } else if (destino === VALOR_OTRO && (nombreOtro.trim().length < 3 || nombreOtro.trim().length > 150)) {
        setErrorOtro("El nombre debe tener entre 3 y 150 caracteres");
        invalido = true;
      }
    }
    if (limpio.length < 3) {
      setErrorTexto(t.vacio);
      invalido = true;
    }
    if (invalido) return;

    const cuerpo: CuerpoAccionImpedimento =
      operacion === "REABRIR"
        ? { motivo: limpio }
        : esEscalar
          ? { comentario: limpio, ...(destino === VALOR_OTRO ? { responsableNombre: nombreOtro.trim() } : { responsableId: destino }) }
          : { comentario: limpio };
    try {
      onExito(await accion.mutateAsync(cuerpo), operacion);
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 409 && error.codigo === "TRANSICION_INVALIDA") onDesactualizado(MENSAJE_TRANSICION);
      else if (error instanceof ErrorApi && error.status === 409 && error.codigo === "HDU_CERRADA") onDesactualizado(MENSAJE_HDU_CERRADA);
      else if (error instanceof ErrorApi && error.status === 403) onDesactualizado(MENSAJE_SIN_PERMISO);
      else if (error instanceof ErrorApi && error.status === 422 && error.codigo === "RESPONSABLE_INVALIDO") {
        setErrorDestino("El responsable elegido ya no está disponible. Actualizamos la lista.");
        setDestino("");
        void candidatos.refetch();
      } else if (error instanceof ErrorApi && error.status === 422) setErrorTexto(error.mensaje || t.vacio);
      else setErrorGlobal(MENSAJE_ERROR_ACCION);
    }
  }

  return (
    <DialogoConfirmacion
      abierto
      titulo={t.titulo}
      etiquetaConfirmar={accion.isPending ? "Guardando…" : t.confirmar}
      deshabilitado={accion.isPending || faltaLista}
      testId={t.testId}
      cerrarAlClicFuera={false}
      onConfirmar={() => void confirmar()}
      onCancelar={onCerrar}
    >
      <p className="resumen-accion" id={idResumen}>
        <strong>{impedimento.titulo}</strong> · {ETIQUETAS_TIPO_IMPEDIMENTO[impedimento.tipo]}
      </p>
      {operacion === "REABRIR" ? <p className="mensaje-aviso">La HDU volverá a quedar bloqueada.</p> : null}
      {operacion === "SEGUIMIENTO" ? <p className="campo-ayuda">El estado no cambia.</p> : null}
      {esEscalar ? (
        faltaLista ? (
          <BloqueEstado id="destinos-escalamiento" estado="error" mensaje="No pudimos cargar los destinos posibles." onReintentar={() => candidatos.refetch()} />
        ) : (
          <>
            <SelectorResponsable
              idSelect="campo-destino-escalamiento"
              idOtro="campo-destino-otro"
              testIdSelect="campo-destino-escalamiento"
              testIdOtro="campo-destino-otro"
              testIdError="error-destino-escalamiento"
              etiqueta="Escalar a"
              ayuda="Quien recibe el escalamiento lo verá en su bandeja, pero no podrá resolverlo: lo sigue gestionando el QE."
              candidatos={lista}
              valor={destino}
              nombreOtro={nombreOtro}
              onCambioValor={setDestino}
              onCambioNombre={setNombreOtro}
              error={errorDestino}
              errorOtro={errorOtro}
              testIdErrorOtro="error-destino-otro"
            />
          </>
        )
      ) : null}
      <CampoTextoContador
        id={t.idCampo}
        testId={t.testIdCampo}
        testIdError="error-comentario-impedimento"
        etiqueta={t.etiquetaCampo}
        obligatorio
        multilinea
        filas={3}
        max={500}
        valor={texto}
        onCambio={setTexto}
        error={errorTexto}
      />
      {errorGlobal ? (
        <p className="mensaje-error-global" role="alert" data-testid="error-accion-impedimento">
          {errorGlobal}
        </p>
      ) : null}
    </DialogoConfirmacion>
  );
}
