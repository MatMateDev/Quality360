/**
 * Validación de los cuerpos de configuración, prueba, sincronización y archivos. El sitio se valida aquí, sin ninguna
 * llamada saliente (D95): solo `https://<subdominio>.atlassian.net` (y, en pruebas, `http://127.0.0.1:<puerto>`).
 */
import type { ConfiguracionIntegraciones } from '../../configuracion.js';
import { MAXIMO_BYTES_ARCHIVO } from '../../dominio/ejecucion.js';
import { ErrorEstructuraArchivo } from '../../dominio/errores.js';
import type { EntradaArchivo } from '../../aplicacion/archivos.servicio.js';
import { TIPOS_ISSUE_POR_DEFECTO, type EntradaGuardado, type EntradaPrueba } from '../../aplicacion/configuracion.servicio.js';
import type { EntradaSincronizacion } from '../../aplicacion/sincronizacion.servicio.js';
import { validarSitio } from '../../dominio/mapeo/sitio.js';
import { Acumulador, objeto } from './comunes.js';

const PROYECTO = /^[A-Z][A-Z0-9_]{1,9}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPO_ISSUE = /^[\p{L}\p{N} _-]+$/u;
const CLAVE_CONTINUAR = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function sitio(datos: Record<string, unknown>, a: Acumulador, permitirHostPrueba: boolean, requerido: boolean): string | undefined {
  const valor = datos.sitio;
  if (valor === undefined || valor === null) {
    if (requerido) a.falla('sitio', 'REQUERIDO', 'El sitio es obligatorio.');
    return undefined;
  }
  if (typeof valor !== 'string' || valor.length > 100) {
    a.falla('sitio', 'FORMATO_INVALIDO', 'El sitio debe ser un texto de hasta 100 caracteres.');
    return undefined;
  }
  const validado = validarSitio(valor, { permitirHostPrueba });
  if (!validado.ok) {
    // D95: sin ruta, puerto ni credenciales; no se llama a nada.
    a.falla('sitio', 'VALOR_NO_PERMITIDO', 'El sitio debe ser https://<subdominio>.atlassian.net.');
    return undefined;
  }
  return validado.sitio;
}

function correo(datos: Record<string, unknown>, a: Acumulador, requerido: boolean): string | undefined {
  const valor = datos.correo;
  if (valor === undefined || valor === null) {
    if (requerido) a.falla('correo', 'REQUERIDO', 'El correo es obligatorio.');
    return undefined;
  }
  if (typeof valor !== 'string' || valor.length > 150 || !CORREO.test(valor)) {
    a.falla('correo', 'FORMATO_INVALIDO', 'El correo no tiene un formato válido (hasta 150 caracteres).');
    return undefined;
  }
  return valor;
}

/** Ausente o vacío conserva el token guardado (D116); presente, de 8 a 200 caracteres. */
function token(datos: Record<string, unknown>, a: Acumulador): string | undefined {
  const valor = datos.token;
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (typeof valor !== 'string' || valor.length < 8 || valor.length > 200) {
    a.falla('token', 'LONGITUD_INVALIDA', 'El API token debe tener entre 8 y 200 caracteres.');
    return undefined;
  }
  return valor;
}

function proyecto(datos: Record<string, unknown>, a: Acumulador, requerido: boolean): string | undefined {
  const valor = datos.proyecto;
  if (valor === undefined || valor === null) {
    if (requerido) a.falla('proyecto', 'REQUERIDO', 'El proyecto es obligatorio.');
    return undefined;
  }
  if (typeof valor !== 'string' || !PROYECTO.test(valor)) {
    a.falla('proyecto', 'FORMATO_INVALIDO', 'La clave del proyecto debe ser como QTY (mayúsculas, números y guion bajo, de 2 a 10 caracteres).');
    return undefined;
  }
  return valor;
}

function tipos(datos: Record<string, unknown>, a: Acumulador, porDefecto: string[] | undefined): string[] | undefined {
  const valor = datos.tiposIssue;
  if (valor === undefined || valor === null) return porDefecto;
  if (!Array.isArray(valor) || valor.length < 1 || valor.length > 5) {
    a.falla('tiposIssue', 'LONGITUD_INVALIDA', 'Indica de 1 a 5 tipos de issue.');
    return undefined;
  }
  const lista: string[] = [];
  for (const tipo of valor) {
    if (typeof tipo !== 'string' || tipo.length < 1 || tipo.length > 40 || !TIPO_ISSUE.test(tipo)) {
      a.falla('tiposIssue', 'FORMATO_INVALIDO', 'Cada tipo debe tener de 1 a 40 letras, números, espacios, guiones o guiones bajos.');
      return undefined;
    }
    lista.push(tipo);
  }
  return lista;
}

