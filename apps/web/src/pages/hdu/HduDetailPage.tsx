import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useAnalistasAsignables } from "@/api/equipo";
import { useAsignarAnalista, useCambiarEstadoHdu, useDetalleHdu, useHistorialHdu } from "@/api/hdu";
import { AccesoDenegado } from "@/components/AccesoDenegado";
import { BloqueEstado } from "@/components/BloqueEstado";
import { ChecklistEntregables } from "@/components/ChecklistEntregables";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { DialogoReasignarQe } from "@/components/DialogoReasignarQe";
import { AvisoSoloLectura } from "@/components/bandeja/Estructura";
import { InsigniaEstadoHdu, InsigniaPrioridad } from "@/components/Etiquetas";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_ESTADO_HDU, ROLES_SOLO_LECTURA, rutaPortal, type EstadoHdu } from "@/types/dominio";

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

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [analistaSeleccionado, setAnalistaSeleccionado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [avisoSinCambios, setAvisoSinCambios] = useState<string | null>(null);
  const [dialogoQeAbierto, setDialogoQeAbierto] = useState(false);
  const [avisoQe, setAvisoQe] = useState<string | null>(null);
  const [errorEstado, setErrorEstado] = useState<{ codigo: string; mensaje: string } | null>(null);

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
      if (error instanceof ErrorApi) {
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

      {hdu.permisos.cambiarEstado ? (
        <div className="panel" id="estado">
          <h2>Cambiar estado</h2>
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
          {errorEstado ? (
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
