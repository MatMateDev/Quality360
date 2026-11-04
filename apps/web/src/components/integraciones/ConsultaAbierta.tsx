import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { codigoDeEscritura, llamadasConsulta } from "@/api/integraciones";
import { DialogoConfirmacion } from "@/components/DialogoConfirmacion";
import { formatearFecha } from "@/lib/formato";
import { ErrorApi } from "@/lib/httpClient";
import {
  TEXTO_MODIFICADA_INFO,
  TEXTO_YA_CONFIRMADA,
  textoAplicadasDe,
  textoCuerpoConfirmar,
  textoBotonConfirmar,
  textoFilasInvalidas,
  textoRechazoFila,
  textoVenceEn,
} from "@/lib/mensajesAsignacion";
import { TEXTO_EN_CURSO, TEXTO_NO_ENCONTRADA, TEXTO_VENCIDA, textoNoAbierta } from "@/lib/mensajesConsulta";
import { mensajeDeError } from "@/lib/mensajesIntegracion";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import type { Consulta, FilaRechazada, ResultadoConfirmacion as RespuestaConfirmacion } from "@/types/dominio";
import { GrupoConsulta } from "./GrupoConsulta";
import { GRUPOS } from "./gruposConsulta";
import { ResumenConfirmacion } from "./ResumenConfirmacion";

export const ID_TITULO_CONSULTA = "titulo-consulta-abierta";

interface Props {
  consulta: Consulta;
  /** Vuelve a leer la consulta del servidor (no llama a Jira) y devuelve la lectura nueva. */
  onActualizar: () => Promise<Consulta | null>;
  actualizando: boolean;
  /** La consulta venció al actuar: el anfitrión muestra el aviso y relee. */
  onVencida: () => void;
  /** Confirmación aplicada (total o parcial): el anfitrión muestra el resultado. */
  onConfirmada: (resultado: RespuestaConfirmacion, tipoDescartadas: { nuevas: number; cambios: number }) => void;
}

type Alerta = { tipo: "modificada-info" } | { tipo: "modificada" } | { tipo: "confirmada" } | { tipo: "en-curso" } | { tipo: "no-encontrada" } | { tipo: "permiso" } | { tipo: "error"; codigo: string } | null;

/**
 * Consulta abierta (diseño §4 y §6): cabecera con contadores y vencimiento, los cuatro grupos, resumen y
 * confirmación. Es la única parte editable de la pestaña; la autorización real es del servidor.
 */
