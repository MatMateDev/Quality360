/**
 * Atlassian Document Format (ADF) a texto plano (sección 5.1 del backlog E5, E5-B02-T03).
 *
 * Dos estilos sobre el mismo recorrido:
 *  - `plano` (consulta y archivos, `adfATexto`): párrafos y títulos en líneas separadas; viñetas con «- » (numeradas con «N. »);
 *    menciones, emojis y estados con su texto; enlaces con el texto del enlace (una tarjeta sin texto, con su URL); saltos
 *    duros como salto de línea; los nodos que no se conocen se ignoran con todo su contenido.
 *  - `detalle` (panel «Ver detalle», `adfADetalle`, D198): viñetas con «• » o «N. », tablas como «celda · celda», `media`, macros
 *    y extensiones como «[contenido no mostrable]», enlaces solo `http(s)` como «texto (url)» y sin etiquetas HTML ejecutables.
 * Nunca produce etiquetas ni JSON. Acotado en profundidad y en tamaño (entrada hostil).
 */
import { limpiarControl } from './tipos.js';

const PROFUNDIDAD_MAX = 20;
const SALIDA_MAX = 20_000;
/** El detalle recorta después a 8.000 o 4.000; esto solo acota una entrada hostil antes de recortar. */
const SALIDA_MAX_DETALLE = 100_000;

export const NO_MOSTRABLE = '[contenido no mostrable]';

type Estilo = 'plano' | 'detalle';
type Nodo = { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown; marks?: unknown };

const esNodo = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v);
const hijos = (n: Nodo): Nodo[] => (Array.isArray(n.content) ? n.content.filter(esNodo) : []);
const attrs = (n: Nodo): Record<string, unknown> => (esNodo(n.attrs) ? (n.attrs as Record<string, unknown>) : {});
const cadena = (v: unknown): string => (typeof v === 'string' ? v : '');

const CONTENEDORES = new Set([
  'doc', 'blockquote', 'panel', 'expand', 'nestedExpand', 'tableCell', 'tableHeader', 'listItem', 'taskItem', 'decisionItem',
]);
/** Nodos que Jira renderiza con algo que el panel no puede mostrar: adjuntos, macros y extensiones. */
const BLOQUES_NO_MOSTRABLES = new Set(['media', 'mediaSingle', 'mediaGroup', 'mediaInline', 'extension', 'bodiedExtension']);

/** `true` solo para una URL absoluta `http(s)` (nunca `javascript:`, `data:` ni relativas). */
export function esUrlHttp(valor: unknown): valor is string {
  if (typeof valor !== 'string' || valor.length > 2000) return false;
  try {
    const url = new URL(valor.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function conEnlace(texto: string, nodo: Nodo, estilo: Estilo): string {
  if (estilo !== 'detalle' || !Array.isArray(nodo.marks)) return texto;
  for (const marca of nodo.marks) {
    if (!esNodo(marca) || marca.type !== 'link') continue;
    const href = attrs(marca).href;
    if (!esUrlHttp(href)) return texto;
    const url = href.trim();
    return texto.trim() === '' || texto.includes(url) ? texto : `${texto} (${url})`;
  }
  return texto;
}

function inline(nodo: Nodo, prof: number, estilo: Estilo): string {
  if (prof > PROFUNDIDAD_MAX) return '';
  switch (nodo.type) {
    case 'text': return conEnlace(cadena(nodo.text), nodo, estilo);
    case 'hardBreak': return '\n';
    case 'mention': return cadena(attrs(nodo).text);
    case 'emoji': return cadena(attrs(nodo).text) || cadena(attrs(nodo).shortName);
    case 'status': return cadena(attrs(nodo).text);
    case 'inlineCard': {
      const url = attrs(nodo).url;
      return estilo === 'detalle' && !esUrlHttp(url) ? '' : cadena(url);
    }
    case 'date': {
      const ms = Number(attrs(nodo).timestamp);
      return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms).toISOString().slice(0, 10) : '';
    }
    case 'inlineExtension':
    case 'mediaInline':
      return estilo === 'detalle' ? NO_MOSTRABLE : '';
    default: return '';
  }
}

function lineasInline(nodo: Nodo, prof: number, estilo: Estilo): string[] {
  const texto = hijos(nodo).map((h) => inline(h, prof + 1, estilo)).join('');
  return texto.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).filter((l) => l.trim() !== '');
}

function conPrefijo(lineas: string[], primero: string): string[] {
  const sangria = ' '.repeat(primero.length);
  return lineas.map((l, i) => (i === 0 ? primero : sangria) + l);
}

function bloque(nodo: Nodo, prof: number, estilo: Estilo): string[] {
  if (prof > PROFUNDIDAD_MAX) return [];
  const tipo = nodo.type;
  if (tipo === 'paragraph' || tipo === 'heading') return lineasInline(nodo, prof, estilo);
  if (tipo === 'codeBlock') return hijos(nodo).map((h) => cadena(h.text)).join('').split('\n').filter((l) => l.trim() !== '');
  if (tipo === 'bulletList' || tipo === 'taskList') {
    const viñeta = estilo === 'detalle' ? '• ' : '- ';
    return hijos(nodo).flatMap((item) => conPrefijo(bloque(item, prof + 1, estilo), viñeta));
  }
  if (tipo === 'orderedList') {
    const inicio = Number(attrs(nodo).order);
    const base = Number.isInteger(inicio) && inicio >= 0 ? inicio : 1;
    return hijos(nodo).flatMap((item, i) => conPrefijo(bloque(item, prof + 1, estilo), `${base + i}. `));
  }
  if (tipo === 'table') {
    const separador = estilo === 'detalle' ? ' · ' : ' | ';
    return hijos(nodo).map((fila) => hijos(fila).map((c) => bloque(c, prof + 2, estilo).join(' ')).filter((c) => c !== '').join(separador)).filter((l) => l !== '');
  }
  if (typeof tipo === 'string' && CONTENEDORES.has(tipo)) return hijos(nodo).flatMap((h) => bloque(h, prof + 1, estilo));
  if (estilo === 'detalle' && typeof tipo === 'string' && BLOQUES_NO_MOSTRABLES.has(tipo)) return [NO_MOSTRABLE];
  return []; // desconocido (rule, ...): se ignora con su contenido
}

/** Convierte un documento ADF (o un texto plano, por si el sitio responde en formato v2) a texto. */
export function adfATexto(adf: unknown): string {
  if (typeof adf === 'string') return limpiarControl(adf).replace(/\r\n?/g, '\n').trim();
  if (!esNodo(adf)) return '';
  const raiz: Nodo = adf.type === 'doc' ? adf : { type: 'doc', content: [adf] };
  const texto = bloque(raiz, 0, 'plano').join('\n');
  return limpiarControl(texto.length > SALIDA_MAX ? texto.slice(0, SALIDA_MAX) : texto).trim();
}

/**
 * Quita lo ejecutable de un texto que pudo venir como HTML (formato v2 o pegado en una celda): bloques `<script>` y
 * `<style>` completos y cualquier otra etiqueta. Es texto para pintar como texto; esto solo evita que el panel o un
 * consumidor futuro reciba marcado.
 */
export function quitarEtiquetas(texto: string): string {
  return texto
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style)\b[^>]*>?/gi, '')
    .replace(/<\/?[a-zA-Z!][^>\n]*>/g, '');
}

