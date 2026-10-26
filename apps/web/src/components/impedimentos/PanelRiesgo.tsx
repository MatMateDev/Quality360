import { useId, useState } from "react";
import { useHistorialRiesgo, useRiesgoHdu } from "@/api/riesgo";
import { useAuth } from "@/auth/AuthContext";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_NIVEL_RIESGO, ETIQUETAS_ROL, GLIFO_NIVEL_RIESGO, type NivelRiesgo, type ResultadoCambioRiesgo } from "@/types/dominio";
import { BloqueDatos, type EstadoDatos } from "../bandeja/Estructura";
import { DialogoFijarRiesgo } from "./DialogoFijarRiesgo";
import { FactoresRiesgo } from "./FactoresRiesgo";
import { SemaforoRiesgo } from "./SemaforoRiesgo";

const nombreNivel = (n: NivelRiesgo | null) => (n ? ETIQUETAS_NIVEL_RIESGO[n] : "Sin nivel");

/**
 * Panel «Riesgo» del detalle (E4-F04). Para el Analista no existe: ni placeholder ni llamada al servicio (D73), así
 * que el padre decide montarlo y aquí se vuelve a comprobar el rol que informa el backend.
 */
export function PanelRiesgo({ hduId }: { hduId: string }) {
  const { perfil } = useAuth();
  const habilitado = perfil !== null && perfil.rol !== "ANALISTA_QA";
  const consulta = useRiesgoHdu(hduId, habilitado);
  const idTitulo = useId();
  const [dialogo, setDialogo] = useState<{ nivel: NivelRiesgo | null } | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const historial = useHistorialRiesgo(hduId, habilitado && historialAbierto);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!habilitado) return null;

  const r = consulta.data;
  let estado: EstadoDatos = "ok";
  if (consulta.isError) estado = consulta.error instanceof ErrorApi && consulta.error.status === 503 ? "indisponible" : "error";
  else if (consulta.isLoading || !r) estado = "cargando";

  function alGuardar(resultado: ResultadoCambioRiesgo) {
    setDialogo(null);
    setAviso(null);
    setMensaje(resultado.cambio ? "Nivel de riesgo guardado." : null);
    if (!resultado.cambio) setAviso("El nivel ya estaba fijado así");
  }

  const sugerenciaTexto = !r
    ? null
    : r.estado === "indisponible"
      ? "No disponible"
      : r.nivelSugerido
        ? ETIQUETAS_NIVEL_RIESGO[r.nivelSugerido]
        : null;

  return (
    <section className="panel panel-riesgo" id="riesgo" aria-labelledby={idTitulo} data-testid="panel-riesgo" aria-busy={estado === "cargando"}>
      <div className="panel-cabecera">
        <h2 id={idTitulo}>Riesgo</h2>
        {r?.permisos.puedeFijarRiesgo ? (
          <div className="acciones-tabla">
            {r.nivelSugerido ? (
              <button type="button" className="boton boton--secundario" data-testid="boton-usar-sugerido" onClick={() => setDialogo({ nivel: r.nivelSugerido })}>
                Usar el sugerido
              </button>
            ) : null}
            <button type="button" className="boton boton--primario" data-testid="boton-fijar-riesgo" onClick={() => setDialogo({ nivel: null })}>
              Fijar riesgo
            </button>
          </div>
        ) : null}
      </div>

      {mensaje ? (
        <p className="mensaje-exito" role="status" data-testid="mensaje-exito-riesgo">
          <span>{mensaje}</span>
        </p>
      ) : null}
      {aviso ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-sin-cambios">
          {aviso}
        </p>
      ) : null}

      <BloqueDatos clave="riesgo" estado={estado} mensajeIndisponible="No disponible" onReintentar={() => consulta.refetch()}>
        {r ? (
          <>
            <div className="panel-riesgo__rejilla">
              <div>
                <h3>Nivel vigente</h3>
                <SemaforoRiesgo
                  variante="lamparas"
                  nivel={r.nivelVigente}
                  estado={r.nivelVigente === null && r.estado === "indisponible" ? "indisponible" : "ok"}
                  origen={r.origen}
                  calculoParcial={r.calculoParcial && r.origen === "SUGERIDO"}
                />
                <p data-testid="riesgo-origen">
                  {r.fijado ? `Fijado por ${r.fijado.actor.nombre} (${ETIQUETAS_ROL[r.fijado.actor.rol]}) el ${formatearFecha(r.fijado.fecha)}` : r.nivelVigente ? "Sugerido por el sistema" : r.hduCerrada ? "HDU cerrada: el nivel no se recalcula" : null}
                </p>
                {r.fijado ? <p data-testid="riesgo-justificacion">«{r.fijado.justificacion}»</p> : null}
                {r.hduCerrada && r.nivelVigente ? <p>HDU cerrada: el nivel no se recalcula.</p> : null}
              </div>
              <div>
                <h3>Sugerencia del sistema</h3>
                {r.hduCerrada ? (
                  <p>Sin sugerencia: la HDU está cerrada.</p>
                ) : (
                  <>
                    <p>
                      Nivel sugerido:{" "}
                      <strong data-testid="riesgo-sugerido" data-nivel={r.nivelSugerido ?? "NO_DISPONIBLE"}>
                        {r.nivelSugerido ? (
                          <span className={`semaforo semaforo--${r.nivelSugerido.toLowerCase()}`}>
                            <span aria-hidden="true">{GLIFO_NIVEL_RIESGO[r.nivelSugerido]}</span> {ETIQUETAS_NIVEL_RIESGO[r.nivelSugerido]}
                          </span>
                        ) : (
                          sugerenciaTexto
                        )}
                      </strong>
                    </p>
                    <FactoresRiesgo factores={r.factores} noEvaluados={r.factoresNoEvaluados} />
                  </>
                )}
              </div>
            </div>
            {r.sugerenciaDistinta && r.nivelSugerido ? (
              <p className="mensaje-aviso" role="status" data-testid="aviso-sugerencia-distinta">
                <span aria-hidden="true">ⓘ </span>La sugerencia actual es {nombreNivel(r.nivelSugerido)}, distinta del nivel fijado.
              </p>
            ) : null}
            {r.calculoParcial ? (
              <p className="mensaje-aviso" role="status" data-testid="aviso-calculo-parcial">
                Cálculo parcial: no pudimos consultar el avance del checklist. El nivel real podría ser igual o mayor. Actualiza en unos minutos.{" "}
                <button type="button" className="boton boton--secundario" onClick={() => consulta.refetch()}>
                  Reintentar
                </button>
              </p>
            ) : null}
            <details className="historial-riesgo" data-testid="historial-riesgo" onToggle={(e) => setHistorialAbierto((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>Historial de cambios de nivel</summary>
              {historial.isLoading ? <p>Cargando…</p> : null}
              {historial.isError ? (
                <p>
                  No pudimos cargar el historial.{" "}
                  <button type="button" className="boton boton--secundario" onClick={() => historial.refetch()}>
                    Reintentar
                  </button>
                </p>
              ) : null}
              {historial.data && historial.data.items.length === 0 ? <p>Aún no se ha fijado un nivel.</p> : null}
              {historial.data && historial.data.items.length > 0 ? (
                <ul className="historial-lista">
                  {historial.data.items.map((e) => (
                    <li key={e.id} className="historial-item">
                      <time dateTime={e.fecha}>{formatearFecha(e.fecha)}</time>
                      <p>
                        {e.actor.nombre} cambió el riesgo de {e.anterior ? nombreNivel(e.anterior as NivelRiesgo) : "sin nivel"} a {nombreNivel(e.nuevo as NivelRiesgo)}
                        {e.sugeridoAlFijar ? ` (sugerido entonces: ${nombreNivel(e.sugeridoAlFijar)})` : ""} — «{e.comentario}»
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          </>
        ) : null}
      </BloqueDatos>

      {dialogo && r ? (
        <DialogoFijarRiesgo
          hduId={hduId}
          nivelInicial={dialogo.nivel}
          sugerido={r.nivelSugerido}
          onCerrar={() => setDialogo(null)}
          onGuardado={alGuardar}
          onDesactualizado={(m) => {
            setDialogo(null);
            setMensaje(null);
            setAviso(m);
            void consulta.refetch();
          }}
        />
      ) : null}
    </section>
  );
}
