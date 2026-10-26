/** Validación de la query: 400 `VALIDACION` con el campo que falla. Los parámetros que el contrato no define se ignoran. */
import type { EstadoHdu, EstadoImpedimento, NivelRiesgo, TipoImpedimento } from '../../dominio/tipos.js';
import { ESTADOS_IMPEDIMENTO, NIVELES_RIESGO, TIPOS_IMPEDIMENTO } from '../../dominio/tipos.js';
import type { AccionGestion, FiltroAuditorImpedimentos, FiltroGestion } from '../../dominio/repositorios.js';
import type { FiltrosImpedimentos, FiltrosRiesgoHdu } from '../../aplicacion/listados.servicio.js';
import { UUID, invalido } from './cuerpos.js';

type Consulta = Record<string, unknown>;

const TAMANO_POR_DEFECTO = 25;
const TAMANO_MAXIMO = 100;
const ESTADOS_HDU: readonly EstadoHdu[] = ['PENDIENTE', 'DISENO_PRUEBAS', 'EN_EJECUCION', 'PENDIENTE_CIERRE', 'CERRADA'];
const ACCIONES: readonly AccionGestion[] = ['REGISTRAR', 'ESCALAR', 'RESOLVER', 'REABRIR', 'SEGUIMIENTO', 'FIJAR_RIESGO'];

function texto(consulta: Consulta, campo: string): string | undefined {
  const valor = consulta[campo];
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string') return invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe enviarse una sola vez.' });
  return valor;
}

function uuid(consulta: Consulta, campo: string): string | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  if (!UUID.test(valor)) invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un UUID.' });
  return valor.toLowerCase();
}

function catalogo<T extends string>(consulta: Consulta, campo: string, valores: readonly T[]): T | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  if (!(valores as readonly string[]).includes(valor)) invalido({ campo, codigo: 'VALOR_NO_PERMITIDO', mensaje: 'Valor no permitido.' });
  return valor as T;
}

function fecha(consulta: Consulta, campo: string): Date | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(valor)) {
    invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser una fecha ISO 8601.' });
  }
  return instante;
}

function entero(consulta: Consulta, campo: string): number | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un entero mayor o igual a 1.' });
  return numero;
}

function booleano(consulta: Consulta, campo: string): boolean | undefined {
  const valor = texto(consulta, campo);
  if (valor === undefined) return undefined;
  if (valor !== 'true' && valor !== 'false') invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser true o false.' });
  return valor === 'true';
}

function busqueda(consulta: Consulta): string | undefined {
  const valor = texto(consulta, 'q');
  if (valor === undefined) return undefined;
  if (valor.length < 2 || valor.length > 120) invalido({ campo: 'q', codigo: 'LONGITUD_INVALIDA', mensaje: 'Entre 2 y 120 caracteres.' });
  return valor;
}

function rango(consulta: Consulta): { desde?: Date; hasta?: Date } {
  const desde = fecha(consulta, 'desde');
  const hasta = fecha(consulta, 'hasta');
  if (desde !== undefined && hasta !== undefined && hasta.getTime() < desde.getTime()) {
    invalido({ campo: 'hasta', codigo: 'VALOR_NO_PERMITIDO', mensaje: 'hasta no puede ser anterior a desde.' });
  }
  return { desde, hasta };
}

/** `columna:asc|desc` con las columnas permitidas. */
function orden<C extends string>(consulta: Consulta, columnas: readonly C[]): { columna: C; sentido: 'asc' | 'desc' } | undefined {
  const valor = texto(consulta, 'orden');
  if (valor === undefined) return undefined;
  const partes = valor.split(':');
  const [columna, sentido] = partes;
  if (partes.length !== 2 || !(columnas as readonly string[]).includes(columna ?? '') || (sentido !== 'asc' && sentido !== 'desc')) {
    invalido({ campo: 'orden', codigo: 'VALOR_NO_PERMITIDO', mensaje: `Usa columna:asc|desc con ${columnas.join(', ')}.` });
  }
  return { columna: columna as C, sentido: sentido as 'asc' | 'desc' };
}

