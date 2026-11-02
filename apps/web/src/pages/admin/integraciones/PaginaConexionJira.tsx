import { useState } from "react";
import { esIndisponible, useConfiguracionJira } from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { EstadoToken } from "@/components/integraciones/CampoToken";
import { FormularioConexionJira } from "@/components/integraciones/FormularioConexionJira";
import { ChipConexion } from "@/components/integraciones/Insignias";
import { ListaEventosConfiguracion } from "@/components/integraciones/ListaEventosConfiguracion";
import { formatearFecha } from "@/lib/formato";
import { mensajeDeError } from "@/lib/mensajesIntegracion";

/** Pestaña «Conexión» (E5-F01): estado de la conexión, formulario y cambios de configuración. */
export function PaginaConexionJira() {
  const consulta = useConfiguracionJira();
  const [tokenNoDescifrable, setTokenNoDescifrable] = useState(false);
  const [llaveAusente, setLlaveAusente] = useState(false);

  let estado: EstadoDatos;
  if (consulta.isError) estado = esIndisponible(consulta.error) ? "indisponible" : "error";
  else if (consulta.isLoading || !consulta.data) estado = "cargando";
  else estado = "ok";

  const config = consulta.data;
  const deshabilitada = Boolean(config && !config.llaveDisponible) || llaveAusente;
  const noDescifrable = Boolean(config && config.token.configurado && !config.token.descifrable && config.llaveDisponible) || tokenNoDescifrable;

  return (
    <div data-testid="pestana-conexion-contenido">
      <BloqueDatos clave="configuracion" estado={estado} onReintentar={() => void consulta.refetch()}>
        {config ? (
          <>
            <section className="panel franja-estado-conexion" aria-labelledby="titulo-estado-conexion">
              <h2 id="titulo-estado-conexion" className="sr-only">
                Estado de la conexión
              </h2>
              <ChipConexion estado={config.estadoConexion} />
              <span data-testid="texto-ultima-prueba">
                {config.ultimaPruebaEn ? (
                  <>
                    Última prueba: <time dateTime={config.ultimaPruebaEn}>{formatearFecha(config.ultimaPruebaEn)}</time>
                    {config.estadoConexion === "FALLIDA" && config.ultimaPruebaCodigo ? <> · {mensajeDeError(config.ultimaPruebaCodigo)}</> : null}
                  </>
                ) : (
                  "Aún no se ha probado la conexión"
                )}
              </span>
              <span>
                API token: <EstadoToken token={config.token} descifrable={config.token.descifrable && !tokenNoDescifrable} />
              </span>
            </section>

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

            <FormularioConexionJira
              config={config}
              tokenNoDescifrable={noDescifrable}
              deshabilitada={deshabilitada}
              onTokenNoDescifrable={() => setTokenNoDescifrable(true)}
              onIntegracionDeshabilitada={() => setLlaveAusente(true)}
            />
            <ListaEventosConfiguracion />
          </>
        ) : null}
      </BloqueDatos>
    </div>
  );
}
