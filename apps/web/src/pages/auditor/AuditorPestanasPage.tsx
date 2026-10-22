import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuditoriaUsuarios, useBitacoraAuditor, useCertificadosAuditor } from "@/api/bandejas";
import type { CampoFiltro } from "@/components/bandeja/BarraFiltros";
import { BotonDescargaCertificado } from "@/components/bandeja/BotonDescargaCertificado";
import { PanelAuditor } from "@/components/bandeja/PanelAuditor";
import type { Columna } from "@/components/bandeja/TablaBandeja";
import { useOpcionesAcumuladas } from "@/components/bandeja/useUsuariosOpciones";
import { describirCambios, describirValor } from "@/lib/cambiosSeguros";
import { formatearFecha } from "@/lib/formato";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import {
  ETIQUETAS_ACCION_BITACORA,
  ETIQUETAS_OPERACION,
  type AccionChecklist,
  type CertificadoAuditoria,
  type EventoBitacoraGlobal,
  type OperacionAuditoriaUsuarios,
  type RegistroAuditoriaUsuario,
} from "@/types/dominio";
import { AuditorLayout } from "./AuditorLayout";

const FECHAS: CampoFiltro[] = [
  { clave: "desde", id: "filtro-desde", etiqueta: "Desde", tipo: "fecha" },
  { clave: "hasta", id: "filtro-hasta", etiqueta: "Hasta", tipo: "fecha" },
];

function Fecha({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatearFecha(iso)}</time>;
}

/** Pestaña «Certificados»: folio, HDU, emisión, QE emisor, huella completa y validez. */
export function AuditorCertificadosPage() {
  const filtros = useFiltrosUrl();
  const consulta = useCertificadosAuditor(filtros);
  const items = consulta.data?.items;
  const emisores = useOpcionesAcumuladas(useMemo(() => items?.map((c) => [c.emitidoPor.id, c.emitidoPor.nombre] as const), [items]));

  const campos: CampoFiltro[] = [
    ...FECHAS,
    { clave: "emisor", id: "filtro-qe-emisor", etiqueta: "QE emisor", tipo: "select", opciones: emisores },
    { clave: "q", id: "filtro-busqueda", etiqueta: "Buscar por folio o HDU", tipo: "texto" },
  ];
  const columnas: Columna<CertificadoAuditoria>[] = [
    { id: "folio", titulo: "Folio", render: (c) => c.folio },
    {
      id: "hdu",
      titulo: "HDU",
      render: (c) => (
        <Link to={`/hdu/${c.hdu.id}`} className="codigo">
          {c.hdu.codigo} · {c.hdu.titulo}
        </Link>
      ),
    },
    { id: "emision", titulo: "Fecha de emisión", render: (c) => <Fecha iso={c.emitidoEn} /> },
    { id: "emisor", titulo: "QE emisor", render: (c) => c.emitidoPor.nombre },
    {
      id: "huella",
      titulo: "Huella SHA-256",
      render: (c) => (
        <span className="texto-huella" data-testid="texto-huella">
          {c.huellaSha256}
        </span>
      ),
    },
    { id: "validez", titulo: "Validez", render: (c) => (c.valido ? "Válido" : "No válido") },
    {
      id: "acciones",
      titulo: "Acciones",
      render: (c) => (
        <div className="acciones-tabla">
          <BotonDescargaCertificado hduId={c.hdu.id} folio={c.folio} testId={`boton-descargar-pdf-${c.folio}`} />
          <a href={`/verificar/${encodeURIComponent(c.folio)}`} target="_blank" rel="noopener noreferrer" data-testid={`enlace-verificar-${c.folio}`}>
            Verificar (se abre en una pestaña nueva)
          </a>
        </div>
      ),
    },
  ];

  return (
    <AuditorLayout>
      <PanelAuditor clave="certificados" titulo="Certificados" consulta={consulta} filtros={filtros} campos={campos} columnas={columnas} caption="Certificados emitidos" clavefila={(c) => c.folio} />
    </AuditorLayout>
  );
}

