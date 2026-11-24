import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { completarConexionOauth, esSinRespuesta } from "@/api/integraciones";
import { EncabezadoBandeja } from "@/components/bandeja/Estructura";
import { BotonConectarJira, ErrorInicioOauth, useIniciarOauth } from "@/components/integraciones/ConectarJira";
import { ErrorIntegracion } from "@/components/integraciones/ErrorIntegracion";
import { tomarRetornoOauth } from "@/lib/capturaRetornoOauth";
import { ErrorApi } from "@/lib/httpClient";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import { useQueryClient } from "@tanstack/react-query";
import type { EstadoNavegacionConexion } from "./PaginaConexionJira";

/** Los 11 estados de la página de retorno (diseño OAuth §4.2). */
export type EstadoRetorno =
  | "procesando"
  | "exito"
  | "elegir-sitio"
  | "consentimiento-rechazado"
  | "estado-invalido"
  | "permisos-insuficientes"
  | "sin-sitio"
  | "sin-autorizacion"
  | "canje-fallido"
  | "error-servidor"
  | "sin-respuesta";

interface Vista {
  estado: EstadoRetorno;
  cuenta?: string | null;
  sitio?: string | null;
  permisosFaltantes?: readonly string[];
  /** Código del servidor, para `error-servidor` (p. ej. `JIRA_OAUTH_NO_CONFIGURADO`). */
  codigo?: string;
}

const ESPERA_REDIRECCION_MS = 1500;

/**
 * Procesa lo que capturó `capturaRetornoOauth` ANTES de que existiera Supabase. Solo `code` (o `error`) y `state` viajan
 * al gateway, con la sesión del Administrador: el portal nunca ve ni guarda tokens ni el secreto.
 */
export async function procesarRetorno(): Promise<Vista> {
  const captura = tomarRetornoOauth();
  // Sin `state`, o sin `code` ni `error`, no hay nada que completar (se abrió la ruta a mano o se recargó).
  if (!captura?.state || (!captura.code && !captura.error)) return { estado: "sin-autorizacion" };
  const cuerpo = captura.error ? { state: captura.state, error: captura.error } : { state: captura.state, code: captura.code as string };
  try {
    const respuesta = await completarConexionOauth(cuerpo);
    if (respuesta.resultado === "CONECTADA") return { estado: "exito", cuenta: respuesta.oauth?.cuenta?.nombre ?? null, sitio: respuesta.oauth?.sitio?.nombre ?? null };
    if (respuesta.resultado === "ELEGIR_SITIO") return { estado: "elegir-sitio" };
    switch (respuesta.error?.codigo) {
      case "JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO":
        return { estado: "consentimiento-rechazado" };
      case "JIRA_OAUTH_CANJE_FALLIDO":
        return { estado: "canje-fallido" };
      case "JIRA_OAUTH_SIN_SITIO":
        return { estado: "sin-sitio" };
      case "JIRA_OAUTH_PERMISOS_INSUFICIENTES":
        return { estado: "permisos-insuficientes", permisosFaltantes: respuesta.error.permisosFaltantes ?? [] };
      default:
        // JIRA_NO_DISPONIBLE, JIRA_TIEMPO_AGOTADO, JIRA_LIMITE_DE_TASA, JIRA_RESPUESTA_INVALIDA…: no se guardó nada.
        return { estado: "error-servidor" };
    }
  } catch (fallo) {
    if (fallo instanceof ErrorApi && fallo.status === 400) return { estado: "estado-invalido" };
    if (fallo instanceof ErrorApi && fallo.status === 503 && fallo.codigo === "JIRA_OAUTH_NO_CONFIGURADO") return { estado: "error-servidor", codigo: "JIRA_OAUTH_NO_CONFIGURADO" };
    // Un corte (504, 502 o la red) no dice si el servidor alcanzó a terminar.
    if (esSinRespuesta(fallo)) return { estado: "sin-respuesta" };
    return { estado: "error-servidor" };
  }
}

