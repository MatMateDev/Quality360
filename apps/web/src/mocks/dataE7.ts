// Datos de referencia de E7 (bandejas por rol) para MSW. Mismo universo que `data.ts`:
// Líder QA con células, Líder sin células, Auditor, estado de checklist por HDU, certificados,
// bitácora y auditoría de usuarios. Nada de esto es fuente de datos del portal real.
import { ID, hdus, usuarios, type UsuarioMock } from "./data";

export interface CelulaLiderMock {
  id: string;
  usuarioId: string;
  celulaId: string;
  desde: string;
  hasta: string | null;
  asignadoPorId: string;
}

/** Líder 1 a cargo de Pagos y Clientes; Líder 2 sin células. */
export const celulasLider: CelulaLiderMock[] = [
  { id: "f6000000-0000-4000-8000-000000000001", usuarioId: ID.lider1, celulaId: ID.celPagos, desde: "2026-09-01T09:00:00Z", hasta: null, asignadoPorId: ID.admin },
  { id: "f6000000-0000-4000-8000-000000000002", usuarioId: ID.lider1, celulaId: ID.celClientes, desde: "2026-09-01T09:00:00Z", hasta: null, asignadoPorId: ID.admin },
  { id: "f6000000-0000-4000-8000-000000000003", usuarioId: ID.lider1, celulaId: ID.celTarjetas, desde: "2026-08-01T09:00:00Z", hasta: "2026-09-01T09:00:00Z", asignadoPorId: ID.admin },
];

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
  { id: "f8000000-0000-4000-8000-000000000001", fecha: "2026-10-20T10:12:00Z", actorId: ID.admin, operacion: "ASIGNAR_CELULAS_LIDER", usuarioAfectadoId: ID.lider1, antes: { celulas: [] }, despues: { celulas: ["Pagos", "Clientes"] }, motivo: null },
  { id: "f8000000-0000-4000-8000-000000000002", fecha: "2026-10-19T09:00:00Z", actorId: ID.admin, operacion: "CAMBIAR_ROL", usuarioAfectadoId: ID.lider2, antes: { rol: "ANALISTA_QA" }, despues: { rol: "LIDER_QA" }, motivo: null },
  // Defensa: un registro con claves prohibidas; el portal no debe mostrarlas jamás (E7-F06-T04).
  { id: "f8000000-0000-4000-8000-000000000003", fecha: "2026-10-18T09:00:00Z", actorId: ID.admin, operacion: "CREAR_USUARIO", usuarioAfectadoId: ID.auditor, antes: null, despues: { nombre: "Andrea Mora", password: "secreto-no-mostrar", accessToken: "tok-no-mostrar", rol: "AUDITOR" }, motivo: null },
];

export interface FuentesMock {
  /** Certificaciones caída: contadores y seguimiento `indisponible`, bitácora y certificados 503. */
  certificaciones: boolean;
  /** Fuente de Organización de la bandeja del Administrador, bloque por bloque. */
  pendientesAdmin: boolean;
  cambiosAdmin: boolean;
}

export const fuentes: FuentesMock = { certificaciones: true, pendientesAdmin: true, cambiosAdmin: true };

/** Pruebas: deja caída una o más fuentes. `reiniciarFuentes` las restaura entre pruebas. */
export function simularFuentes(parcial: Partial<FuentesMock>): void {
  Object.assign(fuentes, parcial);
}

const celulasLiderInicial = celulasLider.map((c) => ({ ...c }));
const rolesIniciales = new Map(usuarios.map((u) => [u.id, u.rol]));
const qeIniciales = new Map(hdus.map((h) => [h.id, h.qeResponsableId]));

/** Restaura fuentes, células del líder, roles y QE responsables entre pruebas. */
export function reiniciarFuentes(): void {
  fuentes.certificaciones = true;
  fuentes.pendientesAdmin = true;
  fuentes.cambiosAdmin = true;
  celulasLider.splice(0, celulasLider.length, ...celulasLiderInicial.map((c) => ({ ...c })));
  for (const u of usuarios) {
    const rol = rolesIniciales.get(u.id);
    if (rol) u.rol = rol;
  }
  for (const h of hdus) {
    const qe = qeIniciales.get(h.id);
    if (qe) h.qeResponsableId = qe;
  }
}

export function celulasVigentesDe(usuarioId: string): string[] {
  return celulasLider.filter((c) => c.usuarioId === usuarioId && c.hasta === null).map((c) => c.celulaId);
}


/** Cierra las células vigentes que ya no están y abre las nuevas (historial con fechas). */
export function aplicarCelulasLider(usuario: UsuarioMock, celulaIds: string[], actorId: string) {
  const ahora = new Date().toISOString();
  for (const asignacion of celulasLider) {
    if (asignacion.usuarioId === usuario.id && asignacion.hasta === null && !celulaIds.includes(asignacion.celulaId)) asignacion.hasta = ahora;
  }
  const vigentes = celulasVigentesDe(usuario.id);
  for (const celulaId of celulaIds) {
    if (!vigentes.includes(celulaId)) {
      celulasLider.push({ id: crypto.randomUUID(), usuarioId: usuario.id, celulaId, desde: ahora, hasta: null, asignadoPorId: actorId });
    }
  }
}
