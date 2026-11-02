import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { mensajeDeError, TEXTO_SUGERENCIA, type ContextoMensaje } from "@/lib/mensajesIntegracion";
import type { SugerenciaIntegracion } from "@/types/dominio";

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
}

/**
 * Panel `role="alert"` de un error de integración. El texto sale de la tabla local por código (D105, D117): nunca se
 * muestra el `mensajeError` que llega del servidor. Las sugerencias son enlaces/botones solo si hay `acciones`.
 */
export function ErrorIntegracion({ testId, codigo, contexto, titulo, sugerencias = [], acciones, pie, enfocar = true, idReintentar }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
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
            {texto}
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
    <div ref={raiz} className="panel-resultado panel-resultado--fallida" role="alert" tabIndex={-1} data-testid={testId} data-codigo={codigo}>
      <p className="panel-resultado__titulo">
        <span aria-hidden="true">✕</span> {titulo ?? "No se pudo completar la operación"}
      </p>
      <p>{mensajeDeError(codigo, contexto)}</p>
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