/** Raíz ADF → líneas en el estilo del detalle, sin recortar (D198). */
export function adfALineasDetalle(adf: unknown): string[] {
  if (typeof adf === 'string') {
    return quitarEtiquetas(limpiarControl(adf).replace(/\r\n?/g, '\n')).split('\n').map((l) => l.replace(/[ \t]+$/g, '')).filter((l) => l.trim() !== '');
  }
  if (!esNodo(adf)) return [];
  const raiz: Nodo = adf.type === 'doc' ? adf : { type: 'doc', content: [adf] };
  const lineas = bloque(raiz, 0, 'detalle').map((l) => quitarEtiquetas(limpiarControl(l))).filter((l) => l.trim() !== '');
  let total = 0;
  const salida: string[] = [];
  for (const l of lineas) {
    total += l.length + 1;
    if (total > SALIDA_MAX_DETALLE) break;
    salida.push(l);
  }
  return salida;
}

/** Texto del detalle: ADF (o texto) a texto plano seguro (D198). Vacío si no queda nada. */
export function adfADetalle(adf: unknown): string {
  return adfALineasDetalle(adf).join('\n').trim();
}

const NORMALIZAR = /[̀-ͯ]/g;
const ENCABEZADO_CRITERIOS = /^(criterios? de aceptacion|acceptance criteria)\s*:?$/;

function normalizarEncabezado(texto: string): string {
  return texto.normalize('NFD').replace(NORMALIZAR, '').toLowerCase().replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Criterios de aceptación dentro de la descripción (D199, opción 2): la sección que empieza en un encabezado (o en un
 * párrafo que es solo ese título) «Criterios de aceptación» / «Acceptance criteria» y llega hasta el siguiente encabezado
 * del mismo nivel o superior. Con la descripción en texto, hasta el final. `null` si no hay sección o queda vacía.
 */
export function criteriosDeDescripcion(adf: unknown): string | null {
  if (typeof adf === 'string') {
    const lineas = limpiarControl(adf).replace(/\r\n?/g, '\n').split('\n');
    const desde = lineas.findIndex((l) => ENCABEZADO_CRITERIOS.test(normalizarEncabezado(l)));
    if (desde < 0) return null;
    const texto = adfADetalle(lineas.slice(desde + 1).join('\n'));
    return texto === '' ? null : texto;
  }
  if (!esNodo(adf)) return null;
  const raiz: Nodo = adf.type === 'doc' ? adf : { type: 'doc', content: [adf] };
  const bloques = hijos(raiz);
  const titulo = (b: Nodo): string => normalizarEncabezado(lineasInline(b, 0, 'plano').join(' '));
  const desde = bloques.findIndex((b) => (b.type === 'heading' || b.type === 'paragraph') && ENCABEZADO_CRITERIOS.test(titulo(b)));
  if (desde < 0) return null;
  const inicio = bloques[desde] as Nodo;
  const nivel = inicio.type === 'heading' && Number.isInteger(Number(attrs(inicio).level)) ? Number(attrs(inicio).level) : 7;
  const seccion: Nodo[] = [];
  for (const b of bloques.slice(desde + 1)) {
    if (b.type === 'heading') {
      const n = Number(attrs(b).level);
      if (!Number.isInteger(n) || n <= nivel) break;
    }
    seccion.push(b);
  }
  const texto = adfADetalle({ type: 'doc', content: seccion });
  return texto === '' ? null : texto;
}
