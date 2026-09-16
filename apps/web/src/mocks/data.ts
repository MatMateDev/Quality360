// Datos de referencia para MSW y para el proveedor de sesión simulado
// (VITE_USAR_MOCKS=true). Cubre los tres roles y los estados de bloque
// compuesto (ok / indisponible) exigidos por Ola 1a.
import type { EstadoHdu, Rol } from "@/types/dominio";

export interface UsuarioMock {
  id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
  /** Contraseña del login simulado (solo existe en mocks; nunca en un backend real). */
  contrasena: string;
}

export interface CelulaMock {
  id: string;
  nombre: string;
}

export interface SprintMock {
  id: string;
  nombre: string;
  inicio: string;
  fin: string;
}

export interface RelacionSupervisionMock {
  id: string;
  analistaId: string;
  qeId: string;
  desde: string;
  hasta: string | null;
  motivo: string | null;
  registradoPorId: string;
}

export interface HduMock {
  id: string;
  codigo: string;
  titulo: string;
  celulaId: string;
  sprintId: string;
  prioridad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  estado: EstadoHdu;
  estadoActualizadoEn: string;
  qeResponsableId: string;
  analistaId: string | null;
  creadoPorId: string;
  creadoEn: string;
  /** `true` fuerza que el cierre responda `CHECKLIST_INCOMPLETO` en vez de `CHECKLIST_NO_DISPONIBLE` (uso exclusivo en pruebas). */
  simularChecklistIncompleto?: boolean;
}

export type TipoEventoHdu = "ESTADO" | "ASIGNACION";

export interface EventoHduMock {
  hduId: string;
  tipo: TipoEventoHdu;
  fecha: string;
  actorId: string;
  estadoAnterior?: EstadoHdu | null;
  estadoNuevo?: EstadoHdu;
  analistaAnterior?: string | null;
  analistaNuevo?: string | null;
  motivo?: string | null;
}

export const ID = {
  admin: "a1000000-0000-4000-8000-000000000001",
  qe1: "a1000000-0000-4000-8000-000000000002",
  qe2: "a1000000-0000-4000-8000-000000000003",
  qa1: "a1000000-0000-4000-8000-000000000004",
  qa2: "a1000000-0000-4000-8000-000000000005",
  qa3: "a1000000-0000-4000-8000-000000000006",
  qaInactivo: "a1000000-0000-4000-8000-000000000007",
  celPagos: "b2000000-0000-4000-8000-000000000001",
  celClientes: "b2000000-0000-4000-8000-000000000002",
  celTarjetas: "b2000000-0000-4000-8000-000000000003",
  sprint18: "c3000000-0000-4000-8000-000000000001",
  sprint19: "c3000000-0000-4000-8000-000000000002",
  hdu1: "d4000000-0000-4000-8000-000000000001",
  hdu2: "d4000000-0000-4000-8000-000000000002",
  hdu3: "d4000000-0000-4000-8000-000000000003",
  hdu4: "d4000000-0000-4000-8000-000000000004",
  hdu5: "d4000000-0000-4000-8000-000000000005",
  hdu6: "d4000000-0000-4000-8000-000000000006",
} as const;

/** Contraseña compartida por todas las cuentas de demostración (solo mock). */
export const CONTRASENA_DEMO = "Quality360!";

