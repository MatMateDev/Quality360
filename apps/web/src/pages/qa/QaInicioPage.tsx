import { Link, useLocation } from "react-router-dom";
import { useBandejaAnalista } from "@/api/bandejas";
import { useInicioQa } from "@/api/inicio";
import { BloqueEstado } from "@/components/BloqueEstado";
import { TarjetaMetrica } from "@/components/TarjetaMetrica";
import type { CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { EncabezadoBandeja, GrupoContadores } from "@/components/bandeja/Estructura";
import { PanelListaHdu } from "@/components/bandeja/PanelListaHdu";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";
import { columnasHdu } from "@/components/bandeja/columnasHdu";
import { useOpcionesCatalogo } from "@/components/bandeja/opciones";
import { useFiltrosUrl } from "@/lib/filtrosUrl";

/**
 * Bandeja del Analista QA (E7-F02) sobre el inicio certificado de E1-F06: se conservan el QE supervisor
 * («Sin supervisor asignado» si no tiene) y «HDU asignadas», y se agregan los contadores de trabajo y «Mis HDU».
 */
export function QaInicioPage() {
  const inicioQuery = useInicioQa();
  const filtros = useFiltrosUrl();
  const bandeja = useBandejaAnalista(filtros);
  const ubicacion = useLocation();
  const { opcionesCelula, opcionesSprint, opcionesEstado } = useOpcionesCatalogo();

  const campos: CampoFiltro[] = [
    { clave: "estado", id: "filtro-estado", etiqueta: "Estado", tipo: "select", opciones: opcionesEstado },
    { clave: "celula", id: "filtro-celula", etiqueta: "Célula", tipo: "select", opciones: opcionesCelula, vacio: "Todas" },
    { clave: "sprint", id: "filtro-sprint", etiqueta: "Sprint", tipo: "select", opciones: opcionesSprint },
    { clave: "solo-obs", id: "filtro-solo-observaciones", etiqueta: "Solo con observaciones", tipo: "casilla" },
    { clave: "solo-bloq", id: "filtro-solo-bloqueadas", etiqueta: "Solo bloqueadas", tipo: "casilla" },
    { clave: "q", id: "filtro-busqueda", etiqueta: "Buscar por código o título", tipo: "texto" },
  ];

  const c = columnasHdu(`${ubicacion.pathname}${ubicacion.search}`);
  const datos = bandeja.data;

  return (
    <div data-testid="bandeja-analista">
      <EncabezadoBandeja etiqueta="Portal Analista QA" descripcion="Tu supervisor, lo que te falta hacer y tus historias asignadas." />

      {inicioQuery.isLoading ? <BloqueEstado id="inicio-qa" estado="cargando" /> : null}
      {inicioQuery.isError ? <BloqueEstado id="inicio-qa" estado="error" onReintentar={() => inicioQuery.refetch()} /> : null}

      {inicioQuery.data ? (
        <div className="tarjetas-resumen">
          <article className="tarjeta-resumen" data-testid="tarjeta-supervisor">
            <span className="tarjeta-resumen__titulo">QE supervisor</span>
            {inicioQuery.data.supervisor.estado === "ok" ? (
              <strong className="tarjeta-resumen__valor" data-testid="valor-supervisor">
                {inicioQuery.data.supervisor.datos.supervisor?.nombre ?? "Sin supervisor asignado"}
              </strong>
            ) : (
              <BloqueEstado id="supervisor" estado={inicioQuery.data.supervisor.estado} />
            )}
          </article>

          <TarjetaMetrica
            id="hdu-qa"
            titulo="HDU asignadas"
            estado={inicioQuery.data.hdu.estado}
            valor={inicioQuery.data.hdu.estado === "ok" ? inicioQuery.data.hdu.datos.hduAsignadas : undefined}
            onReintentar={() => inicioQuery.refetch()}
          />
        </div>
      ) : null}

      <GrupoContadores compacto>
        <TarjetaContador consulta={bandeja} id="abiertas" clave="abiertas" titulo="Abiertas" contador={datos?.contadores.abiertas} />
        <TarjetaContador
          consulta={bandeja}
          id="con-observaciones"
          clave="con-observaciones"
          titulo="Con observaciones"
          contador={datos?.contadores.conObservaciones}
          atencion
        />
        <TarjetaContador
          consulta={bandeja}
          id="esperando-aprobacion"
          clave="esperando-aprobacion"
          titulo="Esperando aprobación"
          contador={datos?.contadores.esperandoAprobacion}
        />
      </GrupoContadores>

      {/* E4: sin riesgo (D73). Debajo de los contadores certificados. */}
      <GrupoContadores titulo="Impedimentos" compacto>
        <TarjetaContador
          consulta={bandeja}
          id="impedimentos-abiertos"
          clave="impedimentos-abiertos"
          titulo="Impedimentos abiertos"
          contador={datos?.impedimentos?.contadores.impedimentosAbiertos}
          atencion
        />
      </GrupoContadores>

      <PanelListaHdu
        clave="mis-hdu"
        titulo="Mis HDU"
        descripcion="Ordenadas por lo que te falta hacer."
        consulta={bandeja}
        bloque={datos?.hdu}
        filtros={filtros}
        campos={campos}
        caption="Mis HDU, ordenadas por lo que te falta hacer"
        testIdTabla="lista-mis-hdu"
        vacioSinFiltros="No tienes HDU asignadas"
        columnas={[c.codigo, c.titulo, c.celula, c.sprint, c.prioridad, c.estado, c.avance, c.siguiente, c.observaciones, c.actualizada, c.bloqueo]}
      />

      <div className="panel">
        <div className="panel-cabecera">
          <h2>Accesos rápidos</h2>
        </div>
        <div className="enlaces-rapidos">
          <Link className="boton boton--secundario" to="/qa/hdu">
            Ver mis HDU
          </Link>
        </div>
      </div>
    </div>
  );
}
