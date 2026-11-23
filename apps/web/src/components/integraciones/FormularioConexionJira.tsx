import { useRef, useState, type FormEvent } from "react";
import { useCelulas } from "@/api/catalogos";
import { useGuardarConfiguracion, useProbarConexion, useQeActivos, useSprintsDeCelula } from "@/api/integraciones";
import { BloqueEstado } from "@/components/BloqueEstado";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { oauthUtilizable } from "@/lib/estadoConexion";
import { ErrorApi } from "@/lib/httpClient";
import { mensajeDeError } from "@/lib/mensajesIntegracion";
import {
  ORDEN_CAMPOS_CONEXION,
  separarTipos,
  validarConexion,
  type CamposConexion,
  type ClaveCampoConexion,
  type ErroresConexion,
} from "@/lib/validacionJira";
import type { ConfiguracionJira, MetodoConexionJira } from "@/types/dominio";
import { CampoForm } from "./CampoForm";
import { CampoToken } from "./CampoToken";
import { type ConexionOauth } from "./ConectarJira";
import { PanelOauthJira } from "./PanelOauthJira";
import { ResultadoConexionJira, type ResultadoPrueba } from "./ResultadoConexionJira";
import { SelectorMetodoConexion } from "./SelectorMetodoConexion";

interface Props {
  config: ConfiguracionJira;
  /** Notifica los casos que cambian lo que la pantalla explica fuera del formulario. */
  onTokenNoDescifrable: () => void;
  onIntegracionDeshabilitada: () => void;
  tokenNoDescifrable: boolean;
  deshabilitada: boolean;
  /** Método elegido en el selector. Elegirlo no cambia el método activo: solo cambia el panel (diseño OAuth §2.2). */
  opcion: MetodoConexionJira;
  onOpcion: (metodo: MetodoConexionJira) => void;
  /** Flujo de «Conectar con Jira», compartido con la tarjeta de estado. */
  conexion: ConexionOauth;
  /** Resultado de la última prueba (compartido con «Probar conexión» de la tarjeta: se muestra uno solo). */
  resultado: ResultadoPrueba | null;
  onResultado: (resultado: ResultadoPrueba | null) => void;
}

const TIPOS_POR_DEFECTO = "Story, Historia";

/**
 * Formulario de conexión con Jira (E5-F01 y E5-F08). Es un solo `<form noValidate>`: «Probar y guardar» es el submit y
 * «Probar sin guardar» un botón. **`form-jira` envuelve el panel del método, «Proyecto y destino» y los botones en ambos
 * métodos.** El campo del token nunca se rellena y se vacía tras CADA intento (D116).
 */
