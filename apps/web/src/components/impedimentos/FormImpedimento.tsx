import { useEffect, useRef, useState } from "react";
import { useRegistrarImpedimento, useResponsablesImpedimento, useTiposImpedimento } from "@/api/impedimentos";
import { ErrorApi } from "@/lib/httpClient";
import { ETIQUETAS_TIPO_IMPEDIMENTO, TIPOS_IMPEDIMENTO, type ImpedimentoDetalle, type NuevoImpedimento, type TipoImpedimento } from "@/types/dominio";
import { BloqueEstado } from "../BloqueEstado";
import { CampoTextoContador } from "./CampoTextoContador";
import { SelectorResponsable, VALOR_OTRO } from "./SelectorResponsable";
import { detalleDeCampo, MENSAJE_ERROR_ACCION, MENSAJE_HDU_CERRADA, MENSAJE_SIN_PERMISO } from "./tiposImpedimentos";

interface Props {
  hduId: string;
  onCancelar: () => void;
  onRegistrado: (impedimento: ImpedimentoDetalle) => void;
  /** Se invoca cuando el servidor dice que ya no se puede registrar (403, HDU cerrada): la sección se recarga. */
  onSinPermiso: () => void;
}

type Campo = "tipo" | "titulo" | "descripcion" | "responsable" | "otro";
type Errores = Partial<Record<Campo, string>>;

const MINIMO_DESCRIPCION = (tipo: TipoImpedimento | "") => (tipo === "OTRO" ? 20 : 10);

/**
 * Registro de un impedimento (E4-F01), en línea y no en un diálogo: son cuatro campos y un contador, y a 375 px un
 * panel en flujo es más cómodo. La validación ocurre al guardar; el formulario sigue abierto con lo escrito y no se
 * envía nada (E4-F01#2). Los botones son `type="button"`.
 */
