import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProbarConexion } from "@/api/integraciones";
import { estadoChip } from "@/lib/estadoConexion";
import { formatearFecha } from "@/lib/formato";
import { ErrorApi } from "@/lib/httpClient";
import { mensajeDeError } from "@/lib/mensajesIntegracion";
import { etiquetaPermiso } from "@/lib/mensajesIntegracion";
import type { ConexionOauthJira, ConfiguracionJira } from "@/types/dominio";
import { AyudaRevocarJira } from "./AyudaOauthJira";
import { BotonConectarJira, type ConexionOauth } from "./ConectarJira";
import { EstadoToken } from "./CampoToken";
import { DialogoDesconexionOauth, TEXTO_DESCONEXION_HECHA } from "./DialogoDesconexionOauth";
import { ChipConexion, InsigniaOauthInactiva } from "./Insignias";
import { ListaSitiosOauth } from "./ListaSitiosOauth";
import type { ResultadoPrueba } from "./ResultadoConexionJira";

interface Props {
  config: ConfiguracionJira;
  /** El token guardado no se puede descifrar (D94): el texto lo dice. */
  tokenDescifrable: boolean;
  /** Flujo único de «Conectar con Jira» / «Reconectar» (lo comparte el panel OAuth). */
  conexion: ConexionOauth;
  onResultado: (resultado: ResultadoPrueba | null) => void;
  /** La conexión quedó hecha al elegir el sitio: el aviso de éxito (`aviso-oauth-conectado`) lo muestra la página. */
  onConectada: (oauth: ConexionOauthJira) => void;
  /** «Conectar con Jira» en la tarjeta del API token: lleva al selector, sin cambiar nada guardado. */
  onOfrecerOauth: () => void;
}

function Fecha({ valor }: { valor: string }) {
  return <time dateTime={valor}>{formatearFecha(valor)}</time>;
}

