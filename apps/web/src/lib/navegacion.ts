/**
 * Salida del portal hacia otra dirección (la `urlAutorizacion` de Atlassian, D210). Se usa `location.assign` y no
 * `window.open`, para que ningún bloqueador de ventanas lo impida. Va en un objeto para poder sustituirlo en pruebas.
 */
export const navegador = {
  ir(url: string): void {
    window.location.assign(url);
  },
};