export function FormularioConexionJira({
  config,
  onTokenNoDescifrable,
  onIntegracionDeshabilitada,
  tokenNoDescifrable,
  deshabilitada,
  opcion,
  onOpcion,
  conexion,
  resultado,
  onResultado,
}: Props) {
  const [campos, setCampos] = useState<CamposConexion>({
    // Con OAuth, `sitio` es el del sitio OAuth y `correo` es nulo: el sitio solo se rellena para el API token.
    sitio: config.metodo === "OAUTH" ? "" : (config.sitio ?? ""),
    correo: config.correo ?? "",
    token: "",
    proyecto: config.proyecto ?? "",
    tipos: config.tiposIssue.length > 0 ? config.tiposIssue.join(", ") : TIPOS_POR_DEFECTO,
    celulaId: config.celula?.id ?? "",
    qeId: config.qeResponsable?.id ?? "",
    sprintId: config.sprintRespaldo?.id ?? "",
  });
  const [errores, setErrores] = useState<ErroresConexion>({});
  const [erroresServidor, setErroresServidor] = useState<ErroresConexion>({});
  const [confirmandoCambio, setConfirmandoCambio] = useState(false);
  const referencias = useRef<Partial<Record<ClaveCampoConexion, HTMLElement | null>>>({});

  const celulas = useCelulas();
  const qes = useQeActivos();
  const sprints = useSprintsDeCelula(campos.celulaId);
  const guardar = useGuardarConfiguracion();
  const probar = useProbarConexion();
  const ocupado = guardar.isPending || probar.isPending;

  const esOauth = opcion === "OAUTH";
  const oauthLista = oauthUtilizable(config);
  const catalogoCaido = celulas.isError || qes.isError || (campos.celulaId !== "" && sprints.isError);
  const catalogoCargando = celulas.isLoading || qes.isLoading || (campos.celulaId !== "" && sprints.isLoading);
  const puedeConservar = config.token.configurado && config.token.descifrable && !tokenNoDescifrable;
  // Con OAuth hace falta una conexión lista: sin ella, el servidor respondería 409 `JIRA_NO_CONFIGURADO`.
  const faltaConexionOauth = esOauth && !oauthLista;
  const sinAccion = deshabilitada || catalogoCaido || ocupado;
  // Pasar de OAuth a API token borra la conexión OAuth si la prueba pasa: pide confirmación antes de enviar (§6.2).
  const cambiaAApiToken = !esOauth && config.metodo === "OAUTH";

  function cambiar<K extends keyof CamposConexion>(clave: K, valor: CamposConexion[K]) {
    setCampos((previos) => ({ ...previos, [clave]: valor }));
  }

  function cambiarCelula(valor: string) {
    // El sprint pertenece a la célula (D120): al cambiarla se limpia.
    setCampos((previos) => ({ ...previos, celulaId: valor, sprintId: "" }));
  }

  function validar(incluirDestino: boolean): boolean {
    const nuevos = validarConexion(campos, { requiereToken: !puedeConservar, incluirDestino, metodo: opcion });
    setErrores(nuevos);
    setErroresServidor({});
    const primero = ORDEN_CAMPOS_CONEXION.find((clave) => nuevos[clave]);
    if (primero) {
      onResultado(null);
      referencias.current[primero]?.focus();
      return false;
    }
    return true;
  }

  function interpretarFallo(error: unknown) {
    if (error instanceof ErrorApi) {
      if (error.status === 409 && error.codigo === "TOKEN_NO_DESCIFRABLE") {
        onTokenNoDescifrable();
        onResultado(null);
        return;
      }
      if (error.status === 503 && error.codigo === "LLAVE_CIFRADO_NO_DISPONIBLE") {
        onIntegracionDeshabilitada();
        onResultado(null);
        return;
      }
      if (error.status === 503 && error.codigo === "JIRA_OAUTH_NO_CONFIGURADO") {
        onResultado({ tipo: "global", texto: `${mensajeDeError("JIRA_OAUTH_NO_CONFIGURADO")} No se guardó nada.` });
        return;
      }
      if (error.status === 409 && error.codigo === "JIRA_NO_CONFIGURADO") {
        onResultado({ tipo: "global", texto: "Conecta con Jira antes de guardar el proyecto y el destino." });
        return;
      }
      if (error.status === 403) {
        onResultado({ tipo: "permiso" });
        return;
      }
      if (error.status === 400 || error.status === 422) {
        // Textos fijos del portal: el detalle del servidor no se muestra.
        const mapa: Record<string, ClaveCampoConexion> = {
          sitio: "sitio",
          correo: "correo",
          token: "token",
          proyecto: "proyecto",
          tiposIssue: "tipos",
          celulaId: "celula",
          qeResponsableId: "qe",
          sprintRespaldoId: "sprint",
        };
        const porCampo: ErroresConexion = {};
        for (const detalle of error.detalles ?? []) {
          const clave = mapa[(detalle as { campo?: string }).campo ?? ""];
          if (clave) porCampo[clave] = clave === "sitio" ? "La dirección del sitio no es válida para Jira Cloud" : "Revisa este dato";
        }
        if (Object.keys(porCampo).length > 0) {
          setErroresServidor(porCampo);
          onResultado(null);
          const primero = ORDEN_CAMPOS_CONEXION.find((clave) => porCampo[clave]);
          if (primero) referencias.current[primero]?.focus();
          return;
        }
      }
    }
    onResultado({ tipo: "global", texto: "No fue posible guardar. Intenta nuevamente." });
  }

  /** Cuerpo de «Probar y guardar» según el método (oneOf del contrato). */
  function cuerpoGuardado() {
    const base = {
      proyecto: campos.proyecto.trim(),
      tiposIssue: separarTipos(campos.tipos),
      celulaId: campos.celulaId,
      qeResponsableId: campos.qeId,
      sprintRespaldoId: campos.sprintId,
    };
    if (esOauth) return { metodo: "OAUTH" as const, ...base };
    const token = campos.token;
    return { sitio: campos.sitio.trim(), correo: campos.correo.trim(), ...(token !== "" ? { token } : {}), ...base };
  }

  async function guardarConfiguracion() {
    onResultado(null);
    try {
      const respuesta = await guardar.mutateAsync(cuerpoGuardado());
      if (respuesta.guardado && respuesta.prueba.ok) {
        const usuario = respuesta.prueba.usuarioJira ?? "tu cuenta";
        let texto = `Conexión exitosa con Jira como ${usuario}. Configuración guardada.`;
        if (esOauth && config.metodo === "API_TOKEN") texto = `Conexión exitosa con Jira como ${usuario}. Ahora Quality360 usa esta conexión en lugar del API token.`;
        else if (cambiaAApiToken) texto = `${texto} Se borraron las credenciales de la conexión con Jira (OAuth).`;
        onResultado({ tipo: "ok", texto });
      } else if (respuesta.prueba.error) {
        onResultado({ tipo: "error", error: respuesta.prueba.error, pie: "No se guardó nada: se conserva la configuración anterior." });
      } else {
        onResultado({ tipo: "global", texto: "No fue posible guardar. Intenta nuevamente." });
      }
    } catch (error) {
      interpretarFallo(error);
    } finally {
      // D116: el token no sobrevive al intento, haya salido bien o mal.
      cambiar("token", "");
    }
  }

  function probarYGuardar(evento: FormEvent) {
    evento.preventDefault();
    if (sinAccion || faltaConexionOauth || !validar(true)) return;
    if (cambiaAApiToken) {
      setConfirmandoCambio(true);
      return;
    }
    void guardarConfiguracion();
  }

  async function probarSinGuardar() {
    if (sinAccion || faltaConexionOauth || !validar(false)) return;
    onResultado(null);
    const token = campos.token;
    try {
      const proyecto = { proyecto: campos.proyecto.trim(), tiposIssue: separarTipos(campos.tipos) };
      const respuesta = await probar.mutateAsync(esOauth ? { metodo: "OAUTH", ...proyecto } : { sitio: campos.sitio.trim(), correo: campos.correo.trim(), ...(token !== "" ? { token } : {}), ...proyecto });
      if (respuesta.ok) {
        onResultado({ tipo: "ok", texto: `Conexión exitosa con Jira como ${respuesta.usuarioJira ?? "tu cuenta"}. No se guardaron cambios.` });
      } else if (respuesta.error) {
        onResultado({ tipo: "error", error: respuesta.error, pie: "No se guardó ningún cambio." });
      } else {
        onResultado({ tipo: "global", texto: "No fue posible probar la conexión. Intenta nuevamente." });
      }
    } catch (error) {
      interpretarFallo(error);
    } finally {
      cambiar("token", "");
    }
  }

  function usarApiToken() {
    onOpcion("API_TOKEN");
    // El panel del API token aparece en el siguiente render: el foco va a `campo-sitio` (diseño §2.3).
    setTimeout(() => referencias.current.sitio?.focus(), 0);
  }

  const err = (clave: ClaveCampoConexion) => errores[clave] ?? erroresServidor[clave];
  const referenciar = (clave: ClaveCampoConexion) => (nodo: HTMLElement | null) => {
    referencias.current[clave] = nodo;
  };
  const sprintsVisibles = sprints.data?.items ?? [];

  return (
    <>
      <div aria-live="off">
        <ResultadoConexionJira resultado={resultado} />
      </div>

      {ocupado ? (
        <p role="status" className="campo-ayuda" data-testid="estado-probando">
          Probando la conexión con Jira…
        </p>
      ) : null}

      {catalogoCaido ? (
        <BloqueEstado
          id="catalogos-jira"
          estado="error"
          mensaje="No pudimos cargar las células, los QE o los sprints."
          onReintentar={() => {
            void celulas.refetch();
            void qes.refetch();
            void sprints.refetch();
          }}
        />
      ) : null}

      <SelectorMetodoConexion elegido={opcion} activo={config.metodo} onElegir={onOpcion} />

      <form noValidate onSubmit={probarYGuardar} data-testid="form-jira" aria-label="Conexión con Jira">
        <fieldset className="fieldset-integracion" disabled={deshabilitada}>
          <legend className="sr-only">Configuración de la conexión con Jira</legend>
          <div className="formulario-jira">
            {esOauth ? (
              <PanelOauthJira config={config} conexion={conexion} onUsarApiToken={usarApiToken} />
            ) : (
              <section className="panel" aria-labelledby="titulo-conexion-jira" data-testid="panel-api-token">
                <h2 id="titulo-conexion-jira">Conectar con API token</h2>
                <p className="campo-ayuda">Úsalo si no puedes conectar con Jira o si tu cuenta no puede aceptar la aplicación.</p>
                {config.metodo === "OAUTH" ? (
                  <p className="mensaje-aviso" role="note" data-testid="aviso-cambio-a-api-token">
                    Si guardas la conexión con API token, se borrarán las credenciales de la conexión con Jira (OAuth) guardadas en Quality360. Mientras no guardes, la conexión con Jira (OAuth) sigue activa.
                  </p>
                ) : null}
                <div className="campos-columna">
                  <CampoForm id="campo-sitio" clave="sitio" etiqueta="Sitio de Jira" error={err("sitio")} ayuda="Dirección de tu Jira Cloud, por ejemplo https://su-empresa.atlassian.net">
                    {(props) => (
                      <input
                        {...props}
                        ref={referenciar("sitio")}
                        data-testid="campo-sitio"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        value={campos.sitio}
                        onChange={(e) => cambiar("sitio", e.target.value)}
                      />
                    )}
                  </CampoForm>
                  <CampoForm id="campo-correo" clave="correo" etiqueta="Correo de la cuenta de Jira" error={err("correo")}>
                    {(props) => (
                      <input
                        {...props}
                        ref={referenciar("correo")}
                        data-testid="campo-correo"
                        type="email"
                        autoComplete="off"
                        value={campos.correo}
                        onChange={(e) => cambiar("correo", e.target.value)}
                      />
                    )}
                  </CampoForm>
                  <CampoToken valor={campos.token} onCambio={(v) => cambiar("token", v)} puedeConservar={puedeConservar} error={err("token")} inputRef={referenciar("token")} />
                </div>
              </section>
            )}

            <section className="panel" aria-labelledby="titulo-destino-jira">
              <h2 id="titulo-destino-jira">Proyecto y destino de las HDU nuevas</h2>
              <div className="campos-columna">
                <div className="campos-fila">
                  <CampoForm id="campo-proyecto" clave="proyecto" etiqueta="Clave del proyecto" error={err("proyecto")} ayuda="Por ejemplo, QTY">
                    {(props) => (
                      <input
                        {...props}
                        ref={referenciar("proyecto")}
                        data-testid="campo-proyecto"
                        autoComplete="off"
                        value={campos.proyecto}
                        onChange={(e) => cambiar("proyecto", e.target.value)}
                      />
                    )}
                  </CampoForm>
                  <CampoForm id="campo-tipos" clave="tipos" etiqueta="Tipos de issue" error={err("tipos")} ayuda="De 1 a 5 tipos, separados por comas.">
                    {(props) => (
                      <input {...props} ref={referenciar("tipos")} data-testid="campo-tipos" autoComplete="off" value={campos.tipos} onChange={(e) => cambiar("tipos", e.target.value)} />
                    )}
                  </CampoForm>
                </div>
                <CampoForm id="campo-celula" clave="celula" etiqueta="Célula" error={err("celula")}>
                  {(props) => (
                    <select {...props} ref={referenciar("celula")} data-testid="campo-celula" value={campos.celulaId} onChange={(e) => cambiarCelula(e.target.value)}>
                      <option value="">Elige la célula</option>
                      {celulas.data?.items.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </CampoForm>
                <CampoForm id="campo-qe" clave="qe" etiqueta="QE responsable por defecto" error={err("qe")} ayuda="Las HDU de Jira se asignan al revisar la consulta. Estos valores se usan al importar archivos.">
                  {(props) => (
                    <select {...props} ref={referenciar("qe")} data-testid="campo-qe" value={campos.qeId} onChange={(e) => cambiar("qeId", e.target.value)}>
                      <option value="">Elige el QE</option>
                      {qes.data?.items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </CampoForm>
                <CampoForm
                  id="campo-sprint"
                  clave="sprint"
                  etiqueta="Sprint de respaldo"
                  error={err("sprint")}
                  ayuda="Se usa cuando Jira trae un sprint que no existe en Quality360."
                >
                  {(props) => (
                    <select {...props} ref={referenciar("sprint")} data-testid="campo-sprint" value={campos.sprintId} onChange={(e) => cambiar("sprintId", e.target.value)}>
                      <option value="">{campos.celulaId ? "Elige el sprint" : "Elige primero la célula"}</option>
                      {sprintsVisibles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </CampoForm>
              </div>
            </section>
          </div>

          {faltaConexionOauth ? (
            <p className="campo-ayuda" data-testid="nota-conectar-primero">
              Conecta con Jira para poder probar y guardar el proyecto y el destino.
            </p>
          ) : null}
          <div className="acciones-formulario acciones-formulario--integracion">
            <button type="submit" className="boton boton--primario" data-testid="boton-probar-guardar" disabled={sinAccion || catalogoCargando || faltaConexionOauth}>
              {guardar.isPending ? "Probando…" : "Probar y guardar"}
            </button>
            <button type="button" className="boton boton--secundario" data-testid="boton-probar" disabled={sinAccion || catalogoCargando || faltaConexionOauth} onClick={() => void probarSinGuardar()}>
              {probar.isPending ? "Probando…" : "Probar sin guardar"}
            </button>
          </div>
        </fieldset>
      </form>

      <DialogoConfirmacion
        abierto={confirmandoCambio}
        titulo="Cambiar a API token"
        rol="alertdialog"
        etiquetaConfirmar="Probar y cambiar"
        cerrarAlClicFuera={false}
        testId="confirmar-cambio-a-api-token"
        testIdConfirmar="boton-confirmar-cambio"
        testIdCancelar="boton-cancelar-cambio"
        onCancelar={() => setConfirmandoCambio(false)}
        onConfirmar={() => {
          setConfirmandoCambio(false);
          void guardarConfiguracion();
        }}
      >
        <p>
          Si la prueba funciona, se borrarán las credenciales de la conexión con Jira (OAuth) y dejará de usarse. Si la prueba falla, no cambia nada. Para volver a OAuth tendrás que conectar con Jira otra vez.
        </p>
      </DialogoConfirmacion>
    </>
  );
}