export const usuarios: UsuarioMock[] = [
  {
    id: ID.admin,
    nombre: "Valentina Rojas",
    correo: "admin@quality360.local",
    rol: "ADMINISTRADOR",
    activo: true,
    creadoEn: "2026-01-05T09:00:00Z",
    actualizadoEn: "2026-01-05T09:00:00Z",
    contrasena: CONTRASENA_DEMO,
  },
  {
    id: ID.qe1,
    nombre: "Jose Seguel",
    correo: "jose.seguel@quality360.local",
    rol: "QE",
    activo: true,
    creadoEn: "2026-01-06T09:00:00Z",
    actualizadoEn: "2026-01-06T09:00:00Z",
    contrasena: CONTRASENA_DEMO,
  },
  {
    id: ID.qe2,
    nombre: "Constanza Díaz",
    correo: "constanza.diaz@quality360.local",
    rol: "QE",
    activo: true,
    creadoEn: "2026-01-06T09:05:00Z",
    actualizadoEn: "2026-01-06T09:05:00Z",
    contrasena: CONTRASENA_DEMO,
  },
  {
    id: ID.qa1,
    nombre: "Jonathan Choque",
    correo: "jonathan.choque@quality360.local",
    rol: "ANALISTA_QA",
    activo: true,
    creadoEn: "2026-01-07T09:00:00Z",
    actualizadoEn: "2026-01-07T09:00:00Z",
    contrasena: CONTRASENA_DEMO,
  },
  {
    id: ID.qa2,
    nombre: "Ana Pérez",
    correo: "ana.perez@quality360.local",
    rol: "ANALISTA_QA",
    activo: true,
    creadoEn: "2026-01-07T09:05:00Z",
    actualizadoEn: "2026-01-07T09:05:00Z",
    contrasena: CONTRASENA_DEMO,
  },
  {
    id: ID.qa3,
    nombre: "Camila Rojas",
    correo: "camila.rojas@quality360.local",
    rol: "ANALISTA_QA",
    activo: true,
    creadoEn: "2026-01-07T09:10:00Z",
    actualizadoEn: "2026-01-07T09:10:00Z",
    contrasena: CONTRASENA_DEMO,
  },
  {
    id: ID.qaInactivo,
    nombre: "Diego Soto",
    correo: "diego.soto@quality360.local",
    rol: "ANALISTA_QA",
    activo: false,
    creadoEn: "2026-01-07T09:15:00Z",
    actualizadoEn: "2026-02-01T09:15:00Z",
    contrasena: CONTRASENA_DEMO,
  },
];

export const celulas: CelulaMock[] = [
  { id: ID.celPagos, nombre: "Pagos" },
  { id: ID.celClientes, nombre: "Clientes" },
  { id: ID.celTarjetas, nombre: "Tarjetas" },
];

export const sprints: SprintMock[] = [
  { id: ID.sprint18, nombre: "Sprint 2026-18", inicio: "2026-08-31", fin: "2026-09-13" },
  { id: ID.sprint19, nombre: "Sprint 2026-19", inicio: "2026-09-14", fin: "2026-09-27" },
];

// QA1 y QA3 supervisados vigentes por QE1. QA3 tuvo antes a QE2 (historial con motivo).
export const relacionesSupervision: RelacionSupervisionMock[] = [
  {
    id: "e5000000-0000-4000-8000-000000000001",
    analistaId: ID.qa1,
    qeId: ID.qe1,
    desde: "2026-01-10T09:00:00Z",
    hasta: null,
    motivo: null,
    registradoPorId: ID.admin,
  },
  {
    id: "e5000000-0000-4000-8000-000000000002",
    analistaId: ID.qa3,
    qeId: ID.qe2,
    desde: "2026-01-10T09:00:00Z",
    hasta: "2026-06-01T09:00:00Z",
    motivo: null,
    registradoPorId: ID.admin,
  },
  {
    id: "e5000000-0000-4000-8000-000000000003",
    analistaId: ID.qa3,
    qeId: ID.qe1,
    desde: "2026-06-01T09:00:00Z",
    hasta: null,
    motivo: "Rebalanceo de carga entre células de Pagos y Clientes.",
    registradoPorId: ID.admin,
  },
  // QA2 nunca tuvo supervisor vigente (E1-F06#2).
];

