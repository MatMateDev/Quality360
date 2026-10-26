// Datos de referencia de E4 (impedimentos y riesgos) para MSW, sobre el mismo universo de `data.ts`. Las fechas son
// relativas al momento de la prueba para que «6 días abiertos» o «hace 2 horas» no caduquen. Nada de esto es la
// fuente de datos del portal real: lo guarda el servicio Impedimentos.
import type { EstadoImpedimento, NivelRiesgo, TipoAccionImpedimento, TipoImpedimento } from "@/types/dominio";
import { ID } from "./data";

export type RolPersonaMock = "ANALISTA_QA" | "QE" | "LIDER_QA" | "ADMINISTRADOR";

export interface ImpedimentoMock {
  id: string;
  hduId: string;
  tipo: TipoImpedimento;
  titulo: string;
  descripcion: string;
  estado: EstadoImpedimento;
  /** `null` = tercero escrito a mano (D63). */
  responsableId: string | null;
  responsableNombre: string;
  creadoPorId: string;
  creadoPorRol: "ANALISTA_QA" | "QE";
  fechaRegistro: string;
  abiertoDesde: string;
  fechaResolucion: string | null;
}

export interface AccionMock {
  id: string;
  impedimentoId: string;
  tipo: TipoAccionImpedimento;
  estadoAnterior: EstadoImpedimento | null;
  estado: EstadoImpedimento;
  actorId: string;
  fecha: string;
  comentario: string;
  detalle: { anterior: { id: string | null; nombre: string }; nuevo: { id: string | null; nombre: string } } | null;
}

export interface RiesgoFijadoMock {
  id: string;
  hduId: string;
  nivel: NivelRiesgo;
  nivelAnterior: NivelRiesgo | null;
  justificacion: string;
  sugeridoAlFijar: NivelRiesgo | null;
  actorId: string;
  fecha: string;
}

export const I = {
  i1: "e4000000-0000-4000-8000-000000000001",
  i2: "e4000000-0000-4000-8000-000000000002",
  i3: "e4000000-0000-4000-8000-000000000003",
  i4: "e4000000-0000-4000-8000-000000000004",
  i5: "e4000000-0000-4000-8000-000000000005",
} as const;

const MS_DIA = 86_400_000;
const hace = (ms: number) => new Date(Date.now() - ms).toISOString();
const haceDias = (dias: number) => hace(dias * MS_DIA);

/** Días entre «hoy» y el fin del sprint de cada HDU del universo (negativo = ya venció). */
export const diasHastaFinSprint: Record<string, number> = {
  [ID.hdu1]: 2,
  [ID.hdu2]: 6,
  [ID.hdu3]: 20,
  [ID.hdu4]: 20,
  [ID.hdu5]: -3,
  [ID.hdu6]: 20,
};

function inicialImpedimentos(): ImpedimentoMock[] {
  return [
    {
      id: I.i1,
      hduId: ID.hdu3,
      tipo: "AMBIENTE",
      titulo: "Ambiente QA no responde",
      descripcion: "El ambiente de pruebas no responde desde la mañana y no se puede ejecutar el regresivo.",
      estado: "ABIERTO",
      responsableId: ID.qe1,
      responsableNombre: "Jose Seguel",
      creadoPorId: ID.qa3,
      creadoPorRol: "ANALISTA_QA",
      fechaRegistro: hace(2 * 3_600_000),
      abiertoDesde: hace(2 * 3_600_000),
      fechaResolucion: null,
    },
    {
      id: I.i2,
      hduId: ID.hdu1,
      tipo: "DATOS_PRUEBA",
      titulo: "Faltan cuentas de prueba con saldo",
      descripcion: "Faltan cuentas de prueba con saldo suficiente para ejecutar los entregables 4 al 6 del checklist.",
      estado: "ABIERTO",
      responsableId: ID.qe1,
      responsableNombre: "Jose Seguel",
      creadoPorId: ID.qa1,
      creadoPorRol: "ANALISTA_QA",
      fechaRegistro: haceDias(6),
      abiertoDesde: haceDias(6),
      fechaResolucion: null,
    },
    {
      id: I.i3,
      hduId: ID.hdu6,
      tipo: "DEPENDENCIA",
      titulo: "API de Pagos sin sandbox",
      descripcion: "El equipo de Pagos aún no entrega el sandbox de la API que necesitamos para probar.",
      estado: "ESCALADO",
      responsableId: ID.lider1,
      responsableNombre: "Luis Soto",
      creadoPorId: ID.qa3,
      creadoPorRol: "ANALISTA_QA",
      fechaRegistro: haceDias(3),
      abiertoDesde: haceDias(3),
      fechaResolucion: null,
    },
    {
      id: I.i4,
      hduId: ID.hdu2,
      tipo: "REQUISITOS",
      titulo: "Criterio de aceptación ambiguo",
      descripcion: "El criterio de aceptación 3 admite dos lecturas y no se puede diseñar el caso.",
      estado: "RESUELTO",
      responsableId: ID.qe1,
      responsableNombre: "Jose Seguel",
      creadoPorId: ID.qa1,
      creadoPorRol: "ANALISTA_QA",
      fechaRegistro: haceDias(5),
      abiertoDesde: haceDias(5),
      fechaResolucion: haceDias(2),
    },
    {
      id: I.i5,
      hduId: ID.hdu4,
      tipo: "ACCESO",
      titulo: "Permisos de la herramienta de pruebas",
      descripcion: "Faltaban los permisos de la herramienta de pruebas para el equipo de Tarjetas.",
      estado: "RESUELTO",
      responsableId: ID.qe1,
      responsableNombre: "Jose Seguel",
      creadoPorId: ID.qa1,
      creadoPorRol: "ANALISTA_QA",
      fechaRegistro: haceDias(20),
      abiertoDesde: haceDias(20),
      fechaResolucion: haceDias(15),
    },
  ];
}

