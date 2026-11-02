import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { codigoDeEscritura, consultarEstado, esIndisponible, useConfiguracionJira, useEstadoIntegracion, useSincronizarJira } from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { ErrorIntegracion } from "@/components/integraciones/ErrorIntegracion";
import { ChipConexion, InsigniaResultado } from "@/components/integraciones/Insignias";
import { PanelEsperaEjecucion } from "@/components/integraciones/PanelEsperaEjecucion";
import { ResultadoEjecucion } from "@/components/integraciones/ResultadoEjecucion";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import type { Ejecucion } from "@/types/dominio";

const INTERVALO_MS = 3000;
const LIMITE_ESPERA_MS = 30_000;

function hostDe(sitio: string | null): string {
  if (!sitio) return "";
  try {
    return new URL(sitio).host;
  } catch {
    return sitio;
  }
}

type Fallo = { codigo: string } | { permiso: true } | { global: true };

/** Pestaña «Sincronizar» (E5-F02): una sola petición, espera indeterminada, resultado por tipo y listas bajo demanda. */
export function PaginaSincronizar() {
  const configuracion = useConfiguracionJira();
  const [vincular, setVincular] = useState(false);
  const [resultado, setResultado] = useState<Ejecucion | null>(null);
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [llaveAusente, setLlaveAusente] = useState(false);
  const [esperaAgotada, setEsperaAgotada] = useState(false);
  const [enCursoLocal, setEnCursoLocal] = useState(false);
  const sincronizar = useSincronizarJira();

  const [sondeo, setSondeo] = useState(true);
  const estado = useEstadoIntegracion({ intervalo: sondeo ? INTERVALO_MS : false });
  const datosEstado = estado.data;
  const ajenaEnCurso = Boolean(datosEstado?.enCurso && !datosEstado.enCurso.abandonada) && !sincronizar.isPending;
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

  const config = configuracion.data;
  let vista: EstadoDatos;
  if (configuracion.isError) vista = esIndisponible(configuracion.error) ? "indisponible" : "error";
  else if (configuracion.isLoading || !config) vista = "cargando";
  else vista = "ok";

  const deshabilitada = Boolean(config && !config.llaveDisponible) || llaveAusente;
  const enCurso = sincronizar.isPending || ajenaEnCurso || enCursoLocal;
  const continuarDesde = datosEstado?.continuar?.desde ?? (resultado?.resultado === "INCOMPLETA" && resultado.origen === "JIRA" ? resultado.continuarDesde : null);

  async function ejecutar(desde?: string) {
    const inicio = Date.now();
    setFallo(null);
    setResultado(null);
    setEnCursoLocal(false);
    try {
      const ejecucion = await sincronizar.mutateAsync({ vincularExistentes: vincular, ...(desde ? { continuarDesde: desde } : {}) });
      setResultado(ejecucion);
    } catch (error) {
      const codigo = codigoDeEscritura(error);
      if (codigo === "SIN_RESPUESTA") {
        setFallo({ codigo });
        // D115: la operación pudo haberse completado; se consulta el estado y, si hay una ejecución posterior al clic, se muestra.
        try {
          const actual = await consultarEstado();
          if (actual.ultimaEjecucion && new Date(actual.ultimaEjecucion.iniciadaEn).getTime() >= inicio - 5000) setResultado(actual.ultimaEjecucion);
        } catch {
          /* sigue la advertencia de SIN_RESPUESTA */
        }
      } else if (error instanceof ErrorApi && error.status === 409 && codigo === "INTEGRACION_EN_CURSO") {
        setEnCursoLocal(true);
        setSondeo(true);
        void estado.refetch();
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
  }

  const acciones = {
    irAConexion: RUTAS_INTEGRACIONES.conexion,
    importarArchivo: RUTAS_INTEGRACIONES.importar,
    reintentar: () => void ejecutar(),
    continuar: continuarDesde ? () => void ejecutar(continuarDesde) : undefined,
  };

  const ultima = datosEstado?.ultimaEjecucion;
  const columnasMovil = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 750px)").matches;

  return (
    <div data-testid="pestana-sincronizar-contenido">
      <BloqueDatos clave="sincronizacion" estado={vista} onReintentar={() => void configuracion.refetch()}>
        {config && !config.configurado ? (
          <div className="bloque-estado bloque-estado--vacio" data-testid="estado-vacio-jira" role="status">
            <p>Configura la conexión con Jira antes de sincronizar</p>
            <Link to={RUTAS_INTEGRACIONES.conexion}>Ir a Conexión</Link>
          </div>
        ) : config ? (
          <>
            <section className="panel" aria-labelledby="titulo-sincronizar">
              <h2 id="titulo-sincronizar">Sincronizar con Jira</h2>
              <p>
                Proyecto <strong>{config.proyecto}</strong> en {hostDe(config.sitio)} <ChipConexion estado={config.estadoConexion} />
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
                  "Aún no se ha sincronizado"
                )}
              </p>
              <p>
                Las HDU nuevas se crean en {config.celula?.nombre ?? "la célula configurada"}, con {config.qeResponsable?.nombre ?? "el QE configurado"} como QE y «{config.sprintRespaldo?.nombre ?? "—"}» de respaldo, sin analista.
              </p>
              <details open={!columnasMovil}>
                <summary>Qué hace esta sincronización</summary>
                <p>
                  Qué se actualiza: solo título, descripción y prioridad, y solo si cambiaron. Nunca el estado, el analista, el QE, el checklist, los impedimentos ni el riesgo. Las HDU cerradas no se modifican.
                </p>
              </details>

              {deshabilitada ? (
                <p className="mensaje-error-global" role="alert" data-testid="aviso-integracion-deshabilitada">
                  La integración no está habilitada en el servidor. Avisa al responsable del despliegue.
                </p>
              ) : (
                <>
                  <div className="campo">
                    <label htmlFor="casilla-vincular">
                      <input id="casilla-vincular" data-testid="casilla-vincular" type="checkbox" checked={vincular} disabled={enCurso} aria-describedby="ayuda-vincular" onChange={(e) => setVincular(e.target.checked)} /> Vincular HDU creadas a mano con el mismo código
                    </label>
                    <span className="campo-ayuda" id="ayuda-vincular">
                      Si ya existe una HDU creada a mano con el mismo código de Jira, se actualizará y pasará a figurar como importada de Jira.
                    </span>
                  </div>
                  {vincular ? (
                    <p className="mensaje-aviso" role="note" data-testid="aviso-vincular-activo">
                      Se actualizarán el título, la descripción y la prioridad de las HDU creadas a mano que coincidan por código. Su estado, analista y checklist no cambian.
                    </p>
                  ) : null}

                  {enCurso && (ajenaEnCurso || enCursoLocal) ? (
                    <p className="mensaje-aviso" role="status" data-testid="aviso-en-curso">
                      Ya hay una sincronización en curso.
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

                  <div className="acciones-formulario acciones-formulario--integracion">
                    {continuarDesde ? (
                      <button
                        type="button"
                        className="boton boton--secundario"
                        data-testid="boton-continuar"
                        disabled={enCurso}
                        aria-describedby={resultado?.resultado === "INCOMPLETA" ? "aviso-incompleta" : undefined}
                        onClick={() => void ejecutar(continuarDesde)}
                      >
                        Continuar
                      </button>
                    ) : null}
                    <button type="button" className="boton boton--primario" data-testid="boton-sincronizar" disabled={enCurso} aria-disabled={enCurso} onClick={() => void ejecutar()}>
                      {sincronizar.isPending ? "Sincronizando…" : "Sincronizar con Jira"}
                    </button>
                  </div>
                </>
              )}
            </section>

            {sincronizar.isPending ? (
              <PanelEsperaEjecucion testId="estado-sincronizando" texto="Leyendo historias de Jira y guardándolas. Puede tardar hasta unos 10 segundos." nota="No se puede cancelar. Puedes salir: el resultado quedará en el Historial." />
            ) : null}

            <div>
              {fallo && "codigo" in fallo ? (
                <ErrorIntegracion
                  testId="error-sincronizacion"
                  codigo={fallo.codigo}
                  titulo={fallo.codigo === "SIN_RESPUESTA" ? "No recibimos respuesta" : "No se pudo sincronizar"}
                  sugerencias={fallo.codigo === "SIN_RESPUESTA" ? [] : fallo.codigo === "JIRA_NO_CONFIGURADO" || fallo.codigo === "TOKEN_NO_DESCIFRABLE" ? ["IR_A_CONEXION", "IMPORTAR_ARCHIVO"] : ["REINTENTAR"]}
                  acciones={acciones}
                  pie={fallo.codigo === "SIN_RESPUESTA" ? <Link to={RUTAS_INTEGRACIONES.historial}>Ver en el Historial</Link> : undefined}
                />
              ) : null}
              {fallo && "permiso" in fallo ? (
                <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-permiso">
                  Ya no tienes permiso para esta acción
                </p>
              ) : null}
              {fallo && "global" in fallo ? (
                <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
                  No fue posible sincronizar. Intenta nuevamente.
                </p>
              ) : null}
            </div>

            {resultado ? <ResultadoEjecucion ejecucion={resultado} modo="jira" testId="resultado-sincronizacion" testIdError="error-sincronizacion" vincularActivo={vincular} acciones={acciones} /> : null}
          </>
        ) : null}
      </BloqueDatos>
    </div>
  );
}
