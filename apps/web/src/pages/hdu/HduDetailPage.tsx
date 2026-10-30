import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useAnalistasAsignables } from "@/api/equipo";
import { useAsignarAnalista, useCambiarEstadoHdu, useDetalleHdu, useHistorialHdu } from "@/api/hdu";
import { useImpedimentosHdu } from "@/api/impedimentos";
import { AccesoDenegado } from "@/components/AccesoDenegado";
import { BloqueEstado } from "@/components/BloqueEstado";
import { ChecklistEntregables } from "@/components/ChecklistEntregables";
import { PanelDescripcionHdu } from "@/components/integraciones/PanelDescripcionHdu";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { DialogoReasignarQe } from "@/components/DialogoReasignarQe";
import { AvisoSoloLectura } from "@/components/bandeja/Estructura";
import { InsigniaEstadoHdu, InsigniaPrioridad } from "@/components/Etiquetas";
import { AvisoHduBloqueada } from "@/components/impedimentos/AvisoHduBloqueada";
import { ErrorCierreBloqueado } from "@/components/impedimentos/ErrorCierreBloqueado";
import { PanelRiesgo } from "@/components/impedimentos/PanelRiesgo";
import { SeccionImpedimentos } from "@/components/impedimentos/SeccionImpedimentos";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_ESTADO_HDU, ROLES_SOLO_LECTURA, rutaPortal, type EstadoHdu, type ListaImpedimentosBloqueantes } from "@/types/dominio";

/** Error de «Cambiar estado»: además del código certificado, el 409 de E4 trae la lista de impedimentos (D77). */
interface ErrorEstado {
  codigo: string;
  mensaje: string;
  bloqueo?: ListaImpedimentosBloqueantes;
}

