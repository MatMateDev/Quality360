// Datos de referencia de E7 (bandejas por rol) para MSW. Mismo universo que `data.ts`:
// Auditor, estado de checklist por HDU, certificados, bitácora y auditoría de usuarios (el Líder QA
// se retiró, D208). Nada de esto es fuente de datos del portal real.
import { ID, hdus, usuarios } from "./data";
import { reiniciarE4 } from "./dataE4";

export interface SeguimientoMock {
  aprobados: number;
  porAprobar: number;
  observaciones: number;
  siguiente: { clave: string; orden: number; nombre: string } | null;
  certificado: { folio: string; emitidoEn: string } | null;
  porAprobarDesde: string | null;
  listaDesde: string | null;
}

const siguiente = (orden: number, nombre: string) => ({ clave: `ENTREGABLE_${orden}`, orden, nombre });

/** Estado de checklist por HDU (lo que en el stack real calcula Certificaciones). */
export const seguimientoPorHdu: Record<string, SeguimientoMock> = {
  // PAGOS-1042: 3 aprobados, 1 por aprobar y 1 observación (rechazo sin corregir).
  [ID.hdu1]: { aprobados: 3, porAprobar: 1, observaciones: 1, siguiente: siguiente(4, "Datos de prueba"), certificado: null, porAprobarDesde: "2026-10-18T10:00:00Z", listaDesde: null },
  // PAGOS-1043: 8 aprobados, lista para certificar.
  [ID.hdu2]: { aprobados: 8, porAprobar: 0, observaciones: 0, siguiente: siguiente(9, "Certificado de calidad"), certificado: null, porAprobarDesde: null, listaDesde: "2026-10-19T10:00:00Z" },
  // CLIENTES-2001: 10 aprobados, lista para cerrar.
  [ID.hdu3]: { aprobados: 10, porAprobar: 0, observaciones: 0, siguiente: null, certificado: { folio: "Q360-0002", emitidoEn: "2026-09-10T12:00:00Z" }, porAprobarDesde: null, listaDesde: "2026-09-10T15:00:00Z" },
  // TARJETAS-3005: cerrada y certificada.
  [ID.hdu4]: { aprobados: 10, porAprobar: 0, observaciones: 0, siguiente: null, certificado: { folio: "Q360-0001", emitidoEn: "2026-08-11T12:00:00Z" }, porAprobarDesde: null, listaDesde: null },
  [ID.hdu5]: { aprobados: 0, porAprobar: 0, observaciones: 0, siguiente: siguiente(1, "Plan de pruebas"), certificado: null, porAprobarDesde: null, listaDesde: null },
  [ID.hdu6]: { aprobados: 0, porAprobar: 0, observaciones: 0, siguiente: siguiente(1, "Plan de pruebas"), certificado: null, porAprobarDesde: null, listaDesde: null },
};

export function seguimientoDe(hduId: string): SeguimientoMock {
  return seguimientoPorHdu[hduId] ?? { aprobados: 0, porAprobar: 0, observaciones: 0, siguiente: null, certificado: null, porAprobarDesde: null, listaDesde: null };
}

export interface CertificadoMock {
  folio: string;
  hduId: string;
  emitidoEn: string;
  emitidoPorId: string;
  huella: string;
}

export const certificados: CertificadoMock[] = [
  { folio: "Q360-0001", hduId: ID.hdu4, emitidoEn: "2026-08-11T12:00:00Z", emitidoPorId: ID.qe1, huella: "a3f1c9d4e5b6a7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70" },
  { folio: "Q360-0002", hduId: ID.hdu3, emitidoEn: "2026-09-10T12:00:00Z", emitidoPorId: ID.qe1, huella: "b4e2d0a5f6c7b8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f7081" },
];

export interface EventoBitacoraMock {
  id: string;
  hduId: string;
  accion: "MARCAR" | "DESMARCAR" | "APROBAR" | "RECHAZAR" | "GENERAR_CERTIFICADO";
  orden: number;
  nombre: string;
  actorId: string;
  fecha: string;
  motivo: string | null;
}

