import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { esIndisponible, useEjecucion, useFilasEjecucion } from "@/api/integraciones";
import { BloqueDatos, type EstadoDatos } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import type { FiltrosUrl } from "@/lib/filtrosUrl";
import { formatearFecha } from "@/lib/formato";
import { textoMotivo } from "@/lib/mensajesIntegracion";
import { RUTAS_INTEGRACIONES } from "@/lib/rutasIntegraciones";
import { formatearDuracion, formatearTamano, origenDe } from "@/lib/textosEjecucion";
import { ErrorApi } from "@/lib/httpClient";
import { ETIQUETAS_ROL, type Ejecucion, type FilaEjecucion } from "@/types/dominio";
import { CeldaCambios } from "./CeldaCambios";
import { ErrorIntegracion } from "./ErrorIntegracion";
import { ChipsAdvertencias, InsigniaFilaEjecucion, InsigniaResultado } from "./Insignias";
import { ResumenEjecucion } from "./ResumenEjecucion";

interface Props {
  id: string;
  filtros: FiltrosUrl;
  soloLectura: boolean;
  /** Ejecución de Jira `INCOMPLETA` que «Continuar» retomaría (solo Administrador). */
  continuarId?: string;
}

const CLAVES_DETALLE = ["ejecucion", "solo-errores", "fpagina"];

/** Detalle de una ejecución (`?ejecucion=<id>`): cabecera, error global, resumen, filtro «solo errores» y filas (D106, D126). */
export function DetalleEjecucion({ id, filtros, soloLectura, continuarId }: Props) {
  const ejecucion = useEjecucion(id);
  const soloErrores = filtros.get("solo-errores") === "1";
  const pagina = Number(filtros.get("fpagina")) > 0 ? Number(filtros.get("fpagina")) : 1;
  const filas = useFilasEjecucion(id, { soloErrores, pagina });
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titulo.current?.focus();
  }, [id, ejecucion.isSuccess]);

  const volver = () => {
    const params = new URLSearchParams(filtros.params);
    for (const clave of CLAVES_DETALLE) params.delete(clave);
    const texto = params.toString();
    return texto ? `?${texto}` : "?";
  };

  // Inexistente o ajena: el mismo mensaje para todos (no revela si existe).
  if (ejecucion.isError && ejecucion.error instanceof ErrorApi && (ejecucion.error.status === 404 || ejecucion.error.status === 403)) {
    return (
      <div className="panel" data-testid="estado-vacio-ejecucion" role="status">
        <p>No encontramos esa ejecución o no tienes acceso a ella</p>
        <Link to={volver()} data-testid="enlace-volver-historial">
          Volver al historial
        </Link>
      </div>
    );
  }

  let estadoCabecera: EstadoDatos;
  if (ejecucion.isError) estadoCabecera = esIndisponible(ejecucion.error) ? "indisponible" : "error";
  else if (ejecucion.isLoading || !ejecucion.data) estadoCabecera = "cargando";
  else estadoCabecera = "ok";

  return (
    <div data-testid="detalle-ejecucion">
      <p>
        <Link to={volver()} data-testid="enlace-volver-historial">
          ← Volver al historial
        </Link>
      </p>
      <BloqueDatos clave="cabecera-ejecucion" estado={estadoCabecera} onReintentar={() => void ejecucion.refetch()}>
        {ejecucion.data ? (
          <>
            <Cabecera ejecucion={ejecucion.data} titulo={titulo} soloLectura={soloLectura} continuarId={continuarId} />
            <Filas ejecucion={ejecucion.data} filas={filas} soloErrores={soloErrores} pagina={pagina} filtros={filtros} />
          </>
        ) : null}
      </BloqueDatos>
    </div>
  );
}