/** E2-F04 y E3: detalle de HDU con responsables, estado, célula, sprint, checklist de entregables, cambio de estado e historial. */
export function HduDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detalleQuery = useDetalleHdu(id);
  const historialQuery = useHistorialHdu(id);
  const { perfil } = useAuth();
  const ubicacion = useLocation();
  const permisoAsignar = detalleQuery.data?.permisos.asignarAnalista ?? false;
  const analistasQuery = useAnalistasAsignables(permisoAsignar);
  const asignarAnalista = useAsignarAnalista(id ?? "");
  const cambiarEstado = useCambiarEstadoHdu(id ?? "");
  const impedimentosQuery = useImpedimentosHdu(id);
  const queryClient = useQueryClient();

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [analistaSeleccionado, setAnalistaSeleccionado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [avisoSinCambios, setAvisoSinCambios] = useState<string | null>(null);
  const [dialogoQeAbierto, setDialogoQeAbierto] = useState(false);
  const [avisoQe, setAvisoQe] = useState<string | null>(null);
  const [errorEstado, setErrorEstado] = useState<ErrorEstado | null>(null);

  const hayDetalle = Boolean(detalleQuery.data);
  useEffect(() => {
    if (!hayDetalle || !ubicacion.hash) return;
    document.getElementById(ubicacion.hash.slice(1))?.scrollIntoView?.({ block: "start" });
  }, [hayDetalle, ubicacion.hash]);

  if (detalleQuery.isError) {
    const error = detalleQuery.error;
    // 403 y 404 muestran lo mismo: no se revela si la HDU existe (D50, diseño §4.3).
    if (error instanceof ErrorApi && (error.status === 403 || error.status === 404)) return <AccesoDenegado variante="recurso" />;
    return <BloqueEstado id="hdu-detalle" estado="error" onReintentar={() => detalleQuery.refetch()} />;
  }

  if (detalleQuery.isLoading || !detalleQuery.data) {
    return <BloqueEstado id="hdu-detalle" estado="cargando" />;
  }

  const hdu = detalleQuery.data;
  const soloLectura = perfil ? ROLES_SOLO_LECTURA.includes(perfil.rol) : false;
  const puedeReasignarQe = perfil?.rol === "ADMINISTRADOR" && hdu.estado !== "CERRADA";
  const desde = (ubicacion.state as { desde?: string } | null)?.desde;
  // D78: `?impedimento=<id>` resalta la tarjeta; un id que no está en la lista se ignora sin aviso ni error.
  const resaltarId = new URLSearchParams(ubicacion.search).get("impedimento");
  const bloqueoImpedimentos = impedimentosQuery.data?.bloqueada ? impedimentosQuery.data.abiertos + impedimentosQuery.data.escalados : 0;

  function abrirDialogoAsignar() {
    setAnalistaSeleccionado(hdu.analista?.id ?? "");
    setMotivo("");
    setErrorAsignacion(null);
    setAvisoSinCambios(null);
    setDialogoAbierto(true);
  }

  async function confirmarAsignacion() {
    if (!analistaSeleccionado) {
      setErrorAsignacion("Selecciona un analista.");
      return;
    }
    try {
      const resultado = await asignarAnalista.mutateAsync({
        analistaId: analistaSeleccionado,
        motivo: motivo.trim() || undefined,
      });
      setDialogoAbierto(false);
      setAvisoSinCambios(resultado.cambio ? null : "Sin cambios: el analista indicado ya estaba asignado.");
    } catch (error) {
      if (error instanceof ErrorApi) {
        setErrorAsignacion(error.mensaje);
      } else {
        setErrorAsignacion("No fue posible asignar el analista.");
      }
    }
  }

  async function manejarCambioEstado(nuevoEstado: EstadoHdu) {
    setErrorEstado(null);
    try {
      await cambiarEstado.mutateAsync({ estado: nuevoEstado });
    } catch (error) {
      if (error instanceof ErrorApi && error.status === 409 && error.codigo === "HDU_BLOQUEADA") {
        const cuerpo = error.cuerpo as { impedimentos?: ListaImpedimentosBloqueantes } | undefined;
        setErrorEstado({ codigo: error.codigo, mensaje: error.mensaje, bloqueo: cuerpo?.impedimentos });
        // La sección se recarga para quedar sincronizada con lo que dijo el servidor.
        void queryClient.invalidateQueries({ queryKey: ["impedimentos"] });
      } else if (error instanceof ErrorApi && error.status === 503 && (error.cuerpo as { impedimentos?: { estado?: string } } | undefined)?.impedimentos?.estado === "indisponible") {
        // Impedimentos no respondió (D60): se distingue de una caída del gateway o de Organización.
        setErrorEstado({ codigo: "IMPEDIMENTOS_NO_DISPONIBLES", mensaje: error.mensaje });
      } else if (error instanceof ErrorApi) {
        setErrorEstado({ codigo: error.codigo, mensaje: error.mensaje });
      } else {
        setErrorEstado({ codigo: "ERROR_INTERNO", mensaje: "No fue posible cambiar el estado." });
      }
    }
  }

  const testIdErrorEstado =
    errorEstado?.codigo === "CHECKLIST_NO_DISPONIBLE"
      ? "error-checklist-no-disponible"
      : errorEstado?.codigo === "CHECKLIST_INCOMPLETO"
        ? "error-checklist-incompleto"
        : errorEstado?.codigo === "TRANSICION_INVALIDA"
          ? "error-transicion-invalida"
          : "error-cambio-estado";

  return (
    <div>
      <p>
        <Link to={desde ?? (perfil ? rutaPortal(perfil.rol) : "/")} data-testid="enlace-volver-bandeja">
          ← Volver a mi bandeja
        </Link>
      </p>
      {soloLectura ? <AvisoSoloLectura /> : null}
      {bloqueoImpedimentos > 0 && perfil ? <AvisoHduBloqueada abiertos={bloqueoImpedimentos} rol={perfil.rol} /> : null}
      <div className="encabezado">
        <p className="etiqueta">{hdu.codigo}</p>
        <h1>{hdu.titulo}</h1>
      </div>

      <div className="panel">
        <div className="resumen-detalle">
          <article>
            <span>Estado</span>
            <strong>
              <InsigniaEstadoHdu estado={hdu.estado} />
            </strong>
          </article>
          <article>
            <span>Célula</span>
            <strong>{hdu.celula.nombre}</strong>
          </article>
          <article>
            <span>Sprint</span>
            <strong>{hdu.sprint.nombre}</strong>
          </article>
          <article>
            <span>Prioridad</span>
            <strong>
              <InsigniaPrioridad prioridad={hdu.prioridad} />
            </strong>
          </article>
          <article>
            <span>QE responsable</span>
            <strong>{hdu.qeResponsable.nombre}</strong>
          </article>
          <article>
            <span>Analista QA</span>
            <strong data-testid="valor-analista-hdu">{hdu.analista?.nombre ?? "Sin asignar"}</strong>
          </article>
          <article>
            <span>Último cambio de estado</span>
            <strong>{formatearFecha(hdu.estadoActualizadoEn)}</strong>
          </article>
          <article>
            <span>Avance del checklist</span>
            {hdu.checklist.estado === "ok" ? (
              <strong>
                {hdu.checklist.datos.porcentajeCumplimiento}% ({hdu.checklist.datos.completados}/{hdu.checklist.datos.totalEntregables})
              </strong>
            ) : (
              <strong data-testid="checklist-no-disponible">No disponible en este momento</strong>
            )}
          </article>
        </div>

        {hdu.permisos.asignarAnalista || puedeReasignarQe ? (
          <div className="enlaces-rapidos" id="asignacion">
            {hdu.permisos.asignarAnalista ? (
              <button type="button" className="boton boton--secundario" onClick={abrirDialogoAsignar}>
                {hdu.analista ? "Reasignar analista" : "Asignar analista"}
              </button>
            ) : null}
            {puedeReasignarQe ? (
              <button type="button" className="boton boton--secundario" data-testid="boton-reasignar-qe" onClick={() => setDialogoQeAbierto(true)}>
                Reasignar QE responsable
              </button>
            ) : null}
          </div>
        ) : null}

        {avisoQe ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-qe-reasignado">
            {avisoQe}
          </p>
        ) : null}

        {avisoSinCambios ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-sin-cambios">
            {avisoSinCambios}
          </p>
        ) : null}
      </div>

      <div id="certificado">
        <ChecklistEntregables hduId={hdu.id} hduCerrada={hdu.estado === "CERRADA"} />
      </div>

      {/* E5 (D108): después del checklist y antes de los bloques de E4. Texto plano; sin `origen` no se renderiza. */}
      <PanelDescripcionHdu hdu={hdu} />

      <SeccionImpedimentos hduId={hdu.id} resaltarId={resaltarId} />
      {/* D73: el Analista no ve el riesgo; el panel ni siquiera se monta (ninguna llamada al servicio). */}
      {perfil && perfil.rol !== "ANALISTA_QA" ? <PanelRiesgo hduId={hdu.id} /> : null}

      {hdu.permisos.cambiarEstado ? (
        <div className="panel" id="estado">
          <h2>Cambiar estado</h2>
          {hdu.transicionesPermitidas.includes("CERRADA") && bloqueoImpedimentos > 0 ? (
            <p className="mensaje-aviso" role="note" data-testid="pista-cierre-bloqueado">
              Esta HDU tiene {bloqueoImpedimentos} {bloqueoImpedimentos === 1 ? "impedimento abierto" : "impedimentos abiertos"}. No podrá cerrarse hasta resolverlos.{" "}
              <a href="#impedimentos">Ver impedimentos</a>
            </p>
          ) : null}
          {hdu.transicionesPermitidas.length === 0 ? (
            <p>No hay transiciones disponibles desde el estado actual.</p>
          ) : (
            <div className="enlaces-rapidos">
              {hdu.transicionesPermitidas.map((estado) => (
                <button
                  key={estado}
                  type="button"
                  className="boton boton--primario"
                  onClick={() => manejarCambioEstado(estado)}
                  disabled={cambiarEstado.isPending}
                >
                  Pasar a {ETIQUETAS_ESTADO_HDU[estado]}
                </button>
              ))}
            </div>
          )}
          {errorEstado?.codigo === "HDU_BLOQUEADA" ? (
            <ErrorCierreBloqueado bloqueo={errorEstado.bloqueo} />
          ) : errorEstado?.codigo === "IMPEDIMENTOS_NO_DISPONIBLES" ? (
            <p className="mensaje-error-global" role="alert" data-testid="error-impedimentos-no-disponible">
              No pudimos verificar los impedimentos de la HDU. Intenta de nuevo en unos minutos.
            </p>
          ) : errorEstado ? (
            <p className="mensaje-error-global" role="alert" data-testid={testIdErrorEstado}>
              {errorEstado.mensaje}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="panel">
        <h2>Historial</h2>
        {historialQuery.isLoading ? <BloqueEstado id="hdu-historial" estado="cargando" /> : null}
        {historialQuery.isError ? (
          <BloqueEstado id="hdu-historial" estado="error" onReintentar={() => historialQuery.refetch()} />
        ) : null}
        {historialQuery.data ? (
          historialQuery.data.items.length === 0 ? (
            <BloqueEstado id="hdu-historial" estado="vacio" mensaje="Sin eventos registrados." />
          ) : (
            <ul className="historial-lista">
              {historialQuery.data.items.map((evento, indice) => (
                <li key={indice} className="historial-item" data-testid={`historial-item-${indice}`}>
                  <time dateTime={evento.fecha}>{formatearFecha(evento.fecha)}</time>
                  {evento.tipo === "ESTADO" ? (
                    <p>
                      {evento.actor.nombre} cambió el estado
                      {evento.estadoAnterior ? ` de ${ETIQUETAS_ESTADO_HDU[evento.estadoAnterior]}` : ""} a{" "}
                      {ETIQUETAS_ESTADO_HDU[evento.estadoNuevo]}.
                    </p>
                  ) : evento.tipo === "QE_RESPONSABLE" ? (
                    <p>
                      {evento.actor.nombre} reasignó el QE responsable (antes {evento.qeAnterior.nombre}) a {evento.qeNuevo.nombre}
                      {` — Motivo: ${evento.motivo}`}.
                    </p>
                  ) : (
                    <p>
                      {evento.actor.nombre} asignó a {evento.analistaNuevo.nombre}
                      {evento.analistaAnterior ? ` (antes ${evento.analistaAnterior.nombre})` : ""}
                      {evento.motivo ? ` — Motivo: ${evento.motivo}` : ""}.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {perfil?.rol === "ADMINISTRADOR" ? (
        <DialogoReasignarQe
          abierto={dialogoQeAbierto}
          hduId={hdu.id}
          codigo={hdu.codigo}
          qeActual={hdu.qeResponsable}
          onCerrar={() => setDialogoQeAbierto(false)}
          onReasignado={(nombre) => setAvisoQe(`QE responsable reasignado a ${nombre}.`)}
        />
      ) : null}

      <DialogoConfirmacion
        abierto={dialogoAbierto}
        titulo={hdu.analista ? "Reasignar analista" : "Asignar analista"}
        etiquetaConfirmar={asignarAnalista.isPending ? "Guardando…" : "Confirmar"}
        deshabilitado={asignarAnalista.isPending}
        onConfirmar={confirmarAsignacion}
        onCancelar={() => setDialogoAbierto(false)}
      >
        <div className="campo">
          <label htmlFor="select-analista-hdu">Analista QA</label>
          <select id="select-analista-hdu" value={analistaSeleccionado} onChange={(evento) => setAnalistaSeleccionado(evento.target.value)}>
            <option value="">Selecciona un analista</option>
            {analistasQuery.data?.items.map((analista) => (
              <option key={analista.id} value={analista.id}>
                {analista.nombre}
              </option>
            ))}
          </select>
        </div>
        {hdu.analista ? (
          <div className="campo">
            <label htmlFor="campo-motivo-asignacion">Motivo del cambio</label>
            <textarea id="campo-motivo-asignacion" rows={3} value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
          </div>
        ) : null}
        {errorAsignacion ? (
          <p className="campo-error" role="alert" data-testid="error-asignacion-analista">
            {errorAsignacion}
          </p>
        ) : null}
      </DialogoConfirmacion>
    </div>
  );
}

/**
 * Evento de reasignación del QE responsable en el historial. El contrato aún no lo declara
 * (PENDIENTE: tipar al regenerar los tipos al integrar E7-B05); se lee de forma defensiva.
 */