export function ConsultaAbierta({ consulta, onActualizar, actualizando, onVencida, onConfirmada }: Props) {
  const cliente = useQueryClient();
  const [anuncio, setAnuncio] = useState("");
  const [alerta, setAlerta] = useState<Alerta>(null);
  const [invalidas, setInvalidas] = useState<{ filas: FilaRechazada[] } | null>(null);
  const [dialogoConfirmar, setDialogoConfirmar] = useState(false);
  const [dialogoDescartar, setDialogoDescartar] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const versionVista = useRef(consulta.version);
  const refAlerta = useRef<HTMLDivElement>(null);
  const refInvalidas = useRef<HTMLDivElement>(null);
  const recargaPendiente = useRef(false);
  const [reemplazada, setReemplazada] = useState<Consulta | null>(null);
  const reemplazadaRef = useRef(false);
  const consultaVigente = useRef(consulta);
  if (!reemplazadaRef.current) consultaVigente.current = consulta;

  useEffect(() => {
    versionVista.current = Math.max(versionVista.current, consulta.version);
  }, [consulta.version]);

  useEffect(() => {
    if (alerta && alerta.tipo !== "modificada-info") refAlerta.current?.focus();
  }, [alerta]);
  useEffect(() => {
    if (invalidas) refInvalidas.current?.focus();
  }, [invalidas]);

  const anunciar = (mensaje: string) => setAnuncio(mensaje);
  const onVersion = (v: number) => {
    versionVista.current = Math.max(versionVista.current, v);
  };
  const recargarTodo = () => void cliente.invalidateQueries({ queryKey: ["integraciones"] });

  // Al volver a la pestaña del navegador se relee la consulta; si otra persona la cambió, se avisa (diseño §7.3).
  async function actualizarYComparar() {
    const antes = Math.max(versionVista.current, consulta.version);
    const nueva = await onActualizar();
    recargarTodo();
    if (nueva && nueva.id === consulta.id && nueva.estado === "ABIERTA" && nueva.version !== antes) {
      versionVista.current = nueva.version;
      setAlerta({ tipo: "modificada-info" });
    }
  }
  const actualizarRef = useRef(actualizarYComparar);
  actualizarRef.current = actualizarYComparar;
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible" && !recargaPendiente.current) void actualizarRef.current();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  /**
   * DEF-E5C-02: otra persona reemplazó la consulta. Se conserva la vista de la consulta anterior en solo lectura con el
   * aviso, y recién cuando la persona lo pide se pasa a la nueva (que ya es la que devuelve `actual`).
   */
  async function marcarReemplazada(cerradaPor?: Consulta["cerradaPor"]) {
    if (reemplazadaRef.current) return;
    const anterior = consultaVigente.current;
    reemplazadaRef.current = true;
    setReemplazada({ ...anterior, estado: "REEMPLAZADA", cerradaPor: cerradaPor ?? anterior.cerradaPor ?? null });
    const nueva = await onActualizar();
    recargarTodo();
    if (!cerradaPor && nueva && nueva.id !== anterior.id) {
      setReemplazada((previa) => (previa && !previa.cerradaPor ? { ...previa, cerradaPor: nueva.creadaPor } : previa));
    }
  }

  /** Errores de consulta comunes a toda edición. Devuelve `true` si ya los resolvió. */
  function manejarError(error: unknown): boolean {
    if (!(error instanceof ErrorApi)) return false;
    if (error.status === 410 || (error.status === 409 && error.codigo === "CONSULTA_VENCIDA")) {
      onVencida();
      return true;
    }
    if (error.status === 409 && error.codigo === "CONSULTA_NO_ABIERTA") {
      const cuerpo = error.cuerpo as { estado?: string; cerradaPor?: Consulta["cerradaPor"] } | undefined;
      if (cuerpo?.estado === "REEMPLAZADA") {
        void marcarReemplazada(cuerpo.cerradaPor);
        return true;
      }
      if (cuerpo?.estado === "CONFIRMADA") setAlerta({ tipo: "confirmada" });
      void onActualizar();
      recargarTodo();
      return true;
    }
    if (error.status === 404 && error.codigo === "CONSULTA_NO_ENCONTRADA") {
      setAlerta({ tipo: "no-encontrada" });
      void onActualizar();
      return true;
    }
    if (error.status === 409 && error.codigo === "INTEGRACION_EN_CURSO") {
      setAlerta({ tipo: "en-curso" });
      return true;
    }
    if (error.status === 403) {
      setAlerta({ tipo: "permiso" });
      return true;
    }
    return false;
  }

  /** Antes del diálogo se compara la `version` con la del servidor (D148). */
  async function pedirConfirmacion() {
    setAlerta(null);
    setInvalidas(null);
    try {
      const fresca = await llamadasConsulta.obtener(consulta.id);
      if (fresca.estado === "REEMPLAZADA") {
        await marcarReemplazada(fresca.cerradaPor);
        return;
      }
      if (fresca.estado !== "ABIERTA") {
        await onActualizar();
        recargarTodo();
        return;
      }
      if (fresca.version !== Math.max(versionVista.current, consulta.version)) {
        versionVista.current = fresca.version;
        await onActualizar();
        recargarTodo();
        setAlerta({ tipo: "modificada-info" });
        return;
      }
      setDialogoConfirmar(true);
    } catch (error) {
      if (!manejarError(error)) setAlerta({ tipo: "error", codigo: codigoDeEscritura(error) });
    }
  }

  async function confirmar(version: number) {
    setDialogoConfirmar(false);
    setConfirmando(true);
    setAlerta(null);
    setInvalidas(null);
    const tipo = { nuevas: consulta.nuevas - consulta.marcadasNuevas, cambios: consulta.cambiaron - consulta.marcadasCambio };
    try {
      const resultado = await llamadasConsulta.confirmar(consulta.id, version);
      recargarTodo();
      void cliente.invalidateQueries({ queryKey: ["bandeja"] });
      onConfirmada(resultado, tipo);
    } catch (error) {
      recargarTodo();
      if (error instanceof ErrorApi && error.status === 409 && error.codigo === "CONSULTA_MODIFICADA") {
        void onActualizar();
        setAlerta({ tipo: "modificada" });
      } else if (error instanceof ErrorApi && error.status === 409 && error.codigo === "ASIGNACIONES_INVALIDAS") {
        void onActualizar();
        setInvalidas({ filas: (error.cuerpo as { filas?: FilaRechazada[] }).filas ?? [] });
      } else if (!manejarError(error)) {
        // Un 503 con respuesta es Organización caída (nada se aplicó); sin respuesta (504, red) pudo haberse completado.
        const codigo = error instanceof ErrorApi && error.status === 503 ? "ORGANIZACION_NO_DISPONIBLE" : codigoDeEscritura(error);
        setAlerta({ tipo: "error", codigo });
        void onActualizar();
      }
    } finally {
      setConfirmando(false);
    }
  }

  async function descartar() {
    setDialogoDescartar(false);
    setDescartando(true);
    try {
      await llamadasConsulta.descartar(consulta.id);
      await onActualizar();
      recargarTodo();
    } catch (error) {
      if (!manejarError(error)) setAlerta({ tipo: "error", codigo: "ERROR_INTERNO" });
    } finally {
      setDescartando(false);
    }
  }

  if (reemplazada) {
    return (
      <>
        <ConsultaCerrada consulta={reemplazada} />
        <div className="acciones-formulario">
          <button
            type="button"
            className="boton boton--primario"
            data-testid="boton-ir-nueva-consulta"
            onClick={() => {
              reemplazadaRef.current = false;
              setReemplazada(null);
              recargarTodo();
              void onActualizar();
            }}
          >
            Ir a la nueva consulta
          </button>
        </div>
      </>
    );
  }

  const hayPendientes = consulta.pendientes > 0 && consulta.aplicadas > 0;
  const aplicadasTotal = consulta.aplicadas + consulta.pendientes;
  const incluidas = consulta.marcadasNuevas + consulta.marcadasCambio;
  const minutos = Math.ceil((Date.parse(consulta.venceEn) - Date.now()) / 60_000);
  const items = [
    { clave: "nuevas", titulo: "Nuevas", valor: consulta.nuevas },
    { clave: "cambiaron", titulo: "Cambiaron", valor: consulta.cambiaron },
    { clave: "sin-cambios", titulo: "Sin cambios", valor: consulta.sinCambios },
    { clave: "con-error", titulo: "Con error", valor: consulta.conError },
  ];

  return (
    <section className="panel consulta-abierta" data-testid="consulta-abierta" data-estado={consulta.estado} data-version={consulta.version} aria-labelledby={ID_TITULO_CONSULTA} aria-busy={confirmando || undefined}>
      <div className="consulta-abierta__cabecera">
        <h2 id={ID_TITULO_CONSULTA} tabIndex={-1}>
          Consulta abierta
        </h2>
        <span className="insignia-estado-consulta insignia-estado-consulta--abierta">
          <span aria-hidden="true">●</span> Abierta
        </span>
      </div>
      <p>
        <span data-testid="consulta-creada-por">
          Creada por {consulta.creadaPor.nombre} el <time dateTime={consulta.creadaEn}>{formatearFecha(consulta.creadaEn)}</time>
        </span>{" "}
        ·{" "}
        <span data-testid="consulta-vence">
          vence el <time dateTime={consulta.venceEn}>{formatearFecha(consulta.venceEn)}</time>
        </span>{" "}
        · Proyecto {consulta.proyecto}
      </p>
      {minutos > 0 && minutos < 60 ? (
        <p className="mensaje-aviso" role="note" data-testid="aviso-vence-pronto">
          {textoVenceEn(minutos)}
        </p>
      ) : null}
      <dl className="resumen-ejecucion resumen-ejecucion--previa resumen-ejecucion--grupos" data-testid="resumen-grupos-consulta">
        {items.map((item) => (
          <div key={item.clave} className="tarjeta-resumen resumen-ejecucion__item" data-testid={`contador-${item.clave}`}>
            <dt className="tarjeta-resumen__titulo">{item.titulo}</dt>
            <dd className="tarjeta-resumen__valor">{item.valor}</dd>
            <dd>
              <a
                href={`#titulo-grupo-${item.clave}`}
                aria-label={`Ir a ${item.titulo}, ${item.valor} ${item.valor === 1 ? "fila" : "filas"}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`titulo-grupo-${item.clave}`)?.focus();
                }}
              >
                Ir a {item.titulo}
              </a>
            </dd>
          </div>
        ))}
      </dl>
      <p className="campo-ayuda">
        Nuevas: {consulta.nuevas} · asignadas <span data-testid="contador-asignadas">{consulta.asignadas}</span> · incluidas <span data-testid="contador-incluidas">{incluidas}</span>
      </p>
      <div className="acciones-formulario acciones-formulario--integracion">
        <button type="button" className="boton boton--secundario" data-testid="boton-actualizar-consulta" disabled={actualizando || confirmando} onClick={() => void actualizarYComparar()}>
          Actualizar consulta
        </button>
        <a
          className="boton boton--secundario"
          href="#resumen-confirmacion"
          data-testid="enlace-ir-resumen"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("titulo-resumen-confirmacion")?.focus();
          }}
        >
          Ir al resumen
        </a>
        <button type="button" className="boton boton--terciario boton--peligro-texto" data-testid="boton-descartar-consulta" disabled={confirmando || descartando} onClick={() => setDialogoDescartar(true)}>
          Descartar consulta
        </button>
      </div>

      <div className="anuncios-consulta sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="anuncios-consulta">
        {anuncio}
      </div>

      {alerta ? (
        <div
          ref={refAlerta}
          tabIndex={-1}
          className={alerta.tipo === "modificada-info" || alerta.tipo === "confirmada" || alerta.tipo === "en-curso" ? "mensaje-aviso" : "mensaje-error-global"}
          role={alerta.tipo === "modificada-info" || alerta.tipo === "confirmada" || alerta.tipo === "en-curso" ? "status" : "alert"}
          data-testid={
            alerta.tipo === "modificada" || alerta.tipo === "modificada-info"
              ? "aviso-consulta-modificada"
              : alerta.tipo === "confirmada"
                ? "aviso-consulta-confirmada"
                : alerta.tipo === "en-curso"
                  ? "aviso-en-curso"
                  : alerta.tipo === "permiso"
                    ? "mensaje-error-permiso"
                    : "error-confirmacion"
          }
          data-codigo={alerta.tipo === "error" ? alerta.codigo : undefined}
        >
          {alerta.tipo === "modificada-info" ? TEXTO_MODIFICADA_INFO : null}
          {alerta.tipo === "modificada" ? mensajeDeError("CONSULTA_MODIFICADA") : null}
          {alerta.tipo === "confirmada" ? TEXTO_YA_CONFIRMADA : null}
          {alerta.tipo === "en-curso" ? TEXTO_EN_CURSO : null}
          {alerta.tipo === "no-encontrada" ? TEXTO_NO_ENCONTRADA : null}
          {alerta.tipo === "permiso" ? "Ya no tienes permiso para esta acción" : null}
          {alerta.tipo === "error" ? (
            <>
              {mensajeDeError(alerta.codigo)}{" "}
              {alerta.codigo === "SIN_RESPUESTA" ? <Link to={RUTAS_INTEGRACIONES.historial}>Ver en el Historial</Link> : null}
            </>
          ) : null}
        </div>
      ) : null}
      {invalidas ? (
        <div ref={refInvalidas} tabIndex={-1} className="alerta-rechazadas" role="alert" data-testid="alerta-asignaciones-invalidas">
          <p>
            <span aria-hidden="true">✕</span> <strong>{textoFilasInvalidas(invalidas.filas.length)}</strong>
          </p>
          <ul>
            {invalidas.filas.map((f) => (
              <li key={f.itemId}>
                {f.codigo} · {textoRechazoFila(f.motivo, f.campo, f.faltantes)}
              </li>
            ))}
          </ul>
          <p>Esas filas quedaron sin incluir. Corrige la asignación y confirma de nuevo.</p>
          <button type="button" className="boton boton--secundario" onClick={() => setInvalidas(null)}>
            Entendido
          </button>
        </div>
      ) : null}

      <div inert={confirmando || undefined}>
        {GRUPOS.map((definicion) => (
          <GrupoConsulta
            key={definicion.clave}
            definicion={definicion}
            consulta={consulta}
            total={{ NUEVA: consulta.nuevas, CAMBIO: consulta.cambiaron, SIN_CAMBIOS: consulta.sinCambios, CON_ERROR: consulta.conError }[definicion.grupo]}
            soloLectura={false}
            onAnunciar={anunciar}
            onErrorDeConsulta={manejarError}
            onVersion={onVersion}
          />
        ))}

        {hayPendientes ? (
          <div className="panel-resultado panel-resultado--incompleta" role="status" data-testid="aviso-incompleta" id="aviso-incompleta">
            <p>
              <span aria-hidden="true">◔</span> {textoAplicadasDe(consulta.aplicadas, aplicadasTotal)}
            </p>
            <p>La consulta sigue abierta. Continúa para aplicar el resto sin duplicar.</p>
            <button type="button" className="boton boton--primario" data-testid="boton-continuar-confirmacion" disabled={confirmando} onClick={() => void confirmar(consulta.version)}>
              {confirmando ? "Continuando…" : "Continuar confirmación"}
            </button>
          </div>
        ) : (
          <ResumenConfirmacion consulta={consulta} ocupado={confirmando} onConfirmar={() => void pedirConfirmacion()} />
        )}
      </div>
      {confirmando ? (
        <p className="panel panel-espera" role="status" aria-busy="true" data-testid="estado-confirmando">
          Confirmando… Se están creando y actualizando las HDU. No se llama a Jira.
        </p>
      ) : null}

      <DialogoConfirmacion
        abierto={dialogoConfirmar}
        titulo="Confirmar la consulta de Jira"
        etiquetaConfirmar={textoBotonConfirmar(incluidas)}
        etiquetaCancelar="Seguir revisando"
        testId="dialogo-confirmar-consulta"
        testIdConfirmar="boton-confirmar-dialogo"
        testIdCancelar="boton-seguir-revisando"
        onCancelar={() => setDialogoConfirmar(false)}
        onConfirmar={() => void confirmar(Math.max(versionVista.current, consulta.version))}
      >
        <p>{textoCuerpoConfirmar(consulta.marcadasNuevas, consulta.marcadasCambio, consulta.nuevas - consulta.marcadasNuevas, consulta.cambiaron - consulta.marcadasCambio)}</p>
      </DialogoConfirmacion>
      <DialogoConfirmacion
        abierto={dialogoDescartar}
        titulo="¿Descartar la consulta?"
        etiquetaConfirmar="Descartar consulta"
        peligro
        testId="dialogo-descartar"
        testIdConfirmar="boton-descartar-confirmar"
        testIdCancelar="boton-cancelar-dialogo"
        onCancelar={() => setDialogoDescartar(false)}
        onConfirmar={() => void descartar()}
      >
        <p>Se perderán las asignaciones y las filas marcadas. No se creará ni se modificará ninguna HDU.</p>
      </DialogoConfirmacion>
    </section>
  );
}

const INSIGNIA_CERRADA = {
  CONFIRMADA: { glifo: "✓", etiqueta: "Confirmada", clase: "exito" },
  REEMPLAZADA: { glifo: "⇄", etiqueta: "Reemplazada", clase: "neutra" },
  DESCARTADA: { glifo: "⊘", etiqueta: "Descartada", clase: "neutra" },
  VENCIDA: { glifo: "◌", etiqueta: "Vencida", clase: "neutra" },
  ABIERTA: { glifo: "●", etiqueta: "Abierta", clase: "abierta" },
} as const;

/** Consulta cerrada (confirmada, reemplazada o descartada): resumen de solo lectura, sin filas ni selectores (D133). */
export function ConsultaCerrada({ consulta }: { consulta: Consulta }) {
  const info = INSIGNIA_CERRADA[consulta.estado];
  return (
    <section className="panel consulta-abierta consulta-abierta--cerrada" data-testid="consulta-abierta" data-estado={consulta.estado} data-version={consulta.version} aria-labelledby="titulo-consulta-cerrada">
      <div className="consulta-abierta__cabecera">
        <h2 id="titulo-consulta-cerrada" tabIndex={-1}>
          Consulta de Jira
        </h2>
        <span className={`insignia-estado-consulta insignia-estado-consulta--${info.clase}`} data-testid="insignia-estado-consulta">
          <span aria-hidden="true">{info.glifo}</span> {info.etiqueta}
        </span>
      </div>
      <p>
        Creada por {consulta.creadaPor.nombre} el <time dateTime={consulta.creadaEn}>{formatearFecha(consulta.creadaEn)}</time>
      </p>
      {consulta.estado === "REEMPLAZADA" ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-consulta-reemplazada">
          {textoNoAbierta("REEMPLAZADA", consulta.cerradaPor)}
        </p>
      ) : null}
      {consulta.estado === "DESCARTADA" ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-consulta-descartada">
          {textoNoAbierta("DESCARTADA")}
        </p>
      ) : null}
      {consulta.estado === "CONFIRMADA" ? (
        <p className="mensaje-aviso" role="status" data-testid="aviso-consulta-confirmada">
          {TEXTO_YA_CONFIRMADA}
        </p>
      ) : null}
      {consulta.estado === "VENCIDA" ? (
        <p className="mensaje-aviso" role="status">
          {TEXTO_VENCIDA}
        </p>
      ) : null}
      <dl className="resumen-ejecucion resumen-ejecucion--previa resumen-ejecucion--grupos" data-testid="resumen-grupos-consulta">
        {[
          { clave: "nuevas", titulo: "Nuevas", valor: consulta.nuevas },
          { clave: "cambiaron", titulo: "Cambiaron", valor: consulta.cambiaron },
          { clave: "sin-cambios", titulo: "Sin cambios", valor: consulta.sinCambios },
          { clave: "con-error", titulo: "Con error", valor: consulta.conError },
        ].map((item) => (
          <div key={item.clave} className="tarjeta-resumen resumen-ejecucion__item" data-testid={`contador-${item.clave}`}>
            <dt className="tarjeta-resumen__titulo">{item.titulo}</dt>
            <dd className="tarjeta-resumen__valor">{item.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
