import { ETIQUETAS_CAMBIO_HDU } from "@/lib/mensajesIntegracion";
import { ETIQUETAS_PRIORIDAD, type CambiosHdu, type PrioridadHdu } from "@/types/dominio";

const texto = (campo: string, crudo: string | null) =>
  campo === "prioridad" && crudo ? (ETIQUETAS_PRIORIDAD[crudo as PrioridadHdu] ?? crudo) : crudo;
const valor = (campo: string, crudo: string | null) => {
  const t = texto(campo, crudo);
  return t === null || t === "" ? "(vacío)" : t;
};

/** `Campo: antes → después` por cada campo que cambió (D98). Texto plano con corte de palabras largas; el lector oye «antes … después …». */
export function CeldaCambios({ cambios, testId }: { cambios: CambiosHdu | null; testId?: string }) {
  const entradas = cambios ? Object.entries(cambios).filter(([, c]) => c) : [];
  if (entradas.length === 0) return <span data-testid={testId}>—</span>;
  return (
    <div className="celda-cambios" data-testid={testId}>
      <ul>
        {entradas.map(([campo, cambio]) => (
          <li key={campo}>
            <span aria-hidden="true">
              {ETIQUETAS_CAMBIO_HDU[campo] ?? campo}: {valor(campo, cambio!.antes)} → {valor(campo, cambio!.despues)}
            </span>
            <span className="sr-only">
              {ETIQUETAS_CAMBIO_HDU[campo] ?? campo}: antes «{valor(campo, cambio!.antes)}», después «{valor(campo, cambio!.despues)}»
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
