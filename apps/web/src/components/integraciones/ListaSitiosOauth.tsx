import { useEffect, useId, useRef, useState } from "react";
import { esSinRespuesta, useElegirSitioOauth } from "@/api/integraciones";
import { ErrorApi } from "@/lib/httpClient";
import { mensajeDeError } from "@/lib/mensajesIntegracion";
import type { ConexionOauthJira, SitioCandidatoJiraOauth } from "@/types/dominio";

interface Props {
  candidatos: readonly SitioCandidatoJiraOauth[];
  /** La conexión quedó `CONECTADA` con el sitio elegido. */
  onConectada: (oauth: ConexionOauthJira) => void;
}

const MAXIMO_SIN_SCROLL = 8;

/**
 * Elegir el sitio de Jira (diseño OAuth §5, D212). Vive en la pestaña Conexión porque `PENDIENTE_SITIO` persiste en el
 * servidor y sobrevive a una recarga. Nunca se elige un sitio al azar: solo se preselecciona el que ya estaba
 * configurado. Las URL y los nombres son texto (no enlaces): el portal no llama a esas direcciones.
 */
export function ListaSitiosOauth({ candidatos, onConectada }: Props) {
  const idAyuda = useId();
  const idMotivo = useId();
  const contenedor = useRef<HTMLFieldSetElement>(null);
  const actual = candidatos.find((c) => c.actual)?.id ?? "";
  const [elegido, setElegido] = useState(actual);
  const [error, setError] = useState<{ codigo: string; texto: string } | null>(null);
  const [limpia, setLimpia] = useState(false);
  const elegir = useElegirSitioOauth();

  // El foco va al grupo al aparecer: el lector anuncia la leyenda y la ayuda.
  useEffect(() => {
    contenedor.current?.focus();
  }, []);

  async function usarSitio() {
    // `aria-disabled` hasta elegir: el clic se ignora (y el motivo está visible).
    if (elegido === "" || elegir.isPending) return;
    setError(null);
    try {
      const resultado = await elegir.mutateAsync(elegido);
      if (resultado.resultado === "CONECTADA" && resultado.oauth) onConectada(resultado.oauth);
      else if (resultado.error) setError({ codigo: resultado.error.codigo, texto: mensajeDeError(resultado.error.codigo, { permisosFaltantes: resultado.error.permisosFaltantes }) });
      else setError({ codigo: "ERROR", texto: "No fue posible guardar el sitio. Intenta nuevamente." });
    } catch (fallo) {
      if (fallo instanceof ErrorApi && fallo.status === 400 && fallo.codigo === "JIRA_OAUTH_SITIO_NO_VALIDO") {
        // Se limpia la lista: el servidor ya no reconoce esos candidatos.
        setLimpia(true);
        setElegido("");
        setError({ codigo: fallo.codigo, texto: `${mensajeDeError(fallo.codigo)} Vuelve a pulsar «Conectar con Jira».` });
      } else if (fallo instanceof ErrorApi && fallo.status === 409 && fallo.codigo === "JIRA_OAUTH_SIN_CONEXION") {
        setError({ codigo: fallo.codigo, texto: mensajeDeError(fallo.codigo) });
      } else if (fallo instanceof ErrorApi && fallo.status === 403) {
        setError({ codigo: "ACCESO_DENEGADO", texto: "Ya no tienes permiso para esta acción" });
      } else {
        // Red o 5xx: la lista se conserva para volver a intentar (un 504 no dice si llegó a guardarse).
        setError({ codigo: esSinRespuesta(fallo) ? "SIN_RESPUESTA" : "ERROR", texto: "No fue posible guardar el sitio. Intenta nuevamente." });
      }
    }
  }

  const sinElegir = elegido === "";
  const larga = candidatos.length > MAXIMO_SIN_SCROLL;

  return (
    <div className="lista-sitios-contenedor">
      {!limpia ? (
        <fieldset ref={contenedor} className="lista-sitios" data-testid="lista-sitios" tabIndex={-1} aria-describedby={idAyuda}>
          <legend>Elige el sitio de Jira</legend>
          <p id={idAyuda} className="campo-ayuda">
            Tu cuenta de Atlassian tiene acceso a más de un sitio de Jira. Elige cuál usará Quality360.
          </p>
          <div className={larga ? "lista-sitios__opciones lista-sitios__opciones--larga" : "lista-sitios__opciones"} {...(larga ? { tabIndex: 0, role: "group", "aria-label": "Lista de sitios" } : {})}>
            {candidatos.map((sitio) => {
              const idUrl = `${idAyuda}-url-${sitio.id}`;
              return (
                <label key={sitio.id} className={`opcion-sitio${elegido === sitio.id ? " opcion-sitio--elegida" : ""}`} data-testid={`sitio-opcion-${sitio.id}`}>
                  <input type="radio" name="sitio-oauth" value={sitio.id} checked={elegido === sitio.id} aria-describedby={idUrl} onChange={() => setElegido(sitio.id)} />
                  <span className="opcion-sitio__texto">
                    <strong>{sitio.nombre}</strong>
                    <span id={idUrl} className="opcion-sitio__url">
                      {sitio.url}
                    </span>
                  </span>
                  {sitio.actual ? (
                    <span className="insignia-texto" data-testid="sitio-actual">
                      Actual
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <div className="acciones-formulario">
            <button
              type="button"
              className="boton boton--primario"
              data-testid="boton-elegir-sitio"
              aria-disabled={sinElegir || elegir.isPending ? "true" : undefined}
              aria-describedby={sinElegir ? idMotivo : undefined}
              onClick={() => void usarSitio()}
            >
              {elegir.isPending ? "Guardando…" : "Usar este sitio"}
            </button>
            {sinElegir ? (
              <span id={idMotivo} className="campo-ayuda" data-testid="motivo-elegir-sitio">
                Elige un sitio para continuar.
              </span>
            ) : null}
          </div>
        </fieldset>
      ) : null}
      {error ? (
        <p className="mensaje-error-global" role="alert" data-testid="error-sitio" data-codigo={error.codigo}>
          {error.texto}
        </p>
      ) : null}
    </div>
  );
}