function DatosOauth({ oauth }: { oauth: ConexionOauthJira }) {
  return (
    <dl className="tarjeta-estado__datos">
      <div>
        <dt>Cuenta</dt>
        <dd data-testid="cuenta-oauth">{oauth.cuenta?.nombre ?? "—"}</dd>
      </div>
      <div>
        <dt>Sitio</dt>
        <dd data-testid="sitio-oauth">{oauth.sitio ? `${oauth.sitio.nombre} · ${oauth.sitio.url}` : "—"}</dd>
      </div>
      <div>
        <dt>Permisos concedidos</dt>
        <dd data-testid="permisos-oauth">
          <strong>Solo lectura</strong>
          <ul className="lista-permisos">
            {oauth.permisos.map((permiso) => {
              const etiqueta = etiquetaPermiso(permiso);
              return (
                <li key={permiso} title={permiso}>
                  {etiqueta}
                  {etiqueta !== permiso ? <span className="sr-only"> ({permiso})</span> : null}
                </li>
              );
            })}
          </ul>
        </dd>
      </div>
      <div>
        <dt>Conectado el</dt>
        <dd data-testid="fecha-renovacion">
          <Fecha valor={oauth.conectadoEn} /> ·{" "}
          {oauth.renovadoEn ? (
            <>
              Renovada el <Fecha valor={oauth.renovadoEn} />
            </>
          ) : (
            "Aún no se ha renovado (se renueva sola antes de que venza)"
          )}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Tarjeta de estado de la conexión (diseño OAuth §3, FO3). El chip refleja el método ACTIVO; la conexión OAuth guardada
 * mientras el API token sigue activo se muestra como «Lista, sin activar» sin tocar el chip (decisiones-mvp).
 */
export function TarjetaEstadoConexion({ config, tokenDescifrable, conexion, onResultado, onConectada, onOfrecerOauth }: Props) {
  const idTitulo = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const aviso = useRef<HTMLDivElement>(null);
  const cliente = useQueryClient();
  const probar = useProbarConexion();
  const [dialogo, setDialogo] = useState(false);
  const [desconectada, setDesconectada] = useState(false);
  const [probadaEn, setProbadaEn] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");

  const estado = estadoChip(config);
  const oauth = config.oauth;
  const reconexion = estado === "reconexion-necesaria";
  const pendiente = oauth?.estado === "PENDIENTE_SITIO";
  const necesitaReconectar = Boolean(oauth && (oauth.estado === "RECONEXION_NECESARIA" || !oauth.descifrable));
  const apiActivo = config.metodo === "API_TOKEN";

  // Foco (diseño §3.7 y §8.1): a `aviso-reconexion` cuando una prueba lo provoca; al título cuando el control que tenía el foco desapareció.
  const anterior = useRef(estado);
  useEffect(() => {
    if (anterior.current === estado) return;
    anterior.current = estado;
    if (estado === "reconexion-necesaria") aviso.current?.focus();
    else if (document.activeElement === document.body || document.activeElement === null) titulo.current?.focus();
  }, [estado]);

  useEffect(() => {
    if (oauth) setDesconectada(false);
  }, [oauth]);

  async function probarConexion() {
    if (probar.isPending) return;
    setAnuncio("Probando la conexión con Jira…");
    onResultado(null);
    try {
      // Solo el método activo: con OAuth no se manda sitio, correo ni token (D138-6).
      const respuesta = await probar.mutateAsync({ metodo: config.metodo === "OAUTH" ? "OAUTH" : "API_TOKEN" });
      if (respuesta.ok) {
        setProbadaEn(new Date().toISOString());
        const texto = `Conexión exitosa con Jira como ${respuesta.usuarioJira ?? "tu cuenta"}. No se guardaron cambios.`;
        onResultado({ tipo: "ok", texto });
        setAnuncio(texto);
      } else if (respuesta.error) {
        onResultado({ tipo: "error", error: respuesta.error, metodo: config.metodo === "OAUTH" ? "OAUTH" : "API_TOKEN", pie: "No se guardó ningún cambio." });
        if (respuesta.error.codigo === "JIRA_RECONEXION_NECESARIA") void cliente.invalidateQueries({ queryKey: ["integraciones"] });
        setAnuncio("");
      } else {
        onResultado({ tipo: "global", texto: "No fue posible probar la conexión. Intenta nuevamente." });
      }
    } catch (fallo) {
      setAnuncio("");
      if (fallo instanceof ErrorApi && fallo.status === 403) onResultado({ tipo: "permiso" });
      else {
        if (fallo instanceof ErrorApi && fallo.status === 409) void cliente.invalidateQueries({ queryKey: ["integraciones"] });
        onResultado({ tipo: "global", texto: "No fue posible probar la conexión. Intenta nuevamente." });
      }
    }
  }

  const ultimaPrueba = probadaEn ?? config.ultimaPruebaEn;
  const textoUltimaPrueba = (
    <span data-testid="texto-ultima-prueba">
      {ultimaPrueba ? (
        <>
          Última prueba: <Fecha valor={ultimaPrueba} />
          {config.estadoConexion === "FALLIDA" && config.ultimaPruebaCodigo && !probadaEn ? <> · {mensajeDeError(config.ultimaPruebaCodigo)}</> : null}
        </>
      ) : (
        "Aún no se ha probado la conexión"
      )}
    </span>
  );

  const botonDesconectar = (
    <button type="button" className="boton boton--secundario boton--texto-peligro" data-testid="boton-desconectar-jira" onClick={() => setDialogo(true)}>
      Desconectar
    </button>
  );
  const botonProbar = (
    <button type="button" className="boton boton--secundario" data-testid="boton-probar-conexion" aria-disabled={probar.isPending ? "true" : undefined} onClick={() => void probarConexion()}>
      {probar.isPending ? "Probando…" : "Probar conexión"}
    </button>
  );

  const avisoReconexion = (
    <div ref={aviso} className="aviso-reconexion" role="alert" tabIndex={-1} data-testid="aviso-reconexion">
      <p>
        <strong>La conexión con Jira venció. Vuelve a conectar con Jira.</strong>
      </p>
      <p>Mientras tanto no se puede consultar ni sincronizar. Lo que ya está en Quality360 no se modifica.</p>
      <BotonConectarJira testId="boton-reconectar-jira" texto="Reconectar" estado={conexion.estado} describedBy="aviso-oauth-no-disponible" onClick={() => void conexion.iniciar()} />
    </div>
  );

  const ultimaCuenta =
    oauth && (oauth.cuenta || oauth.sitio) ? (
      <p className="campo-ayuda" data-testid="ultima-cuenta-oauth">
        {oauth.cuenta ? <>Última cuenta: {oauth.cuenta.nombre}</> : null}
        {oauth.cuenta && oauth.sitio ? " · " : null}
        {oauth.sitio ? <>Sitio: {oauth.sitio.nombre}</> : null}
      </p>
    ) : null;

  return (
    <section className="panel tarjeta-estado" data-testid="tarjeta-estado-conexion" aria-labelledby={idTitulo}>
      <h2 id={idTitulo} ref={titulo} tabIndex={-1}>
        Estado de la conexión
      </h2>
      <div role="status" className="sr-only" data-testid="anuncio-conexion">
        {anuncio}
      </div>
      <p className="tarjeta-estado__chip">
        <ChipConexion config={config} />
      </p>

      {/* ---------------------------------------------------------------- API token activo (C) */}
      {apiActivo ? (
        <>
          <dl className="tarjeta-estado__datos">
            <div>
              <dt>Sitio</dt>
              <dd className="texto-largo">{config.sitio ?? "—"}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd className="texto-largo">{config.correo ?? "—"}</dd>
            </div>
            <div>
              <dt>API token</dt>
              <dd>
                <EstadoToken token={config.token} descifrable={tokenDescifrable} />
              </dd>
            </div>
          </dl>
          <p>{textoUltimaPrueba}</p>
          {!oauth ? (
            <p className="campo-ayuda" data-testid="ofrecer-oauth">
              {config.oauthDisponible ? (
                <>
                  ¿Prefieres no copiar tokens? Conecta con Jira.{" "}
                  <button type="button" className="boton boton--secundario" data-testid="boton-pasar-a-oauth" onClick={onOfrecerOauth}>
                    Conectar con Jira
                  </button>
                </>
              ) : (
                "La conexión automática aún no está habilitada en el servidor."
              )}
            </p>
          ) : null}
          {desconectada && !oauth ? (
            <>
              <p className="mensaje-exito" role="status" data-testid="mensaje-desconexion-ok">
                {TEXTO_DESCONEXION_HECHA}
              </p>
              <AyudaRevocarJira abierta />
            </>
          ) : null}
          <div className="acciones-formulario">{botonProbar}</div>
          {/* Sin «Desconectar» con API token (D217, diseño §12.1): el token se reemplaza al guardar otro. */}
          {oauth ? (
            <div className="tarjeta-oauth-inactiva" data-testid="tarjeta-oauth-inactiva" data-estado={oauth.estado}>
              <h3>Conexión con Jira (OAuth) guardada</h3>
              <p>
                <span data-testid="estado-oauth" data-estado={oauth.estado}>
                  {necesitaReconectar ? (
                    <InsigniaOauthInactiva glifo="⚠" texto="Reconexión necesaria" clase="incompleta" testId="insignia-oauth" />
                  ) : pendiente ? (
                    <InsigniaOauthInactiva glifo="◐" texto="Falta elegir el sitio" clase="incompleta" testId="insignia-oauth" />
                  ) : (
                    <InsigniaOauthInactiva glifo="✓" texto="Lista, sin activar" clase="ok" testId="insignia-oauth" />
                  )}
                </span>
              </p>
              {necesitaReconectar ? (
                <>
                  {avisoReconexion}
                  {ultimaCuenta}
                </>
              ) : pendiente ? (
                <ListaSitiosOauth candidatos={oauth.sitiosCandidatos ?? []} onConectada={onConectada} />
              ) : (
                <>
                  <DatosOauth oauth={oauth} />
                  <p className="mensaje-aviso" role="note" data-testid="aviso-oauth-lista">
                    La conexión con Jira funciona, pero todavía no está activa. Pulsa «Probar y guardar» para empezar a usarla; hasta entonces se sigue usando el API token.
                  </p>
                </>
              )}
              <div className="acciones-formulario">{botonDesconectar}</div>
              <AyudaRevocarJira />
            </div>
          ) : null}
        </>
      ) : null}

      {/* ---------------------------------------------------- OAuth activo, o sin configuración (A, B, D, E) */}
      {!apiActivo ? (
        <>
          {oauth ? (
            <p className="tarjeta-estado__metodo">
              <span className="insignia-texto" data-testid="estado-oauth" data-estado={oauth.estado}>
                Método: Jira (OAuth)
              </span>
            </p>
          ) : null}

          {estado === "sin-conectar" || !oauth ? (
            <>
              {desconectada ? (
                <p className="mensaje-exito" role="status" data-testid="mensaje-desconexion-ok">
                  {TEXTO_DESCONEXION_HECHA}
                </p>
              ) : (
                <p>Aún no hay una conexión con Jira. Elige un método para empezar.</p>
              )}
              <p>{textoUltimaPrueba}</p>
              {desconectada ? <AyudaRevocarJira abierta /> : null}
            </>
          ) : null}

          {oauth && reconexion ? (
            <>
              {avisoReconexion}
              {ultimaCuenta}
              <p>{textoUltimaPrueba}</p>
              <div className="acciones-formulario">{botonDesconectar}</div>
              <AyudaRevocarJira />
            </>
          ) : null}

          {oauth && !reconexion && pendiente ? (
            <>
              <ListaSitiosOauth candidatos={oauth.sitiosCandidatos ?? []} onConectada={onConectada} />
              <div className="acciones-formulario">{botonDesconectar}</div>
              <AyudaRevocarJira />
            </>
          ) : null}

          {oauth && !reconexion && !pendiente ? (
            <>
              <DatosOauth oauth={oauth} />
              <p className="campo-ayuda">La conexión se renueva sola. Solo tendrás que reconectar si revocas el permiso en Atlassian o si pasan muchos días sin usarla.</p>
              <p>{textoUltimaPrueba}</p>
              <div className="acciones-formulario">
                {botonProbar}
                {botonDesconectar}
              </div>
              <AyudaRevocarJira />
            </>
          ) : null}
        </>
      ) : null}

      <DialogoDesconexionOauth
        abierto={dialogo}
        onCancelar={() => setDialogo(false)}
        onDesconectada={() => {
          setDialogo(false);
          setDesconectada(true);
          onResultado(null);
        }}
        onSinConexion={() => void cliente.invalidateQueries({ queryKey: ["integraciones"] })}
      />
    </section>
  );
}
