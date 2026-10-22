import { useId } from "react";
import { useLocation } from "react-router-dom";
import { useBandejaLider } from "@/api/bandejas";
import { BloqueEstado } from "@/components/BloqueEstado";
import type { CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { BotonDescargaCertificado } from "@/components/bandeja/BotonDescargaCertificado";
import { CeldaNoDisponible } from "@/components/bandeja/Celdas";
import { AvisoSoloLectura, BloqueDatos, EncabezadoBandeja, GrupoContadores, type EstadoDatos } from "@/components/bandeja/Estructura";
import { PanelListaHdu } from "@/components/bandeja/PanelListaHdu";
import { TablaBandeja, type Columna } from "@/components/bandeja/TablaBandeja";
import { TarjetaContador } from "@/components/bandeja/TarjetaContador";
import { columnasHdu } from "@/components/bandeja/columnasHdu";
import { useOpcionesCatalogo } from "@/components/bandeja/opciones";
import { useUsuariosOpciones } from "@/components/bandeja/useUsuariosOpciones";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { ESTADOS_HDU, ETIQUETAS_ESTADO_HDU, type EstadoHdu, type ItemBandejaHdu, type ResumenCelulaLider } from "@/types/dominio";

/**
 * Bandeja del Líder QA (E7-F04), solo lectura: sus células, el resumen por célula y todas las HDU de ellas.
 * Sin células no se muestran contadores ni tabla (nada de cifras ficticias).
 */
export function LiderBandejaPage() {
  const filtros = useFiltrosUrl();
  const bandeja = useBandejaLider(filtros);
  const ubicacion = useLocation();
  const idResumen = useId();
  const { opcionesSprint, opcionesEstado } = useOpcionesCatalogo();

  const datos = bandeja.data;
  const { opcionesQe, opcionesAnalista } = useUsuariosOpciones(datos?.hdu.estado === "ok" ? datos.hdu.datos.items : undefined);
  const celulas = datos?.celulas.estado === "ok" ? datos.celulas.datos.items : undefined;
  const sinCelulas = celulas !== undefined && celulas.length === 0;

  const campos: CampoFiltro[] = [
    // Solo las células vigentes del líder (el filtro no ofrece las quitadas).
    { clave: "celula", id: "filtro-celula", etiqueta: "Célula", tipo: "select", opciones: celulas?.map((c) => ({ valor: c.id, etiqueta: c.nombre })) ?? [], vacio: "Todas las mías" },
    { clave: "sprint", id: "filtro-sprint", etiqueta: "Sprint", tipo: "select", opciones: opcionesSprint },
    { clave: "estado", id: "filtro-estado", etiqueta: "Estado", tipo: "select", opciones: opcionesEstado },
    { clave: "qe", id: "filtro-qe", etiqueta: "QE responsable", tipo: "select", opciones: opcionesQe },
    { clave: "analista", id: "filtro-analista", etiqueta: "Analista", tipo: "select", opciones: opcionesAnalista },
    { clave: "sin-analista", id: "filtro-sin-analista", etiqueta: "Sin analista", tipo: "casilla" },
    { clave: "q", id: "filtro-busqueda", etiqueta: "Buscar por código o título", tipo: "texto" },
  ];

  const c = columnasHdu(`${ubicacion.pathname}${ubicacion.search}`);
  const certificado: Columna<ItemBandejaHdu> = {
    ...c.certificado,
    render: (h) => {
      if (h.seguimiento.estado !== "ok") return <CeldaNoDisponible clave="certificado" />;
      const cert = h.seguimiento.datos.certificado;
      if (!cert) return <span data-testid={`celda-certificado-${h.id}`}>—</span>;
      return (
        <span data-testid={`celda-certificado-${h.id}`}>
          {cert.folio} <BotonDescargaCertificado hduId={h.id} folio={cert.folio} testId={`boton-descargar-certificado-${h.id}`} />
        </span>
      );
    },
  };

  const resumen = datos?.resumenPorCelula;
  const estadoResumen: EstadoDatos = bandeja.isError ? "error" : bandeja.isLoading || !resumen ? "cargando" : resumen.estado !== "ok" ? "indisponible" : "ok";

  const colResumen: Columna<ResumenCelulaLider>[] = [
    { id: "celula", titulo: "Célula", render: (f) => f.celula.nombre },
    ...ESTADOS_HDU.map(
      (e: EstadoHdu): Columna<ResumenCelulaLider> => ({ id: e, titulo: ETIQUETAS_ESTADO_HDU[e], render: (f) => f.porEstado[e] }),
    ),
    {
      id: "avance",
      titulo: "Avance promedio (abiertas)",
      render: (f) =>
        f.avancePromedioAbiertas.estado !== "ok" ? (
          <CeldaNoDisponible clave="avance-promedio" />
        ) : f.avancePromedioAbiertas.datos.porcentaje === null ? (
          "—"
        ) : (
          `${f.avancePromedioAbiertas.datos.porcentaje} %`
        ),
    },
  ];

  return (
    <div data-testid="bandeja-lider">
      <EncabezadoBandeja etiqueta="Portal Líder QA" descripcion="Estado de las HDU y la certificación de las células que tienes a cargo.">
        {celulas && celulas.length > 0 ? (
          <ul className="chips" aria-label="Células a cargo" data-testid="chips-celulas">
            {celulas.map((cel) => (
              <li className="chip" key={cel.id} data-testid={`chip-celula-${cel.id}`}>
                {cel.nombre}
              </li>
            ))}
          </ul>
        ) : null}
        <AvisoSoloLectura />
      </EncabezadoBandeja>

      {bandeja.isError ? <BloqueEstado id="bandeja-lider" estado="error" onReintentar={() => bandeja.refetch()} /> : null}
      {bandeja.isLoading ? <BloqueEstado id="bandeja-lider" estado="cargando" /> : null}

      {sinCelulas ? (
        <div data-testid="estado-vacio-celulas">
          <BloqueEstado id="celulas" estado="vacio" mensaje="Aún no tienes células asignadas. Pide al Administrador que te las asigne" />
        </div>
      ) : datos ? (
        <>
          <GrupoContadores compacto>
            <TarjetaContador consulta={bandeja} id="celulas" clave="celulas" titulo="Células" contador={datos.contadores.celulas} />
            <TarjetaContador consulta={bandeja} id="hdu-abiertas" clave="hdu-abiertas" titulo="HDU abiertas" contador={datos.contadores.hduAbiertas} />
            <TarjetaContador consulta={bandeja} id="hdu-cerradas" clave="hdu-cerradas" titulo="HDU cerradas" contador={datos.contadores.hduCerradas} />
            <TarjetaContador consulta={bandeja} id="sin-analista" clave="sin-analista" titulo="Sin analista" contador={datos.contadores.sinAnalista} atencion />
            <TarjetaContador consulta={bandeja} id="certificados" clave="certificados" titulo="Certificados" contador={datos.contadores.certificados} />
          </GrupoContadores>

          <section className="panel" aria-labelledby={idResumen}>
            <div className="panel-cabecera">
              <h2 id={idResumen}>Resumen por célula</h2>
            </div>
            <BloqueDatos clave="resumen-celulas" estado={estadoResumen} onReintentar={() => bandeja.refetch()}>
              {resumen?.estado === "ok" ? (
                <TablaBandeja
                  testId="lista-resumen-celulas"
                  caption="HDU por estado en cada una de tus células"
                  columnas={colResumen}
                  items={resumen.datos.items}
                  clave={(f) => f.celula.id}
                  testIdFila={(f) => `fila-celula-${f.celula.id}`}
                />
              ) : null}
            </BloqueDatos>
          </section>

          <PanelListaHdu
            clave="hdu-lider"
            titulo="HDU de mis células"
            consulta={bandeja}
            bloque={datos.hdu}
            filtros={filtros}
            campos={campos}
            caption="HDU de mis células"
            testIdTabla="lista-hdu-lider"
            vacioSinFiltros="Tus células aún no tienen HDU"
            columnas={[c.codigo, c.titulo, c.celula, c.sprint, c.prioridad, c.estado, c.qe, c.analista, c.avance, certificado, c.actualizada]}
          />
        </>
      ) : null}
    </div>
  );
}
