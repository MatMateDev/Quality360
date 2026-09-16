import { useState } from "react";
import { useAsignarSupervisor, useHistorialSupervision } from "@/api/supervision";
import { useUsuarios } from "@/api/usuarios";
import { BloqueEstado } from "@/components/BloqueEstado";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { formatearFecha } from "@/lib/formato";
import { ErrorApi } from "@/lib/httpClient";

/** F10: asigna o cambia el QE supervisor. Muestra la relación vigente antes de confirmar, pide motivo si ya había QE y ofrece el historial. */
export function AdminSupervisionPage() {
  const analistasQuery = useUsuarios({ rol: "ANALISTA_QA" });
  const qesQuery = useUsuarios({ rol: "QE" });
  const asignarSupervisor = useAsignarSupervisor();

  const [analistaId, setAnalistaId] = useState("");
  const [qeId, setQeId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoSinCambios, setAvisoSinCambios] = useState<string | null>(null);

  const historialQuery = useHistorialSupervision(analistaId || null);
  const analistaSeleccionado = analistasQuery.data?.items.find((usuario) => usuario.id === analistaId);
  const qeSeleccionado = qesQuery.data?.items.find((usuario) => usuario.id === qeId);

  function seleccionarAnalista(id: string) {
    setAnalistaId(id);
    setError(null);
    setAvisoSinCambios(null);
  }

  function abrirDialogo() {
    if (!analistaId || !qeId) {
      setError("Selecciona un analista y un QE.");
      return;
    }
    setError(null);
    setDialogoAbierto(true);
  }

  async function confirmar() {
    try {
      const resultado = await asignarSupervisor.mutateAsync({ analistaId, body: { qeId, motivo: motivo.trim() || undefined } });
      setDialogoAbierto(false);
      setMotivo("");
      setAvisoSinCambios(resultado.cambio ? null : "Sin cambios: el QE indicado ya era el supervisor vigente.");
    } catch (error) {
      setError(error instanceof ErrorApi ? error.mensaje : "No fue posible asignar el supervisor.");
    }
  }

  return (
    <div>
      <div className="encabezado">
        <p className="etiqueta">Portal Administrador</p>
        <h1>Supervisión</h1>
        <p>Asigna o cambia el QE supervisor de un Analista QA.</p>
      </div>

      <div className="panel">
        <h2>Asignar o cambiar supervisor</h2>

        <div className="campos-formulario">
          <div className="campo">
            <label htmlFor="select-analista-supervision">Analista QA</label>
            <select id="select-analista-supervision" value={analistaId} onChange={(evento) => seleccionarAnalista(evento.target.value)}>
              <option value="">Selecciona un analista</option>
              {analistasQuery.data?.items.map((analista) => (
                <option key={analista.id} value={analista.id}>
                  {analista.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="select-qe-supervision">QE supervisor</label>
            <select id="select-qe-supervision" value={qeId} onChange={(evento) => setQeId(evento.target.value)}>
              <option value="">Selecciona un QE</option>
              {qesQuery.data?.items.map((qe) => (
                <option key={qe.id} value={qe.id}>
                  {qe.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {analistaSeleccionado ? (
          <p data-testid="relacion-vigente-supervision">
            Relación vigente: <strong>{analistaSeleccionado.supervisorVigente?.nombre ?? "Sin supervisor asignado"}</strong>
          </p>
        ) : null}

        {error ? (
          <p className="mensaje-error-global" role="alert" data-testid="error-supervision">
            {error}
          </p>
        ) : null}
        {avisoSinCambios ? (
          <p className="mensaje-aviso" role="status" data-testid="aviso-sin-cambios-supervision">
            {avisoSinCambios}
          </p>
        ) : null}

        <div className="acciones-formulario">
          <button type="button" className="boton boton--primario" onClick={abrirDialogo}>
            Asignar / cambiar
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Historial de supervisión</h2>
        {!analistaId ? <p>Selecciona un analista para ver su historial.</p> : null}
        {analistaId && historialQuery.isLoading ? <BloqueEstado id="historial-supervision" estado="cargando" /> : null}
        {analistaId && historialQuery.isError ? (
          <BloqueEstado id="historial-supervision" estado="error" onReintentar={() => historialQuery.refetch()} />
        ) : null}
        {historialQuery.data ? (
          historialQuery.data.items.length === 0 ? (
            <BloqueEstado id="historial-supervision" estado="vacio" mensaje="Este analista nunca tuvo supervisor." />
          ) : (
            <ul className="historial-lista">
              {historialQuery.data.items.map((relacion) => (
                <li key={relacion.id} className="historial-item" data-testid={`historial-supervision-${relacion.id}`}>
                  <time dateTime={relacion.desde}>
                    {formatearFecha(relacion.desde)} {relacion.hasta ? `– ${formatearFecha(relacion.hasta)}` : "– vigente"}
                  </time>
                  <p>
                    {relacion.qe.nombre}
                    {relacion.motivo ? ` — Motivo: ${relacion.motivo}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      <DialogoConfirmacion
        abierto={dialogoAbierto}
        titulo="Confirmar supervisión"
        etiquetaConfirmar={asignarSupervisor.isPending ? "Guardando…" : "Confirmar"}
        deshabilitado={asignarSupervisor.isPending}
        onConfirmar={confirmar}
        onCancelar={() => setDialogoAbierto(false)}
      >
        <p>
          Analista: <strong>{analistaSeleccionado?.nombre}</strong>
        </p>
        <p>
          QE actual: <strong>{analistaSeleccionado?.supervisorVigente?.nombre ?? "Sin supervisor asignado"}</strong>
        </p>
        <p>
          QE nuevo: <strong>{qeSeleccionado?.nombre}</strong>
        </p>
        {analistaSeleccionado?.supervisorVigente ? (
          <div className="campo">
            <label htmlFor="motivo-supervision">Motivo del cambio</label>
            <textarea id="motivo-supervision" rows={3} value={motivo} onChange={(evento) => setMotivo(evento.target.value)} />
          </div>
        ) : null}
      </DialogoConfirmacion>
    </div>
  );
}
