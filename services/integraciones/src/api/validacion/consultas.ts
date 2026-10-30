/** Validación de las consultas del historial y de los eventos de configuración. */
import { errorValidacion } from '@quality360/auth-nest';

import type { EntradaDetalle, EntradaListado } from '../../aplicacion/historial.servicio.js';
import { diaSiguiente, inicioDeDiaSantiago } from '../../dominio/fechas.js';
import type { OrigenEjecucion, ResultadoEjecucion, ResultadoFila } from '../../dominio/tipos.js';
import { Acumulador, consultaBooleana, consultaEnumerada, consultaFecha, consultaTexto, leerPaginacion } from './comunes.js';

type Consulta = Record<string, unknown>;

const ORIGENES: readonly OrigenEjecucion[] = ['JIRA', 'CSV', 'JSON'];
const RESULTADOS: readonly ResultadoEjecucion[] = ['EN_CURSO', 'EXITOSA', 'CON_ERRORES', 'INCOMPLETA', 'FALLIDA', 'INTERRUMPIDA'];
const RESULTADOS_FILA: readonly ResultadoFila[] = ['CREADA', 'ACTUALIZADA', 'OMITIDA', 'ERROR'];

/** `GET /v1/integraciones/ejecuciones`: filtros, orden y paginación (25 por defecto; más de 100 se recorta, D49). */
export function leerListado(consulta: Consulta): EntradaListado {
  const a = new Acumulador();
  const origen = consultaEnumerada(consulta, 'origen', ORIGENES, a);
  const resultado = consultaEnumerada(consulta, 'resultado', RESULTADOS, a);
  const desde = consultaFecha(consulta, 'desde', a);
  const hasta = consultaFecha(consulta, 'hasta', a);
  if (desde !== undefined && hasta !== undefined && desde > hasta) a.falla('query.hasta', 'VALOR_NO_PERMITIDO', 'La fecha final no puede ser anterior a la inicial.');
  let orden: 'asc' | 'desc' = 'desc';
  const crudo = consultaTexto(consulta, 'orden');
  if (consulta.orden !== undefined) {
    if (crudo === 'iniciadaEn:asc') orden = 'asc';
    else if (crudo !== 'iniciadaEn:desc') a.falla('query.orden', 'VALOR_NO_PERMITIDO', 'Solo se ordena por iniciadaEn:asc o iniciadaEn:desc.');
  }
  const { pagina, tamanoPagina } = leerPaginacion(consulta, 25, 100, true, a);
  a.lanzarSiHay();
  return {
    filtro: {
      origen,
      resultado,
      desde: desde === undefined ? undefined : inicioDeDiaSantiago(desde),
      hastaExcluyente: hasta === undefined ? undefined : inicioDeDiaSantiago(diaSiguiente(hasta)),
      orden,
    },
    pagina,
    tamanoPagina,
  };
}

/** `GET /v1/integraciones/ejecuciones/{id}/detalle`: `soloErrores=true` equivale a `resultado=ERROR`; ambos con otro resultado → 400. */
export function leerDetalle(consulta: Consulta): EntradaDetalle {
  const a = new Acumulador();
  let resultado = consultaEnumerada(consulta, 'resultado', RESULTADOS_FILA, a);
  const soloErrores = consultaBooleana(consulta, 'soloErrores', a) ?? false;
  if (soloErrores) {
    if (resultado !== undefined && resultado !== 'ERROR') a.falla('query.soloErrores', 'NO_PERMITIDO', 'soloErrores solo es compatible con resultado=ERROR.');
    resultado = 'ERROR';
  }
  const { pagina, tamanoPagina } = leerPaginacion(consulta, 25, 100, true, a);
  a.lanzarSiHay();
  return { resultado, pagina, tamanoPagina };
}

/** `GET /v1/integraciones/jira/configuracion/eventos`: `tamanoPagina` de 1 a 100 (20 por defecto). */
export function leerPaginaEventos(consulta: Consulta): { pagina: number; tamanoPagina: number } {
  const a = new Acumulador();
  const paginacion = leerPaginacion(consulta, 20, 100, false, a);
  if (a.detalles.length > 0) throw errorValidacion(a.detalles, 'paginación inválida');
  return paginacion;
}