/** `PUT /v1/integraciones/jira/configuracion`. */
export function leerGuardado(cuerpo: unknown, configuracion: ConfiguracionIntegraciones): EntradaGuardado {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['sitio', 'correo', 'token', 'proyecto', 'tiposIssue', 'celulaId', 'qeResponsableId', 'sprintRespaldoId']);
  const entrada = {
    sitio: sitio(datos, a, configuracion.permitirHostPrueba, true),
    correo: correo(datos, a, true),
    token: token(datos, a),
    proyecto: proyecto(datos, a, true),
    tiposIssue: tipos(datos, a, TIPOS_ISSUE_POR_DEFECTO),
    celulaId: a.uuid(datos, 'celulaId'),
    qeResponsableId: a.uuid(datos, 'qeResponsableId'),
    sprintRespaldoId: a.uuid(datos, 'sprintRespaldoId'),
  };
  a.lanzarSiHay();
  return entrada as EntradaGuardado;
}

/** `POST /v1/integraciones/jira/configuracion/probar`: el cuerpo es opcional y cada campo es opcional. */
export function leerPrueba(cuerpo: unknown, configuracion: ConfiguracionIntegraciones): EntradaPrueba {
  const datos = objeto(cuerpo, true);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['sitio', 'correo', 'token', 'proyecto', 'tiposIssue']);
  const entrada = {
    sitio: sitio(datos, a, configuracion.permitirHostPrueba, false),
    correo: correo(datos, a, false),
    token: token(datos, a),
    proyecto: proyecto(datos, a, false),
  };
  tipos(datos, a, undefined);
  a.lanzarSiHay();
  return entrada;
}

/** `POST /v1/integraciones/jira/sincronizaciones`. */
export function leerSincronizacion(cuerpo: unknown): EntradaSincronizacion {
  const datos = objeto(cuerpo, true);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['continuarDesde', 'vincularExistentes']);
  let continuarDesde: string | undefined;
  if (datos.continuarDesde !== undefined) {
    const valor = datos.continuarDesde;
    if (typeof valor !== 'string' || valor.length > 40 || !CLAVE_CONTINUAR.test(valor)) {
      // Se valida antes de interpolarla en la consulta a Jira (D96).
      a.falla('continuarDesde', 'FORMATO_INVALIDO', 'La clave desde la que continuar no es válida.');
    } else continuarDesde = valor;
  }
  const vincularExistentes = a.booleano(datos, 'vincularExistentes');
  a.lanzarSiHay();
  return { continuarDesde, vincularExistentes };
}

/**
 * `archivos/vista-previa` e `importaciones`. Orden: 413 si `contenido` supera 1 MB (antes que cualquier 400) → 400 de
 * forma → 422 (formato y estructura, en la aplicación).
 */
export function leerArchivo(cuerpo: unknown): EntradaArchivo {
  const datos = objeto(cuerpo);
  if (typeof datos.contenido === 'string' && Buffer.byteLength(datos.contenido, 'utf8') > MAXIMO_BYTES_ARCHIVO) {
    throw new ErrorEstructuraArchivo('ARCHIVO_MUY_GRANDE', null);
  }
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['formato', 'nombre', 'contenido', 'estricto', 'vincularExistentes']);
  let formato = '';
  if (typeof datos.formato !== 'string' || datos.formato.length > 10) a.falla('formato', datos.formato === undefined ? 'REQUERIDO' : 'FORMATO_INVALIDO', 'El formato es obligatorio (hasta 10 caracteres).');
  else formato = datos.formato;
  let nombre = '';
  if (typeof datos.nombre !== 'string' || datos.nombre.length < 1 || datos.nombre.length > 150) a.falla('nombre', datos.nombre === undefined ? 'REQUERIDO' : 'LONGITUD_INVALIDA', 'El nombre del archivo es obligatorio (hasta 150 caracteres).');
  else nombre = datos.nombre;
  let contenido = '';
  if (typeof datos.contenido !== 'string') a.falla('contenido', datos.contenido === undefined ? 'REQUERIDO' : 'FORMATO_INVALIDO', 'El contenido debe ser un texto.');
  else contenido = datos.contenido;
  const estricto = a.booleano(datos, 'estricto');
  const vincularExistentes = a.booleano(datos, 'vincularExistentes');
  a.lanzarSiHay();
  return { formato, nombre, contenido, estricto, vincularExistentes };
}