export function FormImpedimento({ hduId, onCancelar, onRegistrado, onSinPermiso }: Props) {
  const tipos = useTiposImpedimento();
  const candidatos = useResponsablesImpedimento(hduId, "REGISTRO", true);
  const registrar = useRegistrarImpedimento(hduId);

  const [tipo, setTipo] = useState<TipoImpedimento | "">("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [responsable, setResponsable] = useState("");
  const [nombreOtro, setNombreOtro] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const preseleccionado = useRef(false);

  const refTipo = useRef<HTMLSelectElement>(null);
  const refTitulo = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const refDescripcion = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const refResponsable = useRef<HTMLSelectElement>(null);
  const refOtro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refTipo.current?.focus();
  }, []);

  // El QE responsable llega preseleccionado (3.5 del backlog); solo la primera vez, para no pisar lo que elija.
  useEffect(() => {
    const datos = candidatos.data;
    if (datos && !preseleccionado.current) {
      preseleccionado.current = true;
      if (datos.preseleccionadoId && datos.items.some((c) => c.id === datos.preseleccionadoId)) setResponsable(datos.preseleccionadoId);
    }
  }, [candidatos.data]);

  const etiquetas = new Map(tipos.data?.items.map((t) => [t.codigo, t.etiqueta]));
  const minimo = MINIMO_DESCRIPCION(tipo);

  function validar(): Errores {
    const e: Errores = {};
    if (!tipo) e.tipo = "Selecciona un tipo";
    const t = titulo.trim();
    if (t.length < 5 || t.length > 200) e.titulo = "El título debe tener entre 5 y 200 caracteres";
    const d = descripcion.trim();
    if (d.length === 0) e.descripcion = "La descripción es obligatoria";
    else if (d.length < minimo) e.descripcion = `La descripción debe tener al menos ${minimo} caracteres`;
    if (!responsable) e.responsable = "Indica quién debe resolverlo";
    else if (responsable === VALOR_OTRO) {
      const n = nombreOtro.trim();
      if (n.length < 3 || n.length > 150) e.otro = "El nombre del responsable debe tener entre 3 y 150 caracteres";
    }
    return e;
  }

  function enfocarPrimero(e: Errores) {
    if (e.tipo) refTipo.current?.focus();
    else if (e.titulo) refTitulo.current?.focus();
    else if (e.descripcion) refDescripcion.current?.focus();
    else if (e.responsable) refResponsable.current?.focus();
    else if (e.otro) refOtro.current?.focus();
  }

  async function guardar() {
    setErrorGlobal(null);
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length > 0) {
      enfocarPrimero(e);
      return;
    }
    const cuerpo: NuevoImpedimento = {
      tipo: tipo as TipoImpedimento,
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      ...(responsable === VALOR_OTRO ? { responsableNombre: nombreOtro.trim() } : { responsableId: responsable }),
    };
    try {
      onRegistrado(await registrar.mutateAsync(cuerpo));
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 400) {
        const servidor: Errores = {
          tipo: detalleDeCampo(error, "tipo"),
          titulo: detalleDeCampo(error, "titulo"),
          descripcion: detalleDeCampo(error, "descripcion"),
          responsable: detalleDeCampo(error, "responsableId"),
          otro: detalleDeCampo(error, "responsableNombre"),
        };
        const hay = Object.values(servidor).some(Boolean);
        setErrores(servidor);
        if (hay) enfocarPrimero(servidor);
        else setErrorGlobal(MENSAJE_ERROR_ACCION);
      } else if (error instanceof ErrorApi && error.status === 422 && error.codigo === "RESPONSABLE_INVALIDO") {
        setErrores({ responsable: "El responsable elegido ya no está disponible. Actualizamos la lista." });
        setResponsable("");
        void candidatos.refetch();
      } else if (error instanceof ErrorApi && error.status === 409 && error.codigo === "HDU_CERRADA") {
        setErrorGlobal(MENSAJE_HDU_CERRADA);
        onSinPermiso();
      } else if (error instanceof ErrorApi && error.status === 403) {
        setErrorGlobal(MENSAJE_SIN_PERMISO);
        onSinPermiso();
      } else {
        setErrorGlobal(MENSAJE_ERROR_ACCION);
      }
    }
  }

  function alPresionarTecla(evento: React.KeyboardEvent) {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      onCancelar();
    }
  }

  return (
    <div className="formulario-impedimento" data-testid="form-impedimento" role="group" aria-labelledby="titulo-form-impedimento" onKeyDown={alPresionarTecla}>
      <h3 id="titulo-form-impedimento">Registrar impedimento</h3>
      <div className="formulario-impedimento__fila">
        <div className="campo">
          <label htmlFor="campo-tipo-impedimento">
            Tipo
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (obligatorio)</span>
          </label>
          <select
            id="campo-tipo-impedimento"
            ref={refTipo}
            data-testid="campo-tipo-impedimento"
            value={tipo}
            aria-required="true"
            aria-invalid={errores.tipo ? true : undefined}
            aria-describedby={errores.tipo ? "error-tipo-impedimento" : undefined}
            onChange={(evento) => setTipo(evento.target.value as TipoImpedimento | "")}
          >
            <option value="">Selecciona un tipo</option>
            {TIPOS_IMPEDIMENTO.map((codigo) => (
              <option key={codigo} value={codigo}>
                {etiquetas.get(codigo) ?? ETIQUETAS_TIPO_IMPEDIMENTO[codigo]}
              </option>
            ))}
          </select>
          {errores.tipo ? (
            <p className="campo-error" id="error-tipo-impedimento" data-testid="error-tipo-impedimento">
              {errores.tipo}
            </p>
          ) : null}
        </div>
        <CampoTextoContador
          id="campo-titulo-impedimento"
          testId="campo-titulo-impedimento"
          testIdContador="contador-titulo-impedimento"
          testIdError="error-titulo-impedimento"
          etiqueta="Título"
          obligatorio
          max={200}
          valor={titulo}
          onCambio={setTitulo}
          error={errores.titulo}
          refControl={refTitulo}
        />
      </div>
      <CampoTextoContador
        id="campo-descripcion-impedimento"
        testId="campo-descripcion-impedimento"
        testIdContador="contador-descripcion-impedimento"
        testIdError="error-descripcion-impedimento"
        etiqueta="Descripción"
        obligatorio
        multilinea
        max={1000}
        valor={descripcion}
        onCambio={setDescripcion}
        ayuda={`Qué te impide avanzar y desde cuándo (mínimo ${minimo} caracteres${tipo === "OTRO" ? ", porque el tipo es «Otro»" : "; 20 si el tipo es «Otro»"}).`}
        error={errores.descripcion}
        refControl={refDescripcion}
      />
      {candidatos.isError ? (
        <BloqueEstado id="responsables-impedimento" estado="error" mensaje="No pudimos cargar a quienes pueden resolverlo." onReintentar={() => candidatos.refetch()} />
      ) : (
        <SelectorResponsable
          idSelect="campo-responsable-impedimento"
          idOtro="campo-responsable-otro"
          testIdSelect="campo-responsable-impedimento"
          testIdOtro="campo-responsable-otro"
          testIdError="error-responsable-impedimento"
          testIdErrorOtro="error-responsable-otro"
          etiqueta="Responsable de resolverlo"
          ayuda="La persona elegida no obtiene permisos en Quality360; sirve para saber a quién se le pidió."
          candidatos={candidatos.data?.items ?? []}
          valor={responsable}
          nombreOtro={nombreOtro}
          onCambioValor={(v) => {
            setResponsable(v);
            if (v === VALOR_OTRO) setTimeout(() => refOtro.current?.focus(), 0);
          }}
          onCambioNombre={setNombreOtro}
          error={errores.responsable}
          errorOtro={errores.otro}
          refSelect={refResponsable}
          refOtro={refOtro}
        />
      )}
      {errorGlobal ? (
        <p className="mensaje-error-global" role="alert" data-testid="error-accion-impedimento">
          {errorGlobal}
        </p>
      ) : null}
      <div className="acciones-formulario">
        <button type="button" className="boton boton--secundario" data-testid="boton-cancelar-impedimento" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="boton boton--primario" data-testid="boton-guardar-impedimento" disabled={registrar.isPending} onClick={() => void guardar()}>
          {registrar.isPending ? "Guardando…" : "Guardar impedimento"}
        </button>
      </div>
    </div>
  );
}
