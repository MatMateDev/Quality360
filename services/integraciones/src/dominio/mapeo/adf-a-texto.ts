/**
 * Atlassian Document Format (ADF) a texto plano (sección 5.1 del backlog E5, E5-B02-T03).
 *
 * Reglas: párrafos y títulos en líneas separadas; viñetas con «- » (numeradas con «N. »); menciones,
 * emojis y estados con su texto; enlaces con el texto del enlace (una tarjeta sin texto, con su URL);
 * saltos duros como salto de línea. Los nodos que no se conocen se ignoran con todo su contenido.
 * Nunca produce etiquetas ni JSON. Acotado en profundidad y en tamaño (entrada hostil).
 */
import { limpiarControl } from './tipos.js';

const PROFUNDIDAD_MAX = 20;
const SALIDA_MAX = 20_000;

type Nodo = { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown };

const esNodo = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v);
const hijos = (n: Nodo): Nodo[] => (Array.isArray(n.content) ? n.content.filter(esNodo) : []);
const attrs = (n: Nodo): Record<string, unknown> => (esNodo(n.attrs) ? (n.attrs as Record<string, unknown>) : {});
const cadena = (v: unknown): string => (typeof v === 'string' ? v : '');

const CONTENEDORES = new Set([
  'doc', 'blockquote', 'panel', 'expand', 'nestedExpand', 'tableCell', 'tableHeader', 'listItem', 'taskItem', 'decisionItem',
]);

function inline(nodo: Nodo, prof: number): string {
  if (prof > PROFUNDIDAD_MAX) return '';
  switch (nodo.type) {
    case 'text': return cadena(nodo.text);
    case 'hardBreak': return '\n';
    case 'mention': return cadena(attrs(nodo).text);
    case 'emoji': return cadena(attrs(nodo).text) || cadena(attrs(nodo).shortName);
    case 'status': return cadena(attrs(nodo).text);
    case 'inlineCard': return cadena(attrs(nodo).url);
    case 'date': {
      const ms = Number(attrs(nodo).timestamp);
      return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? new Date(ms).toISOString().slice(0, 10) : '';
    }
    default: return '';
  }
}

function lineasInline(nodo: Nodo, prof: number): string[] {
  const texto = hijos(nodo).map((h) => inline(h, prof + 1)).join('');
  return texto.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).filter((l) => l.trim() !== '');
}

function conPrefijo(lineas: string[], primero: string): string[] {
  const sangria = ' '.repeat(primero.length);
  return lineas.map((l, i) => (i === 0 ? primero : sangria) + l);
}

function bloque(nodo: Nodo, prof: number): string[] {
  if (prof > PROFUNDIDAD_MAX) return [];
  const tipo = nodo.type;
  if (tipo === 'paragraph' || tipo === 'heading') return lineasInline(nodo, prof);
  if (tipo === 'codeBlock') return hijos(nodo).map((h) => cadena(h.text)).join('').split('\n').filter((l) => l.trim() !== '');
  if (tipo === 'bulletList' || tipo === 'taskList') {
    return hijos(nodo).flatMap((item) => conPrefijo(bloque(item, prof + 1), '- '));
  }
  if (tipo === 'orderedList') {
    const inicio = Number(attrs(nodo).order);
    const base = Number.isInteger(inicio) && inicio >= 0 ? inicio : 1;
    return hijos(nodo).flatMap((item, i) => conPrefijo(bloque(item, prof + 1), `${base + i}. `));
  }
  if (tipo === 'table') {
    return hijos(nodo).map((fila) => hijos(fila).map((c) => bloque(c, prof + 2).join(' ')).filter((c) => c !== '').join(' | ')).filter((l) => l !== '');
  }
  if (typeof tipo === 'string' && CONTENEDORES.has(tipo)) return hijos(nodo).flatMap((h) => bloque(h, prof + 1));
  return []; // desconocido (media, rule, extension, ...): se ignora con su contenido
}

/** Convierte un documento ADF (o un texto plano, por si el sitio responde en formato v2) a texto. */
export function adfATexto(adf: unknown): string {
  if (typeof adf === 'string') return limpiarControl(adf).replace(/\r\n?/g, '\n').trim();
  if (!esNodo(adf)) return '';
  const raiz: Nodo = adf.type === 'doc' ? adf : { type: 'doc', content: [adf] };
  const texto = bloque(raiz, 0).join('\n');
  return limpiarControl(texto.length > SALIDA_MAX ? texto.slice(0, SALIDA_MAX) : texto).trim();
}
