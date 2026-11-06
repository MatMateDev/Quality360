import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useDetalleItem } from "@/api/integraciones";
import { ETIQUETAS_PRIORIDAD, type DetalleHdu, type ItemConsulta } from "@/types/dominio";
import { textoMotivo } from "@/lib/mensajesIntegracion";
import { TEXTO_APOYO_YA_ASIGNADA } from "@/lib/mensajesAsignacion";
import { AlertaHduYaAsignada } from "./AlertaHduYaAsignada";
import { CeldaCambios } from "./CeldaCambios";
import { SeccionAsignacion } from "./SeccionAsignacion";
import { TextoLargoExpandible } from "./TextoLargoExpandible";
import { useAsignacionFila } from "./useAsignacionFila";

const FOCALIZABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ETIQUETAS_VISIBLES = 8;
const ETIQUETA_GRUPO = { NUEVA: "+ Nueva", CAMBIO: "Cambió", SIN_CAMBIOS: "Sin cambios", CON_ERROR: "Con error" } as const;
const ETIQUETA_SPRINT = { ACTIVO: "Activo", FUTURO: "Futuro", CERRADO: "Cerrado" } as const;

const fechaHora = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fechaDia = (iso: string | null, conAnio = true): string => {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-CL", { day: "numeric", month: "short", ...(conAnio ? { year: "numeric" } : {}) });
};
const rangoSprint = (inicio: string | null, fin: string | null) => {
  const partes = [inicio, fin].filter((f): f is string => Boolean(f)).map((f) => fechaDia(f, false)).filter((f) => f !== "—");
  return partes.length > 0 ? `, ${partes.join("–")}` : "";
};

/** Una fila de la lista de datos cortos: etiqueta + valor o el texto de «sin dato» (nunca una celda en blanco). */
function Dato({ etiqueta, id, children }: { etiqueta: string; id: string; children: React.ReactNode }) {
  return (
    <div className="panel-detalle__dato">
      <dt>{etiqueta}</dt>
      <dd data-testid={id}>{children}</dd>
    </div>
  );
}

function Etiquetas({ detalle }: { detalle: DetalleHdu }) {
  const [todas, setTodas] = useState(false);
  const lista = detalle.etiquetas;
  if (lista.length === 0) return <span data-testid="detalle-vacio-etiquetas">Sin etiquetas en Jira</span>;
  const visibles = todas ? lista : lista.slice(0, ETIQUETAS_VISIBLES);
  const ocultas = lista.length - visibles.length;
  const enJira = Math.max(0, detalle.etiquetasTotal - lista.length);
  return (
    <>
      <ul className="panel-detalle__etiquetas">
        {visibles.map((e, i) => (
          <li key={`${e.valor}-${i}`} className="chip-grupo texto-largo">
            {e.valor}
          </li>
        ))}
      </ul>
      {ocultas > 0 ? (
        <button type="button" className="boton boton--terciario" aria-expanded={false} data-testid="boton-mas-etiquetas" onClick={() => setTodas(true)}>
          +{ocultas} más
        </button>
      ) : null}
      {todas && lista.length > ETIQUETAS_VISIBLES ? (
        <button type="button" className="boton boton--terciario" aria-expanded data-testid="boton-menos-etiquetas" onClick={() => setTodas(false)}>
          Ver menos
        </button>
      ) : null}
      {enJira > 0 ? <span className="campo-ayuda"> +{enJira} más en Jira</span> : null}
    </>
  );
}

interface PropsContenido {
  consultaId: string;
  item: ItemConsulta;
  /** `true` cuando la persona navegó con Anterior o Siguiente: el foco va al título, no a «Cerrar». */
  navegado: boolean;
  haySiguiente: boolean;
  hayAnterior: boolean;
  onAnterior: () => void;
  onSiguiente: () => void;
  onCerrar: () => void;
  onOcupado: (ocupado: boolean) => void;
  idTitulo: string;
  onAnunciar: (mensaje: string) => void;
  onErrorDeConsulta: (error: unknown) => boolean;
  onVersion?: (version: number) => void;
  alCrear?: (item: ItemConsulta) => void;
}