/** Página y tamaño (25 por defecto; un tamaño mayor a 100 se recorta sin error, D49). */
export function leerPaginacion(consulta: Consulta): { pagina: number; tamanoPagina: number } {
  return { pagina: entero(consulta, 'pagina') ?? 1, tamanoPagina: Math.min(entero(consulta, 'tamanoPagina') ?? TAMANO_POR_DEFECTO, TAMANO_MAXIMO) };
}

export function leerFiltrosImpedimentos(consulta: Consulta): FiltrosImpedimentos {
  return {
    estado: catalogo<EstadoImpedimento>(consulta, 'estado', ESTADOS_IMPEDIMENTO),
    tipo: catalogo<TipoImpedimento>(consulta, 'tipo', TIPOS_IMPEDIMENTO),
    celulaId: uuid(consulta, 'celulaId'),
    analistaId: uuid(consulta, 'analistaId'),
    riesgo: catalogo<NivelRiesgo>(consulta, 'riesgo', NIVELES_RIESGO),
    incluirResueltos: booleano(consulta, 'incluirResueltos') ?? false,
    q: busqueda(consulta),
    orden: orden(consulta, ['riesgo', 'diasAbierto', 'fechaRegistro'] as const),
    ...leerPaginacion(consulta),
  };
}

export function leerFiltrosRiesgoHdu(consulta: Consulta): FiltrosRiesgoHdu {
  return {
    nivel: catalogo<NivelRiesgo>(consulta, 'nivel', NIVELES_RIESGO),
    celulaId: uuid(consulta, 'celulaId'),
    sprintId: uuid(consulta, 'sprintId'),
    analistaId: uuid(consulta, 'analistaId'),
    estado: catalogo<EstadoHdu>(consulta, 'estado', ESTADOS_HDU),
    soloBloqueadas: booleano(consulta, 'soloBloqueadas') ?? false,
    q: busqueda(consulta),
    orden: orden(consulta, ['riesgo', 'impedimentosAbiertos', 'codigo', 'avance'] as const),
    ...leerPaginacion(consulta),
  };
}

export function leerProposito(consulta: Consulta): 'REGISTRO' | 'ESCALAMIENTO' {
  const valor = texto(consulta, 'proposito');
  if (valor === undefined) return invalido({ campo: 'proposito', codigo: 'REQUERIDO', mensaje: 'Indica REGISTRO o ESCALAMIENTO.' });
  return catalogo(consulta, 'proposito', ['REGISTRO', 'ESCALAMIENTO'] as const) as 'REGISTRO' | 'ESCALAMIENTO';
}

/** `GET /v1/hdu/{hduId}/gestion-impedimentos`: `desde`, `hasta`, `tipo` y `orden=fecha:asc|desc`. */
export function leerFiltrosHistorialHdu(consulta: Consulta): { desde?: Date; hasta?: Date; tipo?: 'IMPEDIMENTO' | 'RIESGO'; descendente: boolean } {
  const ordenFecha = catalogo(consulta, 'orden', ['fecha:asc', 'fecha:desc'] as const);
  return { ...rango(consulta), tipo: catalogo(consulta, 'tipo', ['IMPEDIMENTO', 'RIESGO'] as const), descendente: ordenFecha === 'fecha:desc' };
}

export const NOMBRES_FILTROS_IMPEDIMENTOS: readonly string[] = ['desde', 'hasta', 'hduId', 'estado', 'tipo', 'q'];
export const NOMBRES_FILTROS_GESTION: readonly string[] = ['desde', 'hasta', 'hduId', 'actorId', 'estado', 'tipo', 'accion'];

export function leerFiltrosAuditorImpedimentos(consulta: Consulta): FiltroAuditorImpedimentos {
  return {
    ...rango(consulta),
    hduId: uuid(consulta, 'hduId'),
    estado: catalogo<EstadoImpedimento>(consulta, 'estado', ESTADOS_IMPEDIMENTO),
    tipo: catalogo<TipoImpedimento>(consulta, 'tipo', TIPOS_IMPEDIMENTO),
    q: busqueda(consulta),
  };
}

