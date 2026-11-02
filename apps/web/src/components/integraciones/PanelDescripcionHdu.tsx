import { useId } from "react";
import type { HduDetalle } from "@/types/dominio";
import { InsigniaOrigen } from "./Insignias";

/** Solo enlaces web: la URL viene de un sistema externo y nunca debe ser `javascript:` ni similar. */
function urlSegura(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const analizada = new URL(url);
    return analizada.protocol === "https:" || analizada.protocol === "http:" ? analizada.href : null;
  } catch {
    return null;
  }
}

/**
 * «Descripción y origen» del detalle de HDU (E5, D108). La descripción es TEXTO PLANO: no se interpreta HTML ni se
 * convierten enlaces. Si el servidor no trae `origen` (campos aditivos), la sección no se renderiza: la ausencia de
 * dato no se confunde con «Manual».
 */
export function PanelDescripcionHdu({ hdu }: { hdu: Pick<HduDetalle, "origen" | "descripcion" | "urlExterna" | "estado"> }) {
  const idTitulo = useId();
  if (!hdu.origen) return null;
  const deJira = hdu.origen === "JIRA";
  const fuente = deJira ? "Jira" : "un archivo";
  const enlace = urlSegura(hdu.urlExterna);
  return (
    <section className="panel" id="descripcion" data-testid="seccion-descripcion-hdu" aria-labelledby={idTitulo}>
      <div className="panel-cabecera">
        <h2 id={idTitulo}>Descripción</h2>
        <span data-testid="hdu-origen">
          <InsigniaOrigen origen={hdu.origen} />
        </span>
      </div>
      {hdu.descripcion ? (
        <p className="descripcion-hdu" data-testid="hdu-descripcion">
          {hdu.descripcion}
        </p>
      ) : (
        <p className="bloque-estado bloque-estado--vacio" data-testid="estado-vacio-descripcion">
          Esta HDU no tiene descripción
        </p>
      )}
      {hdu.origen !== "MANUAL" ? (
        <p className="nota-origen" data-testid="nota-origen-hdu">
          <span aria-hidden="true">ⓘ</span>{" "}
          {hdu.estado === "CERRADA"
            ? `Esta HDU está cerrada: ${deJira ? "Jira" : "la importación"} no la modificará.`
            : `Este texto viene de ${fuente}. ${deJira ? "Una nueva sincronización" : "Una nueva importación"} puede actualizar el título, la descripción y la prioridad.`}
        </p>
      ) : null}
      {enlace ? (
        <p>
          <a href={enlace} target="_blank" rel="noopener noreferrer" data-testid="enlace-abrir-en-jira">
            Abrir en Jira<span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
        </p>
      ) : null}
    </section>
  );
}
