import { useState } from "react";
import { useHistorialUmbral } from "@/api/indicadores";
import { BloqueEstado } from "@/components/BloqueEstado";
import { formatearFechaHoraChile } from "@/lib/formato";
import type { EventoUmbralCarga } from "@/types/dominio";

function Evento({ e }: { e: EventoUmbralCarga }) {
  return (
    <li className="historial-item">
      <time dateTime={e.fecha}>{formatearFechaHoraChile(e.fecha)}</time>
      <p>
        {e.actor.nombre} · Umbral: <span aria-hidden="true">{e.valorAnterior} → {e.valorNuevo}</span>
        <span className="sr-only">de {e.valorAnterior} a {e.valorNuevo}</span> HDU activas
      </p>
    </li>
  );
}

function PaginaExtra({ qeId, pagina }: { qeId: string | undefined; pagina: number }) {
  const q = useHistorialUmbral(qeId, pagina);
  if (q.isPending) return <li>Cargando…</li>;
  return <>{q.data?.items.map((e) => <Evento key={e.id} e={e} />)}</>;
}

/** Historial del umbral (D183): más reciente primero, de 5 en 5 con «Mostrar más». */
export function HistorialUmbral({ qeId }: { qeId?: string }) {
  const primera = useHistorialUmbral(qeId, 1);
  const [paginas, setPaginas] = useState(1);
  const total = primera.data?.total ?? 0;

  return (
    <section className="panel" data-testid="historial-umbral" aria-label="Historial del umbral">
      <h3>Historial del umbral</h3>
      {primera.isPending ? (
        <p>Cargando…</p>
      ) : primera.isError ? (
        <BloqueEstado id="historial-umbral" estado="error" onReintentar={() => void primera.refetch()} />
      ) : total === 0 ? (
        <p>Aún no has cambiado el umbral</p>
      ) : (
        <>
          <ul className="historial-lista">
            {primera.data!.items.map((e) => <Evento key={e.id} e={e} />)}
            {Array.from({ length: paginas - 1 }, (_, i) => <PaginaExtra key={i} qeId={qeId} pagina={i + 2} />)}
          </ul>
          {total > paginas * 5 ? (
            <button type="button" className="boton boton--secundario" data-testid="boton-ver-mas-historial-umbral" onClick={() => setPaginas((p) => p + 1)}>
              Mostrar más
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
