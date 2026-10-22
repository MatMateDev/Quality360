import { useLocation } from "react-router-dom";
import { useBandejaAuditor } from "@/api/bandejas";
import type { CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { BotonExportarCsv } from "@/components/bandeja/BotonExportarCsv";
import { BotonDescargaCertificado } from "@/components/bandeja/BotonDescargaCertificado";
import { CeldaNoDisponible } from "@/components/bandeja/Celdas";
import { PanelListaHdu } from "@/components/bandeja/PanelListaHdu";
import type { Columna } from "@/components/bandeja/TablaBandeja";
import { columnasHdu } from "@/components/bandeja/columnasHdu";
import { useOpcionesCatalogo } from "@/components/bandeja/opciones";
import { useUsuariosOpciones } from "@/components/bandeja/useUsuariosOpciones";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import type { ItemBandejaHdu } from "@/types/dominio";
import { AuditorLayout } from "./AuditorLayout";

/** Pestaña HDU del Auditor (`/auditor` y `/auditor/hdu`): todas las HDU, con filtros y exportación. */
export function AuditorBandejaPage() {
  const filtros = useFiltrosUrl();
  const bandeja = useBandejaAuditor(filtros);
  const ubicacion = useLocation();
  const { opcionesCelula, opcionesSprint, opcionesEstado } = useOpcionesCatalogo();
  const datos = bandeja.data;
  const { opcionesQe, opcionesAnalista } = useUsuariosOpciones(datos?.hdu.estado === "ok" ? datos.hdu.datos.items : undefined);

  const campos: CampoFiltro[] = [
    { clave: "celula", id: "filtro-celula", etiqueta: "Célula", tipo: "select", opciones: opcionesCelula, vacio: "Todas" },
    { clave: "sprint", id: "filtro-sprint", etiqueta: "Sprint", tipo: "select", opciones: opcionesSprint },
    { clave: "estado", id: "filtro-estado", etiqueta: "Estado", tipo: "select", opciones: opcionesEstado },
    { clave: "qe", id: "filtro-qe", etiqueta: "QE", tipo: "select", opciones: opcionesQe },
    { clave: "analista", id: "filtro-analista", etiqueta: "Analista", tipo: "select", opciones: opcionesAnalista },
    {
      clave: "certificado",
      id: "filtro-certificado",
      etiqueta: "Certificado",
      tipo: "select",
      opciones: [
        { valor: "con", etiqueta: "Con certificado" },
        { valor: "sin", etiqueta: "Sin certificado" },
      ],
    },
    { clave: "desde", id: "filtro-desde", etiqueta: "Desde", tipo: "fecha" },
    { clave: "hasta", id: "filtro-hasta", etiqueta: "Hasta", tipo: "fecha" },
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
          {cert.folio} <BotonDescargaCertificado hduId={h.id} folio={cert.folio} testId={`boton-descargar-pdf-${cert.folio}`} />
        </span>
      );
    },
  };

  const bloque = datos?.hdu;
  const motivo = bandeja.isLoading ? "Cargando…" : bandeja.isError ? "No se pudo cargar la lista" : bloque?.estado === "indisponible" ? "No disponible" : undefined;

  return (
    <AuditorLayout>
      <div data-testid="panel-hdu">
        <PanelListaHdu
          clave="auditor-hdu"
          titulo="HDU"
          consulta={bandeja}
          bloque={bloque}
          filtros={filtros}
          campos={campos}
          caption="Todas las HDU"
          testIdTabla="lista-auditor-hdu"
          vacioSinFiltros="No hay registros"
          vacioConFiltros="No hay registros con esos filtros"
          acciones={<BotonExportarCsv recurso="hdu" filtros={filtros} total={bloque?.estado === "ok" ? bloque.datos.total : undefined} motivoDeshabilitado={motivo} />}
          columnas={[c.codigo, c.titulo, c.celula, c.sprint, c.estado, c.qe, c.analista, c.avance, certificado, c.actualizada]}
        />
      </div>
    </AuditorLayout>
  );
}