/** Pestaña «Bitácora de checklist»: quién hizo qué sobre cada entregable. */
export function AuditorBitacoraPage() {
  const filtros = useFiltrosUrl();
  const consulta = useBitacoraAuditor(filtros);
  const items = consulta.data?.items;
  const hdus = useOpcionesAcumuladas(useMemo(() => items?.map((e) => [e.hdu.id, e.hdu.codigo] as const), [items]));
  const actores = useOpcionesAcumuladas(useMemo(() => items?.map((e) => [e.actor.id, e.actor.nombre] as const), [items]));

  const campos: CampoFiltro[] = [
    ...FECHAS,
    { clave: "hdu", id: "filtro-hdu", etiqueta: "HDU", tipo: "select", opciones: hdus },
    { clave: "actor", id: "filtro-actor", etiqueta: "Actor", tipo: "select", opciones: actores },
    {
      clave: "accion",
      id: "filtro-accion",
      etiqueta: "Acción",
      tipo: "select",
      opciones: (Object.keys(ETIQUETAS_ACCION_BITACORA) as AccionChecklist[]).map((a) => ({ valor: a, etiqueta: ETIQUETAS_ACCION_BITACORA[a] })),
    },
  ];
  const columnas: Columna<EventoBitacoraGlobal>[] = [
    { id: "fecha", titulo: "Fecha", render: (e) => <Fecha iso={e.fecha} /> },
    {
      id: "hdu",
      titulo: "HDU",
      render: (e) => (
        <Link to={`/hdu/${e.hdu.id}`} className="codigo">
          {e.hdu.codigo}
        </Link>
      ),
    },
    { id: "entregable", titulo: "Entregable", render: (e) => e.nombreEntregable },
    { id: "accion", titulo: "Acción", render: (e) => ETIQUETAS_ACCION_BITACORA[e.accion] ?? e.accion },
    { id: "actor", titulo: "Actor", render: (e) => e.actor.nombre },
    { id: "cambio", titulo: "Valor anterior → nuevo", render: (e) => `${describirValor(e.valorAnterior)} → ${describirValor(e.valorNuevo)}` },
    { id: "motivo", titulo: "Motivo o comentario", render: (e) => e.motivo ?? "—" },
  ];

  return (
    <AuditorLayout>
      <PanelAuditor clave="bitacora" titulo="Bitácora de checklist" consulta={consulta} filtros={filtros} campos={campos} columnas={columnas} caption="Bitácora de checklist, de la más reciente a la más antigua" clavefila={(e) => e.id} />
    </AuditorLayout>
  );
}

/** Pestaña «Auditoría de usuarios»: cambios en lenguaje natural, sin JSON y sin claves sensibles. */
export function AuditorAuditoriaUsuariosPage() {
  const filtros = useFiltrosUrl();
  const consulta = useAuditoriaUsuarios(filtros);
  const items = consulta.data?.items;
  const actores = useOpcionesAcumuladas(useMemo(() => items?.map((r) => [r.actor.id, r.actor.nombre] as const), [items]));
  const afectados = useOpcionesAcumuladas(
    useMemo(() => items?.filter((r) => r.usuarioAfectado).map((r) => [r.usuarioAfectado!.id, r.usuarioAfectado!.nombre] as const), [items]),
  );

  const campos: CampoFiltro[] = [
    ...FECHAS,
    { clave: "actor", id: "filtro-actor", etiqueta: "Actor", tipo: "select", opciones: actores },
    {
      clave: "operacion",
      id: "filtro-operacion",
      etiqueta: "Operación",
      tipo: "select",
      opciones: (Object.keys(ETIQUETAS_OPERACION) as OperacionAuditoriaUsuarios[]).map((o) => ({ valor: o, etiqueta: ETIQUETAS_OPERACION[o] })),
    },
    { clave: "usuario", id: "filtro-usuario-afectado", etiqueta: "Usuario afectado", tipo: "select", opciones: afectados },
  ];
  const columnas: Columna<RegistroAuditoriaUsuario>[] = [
    { id: "fecha", titulo: "Fecha", render: (r) => <Fecha iso={r.fecha} /> },
    { id: "actor", titulo: "Actor", render: (r) => r.actor.nombre },
    { id: "operacion", titulo: "Operación", render: (r) => ETIQUETAS_OPERACION[r.operacion] ?? r.operacion },
    { id: "afectado", titulo: "Usuario afectado", render: (r) => r.usuarioAfectado?.nombre ?? "—" },
    {
      id: "cambios",
      titulo: "Cambios (antes → después)",
      render: (r) => {
        const lineas = describirCambios(r.antes as Record<string, unknown> | null, r.despues as Record<string, unknown> | null);
        return lineas.length ? (
          <ul className="historial-lista" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {lineas.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          "—"
        );
      },
    },
    { id: "motivo", titulo: "Motivo", render: (r) => r.motivo ?? "—" },
  ];

  return (
    <AuditorLayout>
      <PanelAuditor clave="auditoria-usuarios" titulo="Auditoría de usuarios" consulta={consulta} filtros={filtros} campos={campos} columnas={columnas} caption="Auditoría de usuarios, de la más reciente a la más antigua" clavefila={(r) => r.id} />
    </AuditorLayout>
  );
}