export function leerFiltrosAuditorGestion(consulta: Consulta): FiltroGestion {
  return {
    ...rango(consulta),
    hduId: uuid(consulta, 'hduId'),
    actorId: uuid(consulta, 'actorId'),
    estado: catalogo<EstadoImpedimento>(consulta, 'estado', ESTADOS_IMPEDIMENTO),
    tipoImpedimento: catalogo<TipoImpedimento>(consulta, 'tipo', TIPOS_IMPEDIMENTO),
    accion: catalogo<AccionGestion>(consulta, 'accion', ACCIONES),
  };
}

/** Solo los parámetros de filtro que se enviaron, tal como quedan registrados en la auditoría (D35). */
export function filtrosEnviados(consulta: Consulta, nombres: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(nombres.filter((nombre) => consulta[nombre] !== undefined).map((nombre) => [nombre, consulta[nombre]]));
}

/** `{hdu: [...], incluirImpedimentos?}` de la evaluación interna (1 a 1000 HDU únicas). */
export function leerEvaluacion(cuerpo: unknown): {
  hdu: Array<{ hduId: string; estado: EstadoHdu; sprintFin: string | null; avance: number | null }>;
  incluirImpedimentos: boolean;
} {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    return invalido({ campo: 'body', codigo: 'FORMATO_INVALIDO', mensaje: 'El cuerpo debe ser un objeto JSON.' });
  }
  const datos = cuerpo as Record<string, unknown>;
  for (const campo of Object.keys(datos)) {
    if (campo !== 'hdu' && campo !== 'incluirImpedimentos') invalido({ campo, codigo: 'NO_PERMITIDO', mensaje: 'Campo no admitido.' });
  }
  if (!Array.isArray(datos.hdu)) return invalido({ campo: 'hdu', codigo: 'REQUERIDO', mensaje: 'Indica la lista de HDU.' });
  if (datos.hdu.length < 1 || datos.hdu.length > 1000) invalido({ campo: 'hdu', codigo: 'LONGITUD_INVALIDA', mensaje: 'Entre 1 y 1000 HDU.' });
  if (datos.incluirImpedimentos !== undefined && typeof datos.incluirImpedimentos !== 'boolean') {
    invalido({ campo: 'incluirImpedimentos', codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un booleano.' });
  }

  const vistos = new Set<string>();
  const hdu = (datos.hdu as unknown[]).map((crudo, indice) => {
    const item = crudo as Record<string, unknown> | null;
    const campo = `hdu[${indice}]`;
    if (item === null || typeof item !== 'object') return invalido({ campo, codigo: 'FORMATO_INVALIDO', mensaje: 'Cada HDU debe ser un objeto.' });
    if (typeof item.hduId !== 'string' || !UUID.test(item.hduId)) invalido({ campo: `${campo}.hduId`, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un UUID.' });
    const hduId = (item.hduId as string).toLowerCase();
    if (vistos.has(hduId)) invalido({ campo: `${campo}.hduId`, codigo: 'DUPLICADO', mensaje: 'Hay identificadores repetidos.' });
    vistos.add(hduId);
    if (typeof item.estado !== 'string' || !ESTADOS_HDU.includes(item.estado as EstadoHdu)) {
      invalido({ campo: `${campo}.estado`, codigo: 'VALOR_NO_PERMITIDO', mensaje: 'Estado de HDU no válido.' });
    }
    let sprintFin: string | null = null;
    if (item.sprintFin !== null && item.sprintFin !== undefined) {
      if (typeof item.sprintFin !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(item.sprintFin)) {
        invalido({ campo: `${campo}.sprintFin`, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser una fecha AAAA-MM-DD o null.' });
      }
      sprintFin = (item.sprintFin as string).slice(0, 10);
    }
    let avance: number | null = null;
    if (item.avance !== null && item.avance !== undefined) {
      if (typeof item.avance !== 'number' || item.avance < 0 || item.avance > 100) {
        invalido({ campo: `${campo}.avance`, codigo: 'FORMATO_INVALIDO', mensaje: 'Debe ser un número entre 0 y 100, o null.' });
      }
      avance = item.avance as number;
    }
    return { hduId, estado: item.estado as EstadoHdu, sprintFin, avance };
  });
  return { hdu, incluirImpedimentos: datos.incluirImpedimentos === true };
}
