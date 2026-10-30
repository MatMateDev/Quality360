/**
 * Filas visibles de una lista de selección dentro de un diálogo. Se usa `size` en vez del
 * desplegable nativo, que se abría fuera de la ventana y ocultaba opciones. Con más de
 * MAXIMO opciones la lista se desplaza dentro del diálogo.
 */
const MINIMO = 2;
const MAXIMO = 6;

export function tamanoLista(opciones: number): number {
  return Math.min(Math.max(opciones, MINIMO), MAXIMO);
}