function Cabecera({ ejecucion: e, titulo, soloLectura, continuarId }: { ejecucion: Ejecucion; titulo: React.RefObject<HTMLHeadingElement | null>; soloLectura: boolean; continuarId?: string }) {
  const acciones = soloLectura ? undefined : { irAConexion: RUTAS_INTEGRACIONES.conexion, importarArchivo: RUTAS_INTEGRACIONES.importar };
  return (
    <section className="panel" aria-labelledby="titulo-detalle-ejecucion">
      <div className="panel-resultado__cabecera">
        <h2 id="titulo-detalle-ejecucion" ref={titulo} tabIndex={-1}>
          Ejecución del {formatearFecha(e.iniciadaEn)}
        </h2>
        <span>
          Resultado: <InsigniaResultado resultado={e.resultado} testId="resultado-ejecucion" />
        </span>
      </div>
      <dl className="detalle-ejecucion__meta">
        <div>
          <dt>Origen</dt>
          <dd>{origenDe(e)}{e.archivo ? ` (${formatearTamano(e.archivo.tamano)})` : ""}</dd>
        </div>
        <div>
          <dt>Ejecutó</dt>
          <dd>
            {e.actor.nombre} · {ETIQUETAS_ROL[e.actor.rol]}
          </dd>
        </div>
        {e.archivo ? (
          <div>
            <dt>Huella</dt>
            <dd title={e.archivo.huella}>{e.archivo.huella.slice(0, 12)}… (SHA-256)</dd>
          </div>
        ) : null}
        <div>
          <dt>Duración</dt>
          <dd>{formatearDuracion(e.duracionMs)}</dd>
        </div>
        <div>
          <dt>Opciones</dt>
          <dd>
            Modo estricto: {e.estricto ? "sí" : "no"} · Vincular HDU manuales: {e.vincularExistentes ? "sí" : "no"}
          </dd>
        </div>
        {e.origen === "JIRA" ? (
          <div>
            <dt>Proyecto</dt>
            <dd>
              {e.proyecto ?? "—"} · {e.sitioHost ?? "—"}
            </dd>
          </div>
        ) : null}
        {e.origen === "JIRA" ? (
          <div>
            <dt>Esperas por límite de tasa</dt>
            <dd>{e.reintentos429 > 0 ? `${e.reintentos429} (${e.eventos.map((v) => `${(v.esperaMs / 1000).toLocaleString("es-CL", { minimumFractionDigits: 1 })} s`).join(" y ")})` : "0"}</dd>
          </div>
        ) : null}
      </dl>
      {e.archivo ? <p className="campo-ayuda">Quality360 guarda la huella y el nombre del archivo, no su contenido.</p> : null}

      {e.codigoError ? (
        <ErrorIntegracion testId="error-ejecucion" codigo={e.codigoError} contexto={{ conError: e.conError }} sugerencias={e.sugerencias} acciones={acciones} enfocar={false} />
      ) : null}
      {!soloLectura && continuarId === e.id ? (
        <p className="mensaje-aviso" role="note">
          <Link to={RUTAS_INTEGRACIONES.sincronizar}>Ir a Sincronizar para continuar</Link>
        </p>
      ) : null}
      <ResumenEjecucion ejecucion={e} enCurso={e.resultado === "EN_CURSO"} />
    </section>
  );
}

type ConsultaFilas = ReturnType<typeof useFilasEjecucion>;

