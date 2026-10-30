export type PasoImportacion = 1 | 2 | 3;

const PASOS = ["Elegir archivo", "Revisar la vista previa", "Importar"];

/** `<ol>` de tres pasos: el actual lleva `aria-current="step"` y se distingue por subrayado y peso, no solo por color. */
export function PasosImportacion({ paso }: { paso: PasoImportacion }) {
  return (
    <ol className="pasos-importacion" aria-label="Pasos de la importación" data-testid="pasos-importacion">
      {PASOS.map((texto, indice) => (
        <li key={texto} aria-current={paso === indice + 1 ? "step" : undefined}>
          {texto}
        </li>
      ))}
    </ol>
  );
}