export const bitacora: EventoBitacoraMock[] = [
  { id: "f7000000-0000-4000-8000-000000000001", hduId: ID.hdu1, accion: "MARCAR", orden: 3, nombre: "Casos de prueba", actorId: ID.qa1, fecha: "2026-10-17T09:00:00Z", motivo: null },
  { id: "f7000000-0000-4000-8000-000000000002", hduId: ID.hdu1, accion: "RECHAZAR", orden: 3, nombre: "Casos de prueba", actorId: ID.qe1, fecha: "2026-10-17T15:00:00Z", motivo: "Faltan casos negativos." },
  { id: "f7000000-0000-4000-8000-000000000003", hduId: ID.hdu4, accion: "GENERAR_CERTIFICADO", orden: 9, nombre: "Certificado de calidad", actorId: ID.qe1, fecha: "2026-08-11T12:00:00Z", motivo: null },
];

export interface RegistroAuditoriaMock {
  id: string;
  fecha: string;
  actorId: string;
  operacion: "CREAR_USUARIO" | "CAMBIAR_ROL" | "ASIGNAR_CELULAS_LIDER" | "CAMBIAR_SUPERVISOR" | "EXPORTAR";
  usuarioAfectadoId: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string | null;
}

export const auditoriaUsuarios: RegistroAuditoriaMock[] = [
  // Histórico anterior a D208: la operación y el rol retirados se siguen mostrando con su rótulo.
  { id: "f8000000-0000-4000-8000-000000000001", fecha: "2026-10-20T10:12:00Z", actorId: ID.admin, operacion: "ASIGNAR_CELULAS_LIDER", usuarioAfectadoId: ID.auditor, antes: { celulas: [] }, despues: { celulas: ["Pagos", "Clientes"] }, motivo: null },
  { id: "f8000000-0000-4000-8000-000000000002", fecha: "2026-10-19T09:00:00Z", actorId: ID.admin, operacion: "CAMBIAR_ROL", usuarioAfectadoId: ID.auditor, antes: { rol: "LIDER_QA" }, despues: { rol: "AUDITOR" }, motivo: "D208: se retiró el rol Líder QA" },
  // Defensa: un registro con claves prohibidas; el portal no debe mostrarlas jamás (E7-F06-T04).
  { id: "f8000000-0000-4000-8000-000000000003", fecha: "2026-10-18T09:00:00Z", actorId: ID.admin, operacion: "CREAR_USUARIO", usuarioAfectadoId: ID.auditor, antes: null, despues: { nombre: "Andrea Mora", password: "secreto-no-mostrar", accessToken: "tok-no-mostrar", rol: "AUDITOR" }, motivo: null },
];

export interface FuentesMock {
  /** Certificaciones caída: contadores y seguimiento `indisponible`, bitácora y certificados 503. */
  certificaciones: boolean;
  /** Fuente de Organización de la bandeja del Administrador, bloque por bloque. */
  pendientesAdmin: boolean;
  cambiosAdmin: boolean;
  /** E4: servicio Impedimentos caído. Las secciones y los bloques de E4 quedan `indisponible`; el resto sigue (D87). */
  impedimentos: boolean;
}

export const fuentes: FuentesMock = { certificaciones: true, pendientesAdmin: true, cambiosAdmin: true, impedimentos: true };

/** Pruebas: deja caída una o más fuentes. `reiniciarFuentes` las restaura entre pruebas. */
export function simularFuentes(parcial: Partial<FuentesMock>): void {
  Object.assign(fuentes, parcial);
}

const cantidadUsuariosInicial = usuarios.length;
const rolesIniciales = new Map(usuarios.map((u) => [u.id, u.rol]));
const qeIniciales = new Map(hdus.map((h) => [h.id, h.qeResponsableId]));

/** Restaura fuentes, roles y QE responsables entre pruebas. */
export function reiniciarFuentes(): void {
  fuentes.certificaciones = true;
  fuentes.pendientesAdmin = true;
  fuentes.cambiosAdmin = true;
  fuentes.impedimentos = true;
  reiniciarE4();
  usuarios.splice(cantidadUsuariosInicial);
  for (const u of usuarios) {
    const rol = rolesIniciales.get(u.id);
    if (rol) u.rol = rol;
  }
  for (const h of hdus) {
    const qe = qeIniciales.get(h.id);
    if (qe) h.qeResponsableId = qe;
    delete h.simularChecklistCompleto;
  }
}
