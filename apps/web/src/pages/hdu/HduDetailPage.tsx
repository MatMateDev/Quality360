import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAnalistasAsignables } from "@/api/equipo";
import { useAsignarAnalista, useCambiarEstadoHdu, useDetalleHdu, useHistorialHdu } from "@/api/hdu";
import { AccesoDenegado } from "@/components/AccesoDenegado";
import { BloqueEstado } from "@/components/BloqueEstado";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { InsigniaEstadoHdu, InsigniaPrioridad } from "@/components/Etiquetas";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";
import { ETIQUETAS_ESTADO_HDU, type EstadoHdu } from "@/types/dominio";

/** E2-F04: detalle de HDU con responsables, estado, célula, sprint, avance del checklist, cambio de estado e historial. */
export function HduDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detalleQuery = useDetalleHdu(id);
  const historialQuery = useHistorialHdu(id);
  const analistasQuery = useAnalistasAsignables();
  const asignarAnalista = useAsignarAnalista(id ?? "");
  const cambiarEstado = useCambiarEstadoHdu(id ?? "");

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [analistaSeleccionado, setAnalistaSeleccionado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [avisoSinCambios, setAvisoSinCambios] = useState<string | null>(null);
  const [errorEstado, setErrorEstado] = useState<{ codigo: string; mensaje: string } | null>(null);

  if (detalleQuery.isError) {
    const error = detalleQuery.error;
    if (error instanceof ErrorApi && error.status === 403) return <AccesoDenegado />;
    return <BloqueEstado id="hdu-detalle" estado="error" onReintentar={() => detalleQuery.refetch()} />;
  }

  if (detalleQuery.isLoading || !detalleQuery.data) {
    return <BloqueEstado id="hdu-detalle" estado="cargando" />;
  }

  const hdu = detalleQuery.data;

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
              <strong data-testid="checklist-no-disponible">No disponible (se habilita en E3)</strong>
            )}
          </article>
        </div>

        {hdu.permisos.asignarAnalista ? (
          <div className="enlaces-rapidos">
            <button type="button" className="boton boton--secundario" onClick={abrirDialogoAsignar}>
              {hdu.analista ? "Reasignar analista" : "Asignar analista"}
            </button>
          </div>
        ) : null}

        {avisoSinCambios ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-sin-cambios">
            {avisoSinCambios}
          </p>
        ) : null}
      </div>

      {hdu.permisos.cambiarEstado ? (
        <div className="panel">
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
