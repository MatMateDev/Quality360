import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { esIndisponible, useConfiguracionJira } from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { useIniciarOauth } from "@/components/integraciones/ConectarJira";
import { FormularioConexionJira } from "@/components/integraciones/FormularioConexionJira";
import { ListaEventosConfiguracion } from "@/components/integraciones/ListaEventosConfiguracion";
import type { ResultadoPrueba } from "@/components/integraciones/ResultadoConexionJira";
import { TarjetaEstadoConexion } from "@/components/integraciones/TarjetaEstadoConexion";
import { tomarAvisoSesionCerrada } from "@/lib/capturaRetornoOauth";
import { textoConexionHecha } from "@/lib/estadoConexion";
import type { ConexionOauthJira, MetodoConexionJira } from "@/types/dominio";

/** Lo que la página de retorno deja en el estado de navegación al volver a Conexión (diseño OAuth §4.3). */
export interface EstadoNavegacionConexion {
  aviso?: "oauth-conectado";
  cuenta?: string | null;
  sitio?: string | null;
}

/** Pestaña «Conexión» (E5-F01 y E5-F08): tarjeta de estado, selector de método, formulario y cambios de configuración. */
export function PaginaConexionJira() {
  const consulta = useConfiguracionJira();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [tokenNoDescifrable, setTokenNoDescifrable] = useState(false);
  const [llaveAusente, setLlaveAusente] = useState(false);
  const [elegida, setElegida] = useState<MetodoConexionJira | null>(null);
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null);
  const [avisoConectado, setAvisoConectado] = useState<{ cuenta: string | null; sitio: string | null } | null>(null);
  // La marca de «sesión cerrada durante la conexión» se consume una sola vez (D210).
  const [avisoSesion] = useState(() => tomarAvisoSesionCerrada());
  const selector = useRef<HTMLDivElement>(null);

  // Al volver de Atlassian con éxito: aviso, OAuth elegido y se limpia el estado de navegación (no sobrevive a una recarga).
  const retorno = (ubicacion.state ?? null) as EstadoNavegacionConexion | null;
  const avisoDeRetorno = retorno?.aviso === "oauth-conectado" ? retorno : null;
  useEffect(() => {
    if (!avisoDeRetorno) return;
    setAvisoConectado({ cuenta: avisoDeRetorno.cuenta ?? null, sitio: avisoDeRetorno.sitio ?? null });
    setElegida("OAUTH");
    navegar(ubicacion.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisoDeRetorno]);

  const config = consulta.data;
  const conexion = useIniciarOauth(config?.oauthDisponible ?? true, useCallback(() => setLlaveAusente(true), []));

  let estado: EstadoDatos;
  if (consulta.isError) estado = esIndisponible(consulta.error) ? "indisponible" : "error";
  else if (consulta.isLoading || !config) estado = "cargando";
  else estado = "ok";

  const deshabilitada = Boolean(config && !config.llaveDisponible) || llaveAusente;
  const noDescifrable = Boolean(config && config.token.configurado && !config.token.descifrable && config.llaveDisponible) || tokenNoDescifrable;
  // Opción inicial: el método activo guardado; sin configuración, OAuth (recomendado, D209).
  const opcion: MetodoConexionJira = elegida ?? config?.metodo ?? "OAUTH";

  function alConectada(oauth: ConexionOauthJira) {
    setAvisoConectado({ cuenta: oauth.cuenta?.nombre ?? null, sitio: oauth.sitio?.nombre ?? null });
    setElegida("OAUTH");
  }

  function ofrecerOauth() {
    setElegida("OAUTH");
    setTimeout(() => selector.current?.querySelector<HTMLElement>("[data-testid=opcion-oauth]")?.focus(), 0);
  }

  return (
    <div data-testid="pestana-conexion-contenido">
      <BloqueDatos clave="configuracion" estado={estado} onReintentar={() => void consulta.refetch()}>
        {config ? (
          <>
            {avisoSesion ? (
              <p className="mensaje-aviso" role="status" data-testid="aviso-sesion-cerrada">
                Tu sesión se cerró durante la conexión. Vuelve a pulsar «Conectar con Jira».
              </p>
            ) : null}
            {avisoConectado ? (
              <div className="mensaje-exito aviso-cerrable" role="status" data-testid="aviso-oauth-conectado">
                <span>{textoConexionHecha(avisoConectado.cuenta, avisoConectado.sitio, Boolean(config.proyecto))}</span>
                <button type="button" className="boton boton--enlace" data-testid="boton-cerrar-aviso" onClick={() => setAvisoConectado(null)}>
                  Cerrar aviso
                </button>
              </div>
            ) : null}

            <TarjetaEstadoConexion
              config={config}
              tokenDescifrable={config.token.descifrable && !tokenNoDescifrable}
              conexion={conexion}
              onResultado={setResultado}
              onConectada={alConectada}
              onOfrecerOauth={ofrecerOauth}
            />

            {deshabilitada ? (
              <p className="mensaje-error-global" role="alert" data-testid="aviso-integracion-deshabilitada">
                La integración no está habilitada en el servidor. Avisa al responsable del despliegue.
              </p>
            ) : null}
            {noDescifrable && !deshabilitada ? (
              <p className="mensaje-aviso" role="alert" data-testid="aviso-token-no-descifrable">
                Vuelve a ingresar el API token.
              </p>
            ) : null}

            <div ref={selector}>
              <FormularioConexionJira
                config={config}
                tokenNoDescifrable={noDescifrable}
                deshabilitada={deshabilitada}
                onTokenNoDescifrable={() => setTokenNoDescifrable(true)}
                onIntegracionDeshabilitada={() => setLlaveAusente(true)}
                opcion={opcion}
                onOpcion={setElegida}
                conexion={conexion}
                resultado={resultado}
                onResultado={setResultado}
              />
            </div>
            <ListaEventosConfiguracion />
          </>
        ) : null}
      </BloqueDatos>
    </div>
  );
}
