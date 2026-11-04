/**
 * Validación de los cuerpos de los internos de la consulta de Jira (E5 consulta y asignación, D136, D138, D151):
 * `hdu/estado-codigos` y `asignaciones/validar`. Todos los campos que fallan se informan a la vez (400 `VALIDACION`).
 */
import type { AsignacionAValidar } from '../../aplicacion/integraciones.servicio.js';
import { Acumulador, objeto } from './integraciones.js';

/** `POST /v1/interno/integraciones/hdu/estado-codigos`: de 1 a 100 códigos de hasta 60 caracteres (101 → 400). */
export function leerEstadoCodigos(cuerpo: unknown): string[] {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['codigos'], '');
  const codigos: string[] = [];
  if (!Array.isArray(datos.codigos)) a.falla('codigos', 'REQUERIDO', 'Los códigos son obligatorios.');
  else if (datos.codigos.length < 1 || datos.codigos.length > 100) a.falla('codigos', 'LONGITUD_INVALIDA', 'Se piden de 1 a 100 códigos.');
  else {
    datos.codigos.forEach((valor, indice) => {
      if (typeof valor !== 'string') a.falla(`codigos[${indice}]`, 'FORMATO_INVALIDO', 'Debe ser un texto.');
      else if (valor.length > 60) a.falla(`codigos[${indice}]`, 'LONGITUD_INVALIDA', 'Debe tener como máximo 60 caracteres.');
      else codigos.push(valor);
    });
  }
  a.lanzarSiHay();
  return codigos;
}

const CAMPOS_ASIGNACION = ['ref', 'celulaId', 'qeResponsableId', 'analistaId', 'sprintId', 'proponerSprint'];

function leerProponerSprint(valor: unknown, prefijo: string, a: Acumulador): AsignacionAValidar['proponerSprint'] {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    a.falla(`${prefijo}proponerSprint`, 'FORMATO_INVALIDO', 'Debe ser un objeto.');
    return undefined;
  }
  const p = valor as Record<string, unknown>;
  const ruta = `${prefijo}proponerSprint.`;
  a.sinCamposExtra(p, ['nombreJira', 'respaldoId'], ruta);
  let nombreJira: string | null = null;
  if (p.nombreJira === undefined) a.falla(`${ruta}nombreJira`, 'REQUERIDO', 'Es obligatorio (puede ser null).');
  else nombreJira = a.textoAnulable(p, 'nombreJira', 120, ruta);
  let respaldoId: string | null = null;
  if (p.respaldoId === undefined) a.falla(`${ruta}respaldoId`, 'REQUERIDO', 'Es obligatorio (puede ser null).');
  else if (p.respaldoId !== null) respaldoId = a.uuid(p, 'respaldoId', ruta);
  return { nombreJira, respaldoId };
}

/** `POST /v1/interno/integraciones/asignaciones/validar`: de 1 a 100 combinaciones; los campos ausentes no se validan. */
export function leerValidarAsignaciones(cuerpo: unknown): AsignacionAValidar[] {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['asignaciones'], '');
  const asignaciones: AsignacionAValidar[] = [];
  if (!Array.isArray(datos.asignaciones)) a.falla('asignaciones', 'REQUERIDO', 'Las asignaciones son obligatorias.');
  else if (datos.asignaciones.length < 1 || datos.asignaciones.length > 100) a.falla('asignaciones', 'LONGITUD_INVALIDA', 'Se piden de 1 a 100 asignaciones.');
  else {
    datos.asignaciones.forEach((valor, indice) => {
      const prefijo = `asignaciones[${indice}].`;
      if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
        a.falla(`asignaciones[${indice}]`, 'FORMATO_INVALIDO', 'Cada asignación debe ser un objeto.');
        return;
      }
      const d = valor as Record<string, unknown>;
      const antes = a.detalles.length;
      a.sinCamposExtra(d, CAMPOS_ASIGNACION, prefijo);
      let ref = '';
      if (typeof d.ref !== 'string' || d.ref.length === 0) a.falla(`${prefijo}ref`, 'REQUERIDO', 'La referencia es obligatoria.');
      else if (d.ref.length > 60) a.falla(`${prefijo}ref`, 'LONGITUD_INVALIDA', 'Debe tener como máximo 60 caracteres.');
      else ref = d.ref;
      const opcional = (campo: string): string | undefined => (d[campo] === undefined ? undefined : a.uuid(d, campo, prefijo));
      const celulaId = opcional('celulaId');
      const qeResponsableId = opcional('qeResponsableId');
      const analistaId = opcional('analistaId');
      const sprintId = opcional('sprintId');
      const proponerSprint = d.proponerSprint === undefined ? undefined : leerProponerSprint(d.proponerSprint, prefijo, a);
      if (a.detalles.length === antes) {
        asignaciones.push({
          ref,
          ...(celulaId === undefined ? {} : { celulaId }),
          ...(qeResponsableId === undefined ? {} : { qeResponsableId }),
          ...(analistaId === undefined ? {} : { analistaId }),
          ...(sprintId === undefined ? {} : { sprintId }),
          ...(proponerSprint === undefined ? {} : { proponerSprint }),
        });
      }
    });
  }
  a.lanzarSiHay();
  return asignaciones;
}
