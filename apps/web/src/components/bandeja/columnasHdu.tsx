import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatearFecha } from "@/lib/formato";
import type { ItemBandejaHdu } from "@/types/dominio";
import { InsigniaEstadoHdu, InsigniaPrioridad } from "../Etiquetas";
import { CeldaAvance, CeldaNoDisponible, InsigniaObservaciones } from "./Celdas";
import type { Columna } from "./TablaBandeja";

type Col = Columna<ItemBandejaHdu>;

/** Columnas comunes de las listas de HDU de las bandejas (Analista, Líder, Auditor). */
export function columnasHdu(desde: string) {
  const codigo: Col = {
    id: "codigo",
    titulo: "Código",
    ordenable: true,
    render: (h) => (
      <Link className="codigo" to={`/hdu/${h.id}`} state={{ desde }}>
        {h.codigo}
      </Link>
    ),
  };
  const titulo: Col = { id: "titulo", titulo: "Título", render: (h) => <span className="celda-titulo">{h.titulo}</span> };
  const celula: Col = { id: "celula", titulo: "Célula", ordenable: true, render: (h) => h.celula.nombre };
  const sprint: Col = { id: "sprint", titulo: "Sprint", ordenable: true, render: (h) => h.sprint.nombre };
  const prioridad: Col = { id: "prioridad", titulo: "Prioridad", ordenable: true, render: (h) => <InsigniaPrioridad prioridad={h.prioridad} /> };
  const estado: Col = { id: "estado", titulo: "Estado", ordenable: true, render: (h) => <InsigniaEstadoHdu estado={h.estado} /> };
  const avance: Col = { id: "avance", titulo: "Avance", ordenable: true, render: (h) => <CeldaAvance hduId={h.id} seguimiento={h.seguimiento} /> };
  const siguiente: Col = {
    id: "siguiente",
    titulo: "Siguiente entregable",
    render: (h) =>
      h.seguimiento.estado !== "ok" ? (
        <CeldaNoDisponible clave="siguiente" />
      ) : (
        <span data-testid={`celda-siguiente-${h.id}`}>
          {h.seguimiento.datos.siguienteEntregable
            ? `${h.seguimiento.datos.siguienteEntregable.orden} · ${h.seguimiento.datos.siguienteEntregable.nombre}`
            : "Todos aprobados"}
        </span>
      ),
  };
  const observaciones: Col = {
    id: "observaciones",
    titulo: "Observaciones",
    render: (h): ReactNode =>
      h.seguimiento.estado !== "ok" ? <CeldaNoDisponible clave="observaciones" /> : <InsigniaObservaciones hduId={h.id} cantidad={h.seguimiento.datos.observaciones} />,
  };
  const actualizada: Col = {
    id: "actualizada",
    titulo: "Actualizada",
    ordenable: true,
    render: (h) => <time dateTime={h.actualizadoEn}>{formatearFecha(h.actualizadoEn)}</time>,
  };
  const qe: Col = { id: "qe", titulo: "QE responsable", render: (h) => h.qeResponsable.nombre };
  const analista: Col = { id: "analista", titulo: "Analista", render: (h) => h.analista?.nombre ?? "Sin asignar" };
  const certificado: Col = {
    id: "certificado",
    titulo: "Certificado",
    render: (h) =>
      h.seguimiento.estado !== "ok" ? (
        <CeldaNoDisponible clave="certificado" />
      ) : h.seguimiento.datos.certificado ? (
        <span data-testid={`celda-certificado-${h.id}`}>{h.seguimiento.datos.certificado.folio}</span>
      ) : (
        <span data-testid={`celda-certificado-${h.id}`}>—</span>
      ),
  };
  return { codigo, titulo, celula, sprint, prioridad, estado, avance, siguiente, observaciones, actualizada, qe, analista, certificado };
}