export const hdus: HduMock[] = [
  {
    id: ID.hdu1,
    codigo: "PAGOS-1042",
    titulo: "Validación de transferencias",
    celulaId: ID.celPagos,
    sprintId: ID.sprint19,
    prioridad: "ALTA",
    estado: "EN_EJECUCION",
    estadoActualizadoEn: "2026-09-05T11:00:00Z",
    qeResponsableId: ID.qe1,
    analistaId: ID.qa1,
    creadoPorId: ID.qe1,
    creadoEn: "2026-09-01T09:00:00Z",
  },
  {
    id: ID.hdu2,
    codigo: "PAGOS-1043",
    titulo: "Consulta de movimientos",
    celulaId: ID.celPagos,
    sprintId: ID.sprint19,
    prioridad: "MEDIA",
    estado: "DISENO_PRUEBAS",
    estadoActualizadoEn: "2026-09-03T09:00:00Z",
    qeResponsableId: ID.qe1,
    analistaId: ID.qa1,
    creadoPorId: ID.qe1,
    creadoEn: "2026-09-01T09:10:00Z",
  },
  {
    id: ID.hdu3,
    codigo: "CLIENTES-2001",
    titulo: "Actualización de datos personales",
    celulaId: ID.celClientes,
    sprintId: ID.sprint18,
    prioridad: "MEDIA",
    estado: "PENDIENTE_CIERRE",
    estadoActualizadoEn: "2026-09-10T15:00:00Z",
    qeResponsableId: ID.qe1,
    analistaId: ID.qa3,
    creadoPorId: ID.qe1,
    creadoEn: "2026-08-20T09:00:00Z",
  },
  {
    id: ID.hdu4,
    codigo: "TARJETAS-3005",
    titulo: "Bloqueo preventivo de tarjeta",
    celulaId: ID.celTarjetas,
    sprintId: ID.sprint18,
    prioridad: "ALTA",
    estado: "CERRADA",
    estadoActualizadoEn: "2026-08-12T16:00:00Z",
    qeResponsableId: ID.qe1,
    analistaId: ID.qa1,
    creadoPorId: ID.qe1,
    creadoEn: "2026-08-01T09:00:00Z",
  },
  {
    id: ID.hdu5,
    codigo: "PAGOS-1044",
    titulo: "Reversa de pago duplicado",
    celulaId: ID.celPagos,
    sprintId: ID.sprint19,
    prioridad: "CRITICA",
    estado: "PENDIENTE",
    estadoActualizadoEn: "2026-09-10T08:00:00Z",
    qeResponsableId: ID.qe1,
    analistaId: null,
    creadoPorId: ID.qe1,
    creadoEn: "2026-09-10T08:00:00Z",
  },
  {
    id: ID.hdu6,
    codigo: "CLIENTES-2002",
    titulo: "Cambio de correo",
    celulaId: ID.celClientes,
    sprintId: ID.sprint19,
    prioridad: "BAJA",
    estado: "PENDIENTE",
    estadoActualizadoEn: "2026-09-12T08:00:00Z",
    qeResponsableId: ID.qe1,
    analistaId: ID.qa3,
    creadoPorId: ID.qe1,
    creadoEn: "2026-09-12T08:00:00Z",
  },
];

