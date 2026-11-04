/**
 * Validación de los cuerpos de `/v1/interno/integraciones/*`. El esquema es amplio a propósito (comun.v1.yaml
 * `FilaUpsertHdu`): un valor fuera de la regla de negocio (código largo, título largo, prioridad desconocida) es
 * un error de LA FILA y no un 400 del lote. Un lote de 0 o de más de 25 filas, un campo desconocido o un tipo
 * equivocado sí son 400 `VALIDACION` con todos los campos que fallan.
 */
import { errorValidacion, type CodigoDetalle, type DetalleError } from '@quality360/auth-nest';

import type { DestinoHdu, SolicitudUpsert } from '../../aplicacion/integraciones.servicio.js';
import type { FilaUpsert } from '../../dominio/reglas/upsert-hdu.js';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ORIGENES = ['JIRA', 'CSV', 'JSON'] as const;
const MAXIMO_FILAS = 25;

export class Acumulador {
  readonly detalles: DetalleError[] = [];

  falla(campo: string, codigo: CodigoDetalle, mensaje: string): void {
    this.detalles.push({ campo, codigo, mensaje });
  }

  lanzarSiHay(): void {
    if (this.detalles.length > 0) throw errorValidacion(this.detalles, this.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join('; '));
  }

  sinCamposExtra(datos: Record<string, unknown>, permitidos: readonly string[], prefijo: string): void {
    for (const campo of Object.keys(datos)) {
      if (!permitidos.includes(campo)) this.falla(`${prefijo}${campo}`, 'NO_PERMITIDO', 'Campo no admitido.');
    }
  }

  uuid(datos: Record<string, unknown>, campo: string, prefijo = ''): string {
    const valor = datos[campo];
    if (valor === undefined || valor === null) this.falla(`${prefijo}${campo}`, 'REQUERIDO', 'Es obligatorio.');
    else if (typeof valor !== 'string' || !UUID.test(valor)) this.falla(`${prefijo}${campo}`, 'FORMATO_INVALIDO', 'Debe ser un UUID.');
    else return valor.toLowerCase();
    return '';
  }

  booleano(datos: Record<string, unknown>, campo: string): boolean {
    const valor = datos[campo];
    if (valor === undefined) return false;
    if (typeof valor !== 'boolean') {
      this.falla(campo, 'FORMATO_INVALIDO', 'Debe ser verdadero o falso.');
      return false;
    }
    return valor;
  }

  /** Texto opcional y anulable con un largo máximo. */
  textoAnulable(datos: Record<string, unknown>, campo: string, maximo: number, prefijo: string): string | null {
    const valor = datos[campo];
    if (valor === undefined || valor === null) return null;
    if (typeof valor !== 'string') {
      this.falla(`${prefijo}${campo}`, 'FORMATO_INVALIDO', 'Debe ser un texto.');
      return null;
    }
    if (valor.length > maximo) {
      this.falla(`${prefijo}${campo}`, 'LONGITUD_INVALIDA', `Debe tener como máximo ${maximo} caracteres.`);
      return null;
    }
    return valor;
  }
}

export function objeto(cuerpo: unknown): Record<string, unknown> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw errorValidacion([{ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: 'El cuerpo debe ser un objeto JSON.' }]);
  }
  return cuerpo as Record<string, unknown>;
}

/** `POST /v1/interno/integraciones/destino`. */
export function leerDestino(cuerpo: unknown): DestinoHdu {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['celulaId', 'qeResponsableId', 'sprintRespaldoId'], '');
  const destino = { celulaId: a.uuid(datos, 'celulaId'), qeResponsableId: a.uuid(datos, 'qeResponsableId'), sprintRespaldoId: a.uuid(datos, 'sprintRespaldoId') };
  a.lanzarSiHay();
  return destino;
}

const CAMPOS_FILA = ['fila', 'codigo', 'titulo', 'descripcion', 'prioridad', 'celula', 'sprint', 'qeCorreo', 'claveExterna', 'urlExterna', 'operacion', 'asignacion'];
const CAMPOS_ASIGNACION_FILA = ['celulaId', 'qeResponsableId', 'analistaId', 'sprintId'] as const;

