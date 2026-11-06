/** Mapeo de una issue de Jira a una fila para Organización (J2, sección 5.1 del backlog E5, D101). */
import type { IssueJira } from '../puertos/fuente-jira.js';
import { adfATexto } from './adf-a-texto.js';
import { construirDetalleSeguro } from './detalle.js';
import { mapearPrioridadJira } from './prioridad.js';
import { elegirSprint } from './sprint.js';
import { LIMITES, PATRON_CODIGO, limpiarControl, limpiarLinea, recortar, type AdvertenciaFila, type FilaMapeada, type MotivoFila } from './tipos.js';


const CELULAS_POR_ETIQUETA: Record<string, string> = {
  'celula-pagos': 'Pagos',
  'celula-clientes': 'Clientes',
};
function obtenerCelulaDesdeEtiquetas(
  labels: readonly string[] | undefined,
): { nombre: string | null; invalida: boolean } {
  const etiquetas = [
    ...new Set(
      (Array.isArray(labels) ? (labels as unknown[]).filter((e): e is string => typeof e === 'string') : [])
        .map((etiqueta) => etiqueta.trim().toLowerCase())
        .filter((etiqueta) => etiqueta.startsWith('celula-')),
    ),
  ];

  if (etiquetas.length === 0) {
    return { nombre: null, invalida: false };
  }

  const etiqueta = etiquetas[0];
  if (etiquetas.length !== 1 || !etiqueta) {
    return { nombre: null, invalida: true };
  }

  const nombre = CELULAS_POR_ETIQUETA[etiqueta];

  return nombre
    ? { nombre, invalida: false }
    : { nombre: null, invalida: true };
}
/**
 * @param posicion posición de la issue en la lectura (1 la primera): es la `fila` del detalle.
 * @param sitio sitio ya validado con `validarSitio` (D95); con él se arma `urlExterna`.
 */

export function mapearIssue(issue: IssueJira, posicion: number, sitio: string): FilaMapeada {
  const advertencias: AdvertenciaFila[] = [];
  let error: MotivoFila | null = null;

  const clave = typeof issue.clave === 'string' ? issue.clave.trim() : '';
  const codigoValido = clave.length > 0 && clave.length <= LIMITES.codigoMax && PATRON_CODIGO.test(clave);
  if (!codigoValido) error = 'CODIGO_INVALIDO';
  const celulaDesdeEtiquetas = obtenerCelulaDesdeEtiquetas(issue.labels);
  // Una etiqueta desconocida o contradictoria no invalida la fila: en la consulta (D136) la célula la elige el Administrador
  // y la sugerida es la de la Conexión; `celula` queda null y solo una etiqueta reconocida aporta una pista.


  let titulo: string | null = limpiarLinea(typeof issue.titulo === 'string' ? issue.titulo : '');
  if (titulo === '') {
    titulo = null;
    error ??= 'TITULO_VACIO';
  } else if (titulo.length > LIMITES.tituloMax) {
    titulo = recortar(titulo, LIMITES.tituloMax).trimEnd();
    advertencias.push('TITULO_TRUNCADO');
  }

  let descripcion: string | null = adfATexto(issue.descripcionAdf);
  if (descripcion === '') {
    descripcion = null;
  } else if (descripcion.length > LIMITES.descripcionMax) {
    descripcion = recortar(descripcion, LIMITES.descripcionMax).trimEnd();
    advertencias.push('DESCRIPCION_TRUNCADA');
  }

  const { prioridad, advertencia } = mapearPrioridadJira(issue.prioridad);
  if (advertencia) advertencias.push(advertencia);

  const estado = issue.estado === null ? null : recortar(limpiarLinea(issue.estado), 100) || null;
  const responsable = issue.responsable === null ? null : recortar(limpiarLinea(issue.responsable), 150) || null;

  return {
    fila: posicion,
    codigo: codigoValido ? clave : recortar(limpiarControl(clave), 200),
    titulo,
    descripcion,
    prioridad,
    sprint: elegirSprint(issue.sprints),
    celula: celulaDesdeEtiquetas.nombre,
    // Una clave inválida no se convierte en enlace ni se guarda como clave externa.
    claveExterna: codigoValido ? clave : null,
    urlExterna: codigoValido ? `${sitio}/browse/${clave}` : null,
    advertencias,
    referencia: { estado, responsable },
    error,
    // El detalle (D198) viaja con la fila hacia `consulta_item.detalle`; lo que no se pueda leer queda `null` y no rechaza la fila.
    detalle: construirDetalleSeguro(issue, codigoValido ? `${sitio}/browse/${clave}` : null),
  };
}
