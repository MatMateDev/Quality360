import { useEffect, useRef } from "react";
import { ETIQUETAS_ESTADO_IMPEDIMENTO, type ListaImpedimentosBloqueantes } from "@/types/dominio";

/**
 * 409 `HDU_BLOQUEADA` al cerrar (D60, D77): la HDU no cambia y el botón sigue habilitado. Muestra el total real
 * (`impedimentos.total`) y los hasta 20 más antiguos con enlace a su tarjeta; el contenedor recibe el foco para
 * que se anuncie (`role="alert"`).
 */
export function ErrorCierreBloqueado({ bloqueo }: { bloqueo: ListaImpedimentosBloqueantes | undefined }) {
  const contenedor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contenedor.current?.focus();
  }, []);

  const total = bloqueo?.total ?? bloqueo?.items.length ?? 0;
  const items = bloqueo?.items ?? [];
  const masNo = Math.max(0, total - items.length);
  const sustantivo = total === 1 ? "impedimento abierto o escalado" : "impedimentos abiertos o escalados";

  return (
    <div ref={contenedor} tabIndex={-1} className="mensaje-error-global error-cierre-bloqueado" role="alert" data-testid="error-hdu-bloqueada">
      <p style={{ margin: 0 }}>
        {total > 0
          ? `No se puede cerrar la HDU: tiene ${total} ${sustantivo}. Resuélvelos y vuelve a intentar.`
          : "No se puede cerrar la HDU: tiene impedimentos abiertos o escalados. Resuélvelos y vuelve a intentar."}
      </p>
      {items.length > 0 ? (
        <ul data-testid="lista-error-bloqueantes">
          {items.map((i) => (
            <li key={i.id}>
              <a href={`#impedimento-${i.id}`}>
                {i.titulo} — {ETIQUETAS_ESTADO_IMPEDIMENTO[i.estado]}
              </a>
            </li>
          ))}
          {masNo > 0 ? (
            <li>
              <a href="#impedimentos">y {masNo} más</a>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
