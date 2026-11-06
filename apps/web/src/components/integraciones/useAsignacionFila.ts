import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCelulas } from "@/api/catalogos";
import { llamadasConsulta, useAnalistasDeQe, useEditarItemsConsulta, useQeActivos, useSprintsDeCelula } from "@/api/integraciones";
import { ErrorApi } from "@/lib/httpClient";
import {
  TEXTO_FALLA_CONFIRMAR,
  TEXTO_FILA_EN_CURSO,
  TEXTO_FILA_MODIFICADA,
  TEXTO_LOTE_EN_CURSO,
  TEXTO_NO_CONFIRMABLE_SIN_ANALISTAS,
  TEXTO_SPRINT_RECALCULADO,
  estadoDeFila,
  textoAnuncioAnalistaAutomatico,
  textoAnuncioCreada,
  textoCarrera,
  textoDejoDeEstarIncluida,
  textoFalta,
  textoLimpiaAnalista,
  textoRechazoFila,
} from "@/lib/mensajesAsignacion";
import type { CampoAsignacion, ErrorFilaModificada, ErrorHduYaAsignada, ItemConsulta, MotivoRechazoFila, SolicitudEdicionItems } from "@/types/dominio";
import { useContextoConsulta } from "./contextoConsulta";

export interface OpcionesFila {
  item: ItemConsulta;
  consultaId: string;
  onAnunciar: (mensaje: string) => void;
  /** Devuelve `true` si el error ya se resolvió a nivel de la consulta (cerrada, reemplazada, sin permiso). */
  onErrorDeConsulta: (error: unknown) => boolean;
  /** La `version` que devolvió el servidor tras una escritura propia (para detectar cambios ajenos antes del lote). */
  onVersion?: (version: number) => void;
  /** La fila quedó creada con «Confirmar asignación»: el anfitrión mueve el foco (diseño §4.2). */
  alCrear?: (item: ItemConsulta) => void;
}

const CAMPO_DE_DETALLE: Record<string, CampoAsignacion> = { celulaId: "celulaId", qeId: "qeId", analistaId: "analistaId", sprintId: "sprintId" };
export type ErroresFila = Partial<Record<CampoAsignacion | "marcada", string>>;
const CODIGOS_RECHAZO = ["QE_INVALIDO", "ANALISTA_INVALIDO", "ANALISTA_FUERA_DE_EQUIPO", "CATALOGO_INVALIDO", "ASIGNACION_INCOMPLETA", "FILA_NO_MARCABLE", "FILA_NO_ASIGNABLE"];
const ESPERA_FILA_EN_CURSO_MS = 5000;

export interface ErrorConfirmarFila {
  tipo: "texto" | "invalida" | "modificada" | "en-curso" | "red";
  codigo: string;
  texto: string;
}

/**
 * Lógica de una fila «Nueva» (edición por cambio, catálogos y «Confirmar asignación»). La comparten la tarjeta de la
 * lista y la sección «Asignación» del panel de detalle: cada una tiene su propia instancia, pero la verdad de la fila
 * (creada, ya asignada, revisión) es siempre la que devuelve el servidor.
 */
