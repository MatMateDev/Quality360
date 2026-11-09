/** Validación de las rutas de la consulta de Jira: cuerpos estrictos (400 por campos desconocidos) y consultas del listado. */
import type { EntradaListadoItems } from '../../aplicacion/consulta.servicio.js';
import type { CambioAsignacion } from '../../dominio/consulta/asignacion.js';
import { GRUPOS, type GrupoConsulta } from '../../dominio/consulta/tipos.js';
import { Acumulador, consultaEnumerada, consultaTexto, leerPaginacion, objeto, UUID } from './comunes.js';

/** `POST /consultas`: cuerpo opcional `{reemplazar?}`. */
export function leerConsultar(cuerpo: unknown): { reemplazar: boolean } {
  const datos = objeto(cuerpo, true);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['reemplazar']);
  const reemplazar = a.booleano(datos, 'reemplazar');
  a.lanzarSiHay();
  return { reemplazar };
}

/** `GET …/items`: `grupo` obligatorio, `q` de hasta 100 caracteres, paginación D49 (25 por defecto, máximo 100 recortado). */
export function leerItems(consulta: Record<string, unknown>): EntradaListadoItems {
  const a = new Acumulador();
  let grupo: GrupoConsulta = 'NUEVA';
  if (consulta.grupo === undefined) a.falla('query.grupo', 'REQUERIDO', 'Es obligatorio.');
  else grupo = consultaEnumerada(consulta, 'grupo', GRUPOS, a) ?? 'NUEVA';
  const q = consultaTexto(consulta, 'q');
  if (consulta.q !== undefined && (q === undefined || q.length > 100)) a.falla('query.q', 'LONGITUD_INVALIDA', 'Debe ser un texto de hasta 100 caracteres.');
  const { pagina, tamanoPagina } = leerPaginacion(consulta, 25, 100, true, a);
  a.lanzarSiHay();
  return { grupo, q, pagina, tamanoPagina };
}

/** `POST …/confirmaciones`: `{version}` entero >= 1. */
export function leerConfirmacion(cuerpo: unknown): { version: number } {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['version']);
  let version = 1;
  if (datos.version === undefined) a.falla('version', 'REQUERIDO', 'Es obligatoria.');
  else if (typeof datos.version !== 'number' || !Number.isInteger(datos.version) || datos.version < 1) a.falla('version', 'FORMATO_INVALIDO', 'Debe ser un entero mayor o igual a 1.');
  else version = datos.version;
  a.lanzarSiHay();
  return { version };
}

/** `POST …/items/{itemId}/confirmaciones`: `{revision}` entero >= 1 (D202); cualquier otro campo es 400. */
export function leerConfirmacionFila(cuerpo: unknown): { revision: number } {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['revision']);
  let revision = 1;
  if (datos.revision === undefined) a.falla('revision', 'REQUERIDO', 'Es obligatoria.');
  else if (typeof datos.revision !== 'number' || !Number.isInteger(datos.revision) || datos.revision < 1 || datos.revision > 2_147_483_647) a.falla('revision', 'FORMATO_INVALIDO', 'Debe ser un entero mayor o igual a 1.');
  else revision = datos.revision;
  a.lanzarSiHay();
  return { revision };
}

export type AlcanceEdicion = { readonly tipo: 'IDS'; readonly itemIds: string[] } | { readonly tipo: 'GRUPO'; readonly grupo: 'NUEVA' | 'CAMBIO'; readonly q: string | undefined };

export interface EntradaEdicion {
  readonly alcance: AlcanceEdicion;
  readonly cambio?: CambioAsignacion;
  readonly marcada?: boolean;
  readonly marcarListas: boolean;
}

const CAMPOS_CAMBIO = ['celulaId', 'qeId', 'analistaId', 'sprintId'] as const;

/**
 * `PATCH …/items` (D139, D145). Alcance: `itemIds` (1 a 100, sin repetir) **o** `{grupo, todas: true, q?}`; nunca los dos. Al
 * menos uno de `asignacion`, `marcada` o `marcarListas`. Cualquier otro campo (`origen`, `estado`, `creadoPor`…) es 400.
 */
