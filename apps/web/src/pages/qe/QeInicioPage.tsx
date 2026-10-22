import { useId } from "react";
import { Link } from "react-router-dom";
import { useBandejaQe } from "@/api/bandejas";
import { useAnalistasAsignables } from "@/api/equipo";
import { useInicioQe } from "@/api/inicio";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import { BarraFiltros, type CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { BloqueDatos, EncabezadoBandeja, GrupoContadores, type EstadoDatos } from "@/components/bandeja/Estructura";
import { Paginacion } from "@/components/bandeja/Paginacion";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";
import { useOpcionesCatalogo } from "@/components/bandeja/opciones";
import { hayFiltrosActivos, useFiltrosUrl } from "@/lib/filtrosUrl";
import { ETIQUETAS_TIPO_ACCION_QE, type AccionPendienteQe, type TipoAccionQe } from "@/types/dominio";

const ICONO_ACCION: Record<TipoAccionQe, string> = { APROBAR: "◐", ASIGNAR: "◌", CERTIFICAR: "✓", CERRAR: "■" };
const SEGMENTO_BOTON: Record<TipoAccionQe, string> = { APROBAR: "aprobar", ASIGNAR: "asignar", CERTIFICAR: "certificar", CERRAR: "cerrar" };
const ETIQUETA_BOTON: Record<TipoAccionQe, string> = { APROBAR: "Aprobar", ASIGNAR: "Asignar", CERTIFICAR: "Certificar", CERRAR: "Cerrar" };
const NOMBRE_ACCESIBLE: Record<TipoAccionQe, string> = {
  APROBAR: "Aprobar entregables de",
  ASIGNAR: "Asignar analista a",
  CERTIFICAR: "Certificar",
  CERRAR: "Cerrar",
};

/** La bandeja nunca ejecuta la acción: lleva a la pantalla donde se hace (diseño E7 §2.2). */
function destinoAccion(a: AccionPendienteQe): string {
  switch (a.tipo) {
    case "APROBAR":
      return `/qe/aprobaciones?hdu=${a.hdu.id}`;
    case "ASIGNAR":
      return `/hdu/${a.hdu.id}#asignacion`;
    case "CERTIFICAR":
      return `/hdu/${a.hdu.id}#certificado`;
    default:
      return `/hdu/${a.hdu.id}#estado`;
  }
}

function textoAccion(a: AccionPendienteQe): string {
  if (a.tipo === "APROBAR") {
    const n = a.entregablesPorAprobar ?? 0;
    return `Aprobar ${n} ${n === 1 ? "entregable" : "entregables"}`;
  }
  return ETIQUETAS_TIPO_ACCION_QE[a.tipo];
}

function textoAntiguedad(dias: number): string {
  if (dias <= 0) return "Hoy";
  return dias === 1 ? "1 día" : `${dias} días`;
}

/**
 * Bandeja del QE (E7-F03): contadores de acción y «Requiere mi acción» arriba (trabajo); debajo, el resumen
 * de equipo certificado de E1-F03 y los accesos rápidos de siempre.
 */
export function QeInicioPage() {
  const inicioQuery = useInicioQe();
  const filtros = useFiltrosUrl();
  const bandeja = useBandejaQe(filtros);
  const analistas = useAnalistasAsignables();
  const { opcionesCelula, opcionesSprint } = useOpcionesCatalogo();
  const idTitulo = useId();

  const datos = bandeja.data;
  const campos: CampoFiltro[] = [
    {
      clave: "tipo",
      id: "filtro-tipo-accion",
      etiqueta: "Tipo de acción",
      tipo: "select",
      vacio: "Todas",
      opciones: (Object.keys(ETIQUETAS_TIPO_ACCION_QE) as TipoAccionQe[]).map((t) => ({ valor: t, etiqueta: ETIQUETAS_TIPO_ACCION_QE[t] })),
    },
    { clave: "celula", id: "filtro-celula", etiqueta: "Célula", tipo: "select", opciones: opcionesCelula, vacio: "Todas" },
    { clave: "sprint", id: "filtro-sprint", etiqueta: "Sprint", tipo: "select", opciones: opcionesSprint },
    {
      clave: "analista",
      id: "filtro-analista",
      etiqueta: "Analista",
      tipo: "select",
      opciones: analistas.data?.items.map((a) => ({ valor: a.id, etiqueta: a.nombre })) ?? [],
    },
    { clave: "q", id: "filtro-busqueda", etiqueta: "Buscar por código o título", tipo: "texto" },
  ];
  const conFiltros = hayFiltrosActivos(filtros, campos.map((c) => c.clave));

  const bloque = datos?.acciones;
  const lista = bloque?.estado === "ok" ? bloque.datos : undefined;
  let estado: EstadoDatos;
  if (bandeja.isError) estado = "error";
  else if (bandeja.isLoading || !bloque) estado = "cargando";
  else if (bloque.estado !== "ok") estado = "indisponible";
  else if (bloque.datos.total === 0) estado = "vacio";
  else estado = "ok";

  const columnas: Columna<AccionPendienteQe>[] = [
    {
      id: "hdu",
      titulo: "HDU",
      render: (a) => (
        <Link className="codigo" to={`/hdu/${a.hdu.id}`}>
          {a.hdu.codigo}
        </Link>
      ),
    },
    { id: "titulo", titulo: "Título", render: (a) => <span className="celda-titulo">{a.hdu.titulo}</span> },
    { id: "celula", titulo: "Célula", render: (a) => a.hdu.celula.nombre },
    { id: "sprint", titulo: "Sprint", render: (a) => a.hdu.sprint.nombre },
    { id: "analista", titulo: "Analista", render: (a) => a.hdu.analista?.nombre ?? "Sin asignar" },
    {
      id: "accion",
      titulo: "Acción pendiente",
      render: (a) => (
        <span className="badge badge-accion" data-testid={`celda-accion-${a.hdu.id}`}>
          <span aria-hidden="true">{ICONO_ACCION[a.tipo]} </span>
          {textoAccion(a)}
        </span>
      ),
    },
    {
      id: "antiguedad",
      titulo: "Antigüedad",
      render: (a) => (
        <time dateTime={a.esperandoDesde} data-testid={`celda-antiguedad-${a.hdu.id}`}>
          {textoAntiguedad(a.antiguedadDias)}
        </time>
      ),
    },
    {
      id: "boton",
      titulo: "Acción",
      render: (a) => (
        <Link
          className="boton boton--primario"
          to={destinoAccion(a)}
          data-testid={`boton-accion-${a.hdu.id}-${SEGMENTO_BOTON[a.tipo]}`}
          aria-label={`${NOMBRE_ACCESIBLE[a.tipo]} ${a.hdu.codigo}`}
        >
          {ETIQUETA_BOTON[a.tipo]}
        </Link>
      ),
    },
  ];

  const por = datos?.contadores.porAprobar;
  const hduPorAprobar = por?.estado === "ok" ? por.datos.hdu : 0;

  return (
    <div data-testid="bandeja-qe">
      <EncabezadoBandeja etiqueta="Portal QE" descripcion="Lo que requiere tu acción y el resumen de tu equipo." />

      <GrupoContadores compacto>
        <TarjetaContador
          consulta={bandeja}
          id="por-aprobar"
          clave="por-aprobar"
          titulo="Por aprobar"
          contador={por}
          atencion
          detalle={() => (
            <span data-testid="contador-por-aprobar-hdu">
              en {hduPorAprobar} HDU
            </span>
          )}
        />
        <TarjetaContador consulta={bandeja} id="sin-analista" clave="sin-analista" titulo="Sin analista" contador={datos?.contadores.sinAnalista} atencion />
        <TarjetaContador
          consulta={bandeja}
          id="listas-certificar"
          clave="listas-certificar"
          titulo="Listas para certificar"
          contador={datos?.contadores.listasCertificar}
          atencion
        />
        <TarjetaContador consulta={bandeja} id="listas-cerrar" clave="listas-cerrar" titulo="Listas para cerrar" contador={datos?.contadores.listasCerrar} atencion />
      </GrupoContadores>

      <section className="panel" aria-labelledby={idTitulo} aria-busy={estado === "cargando"}>
        <div className="panel-cabecera">
          <div>
            <h2 id={idTitulo}>Requiere mi acción</h2>
            <p>Las más antiguas primero. Esta bandeja no ejecuta nada: te lleva a la pantalla donde se hace.</p>
          </div>
        </div>
        <BarraFiltros filtros={filtros} campos={campos} clave="requiere-accion" total={lista?.total} etiquetaPlural="resultados" />

        {lista?.calculoParcial ? (
          <div data-testid="estado-indisponible-requiere-accion-parcial">
            <BloqueEstado
              id="requiere-accion-parcial"
              estado="indisponible"
              mensaje="Algunas acciones no se pueden calcular ahora (Certificaciones no disponible)"
              onReintentar={() => bandeja.refetch()}
            />
          </div>
        ) : null}

        <BloqueDatos
          clave={conFiltros && estado === "vacio" ? "filtros-requiere-accion" : "requiere-accion"}
          estado={estado}
          mensajeVacio={conFiltros ? "No hay acciones con esos filtros" : "No tienes acciones pendientes"}
          onReintentar={() => bandeja.refetch()}
        >
          {lista ? (
            <>
              <TablaBandeja
                testId="lista-requiere-accion"
                caption="Acciones pendientes del QE, de la más antigua a la más reciente"
                columnas={columnas}
                items={lista.items}
                clave={(a) => `${a.hdu.id}-${a.tipo}`}
                testIdFila={(a) => `fila-accion-${a.hdu.id}-${SEGMENTO_BOTON[a.tipo]}`}
                focoPagina={filtros.pagina}
              />
              <Paginacion
                clave="requiere-accion"
                etiqueta="Requiere mi acción"
                total={lista.total}
                pagina={lista.pagina}
                tamano={lista.tamanoPagina}
                onPagina={(p) => filtros.set({ pagina: String(p) })}
                onTamano={(t) => filtros.set({ tamano: t === 25 ? undefined : String(t) })}
              />
            </>
          ) : null}
        </BloqueDatos>
      </section>

      {inicioQuery.isLoading ? <BloqueEstado id="inicio-qe" estado="cargando" /> : null}
      {inicioQuery.isError ? <BloqueEstado id="inicio-qe" estado="error" onReintentar={() => inicioQuery.refetch()} /> : null}

      {inicioQuery.data ? (
        <div className="tarjetas-resumen">
          <TarjetaMetrica
            id="equipo"
            titulo="Analistas supervisados"
            estado={inicioQuery.data.equipo.estado}
            valor={inicioQuery.data.equipo.estado === "ok" ? inicioQuery.data.equipo.datos.analistasVigentes : undefined}
          />
          <TarjetaMetrica
            id="hdu-qe"
            titulo="HDU bajo supervisión"
            estado={inicioQuery.data.hdu.estado}
            valor={inicioQuery.data.hdu.estado === "ok" ? inicioQuery.data.hdu.datos.hduEnAmbito : undefined}
          />
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-cabecera">
          <h2>Accesos rápidos</h2>
        </div>
        <div className="enlaces-rapidos">
          <Link className="boton boton--secundario" to="/qe/equipo">
            Ver equipo
          </Link>
          <Link className="boton boton--secundario" to="/qe/hdu">
            Ver historias supervisadas
          </Link>
          {/* E3-F03#3: la bandeja va en accesos rápidos para respetar el menú de E1-F02#3. */}
          <Link className="boton boton--primario" to="/qe/aprobaciones" data-testid="enlace-aprobaciones-pendientes">
            Aprobaciones pendientes
          </Link>
        </div>
      </div>
    </div>
  );
}
