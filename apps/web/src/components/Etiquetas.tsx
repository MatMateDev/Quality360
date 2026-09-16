import { ETIQUETAS_ESTADO_HDU, ETIQUETAS_PRIORIDAD, ETIQUETAS_ROL, type EstadoHdu, type PrioridadHdu, type Rol } from "@/types/dominio";

const CLASE_ROL: Record<Rol, string> = {
  ADMINISTRADOR: "badge-administrador",
  QE: "badge-qe",
  ANALISTA_QA: "badge-analista-qa",
};

export function InsigniaRol({ rol }: { rol: Rol }) {
  return <span className={`badge ${CLASE_ROL[rol]}`}>{ETIQUETAS_ROL[rol]}</span>;
}

export function InsigniaEstadoHdu({ estado }: { estado: EstadoHdu }) {
  return <span className="badge badge-estado">{ETIQUETAS_ESTADO_HDU[estado]}</span>;
}

export function InsigniaPrioridad({ prioridad }: { prioridad: PrioridadHdu }) {
  return <span className="badge badge-estado">{ETIQUETAS_PRIORIDAD[prioridad]}</span>;
}

export function InsigniaActivo({ activo }: { activo: boolean }) {
  return <span className={`badge ${activo ? "badge-activo" : "badge-inactivo"}`}>{activo ? "Activo" : "Inactivo"}</span>;
}
