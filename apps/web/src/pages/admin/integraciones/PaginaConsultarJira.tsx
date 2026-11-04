import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  codigoDeEscritura,
  consultarEstado,
  esIndisponible,
  llamadasConsulta,
  useConfiguracionJira,
  useConsultaActual,
  useConsultarJira,
  useContinuarConsulta,
  useEstadoIntegracion,
} from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { ConsultaAbierta, ConsultaCerrada, ID_TITULO_CONSULTA } from "@/components/integraciones/ConsultaAbierta";
import { ResultadoConfirmacion } from "@/components/integraciones/ResultadoConfirmacion";
import { ErrorIntegracion } from "@/components/integraciones/ErrorIntegracion";
import { ChipConexion, InsigniaResultado } from "@/components/integraciones/Insignias";
import { PanelEsperaEjecucion } from "@/components/integraciones/PanelEsperaEjecucion";
import { ResultadoConsulta } from "@/components/integraciones/ResultadoConsulta";
import { formatearFecha } from "@/lib/formato";
import { ErrorApi } from "@/lib/httpClient";
import {
  TEXTO_CONSULTANDO,
  TEXTO_CONSULTANDO_NOTA,
  TEXTO_EN_CURSO,
  TEXTO_NO_CREA_HDU,
  TEXTO_QUE_SE_ACTUALIZA,
  TEXTO_SIN_CONSULTA,
  TEXTO_VENCIDA,
  textoReemplazo,
} from "@/lib/mensajesConsulta";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import type { Consulta, ErrorConsultaAbierta, Ejecucion, ResultadoConfirmacion as ResultadoConfirmacionJira } from "@/types/dominio";

const INTERVALO_MS = 3000;
const LIMITE_ESPERA_MS = 30_000;
const TOPE_FILAS_CONSULTA = 500;

function hostDe(sitio: string | null): string {
  if (!sitio) return "";
  try {
    return new URL(sitio).host;
  } catch {
    return sitio;
  }
}

type Fallo = { codigo: string } | { permiso: true } | { global: true };
interface Tanda {
  ejecucion: Ejecucion;
  consulta: Consulta | null;
  /** Había otra consulta abierta que la tanda no tocó. */
  hayAbierta: boolean;
}

/**
 * Pestaña «Consultar Jira» (E5-F02): una sola petición por tanda, espera indeterminada, resultado con cifras
 * acumuladas, «Continuar consulta» y la consulta abierta. La revisión por grupo y la confirmación se montan
 * sobre `ConsultaAbierta` (FC3 y FC4).
 */
