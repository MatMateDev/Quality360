import { useEffect, useId, useRef, useState } from "react";
import { useFijarUmbral, useUmbral } from "@/api/indicadores";
import { BloqueEstado } from "@/components/BloqueEstado";
import { ErrorApi } from "@/lib/httpClient";

const TEXTO_ENTERO = "Ingresa un número entero";
const TEXTO_RANGO = "El umbral debe estar entre 1 y 50";

const unidad = (n: number) => `${n} HDU ${n === 1 ? "activa" : "activas"}`;

/**
 * Umbral de sobrecarga (E6-F03, D159, D183): solo el QE dueño. Es `type="text"` a propósito: con `type="number"` el
 * navegador impediría escribir «abc» o «2.5» y el mensaje de error nunca aparecería. Valida al pulsar, no antes.
 */
export function PanelUmbral() {
  const consulta = useUmbral(undefined);
  const fijar = useFijarUmbral();
  const [texto, setTexto] = useState("");
  const [sucio, setSucio] = useState(false);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const idAyuda = useId();
  const idError = useId();

  const vigente = consulta.data;
  useEffect(() => {
    if (vigente && !sucio) setTexto(String(vigente.valor));
  }, [vigente, sucio]);

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setExito(null);
    setErrorGlobal(null);
    const limpio = texto.trim();
    if (!/^\d+$/.test(limpio)) {
      setErrorCampo(TEXTO_ENTERO);
      campo.current?.focus();
      return;
    }
    const valor = Number(limpio);
    if (valor < 1 || valor > 50) {
      setErrorCampo(TEXTO_RANGO);
      campo.current?.focus();
      return;
    }
    setErrorCampo(null);
    try {
      const r = await fijar.mutateAsync(valor);
      setSucio(false);
      setTexto(String(r.umbral.valor));
      setExito(r.cambio ? `Umbral guardado: ${unidad(r.umbral.valor)}` : `El umbral ya era ${r.umbral.valor}`);
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 400) {
        setErrorCampo(error.codigo === "VALOR_FUERA_DE_RANGO" ? TEXTO_RANGO : TEXTO_ENTERO);
        campo.current?.focus();
      } else if (error instanceof ErrorApi && error.status === 403) {
        setErrorGlobal("Ya no tienes permiso para esta acción");
      } else {
        setErrorGlobal("No fue posible guardar. Intenta nuevamente.");
      }
    }
  }

  return (
    <section className="panel panel-umbral" aria-labelledby="titulo-umbral" data-testid="panel-umbral">
      <h2 id="titulo-umbral">Umbral de sobrecarga</h2>
      {consulta.isError ? (
        <BloqueEstado id="umbral" estado="error" onReintentar={() => void consulta.refetch()} />
      ) : (
        <form onSubmit={(e) => void guardar(e)} noValidate aria-busy={fijar.isPending}>
          <div className="campo">
            <label htmlFor="campo-umbral">
              Umbral (HDU activas)
              <span aria-hidden="true"> *</span>
              <span className="sr-only"> (obligatorio)</span>
            </label>
            <input
              ref={campo}
              id="campo-umbral"
              data-testid="campo-umbral"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={consulta.isPending ? "" : texto}
              disabled={consulta.isPending}
              placeholder={consulta.isPending ? "Cargando…" : undefined}
              aria-required="true"
              aria-invalid={errorCampo ? true : undefined}
              aria-describedby={`${idAyuda}${errorCampo ? ` ${idError}` : ""}`}
              onChange={(e) => {
                setTexto(e.target.value);
                setSucio(true);
              }}
            />
          </div>
          <button type="submit" className="boton boton--primario" data-testid="boton-guardar-umbral" disabled={fijar.isPending || consulta.isPending}>
            {fijar.isPending ? "Guardando…" : "Guardar umbral"}
          </button>
          {vigente?.porDefecto ? (
            <span className="insignia-defecto" data-testid="insignia-umbral-defecto">
              Valor por defecto
            </span>
          ) : null}
        </form>
      )}
      <p className="campo-ayuda" id={idAyuda}>
        De 1 a 50 HDU activas; se considera sobrecarga superar este valor.
      </p>
      {vigente ? (
        <p data-testid="resumen-umbral">Hay sobrecarga con más de {unidad(vigente.valor)}</p>
      ) : null}
      {errorCampo ? (
        <p className="campo-error" id={idError} role="alert" data-testid="error-umbral">
          {errorCampo}
        </p>
      ) : null}
      {exito ? (
        <p className="mensaje-exito" role="status" data-testid="mensaje-exito-umbral">
          {exito}
        </p>
      ) : null}
      {errorGlobal ? (
        <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
          {errorGlobal}
        </p>
      ) : null}
    </section>
  );
}