/** `operacion` y `asignacion`: obligatorias en el modo confirmación (la asignación, solo en `CREAR`) y prohibidas sin él (400). */
function leerOperacion(datos: Record<string, unknown>, prefijo: string, confirmacion: boolean, a: Acumulador): Pick<FilaUpsert, 'operacion' | 'asignacion'> {
  if (!confirmacion) {
    if (datos.operacion !== undefined) a.falla(`${prefijo}operacion`, 'NO_PERMITIDO', 'Solo se admite con consultaId.');
    if (datos.asignacion !== undefined) a.falla(`${prefijo}asignacion`, 'NO_PERMITIDO', 'Solo se admite con consultaId.');
    return {};
  }
  if (datos.operacion !== 'CREAR' && datos.operacion !== 'ACTUALIZAR') {
    a.falla(`${prefijo}operacion`, datos.operacion === undefined ? 'REQUERIDO' : 'VALOR_NO_PERMITIDO', 'Debe ser CREAR o ACTUALIZAR.');
    return {};
  }
  if (datos.operacion === 'ACTUALIZAR') {
    if (datos.asignacion !== undefined) a.falla(`${prefijo}asignacion`, 'NO_PERMITIDO', 'Solo se admite en CREAR.');
    return { operacion: 'ACTUALIZAR' };
  }
  const crudo = datos.asignacion;
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    a.falla(`${prefijo}asignacion`, 'REQUERIDO', 'La asignación es obligatoria en CREAR.');
    return {};
  }
  const d = crudo as Record<string, unknown>;
  a.sinCamposExtra(d, CAMPOS_ASIGNACION_FILA, `${prefijo}asignacion.`);
  const asignacion = {
    celulaId: a.uuid(d, 'celulaId', `${prefijo}asignacion.`),
    qeResponsableId: a.uuid(d, 'qeResponsableId', `${prefijo}asignacion.`),
    analistaId: a.uuid(d, 'analistaId', `${prefijo}asignacion.`),
    sprintId: a.uuid(d, 'sprintId', `${prefijo}asignacion.`),
  };
  return { operacion: 'CREAR', asignacion };
}

function leerFila(valor: unknown, indice: number, a: Acumulador, confirmacion: boolean): FilaUpsert | null {
  const prefijo = `filas[${indice}].`;
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    a.falla(`filas[${indice}]`, 'FORMATO_INVALIDO', 'Cada fila debe ser un objeto.');
    return null;
  }
  const datos = valor as Record<string, unknown>;
  const antes = a.detalles.length;
  a.sinCamposExtra(datos, CAMPOS_FILA, prefijo);

  const numero = datos.fila;
  if (typeof numero !== 'number' || !Number.isInteger(numero) || numero < 1) a.falla(`${prefijo}fila`, 'FORMATO_INVALIDO', 'Debe ser un entero mayor o igual a 1.');

  let codigo = '';
  if (typeof datos.codigo !== 'string') a.falla(`${prefijo}codigo`, 'REQUERIDO', 'El código es obligatorio.');
  else if (datos.codigo.length > 200) a.falla(`${prefijo}codigo`, 'LONGITUD_INVALIDA', 'Debe tener como máximo 200 caracteres.');
  else codigo = datos.codigo;

  if (datos.titulo === undefined) a.falla(`${prefijo}titulo`, 'REQUERIDO', 'El título es obligatorio (puede ser null).');
  const titulo = a.textoAnulable(datos, 'titulo', 1000, prefijo);
  const descripcion = a.textoAnulable(datos, 'descripcion', 1000, prefijo);
  // La prioridad desconocida no es un 400: la fila queda con error `PRIORIDAD_INVALIDA`.
  const prioridad = a.textoAnulable(datos, 'prioridad', 40, prefijo);
  const celula = a.textoAnulable(datos, 'celula', 120, prefijo);
  const sprint = a.textoAnulable(datos, 'sprint', 120, prefijo);
  const qeCorreo = a.textoAnulable(datos, 'qeCorreo', 150, prefijo);
  const claveExterna = a.textoAnulable(datos, 'claveExterna', 60, prefijo);
  const urlExterna = a.textoAnulable(datos, 'urlExterna', 300, prefijo);
  if (urlExterna !== null && !/^https?:\/\//.test(urlExterna)) a.falla(`${prefijo}urlExterna`, 'FORMATO_INVALIDO', 'Debe empezar con http:// o https://.');

  const { operacion, asignacion } = leerOperacion(datos, prefijo, confirmacion, a);

  if (a.detalles.length > antes) return null;
  return {
    fila: numero as number,
    codigo,
    titulo,
    descripcion,
    prioridad,
    celula,
    sprint,
    qeCorreo,
    claveExterna,
    urlExterna,
    ...(operacion === undefined ? {} : { operacion }),
    ...(asignacion === undefined ? {} : { asignacion }),
  };
}

