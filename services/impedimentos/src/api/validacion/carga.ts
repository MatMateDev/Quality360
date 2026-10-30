/** Validación de las cargas de la semilla E4 (`/v1/interno/carga/*`). */
import type { CargaImpedimentoAccion, CargaImpedimentoDatos, CargaRiesgoDatos } from '../../dominio/repositorios.js';
import {
  ESTADOS_IMPEDIMENTO,
  NIVELES_RIESGO,
  TIPOS_IMPEDIMENTO,
  type EstadoImpedimento,
  type NivelRiesgo,
  type PersonaRol,
  type Responsable,
  type RolUsuario,
  type TipoAccion,
  type TipoImpedimento,
} from '../../dominio/tipos.js';
import { UUID, invalido } from './cuerpos.js';

type Json = Record<string, unknown>;

const ROLES: readonly RolUsuario[] = ['ADMINISTRADOR', 'QE', 'ANALISTA_QA', 'LIDER_QA', 'AUDITOR'];
const TIPOS_ACCION: readonly TipoAccion[] = ['REGISTRAR', 'ESCALAR', 'RESOLVER', 'REABRIR', 'SEGUIMIENTO'];

function objeto(valor: unknown, campo: string): Json {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un objeto JSON.' });
  }
  return valor as Json;
}

function uuid(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) return invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un UUID.' });
  return valor.toLowerCase();
}

function cadena(valor: unknown, campo: string, minimo: number, maximo: number): string {
  if (typeof valor !== 'string' || valor.length < minimo || valor.length > maximo) {
    return invalido({ campo, codigo: 'LONGITUD_INVALIDA', mensaje: `Debe tener entre ${minimo} y ${maximo} caracteres.` });
  }
  return valor;
}

function elegido<T extends string>(valor: unknown, campo: string, valores: readonly T[]): T {
  if (typeof valor !== 'string' || !(valores as readonly string[]).includes(valor)) {
    return invalido({ campo, codigo: 'VALOR_NO_PERMITIDO', mensaje: 'Valor no permitido.' });
  }
  return valor as T;
}

function fecha(valor: unknown, campo: string): Date {
  const instante = typeof valor === 'string' ? new Date(valor) : new Date(Number.NaN);
  if (Number.isNaN(instante.getTime())) return invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser una fecha-hora ISO 8601.' });
  return instante;
}

function personaRol(valor: unknown, campo: string): PersonaRol {
  const datos = objeto(valor, campo);
  return { id: uuid(datos.id, `${campo}.id`), nombre: cadena(datos.nombre, `${campo}.nombre`, 1, 150), rol: elegido(datos.rol, `${campo}.rol`, ROLES) };
}

function responsable(valor: unknown, campo: string): Responsable {
  const datos = objeto(valor, campo);
  return {
    id: datos.id === null || datos.id === undefined ? null : uuid(datos.id, `${campo}.id`),
    nombre: cadena(datos.nombre, `${campo}.nombre`, 1, 150),
  };
}

function accion(valor: unknown, indice: number): CargaImpedimentoAccion {
  const campo = `acciones[${indice}]`;
  const datos = objeto(valor, campo);
  const tipo = elegido<TipoAccion>(datos.tipo, `${campo}.tipo`, TIPOS_ACCION);
  return {
    tipo,
    estadoAnterior: datos.estadoAnterior === undefined || datos.estadoAnterior === null ? null : elegido<EstadoImpedimento>(datos.estadoAnterior, `${campo}.estadoAnterior`, ESTADOS_IMPEDIMENTO),
    estado: elegido<EstadoImpedimento>(datos.estado, `${campo}.estado`, ESTADOS_IMPEDIMENTO),
    actor: personaRol(datos.actor, `${campo}.actor`),
    fecha: fecha(datos.fecha, `${campo}.fecha`),
    comentario: cadena(datos.comentario, `${campo}.comentario`, 1, 500),
    ...(datos.responsableNuevo === undefined ? {} : { responsableNuevo: responsable(datos.responsableNuevo, `${campo}.responsableNuevo`) }),
  };
}

export function leerCargaImpedimento(cuerpo: unknown): CargaImpedimentoDatos {
  const datos = objeto(cuerpo, 'body');
  if (!Array.isArray(datos.acciones) || datos.acciones.length < 1) {
    return invalido({ campo: 'acciones', codigo: 'REQUERIDO', mensaje: 'Indica al menos una acción.' });
  }
  return {
    hduId: uuid(datos.hduId, 'hduId'),
    certificacionId: datos.certificacionId === undefined || datos.certificacionId === null ? null : uuid(datos.certificacionId, 'certificacionId'),
    tipo: elegido<TipoImpedimento>(datos.tipo, 'tipo', TIPOS_IMPEDIMENTO),
    titulo: cadena(datos.titulo, 'titulo', 5, 200),
    descripcion: cadena(datos.descripcion, 'descripcion', 10, 1000),
    responsableInicial: responsable(datos.responsableInicial, 'responsableInicial'),
    creadoPor: personaRol(datos.creadoPor, 'creadoPor'),
    acciones: (datos.acciones as unknown[]).map(accion),
  };
}

export function leerCargaRiesgo(cuerpo: unknown): CargaRiesgoDatos {
  const datos = objeto(cuerpo, 'body');
  return {
    hduId: uuid(datos.hduId, 'hduId'),
    nivel: elegido<NivelRiesgo>(datos.nivel, 'nivel', NIVELES_RIESGO),
    nivelAnterior: datos.nivelAnterior === undefined || datos.nivelAnterior === null ? null : elegido<NivelRiesgo>(datos.nivelAnterior, 'nivelAnterior', NIVELES_RIESGO),
    sugeridoAlFijar: datos.sugeridoAlFijar === undefined || datos.sugeridoAlFijar === null ? null : elegido<NivelRiesgo>(datos.sugeridoAlFijar, 'sugeridoAlFijar', NIVELES_RIESGO),
    justificacion: cadena(datos.justificacion, 'justificacion', 3, 500),
    actor: personaRol(datos.actor, 'actor'),
    fecha: fecha(datos.fecha, 'fecha'),
  };
}
