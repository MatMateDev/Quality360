import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError, TEXTO_SUGERENCIA, type ContextoMensaje } from "@/lib/mensajesIntegracion";
import type { SugerenciaIntegracion } from "@/types/dominio";
import { useMetodoJiraActivo } from "./MetodoJiraContext";

export interface AccionesSugerencia {
  /** Rutas del Administrador para los enlaces (Conexión, Importar). */
  irAConexion?: string;
  importarArchivo?: string;
  /** Acciones que repiten una operación. */
  reintentar?: () => void;
  continuar?: () => void;
  importarMismoArchivo?: () => void;
}

interface Props {
  /** `data-testid` propio de cada anfitrión: `error-conexion`, `error-sincronizacion`, `error-archivo`, `error-ejecucion`. */
  testId: string;
  codigo: string;
  contexto?: ContextoMensaje;
  titulo?: string;
  sugerencias?: readonly SugerenciaIntegracion[];
  /** Solo el Administrador tiene pantallas a las que ir: para el resto, las sugerencias son texto (D117). */
  acciones?: AccionesSugerencia;
  /** Texto fijo bajo el mensaje (p. ej. «No se guardó nada…»). */
  pie?: ReactNode;
  /** Mueve el foco al panel al aparecer (se anuncia). */
  enfocar?: boolean;
  idReintentar?: string;
  /** Texto propio del botón de reintento («Consultar de nuevo»); por defecto el de la sugerencia. */
  textoReintentar?: string;
  /**
   * QE y Auditor ven el historial en solo lectura y no tienen la pantalla Conexión: con `JIRA_RECONEXION_NECESARIA` el
   * texto va sin enlace y pide avisar a un Administrador (diseño OAuth §7).
   */
  avisarAdministrador?: boolean;
  /** El título es un `h2` (página de retorno de OAuth, diseño §4.2); por defecto es un párrafo destacado. */
  tituloEsEncabezado?: boolean;
}

export const TEXTO_AVISAR_ADMINISTRADOR = "Avisa a un Administrador para que vuelva a conectar con Jira.";

/**
 * Panel `role="alert"` de un error de integración. El texto sale de la tabla local por código (D105, D117): nunca se
 * muestra el `mensajeError` que llega del servidor. Las sugerencias son enlaces/botones solo si hay `acciones`.
 */
export function ErrorIntegracion({ testId, codigo, contexto, titulo, sugerencias = [], acciones, pie, enfocar = true, idReintentar, textoReintentar, avisarAdministrador, tituloEsEncabezado }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const metodoActivo = useMetodoJiraActivo();
  // Con OAuth, el texto de «sin permiso» y «proyecto no encontrado» habla de la cuenta conectada (diseño OAuth §9.3).
  const contextoFinal: ContextoMensaje = { metodo: metodoActivo, ...contexto };
  // La reconexión tiene remedio directo: glifo ⚠ y borde de «incompleta», no ✕ (diseño OAuth §7).
  const reconexion = codigo === "JIRA_RECONEXION_NECESARIA";
  useEffect(() => {
    if (enfocar) raiz.current?.focus();
  }, [enfocar, codigo]);

  const elementos = sugerencias.map((s) => {
    const texto = TEXTO_SUGERENCIA[s];
    if (acciones) {
      if (s === "IR_A_CONEXION" && acciones.irAConexion)
        return (
          <Link key={s} to={acciones.irAConexion} data-testid="enlace-ir-conexion">
            {texto}
          </Link>
        );
      if (s === "IMPORTAR_ARCHIVO" && acciones.importarArchivo)
        return (
          <Link key={s} to={acciones.importarArchivo} data-testid="enlace-importar-archivo">
            {texto}
          </Link>
        );
      if (s === "REINTENTAR" && acciones.reintentar)
        return (
          <button key={s} type="button" className="boton boton--secundario" data-testid={idReintentar ?? "boton-reintentar-sincronizacion"} onClick={acciones.reintentar}>
            {textoReintentar ?? texto}
          </button>
        );
      if (s === "CONTINUAR" && acciones.continuar)
        return (
          <button key={s} type="button" className="boton boton--secundario" data-testid="boton-continuar-error" onClick={acciones.continuar}>
            {texto}
          </button>
        );
      if (s === "IMPORTAR_MISMO_ARCHIVO" && acciones.importarMismoArchivo)
        return (
          <button key={s} type="button" className="boton boton--secundario" data-testid="boton-importar-de-nuevo-error" onClick={acciones.importarMismoArchivo}>
            {texto}
          </button>
        );
    }
    return <span key={s}>{texto}</span>;
  });

  return (
    <div ref={raiz} className={`panel-resultado panel-resultado--${reconexion ? "incompleta" : "fallida"}`} role="alert" tabIndex={-1} data-testid={testId} data-codigo={codigo}>
      {tituloEsEncabezado ? (
        <h2 className="panel-resultado__titulo">
          <span aria-hidden="true">{reconexion ? "⚠" : "✕"}</span> {titulo ?? "No se pudo completar la operación"}
        </h2>
      ) : (
        <p className="panel-resultado__titulo">
          <span aria-hidden="true">{reconexion ? "⚠" : "✕"}</span> {titulo ?? "No se pudo completar la operación"}
        </p>
      )}
      <p>{mensajeDeError(codigo, contextoFinal)}</p>
      {reconexion && avisarAdministrador ? <p data-testid="aviso-administrador-reconexion">{TEXTO_AVISAR_ADMINISTRADOR}</p> : null}
      {pie ? <p>{pie}</p> : null}
      {elementos.length > 0 ? (
        <div className="acciones-sugeridas">
          <span>Qué puedes hacer:</span>
          <ul>
            {elementos.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
