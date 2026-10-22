import { useState } from "react";
import {
  obtenerDescargaCertificado,
  obtenerDescargaEvidencia,
  useAprobarEntregable,
  useBitacoraChecklist,
  useChecklist,
  useDesmarcarEntregable,
  useGenerarCertificado,
  useMarcarEntregable,
  useRechazarEntregable,
} from "@/api/checklist";
import { BloqueEstado } from "@/components/BloqueEstado";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { ErrorApi } from "@/lib/httpClient";
import { formatearFecha } from "@/lib/formato";
import {
  ETIQUETAS_ACCION_CHECKLIST,
  ETIQUETAS_ESTADO_ENTREGABLE,
  TAMANO_MAXIMO_EVIDENCIA,
  TIPOS_EVIDENCIA,
  type ChecklistHdu,
  type ClaveEntregable,
  type Entregable,
} from "@/types/dominio";

type Dialogo =
  | { tipo: "marcar"; entregable: Entregable }
  | { tipo: "desmarcar"; entregable: Entregable }
  | { tipo: "rechazar"; entregable: Entregable }
  | null;

function mensajeDe(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.mensaje : porDefecto;
}

/** Descarga por URL firmada: el navegador baja el archivo sin salir del portal. */
function descargar(url: string): void {
  window.location.assign(url);
}

