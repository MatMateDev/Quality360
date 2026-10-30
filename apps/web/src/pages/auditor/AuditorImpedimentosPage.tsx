import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCatalogoAuditor } from "@/api/bandejas";
import { useGestionAuditor, useImpedimentosAuditor } from "@/api/impedimentos";
import type { CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { PanelAuditor } from "@/components/bandeja/PanelAuditor";
import { PestanasNav } from "@/components/bandeja/PestanasNav";
import type { Columna } from "@/components/bandeja/TablaBandeja";
import { useOpcionesAcumuladas } from "@/components/bandeja/useUsuariosOpciones";
import { DiasAbierto, InsigniaEstadoImpedimento } from "@/components/impedimentos/Insignias";
import { SemaforoRiesgo } from "@/components/impedimentos/SemaforoRiesgo";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { formatearFecha } from "@/lib/formato";
import {
  ESTADOS_IMPEDIMENTO,
  ETIQUETAS_ACCION_IMPEDIMENTO,
  ETIQUETAS_ESTADO_IMPEDIMENTO,
  ETIQUETAS_ROL,
  ETIQUETAS_TIPO_IMPEDIMENTO,
  TIPOS_IMPEDIMENTO,
  type EntradaGestion,
  type NivelRiesgo,
} from "@/types/dominio";
import { AuditorLayout } from "./AuditorLayout";

const FECHAS: CampoFiltro[] = [
  { clave: "desde", id: "filtro-desde", etiqueta: "Desde", tipo: "fecha" },
  { clave: "hasta", id: "filtro-hasta", etiqueta: "Hasta", tipo: "fecha" },
];

const VISTAS = [
  { id: "impedimentos", a: "/auditor/impedimentos", texto: "Impedimentos", testId: "vista-impedimentos" },
  { id: "gestion", a: "/auditor/impedimentos?vista=gestion", texto: "Gestión", testId: "vista-gestion" },
] as const;

const ACCIONES_GESTION = [...Object.keys(ETIQUETAS_ACCION_IMPEDIMENTO), "FIJAR_RIESGO"];

function Fecha({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatearFecha(iso)}</time>;
}

/** En eventos de riesgo, anterior y nuevo son niveles: se muestran con la píldora del semáforo. */
function Nivel({ valor }: { valor: string | null }) {
  return valor ? <SemaforoRiesgo nivel={valor as NivelRiesgo} /> : <span>—</span>;
}

function VistaImpedimentos() {
  const filtros = useFiltrosUrl();
  const consulta = useImpedimentosAuditor(filtros);
  const items = consulta.data?.items;
  const catalogo = useCatalogoAuditor().data;
  const hdus = useOpcionesAcumuladas(useMemo(() => [...(catalogo?.hdus ?? []), ...(items?.map((i) => [i.hdu.id, i.hdu.codigo] as const) ?? [])], [catalogo, items]));

  const campos: CampoFiltro[] = [
    ...FECHAS,
    { clave: "hdu", id: "filtro-hdu", etiqueta: "HDU", tipo: "select", opciones: hdus, buscable: true },
    { clave: "estado", id: "filtro-estado", etiqueta: "Estado", tipo: "select", opciones: ESTADOS_IMPEDIMENTO.map((e) => ({ valor: e, etiqueta: ETIQUETAS_ESTADO_IMPEDIMENTO[e] })) },
    { clave: "tipo", id: "filtro-tipo", etiqueta: "Tipo", tipo: "select", opciones: TIPOS_IMPEDIMENTO.map((t) => ({ valor: t, etiqueta: ETIQUETAS_TIPO_IMPEDIMENTO[t] })) },
    { clave: "q", id: "filtro-busqueda", etiqueta: "Buscar por código o título", tipo: "texto" },
  ];
  const columnas: Columna<NonNullable<typeof items>[number]>[] = [
    { id: "fecha", titulo: "Fecha de registro", render: (i) => <Fecha iso={i.fechaRegistro} /> },
    {
      id: "hdu",
      titulo: "HDU",
      render: (i) => (
        <Link className="codigo" to={`/hdu/${i.hdu.id}`}>
          {i.hdu.codigo}
        </Link>
      ),
    },
    { id: "tipo", titulo: "Tipo", render: (i) => ETIQUETAS_TIPO_IMPEDIMENTO[i.tipo] },
    { id: "titulo", titulo: "Título", render: (i) => <span className="celda-titulo">{i.titulo}</span> },
    { id: "estado", titulo: "Estado", render: (i) => <InsigniaEstadoImpedimento estado={i.estado} /> },
    { id: "responsable", titulo: "Responsable", render: (i) => `${i.responsable.nombre}${i.responsable.externo ? " (externo)" : ""}` },
    { id: "registrado", titulo: "Registrado por", render: (i) => `${i.creadoPor.nombre} · ${ETIQUETAS_ROL[i.creadoPor.rol]}` },
    { id: "dias", titulo: "Días abiertos", render: (i) => <DiasAbierto dias={i.diasAbierto} resuelto={i.estado === "RESUELTO"} /> },
    { id: "resolucion", titulo: "Fecha de resolución", render: (i) => (i.fechaResolucion ? <Fecha iso={i.fechaResolucion} /> : "—") },
  ];
  return (
    <PanelAuditor
      clave="impedimentos"
      titulo="Impedimentos"
      consulta={consulta}
      filtros={filtros}
      campos={campos}
      columnas={columnas}
      caption="Impedimentos registrados, del más reciente al más antiguo"
      clavefila={(i) => i.id}
      testIdPanel="panel-vista-impedimentos"
      testIdTabla="lista-auditor-impedimentos"
    />
  );
}

function VistaGestion() {
  const filtros = useFiltrosUrl();
  const consulta = useGestionAuditor(filtros);
  const items = consulta.data?.items;
  const catalogo = useCatalogoAuditor().data;
  const hdus = useOpcionesAcumuladas(useMemo(() => [...(catalogo?.hdus ?? []), ...(items?.map((e) => [e.hdu.id, e.hdu.codigo] as const) ?? [])], [catalogo, items]));
  const actores = useOpcionesAcumuladas(useMemo(() => [...(catalogo?.actores ?? []), ...(items?.map((e) => [e.actor.id, e.actor.nombre] as const) ?? [])], [catalogo, items]));

  const campos: CampoFiltro[] = [
    ...FECHAS,
    { clave: "hdu", id: "filtro-hdu", etiqueta: "HDU", tipo: "select", opciones: hdus, buscable: true },
    { clave: "estado", id: "filtro-estado", etiqueta: "Estado", tipo: "select", opciones: ESTADOS_IMPEDIMENTO.map((e) => ({ valor: e, etiqueta: ETIQUETAS_ESTADO_IMPEDIMENTO[e] })) },
    { clave: "tipo", id: "filtro-tipo", etiqueta: "Tipo", tipo: "select", opciones: TIPOS_IMPEDIMENTO.map((t) => ({ valor: t, etiqueta: ETIQUETAS_TIPO_IMPEDIMENTO[t] })) },
    { clave: "actor", id: "filtro-actor", etiqueta: "Actor", tipo: "select", opciones: actores, buscable: true },
    {
      clave: "accion",
      id: "filtro-accion",
      etiqueta: "Acción",
      tipo: "select",
      opciones: ACCIONES_GESTION.map((a) => ({ valor: a, etiqueta: a === "FIJAR_RIESGO" ? "Fijar riesgo" : ETIQUETAS_ACCION_IMPEDIMENTO[a as keyof typeof ETIQUETAS_ACCION_IMPEDIMENTO] })),
    },
  ];
  const columnas: Columna<EntradaGestion>[] = [
    { id: "fecha", titulo: "Fecha", render: (e) => <Fecha iso={e.fecha} /> },
    {
      id: "hdu",
      titulo: "HDU",
      render: (e) => (
        <Link className="codigo" to={`/hdu/${e.hdu.id}`}>
          {e.hdu.codigo}
        </Link>
      ),
    },
    { id: "tipo", titulo: "Tipo de evento", render: (e) => (e.tipo === "RIESGO" ? "Riesgo" : "Impedimento") },
    { id: "accion", titulo: "Acción", render: (e) => (e.accion === "FIJAR_RIESGO" ? "Fijó el riesgo" : ETIQUETAS_ACCION_IMPEDIMENTO[e.accion]) },
    { id: "impedimento", titulo: "Impedimento", render: (e) => e.impedimento?.titulo ?? "—" },
    { id: "actor", titulo: "Actor", render: (e) => `${e.actor.nombre} · ${ETIQUETAS_ROL[e.actor.rol]}` },
    {
      id: "cambio",
      titulo: "Anterior → nuevo",
      render: (e) =>
        e.tipo === "RIESGO" ? (
          <span>
            <Nivel valor={e.anterior} /> → <Nivel valor={e.nuevo} />
          </span>
        ) : (
          `${e.anterior ? ETIQUETAS_ESTADO_IMPEDIMENTO[e.anterior as keyof typeof ETIQUETAS_ESTADO_IMPEDIMENTO] : "—"} → ${ETIQUETAS_ESTADO_IMPEDIMENTO[e.nuevo as keyof typeof ETIQUETAS_ESTADO_IMPEDIMENTO] ?? e.nuevo}`
        ),
    },
    { id: "comentario", titulo: "Comentario", render: (e) => e.comentario ?? "—" },
  ];
  return (
    <PanelAuditor
      clave="gestion-impedimentos"
      titulo="Gestión de impedimentos y riesgo"
      consulta={consulta}
      filtros={filtros}
      campos={campos}
      columnas={columnas}
      caption="Gestión de impedimentos y cambios de riesgo, del más reciente al más antiguo"
      clavefila={(e) => e.id}
      testIdPanel="panel-vista-gestion"
      testIdTabla="lista-auditor-gestion"
    />
  );
}

/**
 * Pestaña «Impedimentos» del Auditor (E4-B04): dos vistas, «Impedimentos» y «Gestión», cada una con sus filtros en la
 * URL y su exportación CSV. Solo lectura: ningún `<form>` ni `button[type=submit]`. No suma columnas a la pestaña
 * HDU (D71, D80).
 */
export function AuditorImpedimentosPage() {
  const filtros = useFiltrosUrl();
  const vista = filtros.get("vista") === "gestion" ? "gestion" : "impedimentos";
  return (
    <AuditorLayout>
      <div data-testid="panel-impedimentos">
        <PestanasNav etiqueta="Vistas de impedimentos" pestanas={VISTAS} activa={vista} clase="pestanas--vistas" />
        {vista === "gestion" ? <VistaGestion key="gestion" /> : <VistaImpedimentos key="impedimentos" />}
      </div>
    </AuditorLayout>
  );
}