export function PaginaConsultarJira() {
  const configuracion = useConfiguracionJira();
  const config = configuracion.data;
  const configurado = Boolean(config?.configurado);
  const actual = useConsultaActual({ habilitado: configurado });
  const consultar = useConsultarJira();
  const continuar = useContinuarConsulta();

  const [tanda, setTanda] = useState<Tanda | null>(null);
  const [resultadoConfirmacion, setResultadoConfirmacion] = useState<{ ejecucion: Ejecucion; descartadas: number; tipo: { nuevas: number; cambios: number } } | null>(null);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [reemplazo, setReemplazo] = useState<ErrorConsultaAbierta | null>(null);
  const [llaveAusente, setLlaveAusente] = useState(false);
  const [enCursoLocal, setEnCursoLocal] = useState(false);
  const [esperaAgotada, setEsperaAgotada] = useState(false);
  const [avisoVencida, setAvisoVencida] = useState(false);

  const [sondeo, setSondeo] = useState(true);
  const estado = useEstadoIntegracion({ intervalo: sondeo ? INTERVALO_MS : false });
  const datosEstado = estado.data;
  const trabajando = consultar.isPending || continuar.isPending;
  const ajenaEnCurso = Boolean(datosEstado?.enCurso && !datosEstado.enCurso.abandonada) && !trabajando;
  const abandonada = Boolean(datosEstado?.enCurso?.abandonada);

  // Solo se consulta cada 3 s mientras hay una ejecución ajena en curso, y hasta 30 s (diseño §4.3).
  useEffect(() => {
    if (!ajenaEnCurso) {
      setSondeo(false);
      setEsperaAgotada(false);
      return;
    }
    setSondeo(true);
    const temporizador = setTimeout(() => {
      setSondeo(false);
      setEsperaAgotada(true);
    }, LIMITE_ESPERA_MS);
    return () => clearTimeout(temporizador);
  }, [ajenaEnCurso]);

  let vista: EstadoDatos;
  if (configuracion.isError) vista = esIndisponible(configuracion.error) ? "indisponible" : "error";
  else if (configuracion.isLoading || !config) vista = "cargando";
  else vista = "ok";

  let vistaConsulta: EstadoDatos = "ok";
  if (actual.isError) vistaConsulta = esIndisponible(actual.error) ? "indisponible" : "error";
  else if (actual.isLoading || !actual.data) vistaConsulta = "cargando";

  const consulta = actual.data?.consulta ?? null;
  const hayQueRevisar = Boolean(consulta && consulta.nuevas + consulta.cambiaron > 0);
  const vencida = !consulta && actual.data?.ultimaCerrada?.estado === "VENCIDA";
  const cerrada = actual.data?.ultimaCerrada ?? null;
  const cerradaVisible = !consulta && cerrada && ["CONFIRMADA", "REEMPLAZADA", "DESCARTADA"].includes(cerrada.estado) ? cerrada : null;

  function alVencer() {
    setAvisoVencida(true);
    void actual.refetch();
  }

  function alConfirmar(respuesta: ResultadoConfirmacionJira, tipo: { nuevas: number; cambios: number }) {
    setTanda(null);
    setFallo(null);
    setResultadoConfirmacion({ ejecucion: respuesta.ejecucion, descartadas: respuesta.consulta.descartadas, tipo });
  }
  const deshabilitada = Boolean(config && !config.llaveDisponible) || llaveAusente;
  const enCurso = trabajando || ajenaEnCurso || enCursoLocal;
  const puedeContinuar = Boolean(consulta?.hayMas && consulta.leidas < TOPE_FILAS_CONSULTA);

  function manejarError(error: unknown) {
    const codigo = codigoDeEscritura(error);
    if (error instanceof ErrorApi && error.status === 409 && codigo === "CONSULTA_ABIERTA") {
      setReemplazo(error.cuerpo as ErrorConsultaAbierta);
    } else if (error instanceof ErrorApi && error.status === 409 && codigo === "INTEGRACION_EN_CURSO") {
      setEnCursoLocal(true);
      setSondeo(true);
      void estado.refetch();
    } else if (error instanceof ErrorApi && error.status === 410) {
      setAvisoVencida(true);
      void actual.refetch();
    } else if (error instanceof ErrorApi && error.status === 409 && ["CONSULTA_NO_ABIERTA", "CONSULTA_LLENA", "CONSULTA_COMPLETA"].includes(codigo)) {
      void actual.refetch();
      setFallo({ codigo });
    } else if (error instanceof ErrorApi && error.status === 409 && (codigo === "JIRA_NO_CONFIGURADO" || codigo === "TOKEN_NO_DESCIFRABLE")) {
      setFallo({ codigo });
    } else if (error instanceof ErrorApi && error.status === 503 && codigo === "LLAVE_CIFRADO_NO_DISPONIBLE") {
      setLlaveAusente(true);
    } else if (error instanceof ErrorApi && error.status === 403) {
      setFallo({ permiso: true });
    } else {
      setFallo({ global: true });
    }
  }

  /** D115: tras un 504 o un corte de red la tanda pudo haberse completado; se relee el estado y la consulta abierta. */
  async function recuperarTrasSinRespuesta(inicio: number) {
    setFallo({ codigo: "SIN_RESPUESTA_CONSULTA" });
    try {
      const [estadoActual, consultaActual] = await Promise.all([consultarEstado(), llamadasConsulta.actual()]);
      const ultima = estadoActual.ultimaEjecucion;
      if (ultima && ultima.fase === "CONSULTA" && new Date(ultima.iniciadaEn).getTime() >= inicio - 5000) {
        setTanda({ ejecucion: ultima, consulta: consultaActual.consulta, hayAbierta: false });
      }
    } catch {
      /* sigue la advertencia de SIN_RESPUESTA */
    }
  }

  async function ejecutar(accion: () => Promise<{ ejecucion: Ejecucion; consulta: Consulta | null }>, hayAbierta: boolean) {
    const inicio = Date.now();
    setFallo(null);
    setTanda(null);
    setResultadoConfirmacion(null);
    setAvisoVencida(false);
    setEnCursoLocal(false);
    try {
      const respuesta = await accion();
      setTanda({ ejecucion: respuesta.ejecucion, consulta: respuesta.consulta, hayAbierta: hayAbierta && respuesta.consulta === null });
    } catch (error) {
      if (codigoDeEscritura(error) === "SIN_RESPUESTA") await recuperarTrasSinRespuesta(inicio);
      else manejarError(error);
    }
  }

  const consultarJira = (reemplazar = false) => ejecutar(() => consultar.mutateAsync({ reemplazar }), Boolean(consulta));
  const continuarConsulta = () => (consulta ? ejecutar(() => continuar.mutateAsync(consulta.id), false) : Promise.resolve());

  function irARevision() {
    document.getElementById(ID_TITULO_CONSULTA)?.focus();
  }

  const acciones = {
    irAConexion: RUTAS_INTEGRACIONES.conexion,
    importarArchivo: RUTAS_INTEGRACIONES.importar,
    reintentar: () => void consultarJira(),
  };
  const ultima = datosEstado?.ultimaEjecucion;
  const columnasMovil = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 750px)").matches;

  return (
    <div data-testid="pestana-sincronizar-contenido">
      <BloqueDatos clave="sincronizacion" estado={vista} onReintentar={() => void configuracion.refetch()}>
        {config && !config.configurado ? (
          <div className="bloque-estado bloque-estado--vacio" data-testid="estado-vacio-jira" role="status">
            <p>Configura la conexión con Jira antes de consultar</p>
            <Link to={RUTAS_INTEGRACIONES.conexion}>Ir a Conexión</Link>
          </div>
        ) : config ? (
          <>
            <section className="panel" aria-labelledby="titulo-consultar">
              <h2 id="titulo-consultar">Sincronizar con Jira</h2>
              <p>
                Proyecto <strong>{config.proyecto}</strong> en <span className="texto-largo">{hostDe(config.sitio)}</span> <ChipConexion estado={config.estadoConexion} />
              </p>
              {config.estadoConexion === "FALLIDA" ? (
                <p className="mensaje-aviso" role="note">
                  La última prueba de conexión falló. Revisa la conexión
                </p>
              ) : null}
              <p data-testid="resumen-ultima-sync">
                {ultima ? (
                  <>
                    Última ejecución: <time dateTime={ultima.iniciadaEn}>{formatearFecha(ultima.iniciadaEn)}</time> · <InsigniaResultado resultado={ultima.resultado} /> ·{" "}
                    <Link to={`${RUTAS_INTEGRACIONES.historial}?ejecucion=${ultima.id}`}>Ver detalle</Link>
                  </>
                ) : (
                  "Aún no se ha consultado Jira"
                )}
              </p>
              <p>{TEXTO_NO_CREA_HDU}</p>
              <details open={!columnasMovil}>
                <summary>Qué se puede actualizar al confirmar</summary>
                <p>{TEXTO_QUE_SE_ACTUALIZA}</p>
              </details>

              {deshabilitada ? (
                <p className="mensaje-error-global" role="alert" data-testid="aviso-integracion-deshabilitada">
                  La integración no está habilitada en el servidor. Avisa al responsable del despliegue.
                </p>
              ) : (
                <>
                  {enCurso && (ajenaEnCurso || enCursoLocal) ? (
                    <p className="mensaje-aviso" role="status" data-testid="aviso-en-curso">
                      {TEXTO_EN_CURSO}
                      {esperaAgotada ? (
                        <>
                          {" "}
                          <button type="button" className="boton boton--secundario" data-testid="boton-actualizar-estado" onClick={() => void estado.refetch().then(() => setEnCursoLocal(false))}>
                            Actualizar
                          </button>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {abandonada ? (
                    <p className="campo-ayuda" role="note" data-testid="nota-ejecucion-abandonada">
                      La ejecución anterior quedó sin terminar; se marcará como interrumpida.
                    </p>
                  ) : null}

                  <div className="acciones-formulario acciones-formulario--integracion acciones-formulario--consulta">
                    {puedeContinuar ? (
                      <button
                        type="button"
                        className="boton boton--secundario"
                        data-testid="boton-continuar-consulta"
                        disabled={enCurso}
                        aria-describedby={tanda?.ejecucion.resultado === "INCOMPLETA" ? "aviso-incompleta" : undefined}
                        onClick={() => void continuarConsulta()}
                      >
                        {continuar.isPending ? "Continuando…" : "Continuar consulta"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`boton ${consulta ? "boton--secundario" : "boton--primario"}`}
                      data-testid="boton-consultar-jira"
                      disabled={enCurso}
                      aria-disabled={enCurso}
                      onClick={() => void consultarJira()}
                    >
                      {consultar.isPending ? "Consultando…" : "Consultar Jira"}
                    </button>
                  </div>
                </>
              )}
            </section>

            {trabajando ? <PanelEsperaEjecucion testId="estado-consultando" texto={TEXTO_CONSULTANDO} nota={TEXTO_CONSULTANDO_NOTA} /> : null}

            <div>
              {fallo && "codigo" in fallo ? (
                <ErrorIntegracion
                  testId="error-consulta"
                  codigo={fallo.codigo}
                  titulo={fallo.codigo === "SIN_RESPUESTA_CONSULTA" ? "No recibimos respuesta" : "No se pudo consultar Jira"}
                  sugerencias={fallo.codigo === "SIN_RESPUESTA_CONSULTA" ? [] : fallo.codigo === "JIRA_NO_CONFIGURADO" || fallo.codigo === "TOKEN_NO_DESCIFRABLE" ? ["IR_A_CONEXION", "IMPORTAR_ARCHIVO"] : ["REINTENTAR"]}
                  acciones={acciones}
                  idReintentar="boton-reintentar-consulta"
                  textoReintentar="Consultar de nuevo"
                  pie={fallo.codigo === "SIN_RESPUESTA_CONSULTA" ? <Link to={RUTAS_INTEGRACIONES.historial}>Ver en el Historial</Link> : undefined}
                />
              ) : null}
              {fallo && "permiso" in fallo ? (
                <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-permiso">
                  Ya no tienes permiso para esta acción
                </p>
              ) : null}
              {fallo && "global" in fallo ? (
                <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
                  No fue posible consultar Jira. Intenta nuevamente.
                </p>
              ) : null}
              {avisoVencida || vencida ? (
                <p className="mensaje-aviso" role={avisoVencida ? "alert" : "status"} data-testid="aviso-consulta-vencida">
                  {TEXTO_VENCIDA}
                </p>
              ) : null}
            </div>

            {tanda ? (
              <ResultadoConsulta ejecucion={tanda.ejecucion} consulta={tanda.consulta} hayAbierta={tanda.hayAbierta && Boolean(consulta)} acciones={acciones} onRevisar={irARevision} />
            ) : null}

            <BloqueDatos
              clave="consulta"
              estado={vistaConsulta}
              mensajeIndisponible="No pudimos consultar el estado de la consulta"
              onReintentar={() => void actual.refetch()}
            >
              {resultadoConfirmacion ? <ResultadoConfirmacion ejecucion={resultadoConfirmacion.ejecucion} descartadas={resultadoConfirmacion.descartadas} tipoDescartadas={resultadoConfirmacion.tipo} /> : null}
              {consulta && hayQueRevisar ? (
                <ConsultaAbierta
                  consulta={consulta}
                  onActualizar={async () => (await actual.refetch()).data?.consulta ?? null}
                  actualizando={actual.isFetching}
                  onVencida={alVencer}
                  onConfirmada={alConfirmar}
                />
              ) : (
                <>
                  {cerradaVisible ? <ConsultaCerrada consulta={cerradaVisible} /> : null}
                  <p className="campo-ayuda" role="status" data-testid="estado-vacio-consulta">
                    {TEXTO_SIN_CONSULTA}
                  </p>
                </>
              )}
            </BloqueDatos>

            <DialogoConfirmacion
              abierto={reemplazo !== null}
              titulo="Ya hay una consulta abierta"
              etiquetaConfirmar="Reemplazar consulta"
              peligro
              testId="dialogo-reemplazar"
              testIdConfirmar="boton-reemplazar-consulta"
              testIdCancelar="boton-cancelar-dialogo"
              onCancelar={() => setReemplazo(null)}
              onConfirmar={() => {
                setReemplazo(null);
                void consultarJira(true);
              }}
            >
              {reemplazo ? <p data-testid="texto-reemplazo">{textoReemplazo(reemplazo.creadaPor, reemplazo.creadaEn, reemplazo.asignadas)}</p> : null}
            </DialogoConfirmacion>
          </>
        ) : null}
      </BloqueDatos>
    </div>
  );
}
