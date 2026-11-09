import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatearFecha } from "@/lib/formato";
import {
  esTopeDeConsulta,
  haySinNovedades,
  TEXTO_CONSERVA,
  TEXTO_CONSULTA_CONSERVADA,
  TEXTO_ESPERA_429,
  TEXTO_FALLIDA_SIN_GUARDAR,
  textoAvisoIncompletaConsulta,
  textoEstaTanda,
  textoLimiteTasa,
  textoRevisar,
  textoSinNovedades,
  titularConsulta,
} from "@/lib/mensajesConsulta";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import { formatearDuracion } from "@/lib/textosEjecucion";
import type { Consulta, Ejecucion } from "@/types/dominio";
import { ErrorIntegracion, type AccionesSugerencia } from "./ErrorIntegracion";
import { InsigniaResultado } from "./Insignias";
import { ResumenConsulta } from "./ResumenConsulta";

interface Props {
  ejecucion: Ejecucion;
  /** La consulta tras la tanda (cifras acumuladas, D149). `null` si la tanda falló o no guardó nada. */
  consulta: Consulta | null;
  /** Hay otra consulta abierta que esta tanda no tocó (solo en tandas fallidas). */
  hayAbierta: boolean;
  acciones: AccionesSugerencia;
  onRevisar: () => void;
}

/** Resultado de una tanda de «Consultar Jira» (diseño §3.2, §3.3 y §7.2). El texto sale de tablas locales, nunca del servidor. */
export function ResultadoConsulta({ ejecucion, consulta, hayAbierta, acciones, onRevisar }: Props) {
  const encabezado = useRef<HTMLHeadingElement>(null);
  const aviso = useRef<HTMLDivElement>(null);
  const incompleta = ejecucion.resultado === "INCOMPLETA";
  const fallida = ejecucion.resultado === "FALLIDA";

  useEffect(() => {
    if (fallida) return;
    (incompleta ? aviso.current : encabezado.current)?.focus();
  }, [ejecucion.id, incompleta, fallida]);

  const cifras = consulta ?? ejecucion;
  const titular = titularConsulta(ejecucion);
  const revisar = consulta ? textoRevisar(consulta.nuevas, consulta.cambiaron) : null;
  const sinNovedades = consulta ? haySinNovedades(consulta, ejecucion) : false;
  const hayContinuaciones = consulta !== null && consulta.leidas !== ejecucion.leidas;
  const tasa = ejecucion.codigoError === "JIRA_LIMITE_DE_TASA";

  return (
    <section className="panel" data-testid="resultado-consulta" aria-labelledby="resultado-consulta-titulo">
      <div className="panel-resultado__cabecera">
        <h3 id="resultado-consulta-titulo" ref={encabezado} tabIndex={-1}>
          Resultado
        </h3>
        <InsigniaResultado resultado={ejecucion.resultado} testId="resultado-ejecucion" />
        <span>
          <time dateTime={ejecucion.iniciadaEn}>{formatearFecha(ejecucion.iniciadaEn)}</time> · duración {formatearDuracion(ejecucion.duracionMs)}
        </span>
        <Link to={`${RUTAS_INTEGRACIONES.historial}?ejecucion=${ejecucion.id}`} data-testid="enlace-ver-detalle-ejecucion">
          Ver detalle en el Historial
        </Link>
      </div>

      {fallida ? (
        <ErrorIntegracion
          testId="error-consulta"
          codigo={ejecucion.codigoError ?? "DESCONOCIDO"}
          titulo="No se pudo consultar Jira"
          sugerencias={tasa ? ["REINTENTAR", "IMPORTAR_ARCHIVO"] : ejecucion.sugerencias}
          acciones={acciones}
          idReintentar="boton-reintentar-consulta"
          textoReintentar="Consultar de nuevo"
          pie={
            <>
              {TEXTO_FALLIDA_SIN_GUARDAR}
              {hayAbierta ? <> {TEXTO_CONSULTA_CONSERVADA}</> : null}
              {tasa ? <> {TEXTO_ESPERA_429}</> : null}
            </>
          }
        />
      ) : (
        <>
          {titular ? <p>{titular}</p> : null}
          <ResumenConsulta cifras={cifras} />
          {hayContinuaciones ? (
            <p className="campo-ayuda" data-testid="texto-esta-tanda">
              {textoEstaTanda(ejecucion.leidas)}
            </p>
          ) : null}
          {ejecucion.reintentos429 > 0 ? (
            <p className="mensaje-aviso" role="status" data-testid="aviso-limite-tasa">
              {textoLimiteTasa(ejecucion.reintentos429)}
            </p>
          ) : null}
          {sinNovedades ? (
            <p className="mensaje-sin-cambios" role="status" data-testid="mensaje-sin-novedades">
              <span aria-hidden="true">✓</span> {textoSinNovedades(ejecucion.leidas)}
            </p>
          ) : null}
          {incompleta ? (
            <div className="panel-resultado panel-resultado--incompleta" role="status" tabIndex={-1} ref={aviso} data-testid="aviso-incompleta" id="aviso-incompleta">
              <p>
                <span aria-hidden="true">◔</span> {textoAvisoIncompletaConsulta(ejecucion)}
              </p>
              <p>{esTopeDeConsulta(ejecucion) ? "Las ejecuciones anteriores quedan en el Historial." : TEXTO_CONSERVA}</p>
            </div>
          ) : null}
          {revisar ? (
            <p>
              <button type="button" className="boton boton--primario" data-testid="enlace-revisar-consulta" onClick={onRevisar}>
                {revisar}
              </button>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
