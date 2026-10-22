import { useEffect, useState } from "react";
import { useCelulas } from "@/api/catalogos";
import { useCelulasLider, useGuardarCelulasLider } from "@/api/usuarios";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFechaCorta } from "@/lib/formato";
import type { Usuario } from "@/types/dominio";
import { BloqueEstado } from "./BloqueEstado";
import { DialogoConfirmacion } from "./DialogoConfirmacion";
import { SelectorCelulas } from "./SelectorCelulas";

interface Props {
  /** `null` = cerrado. */
  usuario: Usuario | null;
  /** Abre con todo desmarcado (acción «Quitar células» del 409). */
  vacioInicial?: boolean;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}

/**
 * «Células de {nombre}»: reconsulta las vigentes al abrir, resume lo que se agrega y lo que se quita, pide
 * confirmación adicional solo al quitar e incluye el historial con fechas (diseño E7 §3.3).
 */
export function DialogoCelulasLider({ usuario, vacioInicial = false, onCerrar, onGuardado }: Props) {
  const celulasQuery = useCelulas();
  const lider = useCelulasLider(usuario?.id ?? null);
  const guardar = useGuardarCelulasLider();
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [inicializado, setInicializado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInicializado(false);
    setError(null);
  }, [usuario?.id, vacioInicial]);

  useEffect(() => {
    if (lider.data && !inicializado) {
      setSeleccion(vacioInicial ? [] : lider.data.vigentes.map((v) => v.celula.id));
      setInicializado(true);
    }
  }, [lider.data, inicializado, vacioInicial]);

  if (!usuario) return null;
  const catalogo = celulasQuery.data?.items ?? [];
  const nombre = (id: string) => catalogo.find((c) => c.id === id)?.nombre ?? id;
  const nombres = (ids: string[]) => ids.map(nombre).sort((a, b) => a.localeCompare(b));
  const vigentes = lider.data?.vigentes.map((v) => v.celula.id) ?? [];
  const agregadas = seleccion.filter((id) => !vigentes.includes(id));
  const quitadas = vigentes.filter((id) => !seleccion.includes(id));
  const sinCambios = agregadas.length === 0 && quitadas.length === 0;
  const quita = quitadas.length > 0;

  async function confirmar() {
    if (!usuario) return;
    setError(null);
    try {
      await guardar.mutateAsync({ id: usuario.id, body: { celulaIds: seleccion } });
      onGuardado(
        seleccion.length > 0
          ? `${usuario.nombre} ahora tiene a cargo ${nombres(seleccion).join(" y ")}.`
          : `${usuario.nombre} ya no tiene células a cargo.`,
      );
      onCerrar();
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === "ROL_INCOMPATIBLE") {
        setError("Este usuario ya no es Líder QA. Actualizamos los datos.");
        void lider.refetch();
      } else if (e instanceof ErrorApi && e.status === 422) {
        setError("Alguna de las células seleccionadas ya no existe. Actualizamos la lista.");
        void celulasQuery.refetch();
      } else {
        setError(e instanceof ErrorApi && e.status < 500 ? e.mensaje : "No fue posible guardar. Intenta nuevamente.");
      }
    }
  }

  return (
    <DialogoConfirmacion
      abierto
      testId="dialogo-celulas"
      titulo={`Células de ${usuario.nombre}`}
      etiquetaConfirmar={guardar.isPending ? "Guardando…" : quita ? "Quitar y guardar" : "Guardar células"}
      peligro={quita}
      deshabilitado={guardar.isPending || sinCambios || !inicializado}
      cerrarAlClicFuera={sinCambios}
      onConfirmar={() => void confirmar()}
      onCancelar={onCerrar}
    >
      {lider.isLoading ? <BloqueEstado id="celulas-lider" estado="cargando" /> : null}
      {lider.isError ? <BloqueEstado id="celulas-lider" estado="error" onReintentar={() => lider.refetch()} /> : null}
      {lider.data ? (
        <>
          <p data-testid="celulas-vigentes">
            Vigentes: {lider.data.vigentes.length > 0 ? lider.data.vigentes.map((v) => v.celula.nombre).join(", ") : "ninguna"}
          </p>
          <SelectorCelulas celulas={catalogo} seleccionadas={seleccion} onChange={setSeleccion} />
          <p role="status" data-testid="resumen-cambio-celulas">
            {sinCambios ? "Sin cambios." : null}
            {agregadas.length > 0 ? `Se agregará ${nombres(agregadas).join(", ")}. ` : null}
            {quita ? `${usuario.nombre} dejará de ver las HDU de ${nombres(quitadas).join(", ")}.` : null}
          </p>
          <details data-testid="historial-celulas-lider">
            <summary>Historial ({lider.data.historial.length})</summary>
            {lider.data.historial.length === 0 ? (
              <p>Aún no tiene historial</p>
            ) : (
              <ul className="historial-lista">
                {lider.data.historial.map((h) => (
                  <li key={h.id} className="historial-item" data-testid={`historial-celula-${h.celula.id}`}>
                    {h.celula.nombre} · desde <time dateTime={h.desde}>{formatearFechaCorta(h.desde)}</time>
                    {h.hasta ? (
                      <>
                        {" "}
                        hasta <time dateTime={h.hasta}>{formatearFechaCorta(h.hasta)}</time>
                      </>
                    ) : (
                      " · vigente"
                    )}{" "}
                    · asignó {h.asignadoPor.nombre}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </>
      ) : null}
      {error ? (
        <p className="campo-error" role="alert" data-testid="error-celulas-lider">
          {error}
        </p>
      ) : null}
    </DialogoConfirmacion>
  );
}