export function leerEdicion(cuerpo: unknown): EntradaEdicion {
  const datos = objeto(cuerpo);
  const a = new Acumulador();
  a.sinCamposExtra(datos, ['itemIds', 'grupo', 'todas', 'q', 'asignacion', 'marcada', 'marcarListas']);

  const hayIds = datos.itemIds !== undefined;
  const hayGrupo = datos.grupo !== undefined || datos.todas !== undefined;
  let alcance: AlcanceEdicion = { tipo: 'IDS', itemIds: [] };
  if (hayIds && hayGrupo) a.falla('itemIds', 'NO_PERMITIDO', 'Indica itemIds o grupo con todas, no ambos.');
  else if (!hayIds && !hayGrupo) a.falla('itemIds', 'REQUERIDO', 'Indica itemIds o grupo con todas.');
  else if (hayIds) {
    const ids = datos.itemIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) a.falla('itemIds', 'LONGITUD_INVALIDA', 'Indica de 1 a 100 ids.');
    else if (ids.some((id) => typeof id !== 'string' || !UUID.test(id))) a.falla('itemIds', 'FORMATO_INVALIDO', 'Cada id debe ser un UUID.');
    else if (new Set(ids.map((id) => (id as string).toLowerCase())).size !== ids.length) a.falla('itemIds', 'DUPLICADO', 'Los ids no pueden repetirse.');
    else alcance = { tipo: 'IDS', itemIds: (ids as string[]).map((id) => id.toLowerCase()) };
    if (datos.q !== undefined) a.falla('q', 'NO_PERMITIDO', 'q solo se usa con todas.');
  } else {
    if (datos.grupo !== 'NUEVA' && datos.grupo !== 'CAMBIO') a.falla('grupo', 'VALOR_NO_PERMITIDO', 'Debe ser NUEVA o CAMBIO.');
    if (datos.todas !== true) a.falla('todas', 'VALOR_NO_PERMITIDO', 'Debe ser true.');
    let q: string | undefined;
    if (datos.q !== undefined) {
      if (typeof datos.q !== 'string' || datos.q.length > 100) a.falla('q', 'LONGITUD_INVALIDA', 'Debe ser un texto de hasta 100 caracteres.');
      else q = datos.q;
    }
    if (datos.grupo === 'NUEVA' || datos.grupo === 'CAMBIO') alcance = { tipo: 'GRUPO', grupo: datos.grupo, q };
  }

  let cambio: CambioAsignacion | undefined;
  if (datos.asignacion !== undefined) {
    const c = datos.asignacion;
    if (typeof c !== 'object' || c === null || Array.isArray(c)) a.falla('asignacion', 'FORMATO_INVALIDO', 'Debe ser un objeto.');
    else {
      const o = c as Record<string, unknown>;
      for (const campo of Object.keys(o)) if (!(CAMPOS_CAMBIO as readonly string[]).includes(campo)) a.falla(`asignacion.${campo}`, 'NO_PERMITIDO', 'Campo no admitido.');
      const parcial: Record<string, string | null> = {};
      for (const campo of CAMPOS_CAMBIO) {
        const valor = o[campo];
        if (valor === undefined) continue;
        if (valor !== null && (typeof valor !== 'string' || !UUID.test(valor))) a.falla(`asignacion.${campo}`, 'FORMATO_INVALIDO', 'Debe ser un UUID o null.');
        else parcial[campo] = valor === null ? null : valor.toLowerCase();
      }
      if (Object.keys(o).length === 0) a.falla('asignacion', 'REQUERIDO', 'Indica al menos un campo.');
      cambio = parcial as CambioAsignacion;
    }
  }
  const marcada = datos.marcada === undefined ? undefined : a.booleano(datos, 'marcada');
  const marcarListas = a.booleano(datos, 'marcarListas');
  if (cambio === undefined && marcada === undefined && !marcarListas) a.falla('asignacion', 'REQUERIDO', 'Indica asignacion, marcada o marcarListas.');
  a.lanzarSiHay();
  return { alcance, ...(cambio === undefined ? {} : { cambio }), ...(marcada === undefined ? {} : { marcada }), marcarListas };
}
