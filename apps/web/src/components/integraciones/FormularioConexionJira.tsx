import { useRef, useState, type FormEvent } from "react";
import { useCelulas } from "@/api/catalogos";
import { useGuardarConfiguracion, useProbarConexion, useQeActivos, useSprintsDeCelula } from "@/api/integraciones";
import { BloqueEstado } from "@/components/BloqueEstado";
import { ErrorApi } from "@/lib/httpClient";
import {
  ORDEN_CAMPOS_CONEXION,
  separarTipos,
  validarConexion,
  type CamposConexion,
  type ClaveCampoConexion,
  type ErroresConexion,
} from "@/lib/validacionJira";
import type { ConfiguracionJira, ErrorIntegracion as ErrorIntegracionTipo } from "@/types/dominio";
import { CampoForm } from "./CampoForm";
import { CampoToken } from "./CampoToken";
import { ErrorIntegracion } from "./ErrorIntegracion";

type Resultado =
  | { tipo: "ok"; texto: string }
  | { tipo: "error"; error: ErrorIntegracionTipo; pie: string }
  | { tipo: "global"; texto: string }
  | { tipo: "permiso" };

interface Props {
  config: ConfiguracionJira;
  /** Notifica los casos que cambian lo que la pantalla explica fuera del formulario. */
  onTokenNoDescifrable: () => void;
  onIntegracionDeshabilitada: () => void;
  tokenNoDescifrable: boolean;
  deshabilitada: boolean;
}

const TIPOS_POR_DEFECTO = "Story, Historia";

/**
 * Formulario de conexión con Jira (E5-F01). Es un solo `<form noValidate>`: «Probar y guardar» es el submit y
 * «Probar sin guardar» un botón. El campo del token nunca se rellena y se vacía tras CADA intento (D116).
 */