function inicialAcciones(): AccionMock[] {
  const reg = (id: string, imp: ImpedimentoMock): AccionMock => ({
    id,
    impedimentoId: imp.id,
    tipo: "REGISTRAR",
    estadoAnterior: null,
    estado: "ABIERTO",
    actorId: imp.creadoPorId,
    fecha: imp.fechaRegistro,
    comentario: "Registro del impedimento",
    detalle: null,
  });
  const [i1, i2, i3, i4, i5] = inicialImpedimentos();
  return [
    reg("e4a00000-0000-4000-8000-000000000001", i1!),
    reg("e4a00000-0000-4000-8000-000000000002", i2!),
    reg("e4a00000-0000-4000-8000-000000000003", i3!),
    {
      id: "e4a00000-0000-4000-8000-000000000004",
      impedimentoId: I.i3,
      tipo: "ESCALAR",
      estadoAnterior: "ABIERTO",
      estado: "ESCALADO",
      actorId: ID.qe1,
      fecha: haceDias(1),
      comentario: "Requiere gestión con el equipo de Pagos.",
      detalle: { anterior: { id: ID.qe1, nombre: "Jose Seguel" }, nuevo: { id: ID.lider1, nombre: "Luis Soto" } },
    },
    reg("e4a00000-0000-4000-8000-000000000005", i4!),
    {
      id: "e4a00000-0000-4000-8000-000000000006",
      impedimentoId: I.i4,
      tipo: "RESOLVER",
      estadoAnterior: "ABIERTO",
      estado: "RESUELTO",
      actorId: ID.qe1,
      fecha: haceDias(2),
      comentario: "Se aclaró el criterio con el PO",
      detalle: null,
    },
    reg("e4a00000-0000-4000-8000-000000000007", i5!),
    {
      id: "e4a00000-0000-4000-8000-000000000008",
      impedimentoId: I.i5,
      tipo: "RESOLVER",
      estadoAnterior: "ABIERTO",
      estado: "RESUELTO",
      actorId: ID.qe1,
      fecha: haceDias(15),
      comentario: "Permisos entregados.",
      detalle: null,
    },
  ];
}

function inicialRiesgos(): RiesgoFijadoMock[] {
  return [
    {
      id: "e4b00000-0000-4000-8000-000000000001",
      hduId: ID.hdu6,
      nivel: "MEDIO",
      nivelAnterior: null,
      justificacion: "Dependencia en gestión con el equipo de Pagos",
      sugeridoAlFijar: "ALTO",
      actorId: ID.qe1,
      fecha: haceDias(2),
    },
  ];
}

export const impedimentosMock: ImpedimentoMock[] = inicialImpedimentos();
export const accionesMock: AccionMock[] = inicialAcciones();
export const riesgosMock: RiesgoFijadoMock[] = inicialRiesgos();

/** Restaura impedimentos, acciones y riesgo fijado entre pruebas (lo invoca `reiniciarFuentes`). */
export function reiniciarE4(): void {
  impedimentosMock.splice(0, impedimentosMock.length, ...inicialImpedimentos());
  accionesMock.splice(0, accionesMock.length, ...inicialAcciones());
  riesgosMock.splice(0, riesgosMock.length, ...inicialRiesgos());
}
