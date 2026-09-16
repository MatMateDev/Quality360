import { env } from "./env";

export interface UsuarioSemilla {
  clave: string;
  nombre: string;
  correo: string;
  rol: "ADMINISTRADOR" | "QE" | "ANALISTA_QA";
  activo: boolean;
}

/**
 * Usuarios cargados por `infrastructure/seed/mvp/datos.json` (ver también su
 * README). Todos comparten la contraseña de demo del entorno local. Ninguna
 * prueba modifica estos usuarios ni sus relaciones: las pruebas que mutan
 * datos crean sus propias entidades (regla de aislamiento de la Ola 2).
 */
export const USUARIOS_SEMILLA = {
  patricia: { clave: "patricia", nombre: "Patricia Rojas", correo: "patricia.rojas@quality360.local", rol: "ADMINISTRADOR", activo: true },
  carla: { clave: "carla", nombre: "Carla Fuentes", correo: "carla.fuentes@quality360.local", rol: "QE", activo: true },
  marcos: { clave: "marcos", nombre: "Marcos Ibanez", correo: "marcos.ibanez@quality360.local", rol: "QE", activo: true },
  sofia: { clave: "sofia", nombre: "Sofia Herrera", correo: "sofia.herrera@quality360.local", rol: "QE", activo: true },
  ana: { clave: "ana", nombre: "Ana Torres", correo: "ana.torres@quality360.local", rol: "ANALISTA_QA", activo: true },
  beatriz: { clave: "beatriz", nombre: "Beatriz Molina", correo: "beatriz.molina@quality360.local", rol: "ANALISTA_QA", activo: true },
  diego: { clave: "diego", nombre: "Diego Salazar", correo: "diego.salazar@quality360.local", rol: "ANALISTA_QA", activo: true },
  elena: { clave: "elena", nombre: "Elena Campos", correo: "elena.campos@quality360.local", rol: "ANALISTA_QA", activo: true },
  francisco: { clave: "francisco", nombre: "Francisco Reyes", correo: "francisco.reyes@quality360.local", rol: "ANALISTA_QA", activo: true },
  gabriela: { clave: "gabriela", nombre: "Gabriela Nunez", correo: "gabriela.nunez@quality360.local", rol: "ANALISTA_QA", activo: false },
} as const satisfies Record<string, UsuarioSemilla>;

export type ClaveUsuarioSemilla = keyof typeof USUARIOS_SEMILLA;

export function contrasenaDe(_clave: ClaveUsuarioSemilla): string {
  return env.contrasenaDemo;
}

/** Códigos de HDU sembrados, agrupados por lo que habilitan (ver infrastructure/seed/mvp/README.md). */
export const HDU_SEMILLA = {
  pag001: "HDU-PAG-001", // Ana, EN_EJECUCION (carla)
  pag002: "HDU-PAG-002", // Beatriz, DISENO_PRUEBAS (carla)
  pag003: "HDU-PAG-003", // Ana, PENDIENTE_CIERRE (carla)
  pag004: "HDU-PAG-004", // Beatriz, PENDIENTE (carla)
  pag005: "HDU-PAG-005", // Ana, DISENO_PRUEBAS (carla)
  pag006: "HDU-PAG-006", // sin analista, PENDIENTE (carla, asignable)
  cli001: "HDU-CLI-001", // Diego, EN_EJECUCION (marcos)
  cli002: "HDU-CLI-002", // Elena, PENDIENTE_CIERRE (marcos)
  cli003: "HDU-CLI-003", // Diego, DISENO_PRUEBAS (marcos)
  cli004: "HDU-CLI-004", // Elena, PENDIENTE (marcos)
  cli005: "HDU-CLI-005", // Diego, PENDIENTE_CIERRE (marcos)
  cli006: "HDU-CLI-006", // Elena, EN_EJECUCION (marcos)
  sof001: "HDU-SOF-001", // sin analista posible, PENDIENTE (sofia)
  sof002: "HDU-SOF-002", // sin analista posible, DISENO_PRUEBAS (sofia)
} as const;