const TITULOS: Record<EstadoRetorno, string> = {
  procesando: "Conectando con Jira…",
  exito: "Conectado con Jira",
  "elegir-sitio": "Elige el sitio de Jira",
  "consentimiento-rechazado": "No se conectó nada",
  "estado-invalido": "La autorización no es válida",
  "permisos-insuficientes": "Faltan permisos",
  "sin-sitio": "Sin acceso a Jira",
  "sin-autorizacion": "No hay una conexión en curso",
  "canje-fallido": "Atlassian no aceptó la autorización",
  "error-servidor": "No pudimos completar la conexión",
  "sin-respuesta": "No recibimos respuesta",
};

/** Código con el que se muestra el mensaje fijo de cada estado de error. */
const CODIGO_DE_ESTADO: Partial<Record<EstadoRetorno, string>> = {
  "consentimiento-rechazado": "JIRA_OAUTH_CONSENTIMIENTO_RECHAZADO",
  "estado-invalido": "JIRA_OAUTH_ESTADO_INVALIDO",
  "permisos-insuficientes": "JIRA_OAUTH_PERMISOS_INSUFICIENTES",
  "sin-sitio": "JIRA_OAUTH_SIN_SITIO",
  "canje-fallido": "JIRA_OAUTH_CANJE_FALLIDO",
  "error-servidor": "OAUTH_ERROR_SERVIDOR",
  "sin-respuesta": "OAUTH_SIN_RESPUESTA",
};

/** Texto extra bajo el mensaje de cada error (diseño OAuth §4.2). */
const PIE: Partial<Record<EstadoRetorno, string>> = {
  "consentimiento-rechazado": "El estado anterior de la conexión no cambió.",
  "permisos-insuficientes": "No se guardó nada.",
  "sin-sitio": "Prueba con otra cuenta de Atlassian o pide acceso al administrador de tu Jira. No se guardó nada.",
  "canje-fallido": "Si vuelve a pasar, avisa a quien administra Quality360: la app de Atlassian puede estar mal configurada.",
  "error-servidor": "No se guardó nada.",
};

/** Texto del botón que reinicia el flujo en cada estado (siempre una autorización nueva: nunca se reutiliza el `state`). */
const TEXTO_REINTENTO: Partial<Record<EstadoRetorno, string>> = {
  "consentimiento-rechazado": "Intentar de nuevo",
  "estado-invalido": "Conectar con Jira",
  "permisos-insuficientes": "Intentar de nuevo",
  "sin-sitio": "Intentar con otra cuenta",
  "canje-fallido": "Intentar de nuevo",
  "error-servidor": "Intentar de nuevo",
};