export function FormularioConexionJira({ config, onTokenNoDescifrable, onIntegracionDeshabilitada, tokenNoDescifrable, deshabilitada }: Props) {
  const [campos, setCampos] = useState<CamposConexion>({
    sitio: config.sitio ?? "",
    correo: config.correo ?? "",
    token: "",
    proyecto: config.proyecto ?? "",
    tipos: config.tiposIssue.length > 0 ? config.tiposIssue.join(", ") : TIPOS_POR_DEFECTO,
    celulaId: config.celula?.id ?? "",
    qeId: config.qeResponsable?.id ?? "",
    sprintId: config.sprintRespaldo?.id ?? "",
  });
  const [errores, setErrores] = useState<ErroresConexion>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erroresServidor, setErroresServidor] = useState<ErroresConexion>({});
  const referencias = useRef<Partial<Record<ClaveCampoConexion, HTMLElement | null>>>({});

  const celulas = useCelulas();
  const qes = useQeActivos();
  const sprints = useSprintsDeCelula(campos.celulaId);
  const guardar = useGuardarConfiguracion();
  const probar = useProbarConexion();
  const ocupado = guardar.isPending || probar.isPending;

  const catalogoCaido = celulas.isError || qes.isError || (campos.celulaId !== "" && sprints.isError);
  const catalogoCargando = celulas.isLoading || qes.isLoading || (campos.celulaId !== "" && sprints.isLoading);
  const puedeConservar = config.token.configurado && config.token.descifrable && !tokenNoDescifrable;
  const sinAccion = deshabilitada || catalogoCaido || ocupado;

  function cambiar<K extends keyof CamposConexion>(clave: K, valor: CamposConexion[K]) {
    setCampos((previos) => ({ ...previos, [clave]: valor }));
  }

  function cambiarCelula(valor: string) {
    // El sprint pertenece a la célula (D120): al cambiarla se limpia.
    setCampos((previos) => ({ ...previos, celulaId: valor, sprintId: "" }));
  }

  function validar(incluirDestino: boolean): boolean {
    const nuevos = validarConexion(campos, { requiereToken: !puedeConservar, incluirDestino });
    setErrores(nuevos);
    setErroresServidor({});
    const primero = ORDEN_CAMPOS_CONEXION.find((clave) => nuevos[clave]);
    if (primero) {
      setResultado(null);
      referencias.current[primero]?.focus();
      return false;
    }
    return true;
  }

  function interpretarFallo(error: unknown) {
    if (error instanceof ErrorApi) {
      if (error.status === 409 && error.codigo === "TOKEN_NO_DESCIFRABLE") {
        onTokenNoDescifrable();
        setResultado(null);
        return;
      }
      if (error.status === 503 && error.codigo === "LLAVE_CIFRADO_NO_DISPONIBLE") {
        onIntegracionDeshabilitada();
        setResultado(null);
        return;
      }
      if (error.status === 403) {
        setResultado({ tipo: "permiso" });
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
          setResultado(null);
          const primero = ORDEN_CAMPOS_CONEXION.find((clave) => porCampo[clave]);
          if (primero) referencias.current[primero]?.focus();
          return;
        }
      }
    }
    setResultado({ tipo: "global", texto: "No fue posible guardar. Intenta nuevamente." });
  }

  async function probarYGuardar(evento: FormEvent) {
    evento.preventDefault();
    if (sinAccion || !validar(true)) return;
    setResultado(null);
    const token = campos.token;
    try {
      const respuesta = await guardar.mutateAsync({
        sitio: campos.sitio.trim(),
        correo: campos.correo.trim(),
        ...(token !== "" ? { token } : {}),
        proyecto: campos.proyecto.trim(),
        tiposIssue: separarTipos(campos.tipos),
        celulaId: campos.celulaId,
        qeResponsableId: campos.qeId,
        sprintRespaldoId: campos.sprintId,
      });
      if (respuesta.guardado && respuesta.prueba.ok) {
        const usuario = respuesta.prueba.usuarioJira ?? "tu cuenta";
        setResultado({ tipo: "ok", texto: `Conexión exitosa con Jira como ${usuario}. Configuración guardada.` });
      } else if (respuesta.prueba.error) {
        setResultado({ tipo: "error", error: respuesta.prueba.error, pie: "No se guardó nada: se conserva la configuración anterior." });
      } else {
        setResultado({ tipo: "global", texto: "No fue posible guardar. Intenta nuevamente." });
      }
    } catch (error) {
      interpretarFallo(error);
    } finally {
      // D116: el token no sobrevive al intento, haya salido bien o mal.
      cambiar("token", "");
    }
  }

  async function probarSinGuardar() {
    if (sinAccion || !validar(false)) return;
    setResultado(null);
    const token = campos.token;
    try {
      const respuesta = await probar.mutateAsync({
        sitio: campos.sitio.trim(),
        correo: campos.correo.trim(),
        ...(token !== "" ? { token } : {}),
        proyecto: campos.proyecto.trim(),
        tiposIssue: separarTipos(campos.tipos),
      });
      if (respuesta.ok) {
        setResultado({ tipo: "ok", texto: `Conexión exitosa con Jira como ${respuesta.usuarioJira ?? "tu cuenta"}. No se guardaron cambios.` });
      } else if (respuesta.error) {
        setResultado({ tipo: "error", error: respuesta.error, pie: "No se guardó ningún cambio." });
      } else {
        setResultado({ tipo: "global", texto: "No fue posible probar la conexión. Intenta nuevamente." });
      }
    } catch (error) {
      interpretarFallo(error);
    } finally {
      cambiar("token", "");
    }
  }

  const err = (clave: ClaveCampoConexion) => errores[clave] ?? erroresServidor[clave];
  const referenciar = (clave: ClaveCampoConexion) => (nodo: HTMLElement | null) => {
    referencias.current[clave] = nodo;
  };
  const sprintsVisibles = sprints.data?.items ?? [];

  return (
    <>
      <div aria-live="off">
        {resultado?.tipo === "ok" ? (
          <p className="mensaje-exito" role="status" data-testid="mensaje-conexion-ok">
            {resultado.texto}
          </p>
        ) : null}
        {resultado?.tipo === "error" ? (
          <ErrorIntegracion
            testId="error-conexion"
            codigo={resultado.error.codigo}
            titulo="No se pudo probar la conexión"
            sugerencias={resultado.error.sugerencias.filter((s) => s !== "IR_A_CONEXION" && s !== "IMPORTAR_ARCHIVO")}
            pie={resultado.pie}
          />
        ) : null}
        {resultado?.tipo === "global" ? (
          <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
            {resultado.texto}
          </p>
        ) : null}
        {resultado?.tipo === "permiso" ? (
          <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-permiso">
            Ya no tienes permiso para esta acción
          </p>
        ) : null}
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

      <form noValidate onSubmit={probarYGuardar} data-testid="form-jira" aria-label="Conexión con Jira">
        <fieldset className="fieldset-integracion" disabled={deshabilitada}>
          <legend className="sr-only">Configuración de la conexión con Jira</legend>
          <div className="formulario-jira">
            <section className="panel" aria-labelledby="titulo-conexion-jira">
              <h2 id="titulo-conexion-jira">Conexión con Jira</h2>
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
              </div>
            </section>

            <section className="panel" aria-labelledby="titulo-destino-jira">
              <h2 id="titulo-destino-jira">Destino de las HDU nuevas</h2>
              <div className="campos-columna">
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
                <CampoForm id="campo-qe" clave="qe" etiqueta="QE responsable por defecto" error={err("qe")} ayuda="Las HDU llegan sin analista; tu QE lo asigna después.">
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

          <div className="acciones-formulario acciones-formulario--integracion">
            <button type="submit" className="boton boton--primario" data-testid="boton-probar-guardar" disabled={sinAccion || catalogoCargando}>
              {guardar.isPending ? "Probando…" : "Probar y guardar"}
            </button>
            <button type="button" className="boton boton--secundario" data-testid="boton-probar" disabled={sinAccion || catalogoCargando} onClick={() => void probarSinGuardar()}>
              {probar.isPending ? "Probando…" : "Probar sin guardar"}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