function Filas({ ejecucion: e, filas, soloErrores, pagina, filtros }: { ejecucion: Ejecucion; filas: ConsultaFilas; soloErrores: boolean; pagina: number; filtros: FiltrosUrl }) {
  const datos = filas.data;
  let estado: EstadoDatos;
  if (filas.isError) estado = esIndisponible(filas.error) ? "indisponible" : "error";
  else if (filas.isLoading || !datos) estado = "cargando";
  else if (datos.items.length === 0) estado = "vacio";
  else estado = "ok";

  const columnas: Columna<FilaEjecucion>[] = [
    { id: "resultado", titulo: "Resultado", prioritaria: true, render: (f) => <InsigniaFilaEjecucion resultado={f.resultado} /> },
    { id: "fila", titulo: "Fila", prioritaria: true, render: (f) => f.fila },
    {
      id: "codigo",
      titulo: "Código",
      render: (f) =>
        f.codigo ? f.idHistoria ? (
          <Link className="codigo" to={`/hdu/${f.idHistoria}`}>
            {f.codigo}
          </Link>
        ) : (
          <span className="codigo">{f.codigo}</span>
        ) : (
          "—"
        ),
    },
    {
      id: "titulo",
      titulo: "Título",
      render: (f) => (
        <span className="celda-titulo-corta" title={f.titulo ?? undefined}>
          {f.titulo ?? "—"}
        </span>
      ),
    },
    {
      id: "motivo",
      titulo: "Motivo",
      render: (f) => (
        <>
          {f.motivo ? textoMotivo(f.motivo) : "—"}
          <ChipsAdvertencias advertencias={f.advertencias} />
        </>
      ),
    },
    { id: "cambios", titulo: "Cambios", render: (f) => <CeldaCambios cambios={f.cambios} /> },
    ...(e.origen === "JIRA"
      ? [
          {
            id: "referencia",
            titulo: "Referencia de Jira (no se guarda)",
            render: (f: FilaEjecucion) => (f.referencia ? `Estado: ${f.referencia.estado ?? "—"} · Responsable: ${f.referencia.responsable ?? "—"}` : "—"),
          } satisfies Columna<FilaEjecucion>,
        ]
      : []),
  ];

  const ocultas = datos?.filasOcultas ?? 0;
  const mensajeVacio = soloErrores ? "Ninguna fila con error" : ocultas > 0 ? "No hay filas de tu ámbito en esta ejecución." : "Esta ejecución no registró filas";

  return (
    <section className="panel" aria-labelledby="titulo-filas-ejecucion">
      <h2 id="titulo-filas-ejecucion">Filas de la ejecución</h2>
      {ocultas > 0 ? (
        <p className="mensaje-aviso" role="status" data-testid="filas-ocultas">
          {ocultas} {ocultas === 1 ? "fila de HDU fuera de tu ámbito" : "filas de HDU fuera de tu ámbito"}
        </p>
      ) : null}
      <div className="campo">
        <label htmlFor="filtro-solo-errores">
          <input
            id="filtro-solo-errores"
            data-testid="filtro-solo-errores"
            type="checkbox"
            checked={soloErrores}
            onChange={(ev) => filtros.set({ "solo-errores": ev.target.checked ? "1" : undefined, fpagina: undefined, pagina: filtros.get("pagina") || undefined })}
          />{" "}
          Solo filas con error
        </label>
      </div>
      {datos ? (
        <p role="status" data-testid="total-detalle-ejecucion">
          {datos.total} {datos.total === 1 ? "fila" : "filas"}
        </p>
      ) : null}
      <BloqueDatos clave="detalle-ejecucion" estado={estado} mensajeVacio={mensajeVacio} tonoVacio={soloErrores ? "exito" : undefined} onReintentar={() => void filas.refetch()}>
        {datos ? (
          <>
            <TablaBandeja
              testId="lista-detalle-ejecucion"
              caption="Filas de la ejecución, en el orden del origen"
              columnas={columnas}
              items={datos.items}
              clave={(f) => String(f.fila)}
              testIdFila={(f) => `fila-detalle-${f.fila}`}
              focoPagina={pagina}
            />
            <Paginacion
              clave="detalle-ejecucion"
              etiqueta="filas de la ejecución"
              total={datos.total}
              pagina={datos.pagina}
              tamano={datos.tamanoPagina}
              onPagina={(p) => filtros.set({ fpagina: p > 1 ? String(p) : undefined, pagina: filtros.get("pagina") || undefined })}
            />
          </>
        ) : null}
      </BloqueDatos>
    </section>
  );
}