export const eventosHdu: EventoHduMock[] = [
  // HDU1 · PAGOS-1042
  { hduId: ID.hdu1, tipo: "ESTADO", fecha: "2026-09-01T09:00:00Z", actorId: ID.qe1, estadoAnterior: null, estadoNuevo: "PENDIENTE" },
  { hduId: ID.hdu1, tipo: "ASIGNACION", fecha: "2026-09-01T09:05:00Z", actorId: ID.qe1, analistaAnterior: null, analistaNuevo: ID.qa1, motivo: null },
  { hduId: ID.hdu1, tipo: "ESTADO", fecha: "2026-09-02T10:00:00Z", actorId: ID.qa1, estadoAnterior: "PENDIENTE", estadoNuevo: "DISENO_PRUEBAS" },
  { hduId: ID.hdu1, tipo: "ESTADO", fecha: "2026-09-05T11:00:00Z", actorId: ID.qa1, estadoAnterior: "DISENO_PRUEBAS", estadoNuevo: "EN_EJECUCION" },
  // HDU2 · PAGOS-1043
  { hduId: ID.hdu2, tipo: "ESTADO", fecha: "2026-09-01T09:10:00Z", actorId: ID.qe1, estadoAnterior: null, estadoNuevo: "PENDIENTE" },
  { hduId: ID.hdu2, tipo: "ASIGNACION", fecha: "2026-09-01T09:12:00Z", actorId: ID.qe1, analistaAnterior: null, analistaNuevo: ID.qa1, motivo: null },
  { hduId: ID.hdu2, tipo: "ESTADO", fecha: "2026-09-03T09:00:00Z", actorId: ID.qa1, estadoAnterior: "PENDIENTE", estadoNuevo: "DISENO_PRUEBAS" },
  // HDU3 · CLIENTES-2001
  { hduId: ID.hdu3, tipo: "ESTADO", fecha: "2026-08-20T09:00:00Z", actorId: ID.qe1, estadoAnterior: null, estadoNuevo: "PENDIENTE" },
  { hduId: ID.hdu3, tipo: "ASIGNACION", fecha: "2026-08-20T09:05:00Z", actorId: ID.qe1, analistaAnterior: null, analistaNuevo: ID.qa3, motivo: null },
  { hduId: ID.hdu3, tipo: "ESTADO", fecha: "2026-08-21T09:00:00Z", actorId: ID.qa3, estadoAnterior: "PENDIENTE", estadoNuevo: "DISENO_PRUEBAS" },
  { hduId: ID.hdu3, tipo: "ESTADO", fecha: "2026-08-25T09:00:00Z", actorId: ID.qa3, estadoAnterior: "DISENO_PRUEBAS", estadoNuevo: "EN_EJECUCION" },
  { hduId: ID.hdu3, tipo: "ESTADO", fecha: "2026-09-10T15:00:00Z", actorId: ID.qa3, estadoAnterior: "EN_EJECUCION", estadoNuevo: "PENDIENTE_CIERRE" },
  // HDU4 · TARJETAS-3005 (cerrada)
  { hduId: ID.hdu4, tipo: "ESTADO", fecha: "2026-08-01T09:00:00Z", actorId: ID.qe1, estadoAnterior: null, estadoNuevo: "PENDIENTE" },
  { hduId: ID.hdu4, tipo: "ASIGNACION", fecha: "2026-08-01T09:05:00Z", actorId: ID.qe1, analistaAnterior: null, analistaNuevo: ID.qa1, motivo: null },
  { hduId: ID.hdu4, tipo: "ESTADO", fecha: "2026-08-02T09:00:00Z", actorId: ID.qa1, estadoAnterior: "PENDIENTE", estadoNuevo: "DISENO_PRUEBAS" },
  { hduId: ID.hdu4, tipo: "ESTADO", fecha: "2026-08-05T09:00:00Z", actorId: ID.qa1, estadoAnterior: "DISENO_PRUEBAS", estadoNuevo: "EN_EJECUCION" },
  { hduId: ID.hdu4, tipo: "ESTADO", fecha: "2026-08-10T09:00:00Z", actorId: ID.qa1, estadoAnterior: "EN_EJECUCION", estadoNuevo: "PENDIENTE_CIERRE" },
  { hduId: ID.hdu4, tipo: "ESTADO", fecha: "2026-08-12T16:00:00Z", actorId: ID.qe1, estadoAnterior: "PENDIENTE_CIERRE", estadoNuevo: "CERRADA" },
  // HDU5 · PAGOS-1044 (sin analista)
  { hduId: ID.hdu5, tipo: "ESTADO", fecha: "2026-09-10T08:00:00Z", actorId: ID.qe1, estadoAnterior: null, estadoNuevo: "PENDIENTE" },
  // HDU6 · CLIENTES-2002
  { hduId: ID.hdu6, tipo: "ESTADO", fecha: "2026-09-12T08:00:00Z", actorId: ID.qe1, estadoAnterior: null, estadoNuevo: "PENDIENTE" },
  { hduId: ID.hdu6, tipo: "ASIGNACION", fecha: "2026-09-12T08:05:00Z", actorId: ID.qe1, analistaAnterior: null, analistaNuevo: ID.qa3, motivo: null },
];

export function buscarUsuario(id: string): UsuarioMock | undefined {
  return usuarios.find((usuario) => usuario.id === id);
}

export function buscarUsuarioPorCorreo(correo: string): UsuarioMock | undefined {
  const normalizado = correo.trim().toLowerCase();
  return usuarios.find((usuario) => usuario.correo.toLowerCase() === normalizado);
}

export function supervisorVigenteDe(analistaId: string): RelacionSupervisionMock | undefined {
  return relacionesSupervision.find((relacion) => relacion.analistaId === analistaId && relacion.hasta === null);
}

export function analistasVigentesDe(qeId: string): RelacionSupervisionMock[] {
  return relacionesSupervision.filter((relacion) => relacion.qeId === qeId && relacion.hasta === null);
}
