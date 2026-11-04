import { useEffect, useRef, useState } from "react";
import { useCelulas } from "@/api/catalogos";
import { esIndisponible, useAnalistasDeQe, useEditarItemsConsulta, useQeActivos, useSprintsDeCelula } from "@/api/integraciones";
import { ErrorApi } from "@/lib/httpClient";
import {
  TEXTO_NO_SE_PUDO_GUARDAR,
  TEXTO_SIN_ANALISTAS,
  TEXTO_SIN_LIDER,
  TEXTO_SPRINT_JIRA_AUSENTE,
  TEXTO_SPRINT_RECALCULADO,
  estadoDeFila,
  textoDejoDeEstarIncluida,
  textoEligeAnalista,
  textoFalta,
  textoLimpiaAnalista,
  textoRechazoFila,
} from "@/lib/mensajesAsignacion";
import { ETIQUETAS_PRIORIDAD, type CampoAsignacion, type ItemConsulta, type MotivoRechazoFila, type SolicitudEdicionItems } from "@/types/dominio";
import { ChipsAdvertencias } from "./Insignias";
import { SelectorAsignacion } from "./SelectorAsignacion";

interface Props {
  item: ItemConsulta;
  consultaId: string;
  seleccionada: boolean;
  onSeleccion: (id: string, valor: boolean) => void;
  onAnunciar: (mensaje: string) => void;
  /** Devuelve `true` si el error ya se resolvió a nivel de la consulta (cerrada, reemplazada, sin permiso). */
  onErrorDeConsulta: (error: unknown) => boolean;
  /** La `version` que devolvió el servidor tras una edición propia (para detectar cambios ajenos antes de confirmar). */
  onVersion?: (version: number) => void;
  soloLectura?: boolean;
}

const CAMPO_DE_DETALLE: Record<string, CampoAsignacion> = { celulaId: "celulaId", qeId: "qeId", analistaId: "analistaId", sprintId: "sprintId" };
type Errores = Partial<Record<CampoAsignacion | "marcada", string>>;
const CODIGOS_RECHAZO = ["QE_INVALIDO", "ANALISTA_INVALIDO", "ANALISTA_FUERA_DE_EQUIPO", "CATALOGO_INVALIDO", "ASIGNACION_INCOMPLETA", "FILA_NO_MARCABLE", "FILA_NO_ASIGNABLE"];

