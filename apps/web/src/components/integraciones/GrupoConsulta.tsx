import { useEffect, useId, useRef, useState } from "react";
import { esIndisponible, useEditarItemsConsulta, useItemsConsulta } from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { TEXTO_NOTA_CAMBIARON, TEXTO_NOTA_CON_ERROR, TEXTO_NOTA_CREADA_A_MANO, textoRechazadasTitulo, textoRechazoFila, textoSeIncluyeron, textoYaAsignadas } from "@/lib/mensajesAsignacion";
import { textoFilas } from "@/lib/mensajesConsulta";
import { textoMotivo } from "@/lib/mensajesIntegracion";
import { ETIQUETAS_ESTADO_HDU, type Consulta, type FilaRechazada, type ItemConsulta } from "@/types/dominio";
import type { DefinicionGrupo } from "./gruposConsulta";
import { AlertaHduYaAsignada } from "./AlertaHduYaAsignada";
import { CeldaCambios } from "./CeldaCambios";
import { ChipsAdvertencias } from "./Insignias";
import { PanelAsignarGrupo } from "./PanelAsignarGrupo";
import { PanelDetalleHdu } from "./PanelDetalleHdu";
import { TarjetaFilaNueva } from "./TarjetaFilaNueva";

const TAMANO = 25;
const LIMITE_VISTA = 200;

interface Props {
  definicion: DefinicionGrupo;
  consulta: Consulta;
  total: number;
  soloLectura: boolean;
  onAnunciar: (mensaje: string) => void;
  onErrorDeConsulta: (error: unknown) => boolean;
  onVersion: (version: number) => void;
}

/** Descripción recortada a 200 caracteres con «Ver completa» (diseño §4.7). */
function CambiosDeFila({ item }: { item: ItemConsulta }) {
  const cambios = item.cambios;
  if (!cambios) return <span>—</span>;
  const larga = cambios.descripcion && ((cambios.descripcion.antes?.length ?? 0) > LIMITE_VISTA || (cambios.descripcion.despues?.length ?? 0) > LIMITE_VISTA);
  const recortar = (v: string | null | undefined) => (v && v.length > LIMITE_VISTA ? `${v.slice(0, LIMITE_VISTA)} (…)` : (v ?? null));
  const corto = {
    ...cambios,
    ...(cambios.descripcion ? { descripcion: { antes: recortar(cambios.descripcion.antes), despues: recortar(cambios.descripcion.despues) } } : {}),
  };
  return (
    <>
      <CeldaCambios cambios={corto} testId="celda-cambios" />
      {larga ? (
        <details>
          <summary>Ver completa</summary>
          <p className="texto-largo texto-plano">Antes: {cambios.descripcion?.antes ?? "(vacío)"}</p>
          <p className="texto-largo texto-plano">Después: {cambios.descripcion?.despues ?? "(vacío)"}</p>
        </details>
      ) : null}
    </>
  );
}