/** `POST /v1/interno/integraciones/hdu/upsert`: de 1 a 25 filas; 26 o más → 400 (E5-B03-T13). */
export function leerSolicitudUpsert(cuerpo: unknown): SolicitudUpsert {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['origen', 'consultaId', 'soloSimular', 'vincularExistentes', 'estricto', 'destino', 'sprintNoEncontrado', 'filas'], '');
  const confirmacion = datos.consultaId !== undefined;
  const consultaId = confirmacion ? a.uuid(datos, 'consultaId') : undefined;

  let origen: SolicitudUpsert['origen'] = 'CSV';
  if (typeof datos.origen !== 'string' || !(ORIGENES as readonly string[]).includes(datos.origen)) a.falla('origen', 'VALOR_NO_PERMITIDO', 'Debe ser JIRA, CSV o JSON.');
  else origen = datos.origen as SolicitudUpsert['origen'];

  let sprintNoEncontrado: SolicitudUpsert['sprintNoEncontrado'];
  if (confirmacion) {
    if (datos.sprintNoEncontrado !== undefined) a.falla('sprintNoEncontrado', 'NO_PERMITIDO', 'No se usa con consultaId.');
  } else if (datos.sprintNoEncontrado !== 'RESPALDO' && datos.sprintNoEncontrado !== 'ERROR') a.falla('sprintNoEncontrado', 'VALOR_NO_PERMITIDO', 'Debe ser RESPALDO o ERROR.');
  else sprintNoEncontrado = datos.sprintNoEncontrado;

  const soloSimular = a.booleano(datos, 'soloSimular');
  const vincularExistentes = a.booleano(datos, 'vincularExistentes');
  const estricto = a.booleano(datos, 'estricto');
  if (confirmacion) {
    for (const campo of ['soloSimular', 'vincularExistentes', 'estricto']) {
      if (datos[campo] === true) a.falla(campo, 'NO_PERMITIDO', 'No se usa con consultaId.');
    }
  }

  let destino: DestinoHdu | undefined;
  if (confirmacion) {
    if (datos.destino !== undefined) a.falla('destino', 'NO_PERMITIDO', 'No se usa con consultaId.');
  } else if (typeof datos.destino !== 'object' || datos.destino === null || Array.isArray(datos.destino)) a.falla('destino', 'REQUERIDO', 'El destino es obligatorio.');
  else {
    const d = datos.destino as Record<string, unknown>;
    a.sinCamposExtra(d, ['celulaId', 'qeResponsableId', 'sprintRespaldoId'], 'destino.');
    destino = { celulaId: a.uuid(d, 'celulaId', 'destino.'), qeResponsableId: a.uuid(d, 'qeResponsableId', 'destino.'), sprintRespaldoId: a.uuid(d, 'sprintRespaldoId', 'destino.') };
  }

  const filas: FilaUpsert[] = [];
  if (!Array.isArray(datos.filas)) a.falla('filas', 'REQUERIDO', 'Las filas son obligatorias.');
  else if (datos.filas.length < 1 || datos.filas.length > MAXIMO_FILAS) a.falla('filas', 'LONGITUD_INVALIDA', `Un lote lleva de 1 a ${MAXIMO_FILAS} filas.`);
  else {
    datos.filas.forEach((valor, indice) => {
      const fila = leerFila(valor, indice, a, confirmacion);
      if (fila !== null) filas.push(fila);
    });
  }

  a.lanzarSiHay();
  return {
    origen,
    ...(consultaId === undefined ? {} : { consultaId }),
    soloSimular,
    vincularExistentes,
    estricto,
    ...(destino === undefined ? {} : { destino }),
    ...(sprintNoEncontrado === undefined ? {} : { sprintNoEncontrado }),
    filas,
  };
}
