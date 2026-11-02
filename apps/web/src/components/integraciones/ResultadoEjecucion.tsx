import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useFilasPorResultado } from "@/api/integraciones";
import { formatearFecha } from "@/lib/formato";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import { esSinCambios, formatearDuracion, formatearTamano, textoAvisoIncompleta, textoSinCambios, titularResultado } from "@/lib/textosEjecucion";
import type { Ejecucion } from "@/types/dominio";
import { ErrorIntegracion, type AccionesSugerencia } from "./ErrorIntegracion";
import { InsigniaResultado } from "./Insignias";
import { ListasFilasEjecucion } from "./ListasFilasEjecucion";
import { ResumenEjecucion } from "./ResumenEjecucion";

interface Props {
  ejecucion: Ejecucion;
  modo: "jira" | "archivo";
  /** `resultado-sincronizacion` o `resultado-importacion`. */
  testId: string;
  /** `error-sincronizacion` o `error-archivo`. */
  testIdError: string;
  vincularActivo: boolean;
  totalFilasArchivo?: number;
  acciones: AccionesSugerencia;
}

/** Omitidas por «ya existe una HDU creada a mano» cuando no se pidió vincular: se sugiere activar «Vincular…». */
function AvisoVincularSugerido({ ejecucion }: { ejecucion: Ejecucion }) {
  const consulta = useFilasPorResultado(ejecucion.id, "OMITIDA", ejecucion.omitidas > 0);
  const filas = consulta.data?.pages.flatMap((p) => p.items) ?? [];
  const manuales = filas.filter((f) => f.motivo === "HDU_MANUAL_EXISTENTE").length;
  if (manuales === 0) return null;
  const mas = consulta.hasNextPage;
  return (
    <p className="mensaje-aviso" role="status" data-testid="aviso-vincular-sugerido">
      {mas ? "Varias historias" : `${manuales} ${manuales === 1 ? "historia" : "historias"}`} se omitieron porque ya existen como HDU creadas a mano. Activa «Vincular HDU creadas a mano con el mismo código» y sincroniza de nuevo para adoptarlas.
    </p>
  );
}

/** Resultado de una sincronización o de una importación (diseño §4.4–§4.6 y §6.5). Los textos salen de tablas locales. */
export function ResultadoEjecucion({ ejecucion, modo, testId, testIdError, vincularActivo, totalFilasArchivo, acciones }: Props) {
  const encabezado = useRef<HTMLHeadingElement>(null);
  const aviso = useRef<HTMLDivElement>(null);
  const incompleta = ejecucion.resultado === "INCOMPLETA";
  const fallida = ejecucion.resultado === "FALLIDA";
  const titular = titularResultado(ejecucion, modo);

  useEffect(() => {
    // La espera terminó: el foco va al resultado para que se anuncie (INCOMPLETA tiene su propio aviso).
    if (fallida) return;
    (incompleta ? aviso.current : encabezado.current)?.focus();
  }, [ejecucion.id, incompleta, fallida]);

  return (
    <section className="panel" data-testid={testId} aria-labelledby={`${testId}-titulo`}>
      <div className="panel-resultado__cabecera">
        <h3 id={`${testId}-titulo`} ref={encabezado} tabIndex={-1}>
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

      {modo === "archivo" && ejecucion.archivo ? (
        <p data-testid="cabecera-archivo">
          Archivo: <span className="celda-titulo-corta" title={ejecucion.archivo.nombre}>{ejecucion.archivo.nombre}</span> · {formatearTamano(ejecucion.archivo.tamano)} · huella{" "}
          <span title={ejecucion.archivo.huella}>{ejecucion.archivo.huella.slice(0, 12)}…</span>
        </p>
      ) : null}

      {fallida ? (
        <>
          <ErrorIntegracion
            testId={testIdError}
            codigo={ejecucion.codigoError ?? "DESCONOCIDO"}
            contexto={{ conError: ejecucion.conError }}
            titulo={modo === "jira" ? "No se pudo sincronizar" : "No se importó nada"}
            sugerencias={ejecucion.sugerencias}
            acciones={acciones}
            pie="La ejecución quedó registrada como fallida y no se creó ninguna HDU."
          />
          {modo === "archivo" ? <ResumenEjecucion ejecucion={ejecucion} /> : null}
        </>
      ) : (
        <>
          {titular ? <p>{titular}</p> : null}
          <ResumenEjecucion ejecucion={ejecucion} />
          {ejecucion.reintentos429 > 0 && modo === "jira" ? (
            <p className="mensaje-aviso" role="status" data-testid="aviso-limite-tasa">
              Jira pidió esperar {ejecucion.reintentos429} {ejecucion.reintentos429 === 1 ? "vez" : "veces"}; se reintentó.
            </p>
          ) : null}
          {esSinCambios(ejecucion) ? (
            <p className="mensaje-sin-cambios" role="status" data-testid="mensaje-sin-cambios">
              {textoSinCambios(ejecucion, modo)}
            </p>
          ) : null}
          {incompleta ? (
            <div className="panel-resultado panel-resultado--incompleta" role="status" tabIndex={-1} ref={aviso} data-testid="aviso-incompleta" id="aviso-incompleta">
              <p>
                <span aria-hidden="true">◔</span> {textoAvisoIncompleta(ejecucion, modo, totalFilasArchivo)}
              </p>
              <p>Las ejecuciones anteriores quedan en el Historial.</p>
              {modo === "archivo" && acciones.importarMismoArchivo ? (
                <button type="button" className="boton boton--secundario" data-testid="boton-importar-de-nuevo" onClick={acciones.importarMismoArchivo}>
                  Importar el mismo archivo
                </button>
              ) : null}
            </div>
          ) : null}
          {modo === "jira" && !vincularActivo && ejecucion.omitidas > 0 ? <AvisoVincularSugerido ejecucion={ejecucion} /> : null}
        </>
      )}

      {ejecucion.leidas > 0 || ejecucion.conError > 0 ? (
        <ListasFilasEjecucion ejecucionId={ejecucion.id} creadas={ejecucion.creadas} actualizadas={ejecucion.actualizadas} omitidas={ejecucion.omitidas} conError={ejecucion.conError} />
      ) : null}
    </section>
  );
}
