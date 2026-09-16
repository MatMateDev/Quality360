/** Configuración del servicio. Todo viene del entorno; sin valores por defecto para secretos. */
import { errorInterno, opcionesDesdeEntorno, type OpcionesVerificador } from '@quality360/auth-nest';

export const CONFIGURACION = Symbol.for('quality360.ConfiguracionImpedimentos');

export interface ConfiguracionImpedimentos {
  puerto: number;
  organizacionUrl: string;
  verificador: OpcionesVerificador;
}

function requerido(valor: string | undefined, nombre: string): string {
  if (valor === undefined || valor.trim().length === 0) throw errorInterno(`Falta la variable de entorno ${nombre}.`);
  return valor;
}

function leerEntero(valor: string | undefined, porDefecto: number, nombre: string): number {
  if (valor === undefined || valor.trim().length === 0) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw errorInterno(`${nombre} debe ser un entero >= 1: ${valor}`);
  return numero;
}

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): ConfiguracionImpedimentos {
  return {
    puerto: leerEntero(entorno.PORT, 3003, 'PORT'),
    organizacionUrl: requerido(entorno.ORGANIZACION_URL, 'ORGANIZACION_URL'),
    verificador: opcionesDesdeEntorno(entorno),
  };
}