export function useAsignacionFila({ item, consultaId, onAnunciar, onErrorDeConsulta, onVersion, alCrear }: OpcionesFila) {
  const cliente = useQueryClient();
  const { loteEnCurso } = useContextoConsulta();
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
  const [errores, setErrores] = useState<ErroresFila>({});
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState<ErrorConfirmarFila | null>(null);
  const [esperaEnCurso, setEsperaEnCurso] = useState(false);
  const [carrera, setCarrera] = useState(false);
  const yaAsignadaInicial = useRef(item.yaAsignada !== null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temporizadorEnCurso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const enVuelo = useRef(0);
  const confirmandoRef = useRef(false);
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      if (temporizadorEnCurso.current) clearTimeout(temporizadorEnCurso.current);
    },
    [],
  );

  const opcionesCelula = (celulas.data?.items ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre }));
  const opcionesQe = (qes.data?.items ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre }));
  const opcionesAnalista = (analistas.data?.items ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre }));
  const opcionesSprint = (sprints.data?.items ?? []).map((s) => ({ valor: s.id, etiqueta: s.nombre }));
  const sinAnalistas = Boolean(qeId) && analistas.isSuccess && opcionesAnalista.length === 0;
  const nombreQe = a?.qeResponsable?.nombre ?? "";
  const catalogoCaido = [celulas, qes].some((q) => q.isError) || (Boolean(qeId) && analistas.isError) || (Boolean(celulaId) && sprints.isError);

  function refrescar() {
    void cliente.invalidateQueries({ queryKey: ["integraciones"] });
  }

  /** `HDU_YA_ASIGNADA` (D204): otra persona creó la HDU. La fila pasa a solo lectura con los nombres actuales. */
  function pasarAYaAsignada(cuerpo: Partial<ErrorHduYaAsignada> | undefined) {
    setCarrera(true);
    setErrorConfirmar(null);
    if (cuerpo?.item?.id === item.id) {
      cliente.setQueriesData<{ items: ItemConsulta[] }>({ queryKey: ["integraciones", "consulta", "items", consultaId] }, (previa) =>
        previa ? { ...previa, items: previa.items.map((i) => (i.id === item.id ? (cuerpo.item as ItemConsulta) : i)) } : previa,
      );
    }
    if (cuerpo?.yaAsignada) onAnunciar(textoCarrera(codigo, cuerpo.yaAsignada));
    refrescar();
  }

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
      const nuevoAnalista = nueva?.asignacion?.analista;
      const nuevoQe = nueva?.asignacion?.qeResponsable;
      if (nueva?.analistaAuto && nuevoAnalista && nuevoQe && !(a?.analista?.id === nuevoAnalista.id && item.analistaAuto)) {
        // Una sola frase: o se asignó solo, o se limpió (nunca ambas).
        onAnunciar(textoAnuncioAnalistaAutomatico(nuevoAnalista.nombre, nuevoQe.nombre));
      } else if (cuerpo.asignacion?.qeId !== undefined && a?.analista && nueva && !nuevoAnalista && nuevoQe) {
        onAnunciar(textoLimpiaAnalista(nuevoQe.nombre));
      }
      if (cuerpo.asignacion?.celulaId !== undefined && a?.sprintOrigen === "MANUAL" && a.sprint) onAnunciar(TEXTO_SPRINT_RECALCULADO);
      if (respuesta.desmarcadas.length > 0) onAnunciar(textoDejoDeEstarIncluida(codigo));
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "HDU_YA_ASIGNADA") {
        pasarAYaAsignada(error.cuerpo as Partial<ErrorHduYaAsignada>);
        return;
      }
      if (error instanceof ErrorApi && error.codigo === "FILA_EN_CURSO") {
        setErrorConfirmar({ tipo: "en-curso", codigo: "FILA_EN_CURSO", texto: TEXTO_FILA_EN_CURSO });
        refrescar();
        return;
      }
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

  // ------------------------------------------------------- «Confirmar asignación»

  const completa = item.completa;
  let motivoConfirmar: string | undefined;
  if (loteEnCurso) motivoConfirmar = TEXTO_LOTE_EN_CURSO;
  else if (!completa && sinAnalistas) motivoConfirmar = TEXTO_NO_CONFIRMABLE_SIN_ANALISTAS;
  else if (!completa) motivoConfirmar = item.faltantes.length > 0 ? textoFalta(item.faltantes) : "Falta completar la asignación";
  const bloqueadoPorEspera = esperaEnCurso;
  const confirmable = !motivoConfirmar && !item.aplicada && !item.yaAsignada;

  async function confirmar() {
    // El segundo clic se ignora mientras una solicitud está en vuelo: el doble clic no manda dos peticiones.
    if (confirmandoRef.current || !confirmable || bloqueadoPorEspera || ocupado) return;
    confirmandoRef.current = true;
    setConfirmando(true);
    setErrorConfirmar(null);
    try {
      const respuesta = await llamadasConsulta.confirmarFila(consultaId, item.id, item.revision);
      onVersion?.(respuesta.consulta.version);
      refrescar();
      void cliente.invalidateQueries({ queryKey: ["bandeja"] });
      const creada = respuesta.item;
      onAnunciar(textoAnuncioCreada(codigo, creada.asignacion?.qeResponsable?.nombre ?? nombreQe, creada.asignacion?.analista?.nombre ?? null));
      alCrear?.(creada);
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "HDU_YA_ASIGNADA") {
        pasarAYaAsignada(error.cuerpo as Partial<ErrorHduYaAsignada>);
      } else if (error instanceof ErrorApi && error.codigo === "FILA_MODIFICADA") {
        const cuerpo = error.cuerpo as Partial<ErrorFilaModificada> | undefined;
        if (cuerpo?.item?.id === item.id) {
          cliente.setQueriesData<{ items: ItemConsulta[] }>({ queryKey: ["integraciones", "consulta", "items", consultaId] }, (previa) =>
            previa ? { ...previa, items: previa.items.map((i) => (i.id === item.id ? (cuerpo.item as ItemConsulta) : i)) } : previa,
          );
        }
        setErrorConfirmar({ tipo: "modificada", codigo: "FILA_MODIFICADA", texto: TEXTO_FILA_MODIFICADA });
        refrescar();
      } else if (error instanceof ErrorApi && error.codigo === "FILA_EN_CURSO") {
        setErrorConfirmar({ tipo: "en-curso", codigo: "FILA_EN_CURSO", texto: TEXTO_FILA_EN_CURSO });
        setEsperaEnCurso(true);
        temporizadorEnCurso.current = setTimeout(() => setEsperaEnCurso(false), ESPERA_FILA_EN_CURSO_MS);
        refrescar();
      } else if (error instanceof ErrorApi && error.status === 422 && error.codigo === "ASIGNACION_INCOMPLETA") {
        const faltantes = (error.detalles ?? []).map((d) => CAMPO_DE_DETALLE[d.campo]).filter((c): c is CampoAsignacion => Boolean(c));
        setErrorConfirmar({ tipo: "invalida", codigo: error.codigo, texto: `${textoFalta(faltantes)}.` });
        refrescar();
      } else if (error instanceof ErrorApi && error.status === 409 && error.codigo === "ASIGNACIONES_INVALIDAS") {
        const fila = (error.cuerpo as { filas?: Array<{ motivo: MotivoRechazoFila; campo: string | null }> } | undefined)?.filas?.[0];
        const texto = fila ? textoRechazoFila(fila.motivo, fila.campo, undefined, { analista: a?.analista?.nombre, qe: nombreQe }) : TEXTO_FALLA_CONFIRMAR;
        setErrorConfirmar({ tipo: "invalida", codigo: error.codigo, texto });
        refrescar();
      } else if (!onErrorDeConsulta(error)) {
        // Falla de red o 503: la fila queda intacta y reintentar es idempotente (el servidor devuelve `repetida`).
        setErrorConfirmar({ tipo: "red", codigo: error instanceof ErrorApi ? error.codigo : "SIN_RESPUESTA", texto: TEXTO_FALLA_CONFIRMAR });
      }
    } finally {
      confirmandoRef.current = false;
      setConfirmando(false);
    }
  }

  // ------------------------------------------------------------------ estado

  const base = estadoDeFila(item);
  const estado: { texto: string; glifo: string; clase: string; dataEstado: string } =
    item.yaAsignada || carrera
      ? { texto: "Ya asignada", glifo: "!", clase: "ya-asignada", dataEstado: "ya-asignada" }
      : item.aplicada
        ? { texto: "Creada", glifo: "✓", clase: "creada", dataEstado: "creada" }
        : confirmando
          ? { texto: "Confirmando…", glifo: "…", clase: "neutro", dataEstado: "confirmando" }
          : errorConfirmar?.tipo === "red" || errorConfirmar?.tipo === "texto"
            ? { texto: "No se pudo confirmar", glifo: "✕", clase: "error", dataEstado: "error" }
            : { ...base, dataEstado: base.clase === "neutro" ? "sin-asignar" : base.clase };

  // La alerta aparece «en sesión» si la fila no la traía al cargar: entonces se anuncia como `alert`, no como `note`.
  const alertaEnSesion = carrera || (item.yaAsignada !== null && !yaAsignadaInicial.current);

  return {
    item,
    codigo,
    celulaId,
    qeId,
    nombreQe,
    celulas,
    qes,
    analistas,
    sprints,
    opcionesCelula,
    opcionesQe,
    opcionesAnalista,
    opcionesSprint,
    sinAnalistas,
    catalogoCaido,
    ocupado,
    guardado,
    fallo,
    errores,
    enviar,
    cambiar,
    confirmar,
    confirmando,
    confirmable,
    bloqueadoPorEspera,
    motivoConfirmar,
    errorConfirmar,
    estado,
    alertaEnSesion,
    reintentarCatalogos: () => void Promise.all([celulas.refetch(), qes.refetch(), qeId ? analistas.refetch() : null, celulaId ? sprints.refetch() : null]),
  };
}

export type FilaAsignacion = ReturnType<typeof useAsignacionFila>;