/** Contenido del panel de una fila. Se monta de nuevo en cada fila (`key`), así el estado de confirmación no se arrastra. */
function ContenidoDetalle({ consultaId, item, navegado, haySiguiente, hayAnterior, onAnterior, onSiguiente, onCerrar, onOcupado, idTitulo, onAnunciar, onErrorDeConsulta, onVersion, alCrear }: PropsContenido) {
  const codigo = item.codigo ?? "—";
  const consulta = useDetalleItem(consultaId, item.id);
  const refTitulo = useRef<HTMLHeadingElement>(null);
  const refCerrar = useRef<HTMLButtonElement>(null);
  const refSiguiente = useRef<HTMLButtonElement>(null);
  const fila = useAsignacionFila({
    item,
    consultaId,
    onAnunciar,
    onErrorDeConsulta,
    onVersion,
    alCrear: (creada) => {
      alCrear?.(creada);
      // Foco tras confirmar desde el panel: «Siguiente sin asignar» o, si no queda ninguna, el título (diseño §4.2).
      setTimeout(() => (haySiguiente && refSiguiente.current ? refSiguiente.current : refTitulo.current)?.focus(), 0);
    },
  });
  const detalle = consulta.data?.detalle ?? null;
  const leidaEn = consulta.data?.leidaEn ?? null;

  useEffect(() => {
    onOcupado(fila.confirmando);
  }, [fila.confirmando, onOcupado]);

  useEffect(() => {
    (navegado ? refTitulo.current : refCerrar.current)?.focus();
    if (navegado) onAnunciar(`Detalle de ${codigo}`);
    // Solo al montar (una vez por fila).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Una consulta vencida, reemplazada o descartada cierra el panel y deja el aviso de la consulta (diseño §2.7).
  useEffect(() => {
    if (consulta.isError && onErrorDeConsulta(consulta.error)) onCerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta.isError, consulta.error]);

  const resumen = detalle?.resumen ?? item.titulo ?? "";
  const yaAsignada = item.yaAsignada;
  const url = detalle?.urlJira ?? item.urlExterna;
  const mostrarAsignacion = item.grupo === "NUEVA";

  return (
    <>
      <header className="panel-detalle__cabecera">
        <div>
          <h2 id={idTitulo} ref={refTitulo} tabIndex={-1} className="texto-largo">
            <span className="sr-only">Detalle de la HDU </span>
            <span>{codigo}</span> · <span data-testid="detalle-resumen">{resumen}</span>
          </h2>
          <p className="panel-detalle__chips">
            <span className={`chip-grupo${item.grupo === "NUEVA" ? " chip-grupo--nuevas" : ""}`}>{ETIQUETA_GRUPO[item.grupo]}</span>
          </p>
        </div>
        <button type="button" ref={refCerrar} className="boton boton--secundario" data-testid="boton-cerrar-detalle" onClick={onCerrar}>
          <span aria-hidden="true">✕ </span>Cerrar
        </button>
      </header>

      {yaAsignada ? <AlertaHduYaAsignada codigo={codigo} yaAsignada={yaAsignada} variante="completa" enSesion={fila.alertaEnSesion} /> : null}

      {consulta.isLoading ? (
        <div className="panel-detalle__esqueleto" data-testid="cargando-detalle" aria-busy="true">
          <span className="sr-only">Cargando detalle de {codigo}…</span>
          <div className="esqueleto-linea" />
          <div className="esqueleto-linea" />
          <div className="esqueleto-linea" />
        </div>
      ) : null}

      {consulta.isError && !consulta.isLoading ? (
        <div className="mensaje-error-global" role="alert" data-testid="error-detalle">
          <p>No se pudo cargar el detalle</p>
          <button type="button" className="boton boton--secundario" data-testid="boton-reintentar-detalle" onClick={() => void consulta.refetch()}>
            Reintentar
          </button>
        </div>
      ) : null}

      {consulta.isSuccess && !detalle ? (
        <p className="mensaje-aviso" role="note" data-testid="aviso-detalle-antiguo">
          <span aria-hidden="true">ⓘ</span> Consulta anterior al detalle completo; consulta Jira de nuevo
        </p>
      ) : null}

      {consulta.isSuccess && !detalle ? (
        <section className="panel-detalle__seccion" aria-label="Datos de la fila" data-testid="datos-fila-sin-detalle">
          <dl className="panel-detalle__datos">
            <Dato etiqueta="Estado" id="detalle-estado">
              {item.referencia?.estado ?? "—"}
            </Dato>
            <Dato etiqueta="Prioridad" id="detalle-prioridad">
              {item.prioridad ? ETIQUETAS_PRIORIDAD[item.prioridad] : "Sin prioridad en Jira"}
            </Dato>
            <Dato etiqueta="Responsable en Jira" id="detalle-responsable">
              {item.referencia?.responsable ? <span className="texto-largo">{item.referencia.responsable}</span> : <span data-testid="detalle-vacio-responsable">Sin responsable en Jira</span>}
            </Dato>
            <Dato etiqueta="Sprint en Jira" id="detalle-sprints">
              {item.sprintJira ? <span className="texto-largo">{item.sprintJira}</span> : <span data-testid="detalle-vacio-sprints">Sin sprint en Jira</span>}
            </Dato>
          </dl>
          <TextoLargoExpandible seccion="descripcion" titulo="Descripción" codigo={codigo} texto={item.descripcion?.trim() ? item.descripcion : null} truncado={false} urlJira={url} vacio="Sin descripción en Jira" onAnunciar={onAnunciar} />
        </section>
      ) : null}

      {detalle ? (
        <>
          <section className="panel-detalle__seccion" aria-label="Datos de la HDU en Jira">
            <dl className="panel-detalle__datos">
              <Dato etiqueta="Estado" id="detalle-estado">
                {detalle.estadoJira ?? "—"}
              </Dato>
              <Dato etiqueta="Tipo" id="detalle-tipo">
                {detalle.tipo ?? "—"}
              </Dato>
              <Dato etiqueta="Prioridad" id="detalle-prioridad">
                {detalle.prioridadJira ? `${detalle.prioridadJira} en Jira${detalle.prioridadQ360 ? ` → ${ETIQUETAS_PRIORIDAD[detalle.prioridadQ360]} en Quality360` : ""}` : "Sin prioridad en Jira"}
              </Dato>
              <Dato etiqueta="Responsable en Jira" id="detalle-responsable">
                {detalle.responsableJira ? <span className="texto-largo">{detalle.responsableJira}</span> : <span data-testid="detalle-vacio-responsable">Sin responsable en Jira</span>}
              </Dato>
              <Dato etiqueta="Épica" id="detalle-epica">
                {detalle.epica ? (
                  <span className="texto-largo">
                    {detalle.epica.clave}
                    {detalle.epica.titulo ? ` · ${detalle.epica.titulo}` : ""}
                  </span>
                ) : (
                  <span data-testid="detalle-vacio-epica">Sin épica en Jira</span>
                )}
              </Dato>
              <Dato etiqueta="Sprints" id="detalle-sprints">
                {detalle.sprints.length > 0 ? (
                  <ul className="panel-detalle__lista">
                    {detalle.sprints.map((s, i) => (
                      <li key={`${s.nombre}-${i}`} className="texto-largo">
                        {s.nombre} ({ETIQUETA_SPRINT[s.estado]}
                        {rangoSprint(s.inicio, s.fin)})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span data-testid="detalle-vacio-sprints">Sin sprint en Jira</span>
                )}
              </Dato>
              <Dato etiqueta="Etiquetas" id="detalle-etiquetas">
                <Etiquetas detalle={detalle} />
              </Dato>
              <Dato etiqueta="Fechas" id="detalle-fechas">
                <ul className="panel-detalle__lista">
                  <li>Creada: {fechaHora(detalle.fechas.creada)}</li>
                  <li>Actualizada: {fechaHora(detalle.fechas.actualizada)}</li>
                  <li>Vence: {fechaDia(detalle.fechas.vencimiento)}</li>
                  <li>Resuelta: {fechaHora(detalle.fechas.resolucion)}</li>
                </ul>
              </Dato>
            </dl>
          </section>

          <TextoLargoExpandible
            seccion="descripcion"
            titulo="Descripción"
            codigo={codigo}
            texto={detalle.descripcion.texto}
            truncado={detalle.descripcion.truncado}
            urlJira={url}
            vacio="Sin descripción en Jira"
            onAnunciar={onAnunciar}
          />
          <TextoLargoExpandible
            seccion="criterios"
            titulo="Criterios de aceptación"
            codigo={codigo}
            texto={detalle.criterios.texto}
            truncado={detalle.criterios.truncado}
            urlJira={url}
            vacio="Sin criterios de aceptación en Jira"
            etiqueta={detalle.criterios.origen === "DESCRIPCION" ? "Tomados de la descripción" : undefined}
            onAnunciar={onAnunciar}
          />
        </>
      ) : null}

      {item.grupo === "CAMBIO" ? (
        <section className="panel-detalle__seccion" aria-labelledby={`${idTitulo}-cambio`}>
          <h3 id={`${idTitulo}-cambio`}>Qué cambió</h3>
          <CeldaCambios cambios={item.cambios} testId="detalle-que-cambio" />
        </section>
      ) : null}
      {item.grupo === "CON_ERROR" ? (
        <section className="panel-detalle__seccion" aria-labelledby={`${idTitulo}-error`}>
          <h3 id={`${idTitulo}-error`}>Motivo del error</h3>
          <p data-testid="detalle-motivo-error">
            <span aria-hidden="true">✕</span> {textoMotivo(item.motivo)}
          </p>
        </section>
      ) : null}

      <div className="panel-detalle__datos-jira">
        {url ? (
          <a className="boton boton--secundario" href={url} target="_blank" rel="noopener noreferrer" data-testid="enlace-abrir-jira" aria-label={`Abrir en Jira: ${codigo} (se abre en otra pestaña)`}>
            Abrir en Jira<span aria-hidden="true"> ↗</span>
          </a>
        ) : null}
        {leidaEn ? <span className="campo-ayuda">Datos de Jira del {fechaHora(leidaEn)}</span> : null}
      </div>

      {mostrarAsignacion ? (
        <section className="panel-detalle__seccion panel-detalle__asignacion" aria-labelledby={`${idTitulo}-asignacion`} data-estado={fila.estado.dataEstado}>
          <h3 id={`${idTitulo}-asignacion`}>Asignación</h3>
          {yaAsignada ? <p className="campo-ayuda">{TEXTO_APOYO_YA_ASIGNADA}</p> : null}
          <SeccionAsignacion fila={fila} origen="panel" conAlerta={false} conMarca={false} />
        </section>
      ) : null}

      <footer className="panel-detalle__pie">
        <button type="button" className="boton boton--secundario" data-testid="boton-anterior" aria-disabled={!hayAnterior || undefined} onClick={() => hayAnterior && onAnterior()}>
          <span aria-hidden="true">◀ </span>Anterior
        </button>
        <button type="button" ref={refSiguiente} className="boton boton--secundario" data-testid="boton-siguiente-sin-asignar" aria-disabled={!haySiguiente || undefined} onClick={() => haySiguiente && onSiguiente()}>
          Siguiente sin asignar<span aria-hidden="true"> ▶</span>
        </button>
        <button type="button" className="boton boton--terciario" data-testid="boton-cerrar-pie" onClick={onCerrar}>
          Cerrar
        </button>
      </footer>
    </>
  );
}

interface Props {
  consultaId: string;
  /** Filas de la página del grupo, en el orden de la lista: Anterior y Siguiente se mueven entre ellas. */
  items: ItemConsulta[];
  itemId: string;
  onCambiar: (itemId: string) => void;
  onCerrar: () => void;
  onAnunciar: (mensaje: string) => void;
  onErrorDeConsulta: (error: unknown) => boolean;
  onVersion?: (version: number) => void;
  alCrear?: (item: ItemConsulta) => void;
}

const sinAsignar = (i: ItemConsulta) => i.grupo === "NUEVA" && !i.aplicada && !i.yaAsignada;

/**
 * Panel de detalle de una HDU (E5-F06, diseño §2): panel lateral modal en escritorio y hoja a pantalla completa en
 * móvil. Foco atrapado, Esc cierra, el resto de la página queda inerte detrás y todo texto de Jira se pinta como texto.
 */
export function PanelDetalleHdu({ consultaId, items, itemId, onCambiar, onCerrar, onAnunciar, onErrorDeConsulta, onVersion, alCrear }: Props) {
  const idTitulo = useId();
  const contenedor = useRef<HTMLElement>(null);
  const [navegado, setNavegado] = useState(false);
  const ocupado = useRef(false);
  const indice = items.findIndex((i) => i.id === itemId);
  const item = items[indice];
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  // Una fila que ya no está en la lista cierra el panel.
  useEffect(() => {
    if (!item) cerrarRef.current();
  }, [item]);

  // El resto de la página queda inerte detrás del panel (diseño §7).
  useEffect(() => {
    const huesped = contenedor.current?.parentElement;
    const previos = Array.from(document.body.children).filter((el) => el !== huesped && !el.hasAttribute("inert"));
    for (const el of previos) el.setAttribute("inert", "");
    return () => {
      for (const el of previos) el.removeAttribute("inert");
    };
  }, []);

  if (!item) return null;

  const siguienteSinAsignar = () => {
    const despues = items.slice(indice + 1).find(sinAsignar);
    return despues ?? items.slice(0, indice).find(sinAsignar);
  };
  const haySiguiente = Boolean(siguienteSinAsignar());
  const ir = (destino: ItemConsulta | undefined) => {
    if (!destino) return;
    setNavegado(true);
    onCambiar(destino.id);
  };

  function manejarTeclado(evento: KeyboardEvent) {
    if (evento.key === "Escape") {
      evento.stopPropagation();
      if (!ocupado.current) onCerrar();
      return;
    }
    if (evento.key !== "Tab" || !contenedor.current) return;
    const elementos = Array.from(contenedor.current.querySelectorAll<HTMLElement>(FOCALIZABLES)).filter((el) => el.getAttribute("aria-hidden") !== "true");
    if (elementos.length === 0) return;
    const primero = elementos[0]!;
    const ultimo = elementos[elementos.length - 1]!;
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  return createPortal(
    <div className="capa-panel-detalle" onClick={() => !ocupado.current && onCerrar()}>
      <aside
        ref={contenedor}
        className="panel-detalle"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        data-testid="panel-detalle-hdu"
        data-codigo={item.codigo ?? ""}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={manejarTeclado}
      >
        <ContenidoDetalle
          key={item.id}
          consultaId={consultaId}
          item={item}
          navegado={navegado}
          haySiguiente={haySiguiente}
          hayAnterior={indice > 0}
          onAnterior={() => ir(items[indice - 1])}
          onSiguiente={() => ir(siguienteSinAsignar())}
          onCerrar={onCerrar}
          onOcupado={(valor) => {
            ocupado.current = valor;
          }}
          idTitulo={idTitulo}
          onAnunciar={onAnunciar}
          onErrorDeConsulta={onErrorDeConsulta}
          onVersion={onVersion}
          alCrear={alCrear}
        />
      </aside>
    </div>,
    document.body,
  );
}