/** E3-F01 a F04: checklist de entregables, evidencias, aprobaciones, certificado y bitácora. */
export function ChecklistEntregables({ hduId, hduCerrada = false }: { hduId: string; hduCerrada?: boolean }) {
  const checklistQuery = useChecklist(hduId);
  const bitacoraQuery = useBitacoraChecklist(hduId);
  const marcar = useMarcarEntregable(hduId);
  const desmarcar = useDesmarcarEntregable(hduId);
  const aprobar = useAprobarEntregable(hduId);
  const rechazar = useRechazarEntregable(hduId);
  const generarCertificado = useGenerarCertificado(hduId);

  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [tipoEvidencia, setTipoEvidencia] = useState<"ENLACE" | "ARCHIVO">("ENLACE");
  const [url, setUrl] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ clave: ClaveEntregable | "certificado"; mensaje: string } | null>(null);

  if (checklistQuery.isLoading) return <BloqueEstado id="checklist" estado="cargando" />;
  if (checklistQuery.isError || !checklistQuery.data) {
    return <BloqueEstado id="checklist" estado="error" onReintentar={() => checklistQuery.refetch()} />;
  }

  const checklist: ChecklistHdu = checklistQuery.data;
  const { permisos, resumen } = checklist;
  const soloLectura = !permisos.puedeMarcar && !permisos.puedeAprobar;
  const ocupado = marcar.isPending || desmarcar.isPending || aprobar.isPending || rechazar.isPending;

  function abrir(tipo: "marcar" | "desmarcar" | "rechazar", entregable: Entregable) {
    setAviso(null);
    if (tipo === "marcar") {
      const anterior = checklist.entregables[entregable.orden - 2];
      if (anterior && anterior.estado !== "APROBADO") {
        setAviso({ clave: entregable.clave, mensaje: `Completa «${anterior.nombre}» antes de marcar «${entregable.nombre}».` });
        return;
      }
    }
    setTipoEvidencia("ENLACE");
    setUrl("");
    setArchivo(null);
    setTexto("");
    setErrorDialogo(null);
    setDialogo({ tipo, entregable });
  }

  async function confirmarDialogo() {
    if (!dialogo) return;
    const { clave } = dialogo.entregable;
    setErrorDialogo(null);
    try {
      if (dialogo.tipo === "marcar") {
        if (tipoEvidencia === "ENLACE") {
          if (!/^https:\/\/\S+$/.test(url.trim())) {
            setErrorDialogo("El enlace debe comenzar con https://.");
            return;
          }
          await marcar.mutateAsync({ clave, evidencia: { tipo: "ENLACE", url: url.trim() } });
        } else {
          if (!archivo) {
            setErrorDialogo("Selecciona un archivo.");
            return;
          }
          if (!(TIPOS_EVIDENCIA as readonly string[]).includes(archivo.type) || archivo.size > TAMANO_MAXIMO_EVIDENCIA) {
            setErrorDialogo("El archivo debe ser PDF, PNG o JPEG de hasta 10 MB.");
            return;
          }
          await marcar.mutateAsync({ clave, evidencia: { tipo: "ARCHIVO", archivo } });
        }
      } else if (dialogo.tipo === "desmarcar") {
        if (!texto.trim()) {
          setErrorDialogo("Indica el motivo para desmarcar el entregable.");
          return;
        }
        await desmarcar.mutateAsync({ clave, motivo: texto.trim() });
      } else {
        if (!texto.trim()) {
          setErrorDialogo("Indica las observaciones del rechazo.");
          return;
        }
        await rechazar.mutateAsync({ clave, comentario: texto.trim() });
      }
      setDialogo(null);
    } catch (error) {
      setErrorDialogo(mensajeDe(error, "No fue posible guardar el cambio."));
    }
  }

  async function manejarAprobar(entregable: Entregable) {
    setAviso(null);
    try {
      await aprobar.mutateAsync({ clave: entregable.clave });
    } catch (error) {
      setAviso({ clave: entregable.clave, mensaje: mensajeDe(error, "No fue posible aprobar el entregable.") });
    }
  }

  async function manejarDescargaEvidencia(entregable: Entregable) {
    setAviso(null);
    try {
      descargar((await obtenerDescargaEvidencia(hduId, entregable.clave)).url);
    } catch (error) {
      setAviso({ clave: entregable.clave, mensaje: mensajeDe(error, "No fue posible descargar la evidencia.") });
    }
  }

  async function manejarGenerarCertificado() {
    setAviso(null);
    try {
      const resultado = await generarCertificado.mutateAsync();
      descargar(resultado.descarga.url);
    } catch (error) {
      setAviso({ clave: "certificado", mensaje: mensajeDe(error, "No fue posible generar el certificado.") });
    }
  }

  async function manejarDescargarCertificado() {
    setAviso(null);
    try {
      descargar((await obtenerDescargaCertificado(hduId)).descarga.url);
    } catch (error) {
      setAviso({ clave: "certificado", mensaje: mensajeDe(error, "No fue posible descargar el certificado.") });
    }
  }

  const tituloDialogo =
    dialogo?.tipo === "marcar"
      ? `Marcar «${dialogo.entregable.nombre}»`
      : dialogo?.tipo === "desmarcar"
        ? `Desmarcar «${dialogo.entregable.nombre}»`
        : dialogo
          ? `Rechazar «${dialogo.entregable.nombre}»`
          : "";

  return (
    <div className="panel" data-testid="panel-checklist">
      <div className="panel-cabecera">
        <div>
          <h2>Checklist de entregables</h2>
          <p>
            {soloLectura ? (
              <span data-testid="checklist-solo-lectura">
                {hduCerrada ? "La HDU está cerrada: el checklist queda en solo lectura." : "Solo lectura: no tienes acciones sobre este checklist."}
              </span>
            ) : permisos.puedeMarcar ? (
              "Marca cada entregable con su evidencia, en orden. El QE responsable los aprueba."
            ) : (
              "Revisa las evidencias y aprueba o rechaza los entregables por aprobar."
            )}
          </p>
        </div>
        <div className="checklist-avance">
          <strong data-testid="checklist-porcentaje">{resumen.porcentajeCumplimiento}%</strong>
          <span data-testid="checklist-completados">
            {resumen.completados} de {resumen.totalEntregables} aprobados
          </span>
          <div className="barra-progreso" role="progressbar" aria-label="Avance del checklist" aria-valuetext={`${resumen.porcentajeCumplimiento}% de cumplimiento`} aria-valuenow={resumen.porcentajeCumplimiento} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${resumen.porcentajeCumplimiento}%` }} />
          </div>
        </div>
      </div>

      <ol className="checklist-lista">
        {checklist.entregables.map((entregable) => {
          const esCertificado = entregable.clave === "CERTIFICADO";
          return (
            <li key={entregable.clave} className="entregable-item" data-testid={`entregable-${entregable.clave}`}>
              <div className="entregable-cabecera">
                <span className="entregable-orden">{entregable.orden}</span>
                <strong>{entregable.nombre}</strong>
                <span className={`badge badge-entregable-${entregable.estado.toLowerCase()}`} data-testid={`estado-${entregable.clave}`}>
                  {ETIQUETAS_ESTADO_ENTREGABLE[entregable.estado]}
                </span>
              </div>

              <div className="entregable-detalle">
                <span data-testid={`completado-${entregable.clave}`}>
                  {entregable.completado
                    ? `Completado por ${entregable.completado.nombre} · ${formatearFecha(entregable.completado.fecha)}`
                    : "Sin completar"}
                </span>
                {entregable.aprobado ? (
                  <span data-testid={`aprobado-${entregable.clave}`}>
                    Aprobado por {entregable.aprobado.nombre} · {formatearFecha(entregable.aprobado.fecha)}
                  </span>
                ) : null}
                {entregable.evidencia?.tipo === "ENLACE" ? (
                  <a href={entregable.evidencia.url} target="_blank" rel="noopener noreferrer" data-testid={`evidencia-${entregable.clave}`}>
                    Ver evidencia (enlace)
                  </a>
                ) : null}
                {entregable.evidencia?.tipo === "ARCHIVO" ? (
                  <button
                    type="button"
                    className="boton-enlace"
                    data-testid={`evidencia-${entregable.clave}`}
                    onClick={() => manejarDescargaEvidencia(entregable)}
                  >
                    Descargar {entregable.evidencia.nombre}
                  </button>
                ) : null}
                {entregable.evidencia?.tipo === "CERTIFICADO" ? (
                  <span data-testid={`evidencia-${entregable.clave}`}>Folio {entregable.evidencia.folio}</span>
                ) : null}
              </div>

              {entregable.observacion ? (
                <p className="mensaje-aviso" role="note" data-testid={`observacion-${entregable.clave}`}>
                  Observación de {entregable.observacion.autor.nombre}: {entregable.observacion.comentario}
                </p>
              ) : null}

              <div className="entregable-acciones">
                {permisos.puedeMarcar && !esCertificado && entregable.estado === "PENDIENTE" ? (
                  <button
                    type="button"
                    className="boton boton--primario"
                    data-testid={`boton-marcar-${entregable.clave}`}
                    disabled={ocupado}
                    onClick={() => abrir("marcar", entregable)}
                  >
                    Marcar
                  </button>
                ) : null}
                {permisos.puedeMarcar && !esCertificado && entregable.estado !== "PENDIENTE" ? (
                  <button
                    type="button"
                    className="boton boton--secundario"
                    data-testid={`boton-desmarcar-${entregable.clave}`}
                    disabled={ocupado}
                    onClick={() => abrir("desmarcar", entregable)}
                  >
                    Desmarcar
                  </button>
                ) : null}
                {permisos.puedeAprobar && entregable.estado === "POR_APROBAR" ? (
                  <>
                    <button
                      type="button"
                      className="boton boton--primario"
                      data-testid={`boton-aprobar-${entregable.clave}`}
                      disabled={ocupado}
                      onClick={() => manejarAprobar(entregable)}
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      className="boton boton--secundario"
                      data-testid={`boton-rechazar-${entregable.clave}`}
                      disabled={ocupado}
                      onClick={() => abrir("rechazar", entregable)}
                    >
                      Rechazar
                    </button>
                  </>
                ) : null}
              </div>

              {aviso?.clave === entregable.clave ? (
                <p className="mensaje-error-global" role="alert" data-testid={`aviso-${entregable.clave}`}>
                  {aviso.mensaje}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="certificado-bloque" data-testid="bloque-certificado">
        <h3>Certificado de cierre</h3>
        {checklist.certificado ? (
          <>
            <p data-testid="certificado-folio">
              Folio <strong>{checklist.certificado.folio}</strong> · emitido por {checklist.certificado.emitido.nombre} el{" "}
              {formatearFecha(checklist.certificado.emitido.fecha)}
            </p>
            <button type="button" className="boton boton--secundario" data-testid="boton-descargar-certificado" onClick={manejarDescargarCertificado}>
              Descargar certificado
            </button>
          </>
        ) : permisos.puedeGenerarCertificado ? (
          <>
            <button
              type="button"
              className="boton boton--primario"
              data-testid="boton-generar-certificado"
              disabled={!checklist.certificacion.habilitada || generarCertificado.isPending}
              onClick={manejarGenerarCertificado}
            >
              {generarCertificado.isPending ? "Generando…" : "Generar certificado"}
            </button>
            {!checklist.certificacion.habilitada && checklist.certificacion.motivo ? (
              <p className="campo-ayuda" data-testid="motivo-certificado-deshabilitado">
                {checklist.certificacion.motivo}
              </p>
            ) : null}
          </>
        ) : (
          <p data-testid="certificado-sin-emitir">{checklist.certificacion.motivo ?? "El certificado aún no se ha emitido."}</p>
        )}
        {aviso?.clave === "certificado" ? (
          <p className="mensaje-error-global" role="alert" data-testid="aviso-certificado">
            {aviso.mensaje}
          </p>
        ) : null}
      </div>

      <details className="bitacora-checklist" data-testid="bitacora-checklist">
        <summary>Bitácora del checklist</summary>
        {bitacoraQuery.isLoading ? <BloqueEstado id="bitacora-checklist" estado="cargando" /> : null}
        {bitacoraQuery.isError ? <BloqueEstado id="bitacora-checklist" estado="error" onReintentar={() => bitacoraQuery.refetch()} /> : null}
        {bitacoraQuery.data ? (
          bitacoraQuery.data.eventos.length === 0 ? (
            <BloqueEstado id="bitacora-checklist" estado="vacio" mensaje="Sin cambios registrados." />
          ) : (
            <ul className="historial-lista">
              {bitacoraQuery.data.eventos.map((evento, indice) => {
                const nombre = checklist.entregables.find((item) => item.clave === evento.clave)?.nombre ?? evento.clave;
                return (
                  <li key={evento.id} className="historial-item" data-testid={`bitacora-item-${indice}`}>
                    <time dateTime={evento.fecha}>{formatearFecha(evento.fecha)}</time>
                    <p>
                      {evento.actor.nombre} {ETIQUETAS_ACCION_CHECKLIST[evento.accion]} «{nombre}»
                      {evento.motivo ? ` — ${evento.accion === "RECHAZAR" ? "Observación" : "Motivo"}: ${evento.motivo}` : ""}.
                    </p>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </details>

      <DialogoConfirmacion
        abierto={dialogo !== null}
        titulo={tituloDialogo}
        etiquetaConfirmar={ocupado ? "Guardando…" : dialogo?.tipo === "rechazar" ? "Rechazar" : "Confirmar"}
        peligro={dialogo?.tipo === "rechazar"}
        deshabilitado={ocupado}
        onConfirmar={confirmarDialogo}
        onCancelar={() => setDialogo(null)}
      >
        {dialogo?.tipo === "marcar" ? (
          <>
            <fieldset className="campo">
              <legend>Evidencia</legend>
              <label>
                <input type="radio" name="tipo-evidencia" checked={tipoEvidencia === "ENLACE"} onChange={() => setTipoEvidencia("ENLACE")} /> Enlace
              </label>{" "}
              <label>
                <input type="radio" name="tipo-evidencia" checked={tipoEvidencia === "ARCHIVO"} onChange={() => setTipoEvidencia("ARCHIVO")} /> Archivo
              </label>
            </fieldset>
            {tipoEvidencia === "ENLACE" ? (
              <div className="campo">
                <label htmlFor="campo-evidencia-url">Enlace a la evidencia</label>
                <input
                  id="campo-evidencia-url"
                  type="url"
                  placeholder="https://"
                  value={url}
                  onChange={(evento) => setUrl(evento.target.value)}
                />
              </div>
            ) : (
              <div className="campo">
                <label htmlFor="campo-evidencia-archivo">Archivo (PDF, PNG o JPEG, hasta 10 MB)</label>
                <input
                  id="campo-evidencia-archivo"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </>
        ) : null}
        {dialogo?.tipo === "desmarcar" || dialogo?.tipo === "rechazar" ? (
          <div className="campo">
            <label htmlFor="campo-texto-checklist">{dialogo.tipo === "desmarcar" ? "Motivo del retroceso" : "Observaciones para el analista"}</label>
            <textarea id="campo-texto-checklist" rows={3} value={texto} onChange={(evento) => setTexto(evento.target.value)} />
          </div>
        ) : null}
        {errorDialogo ? (
          <p className="campo-error" role="alert" data-testid="error-dialogo-checklist">
            {errorDialogo}
          </p>
        ) : null}
      </DialogoConfirmacion>
    </div>
  );
}