/** Tarjeta-fila editable de una fila «Nueva» (diseño §4.3 y §4.6): cuatro selectores, estado por texto y guardado por cambio. */
export function TarjetaFilaNueva({ item, consultaId, seleccionada, onSeleccion, onAnunciar, onErrorDeConsulta, onVersion, soloLectura = false }: Props) {
  const codigo = item.codigo ?? "—";
  const a = item.asignacion;
  const celulaId = a?.celula?.id ?? "";
  const qeId = a?.qeResponsable?.id ?? "";
  const celulas = useCelulas();
  const qes = useQeActivos();
  const analistas = useAnalistasDeQe(qeId || null);
  const sprints = useSprintsDeCelula(celulaId);
  const editar = useEditarItemsConsulta(consultaId);
  const [ocupado, setOcupado] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [fallo, setFallo] = useState<SolicitudEdicionItems | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [ampliado, setAmpliado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const enVuelo = useRef(0);
  useEffect(() => () => void (temporizador.current && clearTimeout(temporizador.current)), []);

  const estado = estadoDeFila(item);
  const opcionesCelula = (celulas.data?.items ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre }));
  const opcionesQe = (qes.data?.items ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre }));
  const opcionesAnalista = (analistas.data?.items ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre }));
  const opcionesSprint = (sprints.data?.items ?? []).map((s) => ({ valor: s.id, etiqueta: s.nombre }));
  const sinAnalistas = Boolean(qeId) && analistas.isSuccess && opcionesAnalista.length === 0;
  const nombreQe = a?.qeResponsable?.nombre ?? "";
  const catalogoCaido = [celulas, qes].some((q) => q.isError) || (Boolean(qeId) && analistas.isError) || (Boolean(celulaId) && sprints.isError);

  async function enviar(cuerpo: SolicitudEdicionItems, nombres: { analista?: string; qe?: string } = {}) {
    enVuelo.current += 1;
    setOcupado(true);
    setErrores({});
    setFallo(null);
    setGuardado(false);
    try {
      // Un solo PATCH en vuelo por fila: el siguiente espera la respuesta del anterior (mejora DEF-E5C-01).
      const turno = cola.current.then(() => editar.mutateAsync(cuerpo));
      cola.current = turno.then(
        () => undefined,
        () => undefined,
      );
      const respuesta = await turno;
      onVersion?.(respuesta.version);
      const nueva = respuesta.items[0];
      if (temporizador.current) clearTimeout(temporizador.current);
      setGuardado(true);
      temporizador.current = setTimeout(() => setGuardado(false), 4000);
      if (cuerpo.asignacion?.qeId !== undefined && a?.analista && nueva && !nueva.asignacion?.analista && nueva.asignacion?.qeResponsable) onAnunciar(textoLimpiaAnalista(nueva.asignacion.qeResponsable.nombre));
      if (cuerpo.asignacion?.celulaId !== undefined && a?.sprintOrigen === "MANUAL" && a.sprint) onAnunciar(TEXTO_SPRINT_RECALCULADO);
      if (respuesta.desmarcadas.length > 0) onAnunciar(textoDejoDeEstarIncluida(codigo));
    } catch (error) {
      if (onErrorDeConsulta(error)) return;
      if (error instanceof ErrorApi && error.status === 422 && CODIGOS_RECHAZO.includes(error.codigo)) {
        const detalle = error.detalles?.[0];
        const campo = (detalle ? CAMPO_DE_DETALLE[detalle.campo] : undefined) ?? (cuerpo.marcada !== undefined ? undefined : "celulaId");
        const faltantes = (error.detalles ?? []).map((d) => CAMPO_DE_DETALLE[d.campo]).filter((c): c is CampoAsignacion => Boolean(c));
        const texto = textoRechazoFila(error.codigo as MotivoRechazoFila, campo ?? null, faltantes, nombres);
        setErrores({ [campo ?? "marcada"]: texto });
        return;
      }
      setFallo(cuerpo);
    } finally {
      enVuelo.current -= 1;
      if (enVuelo.current <= 0) setOcupado(false);
    }
  }

  const cambiar = (cambio: NonNullable<SolicitudEdicionItems["asignacion"]>, nombres?: { analista?: string; qe?: string }) => enviar({ itemIds: [item.id], asignacion: cambio }, nombres);
  const valorOId = (v: string) => (v === "" ? null : v);

  function alternarMarca(marcar: boolean) {
    if (!item.marcable && marcar) {
      onAnunciar(item.faltantes.length > 0 ? textoFalta(item.faltantes) : "Esta fila no se puede incluir.");
      return;
    }
    void enviar({ itemIds: [item.id], marcada: marcar });
  }

  const clase = `fila-asignacion fila-asignacion--${estado.clase === "lista" ? (item.marcada ? "marcada" : "lista") : estado.clase}`;
  const motivoMarca = item.marcable ? undefined : item.faltantes.length > 0 ? textoFalta(item.faltantes) : "Esta fila no se puede incluir";
  const conMotivoSinAnalistas = sinAnalistas && !item.marcable;
  const descripcion = item.descripcion?.trim();
  const titulo = item.titulo ?? "";
  const largo = titulo.length > 140;

  return (
    <li id={`fila-${codigo}`} className={clase} data-testid={`fila-${codigo}`} data-completa={item.completa ? "true" : "false"} data-marcada={item.marcada ? "true" : "false"} aria-busy={ocupado || undefined}>
      <div className="fila-asignacion__cabecera">
        <label className="fila-asignacion__seleccionar">
          <input type="checkbox" data-testid="casilla-seleccionar" checked={seleccionada} disabled={soloLectura} onChange={(e) => onSeleccion(item.id, e.target.checked)} />
          <span>Seleccionar</span>
          <span className="sr-only"> {codigo}</span>
        </label>
        <strong className="codigo">{codigo}</strong>
        <span className={`texto-largo fila-asignacion__titulo${largo && !ampliado ? " fila-asignacion__titulo--recortado" : ""}`}>{titulo}</span>
        <span className="fila-asignacion__prioridad">Prioridad: {item.prioridad ? ETIQUETAS_PRIORIDAD[item.prioridad] : "Sin prioridad"}</span>
      </div>
      {largo ? (
        <button type="button" className="boton boton--terciario" aria-expanded={ampliado} onClick={() => setAmpliado((v) => !v)}>
          {ampliado ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
      <p className="fila-asignacion__meta">
        <span className="texto-largo">Sprint en Jira: {item.sprintJira ?? "—"}</span> <span className="chip-grupo chip-grupo--nuevas">+ Nueva</span>{" "}
        <span className="chip-grupo">Creada por Jira</span>
        <ChipsAdvertencias advertencias={item.advertencias.filter((x) => x !== "SPRINT_NO_ENCONTRADO")} />
      </p>
      {descripcion ? (
        <details className="fila-asignacion__descripcion">
          <summary data-testid={`boton-ver-descripcion-${codigo}`}>Ver descripción</summary>
          <p className="texto-largo texto-plano">{descripcion}</p>
        </details>
      ) : null}

      {!soloLectura ? (
        <div className="fila-asignacion__selectores">
          <SelectorAsignacion
            id={`celula-${item.id}`}
            etiqueta="Célula"
            nombreAccesible={`Célula de ${codigo}`}
            valor={celulaId}
            opciones={opcionesCelula}
            vacio="Elige…"
            testId="selector-celula"
            ocupado={ocupado}
            error={errores.celulaId}
            idError={`error-celula-${item.id}`}
            testIdError={`error-celulaId-${codigo}`}
            onCambio={(v) => void cambiar({ celulaId: valorOId(v) })}
          />
          <SelectorAsignacion
            id={`qe-${item.id}`}
            etiqueta="QE responsable"
            nombreAccesible={`QE responsable de ${codigo}`}
            valor={qeId}
            opciones={opcionesQe}
            vacio="Elige…"
            testId="selector-qe"
            ocupado={ocupado}
            error={errores.qeId}
            idError={`error-qe-${item.id}`}
            testIdError={`error-qeId-${codigo}`}
            onCambio={(v) => void cambiar({ qeId: valorOId(v) })}
          />
          <SelectorAsignacion
            id={`analista-${item.id}`}
            etiqueta="Analista QA"
            nombreAccesible={`Analista QA de ${codigo}`}
            valor={a?.analista?.id ?? ""}
            opciones={opcionesAnalista}
            vacio="Elige…"
            testId="selector-analista"
            ocupado={ocupado}
            deshabilitado={!qeId}
            motivo={!qeId ? "Elige primero un QE" : undefined}
            ayuda={sinAnalistas ? <span data-testid="ayuda-sin-analistas">{TEXTO_SIN_ANALISTAS} Elige otro QE.</span> : qeId && !a?.analista && analistas.isSuccess ? <span data-testid="ayuda-elige-analista">{textoEligeAnalista(nombreQe)}</span> : undefined}
            idAyuda={`ayuda-analista-${item.id}`}
            error={errores.analistaId}
            idError={`error-analista-${item.id}`}
            testIdError={`error-analistaId-${codigo}`}
            onCambio={(v) => void cambiar({ analistaId: valorOId(v) }, { analista: opcionesAnalista.find((o) => o.valor === v)?.etiqueta, qe: nombreQe })}
          />
          <SelectorAsignacion
            id={`sprint-${item.id}`}
            etiqueta="Sprint"
            nombreAccesible={`Sprint de ${codigo}`}
            valor={a?.sprint?.id ?? ""}
            opciones={opcionesSprint}
            vacio="Elige un sprint"
            testId="selector-sprint"
            ocupado={ocupado}
            deshabilitado={!celulaId}
            motivo={!celulaId ? "Elige primero una célula" : undefined}
            error={errores.sprintId}
            idError={`error-sprint-${item.id}`}
            testIdError={`error-sprintId-${codigo}`}
            onCambio={(v) => void cambiar({ sprintId: valorOId(v) })}
          />
        </div>
      ) : null}
      {catalogoCaido ? (
        <p className="campo-error" role="status" data-testid={`error-catalogos-${codigo}`}>
          No pudimos cargar las opciones
          {esIndisponible(celulas.error) ? " (no disponible)" : ""}.{" "}
          <button type="button" className="boton boton--secundario" onClick={() => void Promise.all([celulas.refetch(), qes.refetch(), qeId ? analistas.refetch() : null, celulaId ? sprints.refetch() : null])}>
            Reintentar
          </button>
        </p>
      ) : null}

      <p className="fila-asignacion__meta">
        {a?.sprintOrigen === "JIRA" ? (
          <span className="chip-grupo" data-testid="chip-sprint-origen">
            Sprint de Jira
          </span>
        ) : null}
        {a?.sprintOrigen === "RESPALDO" ? (
          <span className="chip-grupo" data-testid="chip-sprint-respaldo">
            Sprint de respaldo
          </span>
        ) : null}
        {item.advertencias.includes("SPRINT_NO_ENCONTRADO") && celulaId ? (
          <span className="chip-advertencia" data-testid="aviso-sprint-no-encontrado">
            <span aria-hidden="true">!</span> {TEXTO_SPRINT_JIRA_AUSENTE}
          </span>
        ) : null}
        {item.avisoSinLider ? (
          <span className="mensaje-aviso" role="note" data-testid="aviso-sin-lider">
            <span aria-hidden="true">!</span> {TEXTO_SIN_LIDER}
          </span>
        ) : null}
      </p>

      <div className="fila-asignacion__pie">
        <span className={`estado-fila estado-fila--${estado.clase}`} data-testid="estado-fila">
          <span aria-hidden="true">{estado.glifo}</span> {estado.texto}
        </span>
        {!soloLectura ? (
          <label className="fila-asignacion__marcar">
            <input
              type="checkbox"
              data-testid="casilla-marcar"
              checked={item.marcada}
              aria-disabled={!item.marcable && !item.marcada ? true : undefined}
              aria-describedby={motivoMarca ? `motivo-marcar-${item.id}` : undefined}
              onChange={(e) => alternarMarca(e.target.checked)}
            />
            <span>Incluir en la confirmación</span>
            <span className="sr-only"> {codigo}</span>
          </label>
        ) : null}
        {motivoMarca && !item.marcada ? (
          <span id={`motivo-marcar-${item.id}`} className="campo-ayuda" data-testid={`motivo-marcar-${codigo}`}>
            {conMotivoSinAnalistas ? `${motivoMarca}. ${TEXTO_SIN_ANALISTAS}` : motivoMarca}
          </span>
        ) : null}
        {errores.marcada ? (
          <span className="campo-error" data-testid={`error-marcada-${codigo}`}>
            {errores.marcada}
          </span>
        ) : null}
        <span className="guardado-fila" data-testid={`guardado-fila-${codigo}`} aria-live="off">
          {ocupado ? "Guardando…" : guardado ? "Guardado" : ""}
        </span>
        {fallo ? (
          <span className="guardado-fila guardado-fila--error" role="status">
            <span aria-hidden="true">✕</span> {TEXTO_NO_SE_PUDO_GUARDAR}{" "}
            <button type="button" className="boton boton--secundario" data-testid={`boton-reintentar-fila-${codigo}`} onClick={() => void enviar(fallo)}>
              Reintentar
            </button>
          </span>
        ) : null}
      </div>
    </li>
  );
}