/** Sección de un grupo (diseño §4.2): disclosure, filtro y paginación en el servidor, y su contenido según el grupo. */
export function GrupoConsulta({ definicion, consulta, total, soloLectura, onAnunciar, onErrorDeConsulta, onVersion }: Props) {
  const { grupo, clave, titulo } = definicion;
  const idPanel = useId();
  const idFiltro = `filtro-texto-${clave}`;
  const encabezado = useRef<HTMLHeadingElement>(null);
  const [abierto, setAbierto] = useState(clave === "nuevas" || (clave !== "sin-cambios" && total > 0));
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());
  const [todoElGrupo, setTodoElGrupo] = useState(false);
  const [rechazadas, setRechazadas] = useState<FilaRechazada[]>([]);
  const [errorMarca, setErrorMarca] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [codigoDetalle, setCodigoDetalle] = useState<string | null>(null);
  const alerta = useRef<HTMLDivElement>(null);
  const editar = useEditarItemsConsulta(consulta.id);
  const consultaItems = useItemsConsulta(consulta.id, { grupo, q, pagina, tamanoPagina: TAMANO });
  const datos = consultaItems.data;

  useEffect(() => {
    const t = setTimeout(() => {
      setQ((anterior) => {
        if (anterior !== texto.trim()) {
          setPagina(1);
          setTodoElGrupo(false);
        }
        return texto.trim();
      });
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    if (rechazadas.length > 0) alerta.current?.focus();
  }, [rechazadas]);

  // Una fila que ya no existe deja de estar seleccionada.
  const idsPagina = datos?.items.map((i) => i.id) ?? [];
  const paginaSeleccionada = idsPagina.length > 0 && (todoElGrupo || idsPagina.every((id) => seleccion.has(id)));

  function alternarFila(id: string, valor: boolean) {
    const nueva = new Set(todoElGrupo ? idsPagina : seleccion);
    if (valor) nueva.add(id);
    else nueva.delete(id);
    setTodoElGrupo(false);
    setSeleccion(nueva);
  }

  function alternarPagina(valor: boolean) {
    const nueva = new Set(seleccion);
    for (const id of idsPagina) {
      if (valor) nueva.add(id);
      else nueva.delete(id);
    }
    setSeleccion(nueva);
    if (!valor) setTodoElGrupo(false);
    else onAnunciar(`Se seleccionaron ${textoFilas(idsPagina.length)} de esta página`);
  }

  async function marcarTodasLasListas() {
    try {
      const r = await editar.mutateAsync({ grupo: "NUEVA", todas: true, ...(q ? { q } : {}), marcarListas: true });
      onVersion(r.version);
      onAnunciar(textoSeIncluyeron(r.marcadas, r.incompletas));
    } catch (error) {
      onErrorDeConsulta(error);
    }
  }

  async function marcarItems(ids: string[], valor: boolean) {
    setErrorMarca(false);
    try {
      onVersion((await editar.mutateAsync({ itemIds: ids.slice(0, 100), marcada: valor })).version);
    } catch (error) {
      if (!onErrorDeConsulta(error)) setErrorMarca(true);
    }
  }

  let estado: EstadoDatos = "ok";
  if (consultaItems.isError) estado = esIndisponible(consultaItems.error) ? "indisponible" : "error";
  else if (consultaItems.isLoading || !datos) estado = "cargando";
  else if (datos.items.length === 0) estado = "vacio";

  const items = datos?.items ?? [];
  const conFiltro = q !== "";

  const botonVerDetalle = (codigo: string | null) => document.querySelector<HTMLElement>(`[data-testid="fila-${codigo}"] [data-testid="boton-ver-detalle"]`);

  function abrirDetalle(item: ItemConsulta) {
    setDetalleId(item.id);
    setCodigoDetalle(item.codigo);
  }

  /** Al cerrar el panel el foco vuelve a «Ver detalle» de la fila, o al encabezado del grupo si la fila ya no está (diseño §7). */
  function cerrarDetalle() {
    const codigo = codigoDetalle;
    setDetalleId(null);
    setCodigoDetalle(null);
    setTimeout(() => (botonVerDetalle(codigo) ?? encabezado.current)?.focus(), 0);
  }

  /** Tras «Confirmar asignación» en la lista el foco pasa a «Ver detalle» de la siguiente Nueva sin asignar, o al `h3` (diseño §4.2). */
  function alCrearFila(creada: ItemConsulta) {
    if (detalleId) return; // el panel abierto mueve el foco por su cuenta
    const resto = items.filter((i) => i.id !== creada.id);
    const posicion = items.findIndex((i) => i.id === creada.id);
    const sinAsignar = (i: ItemConsulta) => i.grupo === "NUEVA" && !i.aplicada && !i.yaAsignada;
    const siguiente = items.slice(posicion + 1).find((i) => i.id !== creada.id && sinAsignar(i)) ?? resto.find(sinAsignar);
    setTimeout(() => {
      const destino = siguiente ? botonVerDetalle(siguiente.codigo) : null;
      if (destino) destino.focus();
      else encabezado.current?.focus();
    }, 0);
  }

  const columnaDetalle: Columna<ItemConsulta> = {
    id: "detalle",
    titulo: "Detalle",
    prioritaria: true,
    render: (i) => (
      <button type="button" className="boton boton--secundario" data-testid="boton-ver-detalle" aria-label={`Ver detalle de ${i.codigo ?? "la fila"}`} onClick={() => abrirDetalle(i)}>
        Ver detalle
      </button>
    ),
  };
  const alertaCompacta = (i: ItemConsulta) => (i.yaAsignada ? <AlertaHduYaAsignada codigo={i.codigo ?? ""} yaAsignada={i.yaAsignada} variante="compacta" enSesion={false} /> : null);
  const marcablesPagina = items.filter((i) => i.marcable && !i.aplicada);
  const nombreRechazo = (f: FilaRechazada) => textoRechazoFila(f.motivo, f.campo, f.faltantes);

  const columnasCambio: Columna<ItemConsulta>[] = [
    {
      id: "incluir",
      titulo: "Incluir",
      prioritaria: true,
      render: (i) => (
        <label>
          <input
            type="checkbox"
            data-testid="casilla-marcar"
            checked={i.marcada}
            disabled={soloLectura || i.aplicada || !i.marcable}
            aria-label={`Incluir ${i.codigo} en la confirmación`}
            onChange={(e) => void marcarItems([i.id], e.target.checked)}
          />
        </label>
      ),
    },
    { id: "codigo", titulo: "Código", prioritaria: true, render: (i) => <strong className="codigo">{i.codigo}</strong> },
    {
      id: "titulo",
      titulo: "Título actual",
      render: (i) => (
        <div className="celda-con-alerta">
          <span className="texto-largo">{i.cambios?.titulo?.antes ?? i.titulo ?? "—"}</span>
          {alertaCompacta(i)}
        </div>
      ),
    },
    {
      id: "cambios",
      titulo: "Cambios",
      render: (i) => (
        <>
          <CambiosDeFila item={i} />
          {i.origenHdu === "MANUAL" ? (
            <p>
              <span className="chip-grupo" data-testid="chip-creada-a-mano">
                Creada a mano
              </span>{" "}
              <span className="campo-ayuda" data-testid="nota-creada-a-mano">
                <span aria-hidden="true">! </span>
                {TEXTO_NOTA_CREADA_A_MANO}
              </span>
            </p>
          ) : null}
        </>
      ),
    },
    { id: "hdu", titulo: "HDU en Quality360", render: (i) => (i.hdu ? `${ETIQUETAS_ESTADO_HDU[i.hdu.estado]} · ${i.hdu.qeResponsable ?? "Sin QE"}` : "—") },
    columnaDetalle,
  ];

  const columnasLectura: Columna<ItemConsulta>[] = [
    { id: "codigo", titulo: "Código", prioritaria: true, render: (i) => <strong className="codigo">{i.codigo ?? "—"}</strong> },
    {
      id: "titulo",
      titulo: "Título",
      render: (i) => (
        <div className="celda-con-alerta">
          <span className="texto-largo">{i.titulo ?? "—"}</span>
          {alertaCompacta(i)}
        </div>
      ),
    },
    {
      id: "motivo",
      titulo: "Motivo",
      prioritaria: true,
      render: (i) => (
        <>
          {grupo === "CON_ERROR" ? (
            <span>
              <span aria-hidden="true">✕</span> Error · {textoMotivo(i.motivo)}
            </span>
          ) : (
            textoMotivo(i.motivo)
          )}
          <ChipsAdvertencias advertencias={i.advertencias} />
        </>
      ),
    },
    columnaDetalle,
  ];

  return (
    <section className={`grupo-consulta grupo-consulta--${clave}`} data-testid={`grupo-${clave}`} aria-labelledby={`titulo-grupo-${clave}`}>
      <h3 id={`titulo-grupo-${clave}`} ref={encabezado} tabIndex={-1}>
        {total > 0 ? (
          <button type="button" className="disclosure__boton" data-testid={`boton-grupo-${clave}`} aria-expanded={abierto} aria-controls={idPanel} onClick={() => setAbierto((v) => !v)}>
            <span aria-hidden="true">{abierto ? "▾" : "▸"}</span> {titulo} <span data-testid={`total-grupo-${clave}`}>({total})</span>
          </button>
        ) : (
          <span>
            {titulo} <span data-testid={`total-grupo-${clave}`}>({total})</span>
          </span>
        )}
        {(datos?.yaAsignadas ?? 0) > 0 ? (
          <span className="chip-grupo chip-grupo--ya-asignadas" data-testid="contador-ya-asignadas">
            <span aria-hidden="true">! </span>
            {textoYaAsignadas(datos?.yaAsignadas ?? 0)}
          </span>
        ) : null}
      </h3>
      {detalleId ? (
        <PanelDetalleHdu
          consultaId={consulta.id}
          items={items}
          itemId={detalleId}
          onCambiar={(id) => {
            setDetalleId(id);
            setCodigoDetalle(items.find((i) => i.id === id)?.codigo ?? null);
          }}
          onCerrar={cerrarDetalle}
          onAnunciar={onAnunciar}
          onErrorDeConsulta={onErrorDeConsulta}
          onVersion={onVersion}
          alCrear={alCrearFila}
        />
      ) : null}
      {total > 0 && abierto ? (
        <div id={idPanel}>
          <div className="campo">
            <label htmlFor={idFiltro}>Filtrar por código o título</label>
            <input id={idFiltro} data-testid={idFiltro} type="search" maxLength={100} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          {grupo === "CAMBIO" ? (
            <>
              <p className="campo-ayuda">{TEXTO_NOTA_CAMBIARON}</p>
              {!soloLectura && items.length > 0 ? (
                <label>
                  <input
                    type="checkbox"
                    data-testid="casilla-marcar-grupo"
                    checked={marcablesPagina.length > 0 && marcablesPagina.every((i) => i.marcada)}
                    disabled={marcablesPagina.length === 0}
                    onChange={(e) => void marcarItems(marcablesPagina.map((i) => i.id), e.target.checked)}
                  />{" "}
                  Incluir todas las de esta página
                </label>
              ) : null}
              {errorMarca ? (
                <p className="mensaje-error-global" role="alert" data-testid="mensaje-error-global">
                  No fue posible guardar. Intenta nuevamente.
                </p>
              ) : null}
            </>
          ) : null}
          {grupo === "CON_ERROR" ? <p className="campo-ayuda">{TEXTO_NOTA_CON_ERROR}</p> : null}
          {grupo === "SIN_CAMBIOS" ? <p className="campo-ayuda">Estas filas ya están en Quality360 y no se modifican.</p> : null}

          {grupo === "NUEVA" && !soloLectura ? (
            <>
              <PanelAsignarGrupo
                consultaId={consulta.id}
                sugerencia={consulta.sugerencia}
                seleccion={seleccion}
                todoElGrupo={todoElGrupo}
                totalGrupo={datos?.total ?? total}
                filtro={q}
                onQuitarSeleccion={() => {
                  setSeleccion(new Set());
                  setTodoElGrupo(false);
                }}
                onAnunciar={onAnunciar}
                onRechazadas={setRechazadas}
                onErrorDeConsulta={onErrorDeConsulta}
                onVersion={onVersion}
              />
              {rechazadas.length > 0 ? (
                <div className="alerta-rechazadas" role="alert" tabIndex={-1} ref={alerta} data-testid="alerta-rechazadas">
                  <p>
                    <span aria-hidden="true">✕</span> <strong>{textoRechazadasTitulo(rechazadas.length)}</strong>
                  </p>
                  <ul>
                    {rechazadas.map((f) => (
                      <li key={f.itemId}>
                        <a href={`#fila-${f.codigo}`}>{f.codigo}</a> · {nombreRechazo(f)}
                      </li>
                    ))}
                  </ul>
                  <p>Las demás filas se actualizaron. Estas filas no cambiaron.</p>
                  <button type="button" className="boton boton--secundario" onClick={() => setRechazadas([])}>
                    Entendido
                  </button>
                </div>
              ) : null}
              <div className="grupo-consulta__acciones">
                <label>
                  <input
                    type="checkbox"
                    data-testid="casilla-seleccionar-grupo"
                    checked={paginaSeleccionada}
                    disabled={items.length === 0}
                    onChange={(e) => alternarPagina(e.target.checked)}
                  />{" "}
                  Seleccionar las {items.length} de esta página
                </label>
                <button type="button" className="boton boton--secundario" data-testid="boton-marcar-todas" onClick={() => void marcarTodasLasListas()}>
                  Incluir todas las listas
                </button>
              </div>
              {paginaSeleccionada && !todoElGrupo && (datos?.total ?? 0) > items.length ? (
                <p role="status" data-testid="banner-seleccion-pagina">
                  Se seleccionaron {textoFilas(items.length)} de esta página.{" "}
                  <button type="button" className="boton boton--secundario" data-testid="boton-seleccionar-todo-el-grupo" onClick={() => setTodoElGrupo(true)}>
                    Seleccionar las {datos?.total} filas del grupo
                  </button>
                  {conFiltro ? <span className="campo-ayuda"> Se seleccionan las filas que coinciden con el filtro.</span> : null}
                </p>
              ) : null}
              {todoElGrupo ? (
                <p role="status" data-testid="banner-seleccion-grupo">
                  Se seleccionaron las {datos?.total} filas del grupo.
                </p>
              ) : null}
            </>
          ) : null}

          <BloqueDatos clave={`consulta-${clave}`} estado={estado} mensajeVacio={conFiltro ? "No hay filas con ese filtro" : "Sin filas"} mensajeIndisponible="No pudimos cargar las filas" onReintentar={() => void consultaItems.refetch()}>
            {datos ? (
              <>
                {grupo === "NUEVA" ? (
                  <ul className="lista-filas-asignacion" data-testid="lista-filas-nuevas">
                    {items.map((item) => (
                      <TarjetaFilaNueva
                        key={item.id}
                        item={item}
                        consultaId={consulta.id}
                        seleccionada={todoElGrupo || seleccion.has(item.id)}
                        onSeleccion={alternarFila}
                        onAnunciar={onAnunciar}
                        onErrorDeConsulta={onErrorDeConsulta}
                        onVersion={onVersion}
                        soloLectura={soloLectura}
                        onVerDetalle={abrirDetalle}
                        alCrear={alCrearFila}
                      />
                    ))}
                  </ul>
                ) : (
                  <TablaBandeja
                    testId={`tabla-${clave}`}
                    caption={`${titulo}: filas de la consulta`}
                    columnas={grupo === "CAMBIO" ? columnasCambio : columnasLectura}
                    items={items}
                    clave={(i) => i.id}
                    testIdFila={(i) => `fila-${i.codigo ?? i.id}`}
                    focoPagina={pagina}
                  />
                )}
                <Paginacion
                  clave={clave}
                  etiqueta={`filas de ${titulo}`}
                  total={datos.total}
                  pagina={datos.pagina}
                  tamano={datos.tamanoPagina}
                  onPagina={(p) => {
                    setPagina(p);
                    encabezado.current?.focus();
                  }}
                />
              </>
            ) : null}
          </BloqueDatos>
        </div>
      ) : null}
    </section>
  );
}