export function PaginaRetornoOauthJira() {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const subtitulo = useRef<HTMLHeadingElement>(null);
  const [vista, setVista] = useState<Vista>({ estado: "procesando" });
  // Una sola vez por visita, también en StrictMode (que monta dos veces): la marca vive en la instancia, no se repite.
  const iniciado = useRef(false);
  const conexion = useIniciarOauth(true);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void procesarRetorno().then((resultado) => {
      // Lo guardado cambió (o no): Conexión debe leer lo vigente.
      void cliente.invalidateQueries({ queryKey: ["integraciones"] });
      setVista(resultado);
    });
  }, [cliente]);

  // Éxito: se deja leer ~1,5 s y se vuelve a Conexión con el aviso. `replace` para que «Atrás» no regrese aquí.
  // «Elige el sitio»: la lista vive en Conexión porque `PENDIENTE_SITIO` persiste en el servidor.
  useEffect(() => {
    if (vista.estado !== "exito" && vista.estado !== "elegir-sitio") return;
    const estado: EstadoNavegacionConexion | null = vista.estado === "exito" ? { aviso: "oauth-conectado", cuenta: vista.cuenta, sitio: vista.sitio } : null;
    const temporizador = setTimeout(() => navegar(RUTAS_INTEGRACIONES.conexion, { replace: true, state: estado }), vista.estado === "exito" ? ESPERA_REDIRECCION_MS : 0);
    return () => clearTimeout(temporizador);
  }, [vista, navegar]);

  // Foco (diseño §8.1): al título del resultado; si es un error, `ErrorIntegracion` se enfoca solo.
  useEffect(() => {
    if (vista.estado === "procesando") return;
    if (!(vista.estado in CODIGO_DE_ESTADO)) subtitulo.current?.focus();
  }, [vista.estado]);

  const estado = vista.estado;
  const codigoError = estado === "error-servidor" && vista.codigo ? vista.codigo : CODIGO_DE_ESTADO[estado];
  const textoReintento = TEXTO_REINTENTO[estado];
  const rechazo = estado === "consentimiento-rechazado";

  const enlaceConexion = (
    <Link
      to={RUTAS_INTEGRACIONES.conexion}
      replace
      state={estado === "exito" ? ({ aviso: "oauth-conectado", cuenta: vista.cuenta, sitio: vista.sitio } satisfies EstadoNavegacionConexion) : null}
      className={`boton ${rechazo || estado === "sin-autorizacion" || estado === "sin-respuesta" || estado === "exito" ? "boton--primario" : "boton--secundario"}`} data-testid="enlace-ir-conexion">
      {estado === "exito" || estado === "sin-autorizacion" || estado === "sin-respuesta" ? "Ir a Conexión" : "Volver a Conexión"}
    </Link>
  );
  const botonReintento = textoReintento ? (
    <BotonConectarJira texto={textoReintento} estado={conexion.estado} secundario={rechazo} onClick={() => void conexion.iniciar()} />
  ) : null;

  return (
    <div data-testid="pagina-retorno-oauth">
      <EncabezadoBandeja etiqueta="Portal Administrador" titulo="Conexión con Jira" descripcion="Atlassian te devolvió a Quality360. Aquí termina la conexión." />
      <section className="panel tarjeta-retorno" role="status" aria-live="polite" aria-busy={estado === "procesando" ? "true" : undefined} data-testid="estado-retorno" data-estado={estado}>
        {estado === "procesando" ? (
          <>
            <h2 ref={subtitulo} tabIndex={-1}>
              {TITULOS.procesando}
            </h2>
            <p>Estamos validando la autorización con Atlassian. No cierres esta página.</p>
            <div className="barra-espera" aria-hidden="true">
              <span />
            </div>
          </>
        ) : null}

        {estado === "exito" ? (
          <>
            <h2 ref={subtitulo} tabIndex={-1}>
              {TITULOS.exito}
            </h2>
            <p>{`Conectado con Jira (OAuth)${vista.cuenta ? ` como ${vista.cuenta}` : ""}${vista.sitio ? ` en ${vista.sitio}` : ""}.`}</p>
            <div className="acciones-formulario">{enlaceConexion}</div>
          </>
        ) : null}

        {estado === "elegir-sitio" ? (
          <>
            <h2 ref={subtitulo} tabIndex={-1}>
              {TITULOS["elegir-sitio"]}
            </h2>
            <p>Tu cuenta de Atlassian tiene acceso a más de un sitio de Jira. Te llevamos a Conexión para elegir cuál usará Quality360.</p>
          </>
        ) : null}

        {estado === "sin-autorizacion" ? (
          <>
            <h2 ref={subtitulo} tabIndex={-1}>
              {TITULOS["sin-autorizacion"]}
            </h2>
            <p>Para conectar con Jira, pulsa «Conectar con Jira» en la pestaña Conexión.</p>
            <div className="acciones-formulario">{enlaceConexion}</div>
          </>
        ) : null}

        {codigoError && estado !== "procesando" ? (
          <>
            <ErrorIntegracion
              testId="error-oauth"
              codigo={codigoError}
              contexto={{ permisosFaltantes: vista.permisosFaltantes }}
              titulo={TITULOS[estado]}
              tituloEsEncabezado
              pie={PIE[estado]}
            />
            <div className="acciones-formulario acciones-retorno" data-testid="acciones-retorno">
              {rechazo || !botonReintento ? enlaceConexion : botonReintento}
              {rechazo || !botonReintento ? botonReintento : enlaceConexion}
            </div>
            {conexion.error ? <ErrorInicioOauth codigo={conexion.error} /> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
