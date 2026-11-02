import type { Ejecucion } from "@/types/dominio";

interface Item {
  clave: string;
  titulo: string;
  valor: number;
}

/**
 * Cinco contadores que suman (leídas, creadas, actualizadas, omitidas, con error) y un sexto, aparte y rotulado
 * «no suma», con las advertencias (diseño E5 §5). Un 0 es un dato válido.
 */
export function ResumenEjecucion({ ejecucion, enCurso = false }: { ejecucion: Pick<Ejecucion, "leidas" | "creadas" | "actualizadas" | "omitidas" | "conError" | "conAdvertencias">; enCurso?: boolean }) {
  const items: Item[] = [
    { clave: "leidas", titulo: "Leídas", valor: ejecucion.leidas },
    { clave: "creadas", titulo: "Creadas", valor: ejecucion.creadas },
    { clave: "actualizadas", titulo: "Actualizadas", valor: ejecucion.actualizadas },
    { clave: "omitidas", titulo: "Omitidas", valor: ejecucion.omitidas },
    { clave: "con-error", titulo: "Con error", valor: ejecucion.conError },
  ];
  const mostrar = (n: number) => (enCurso ? "—" : String(n));
  return (
    <dl className="resumen-ejecucion" data-testid="resumen-ejecucion">
      {items.map((item) => (
        <div key={item.clave} className="tarjeta-resumen resumen-ejecucion__item" data-testid={`res-${item.clave}`}>
          <dt className="tarjeta-resumen__titulo">{item.titulo}</dt>
          <dd className="tarjeta-resumen__valor">{mostrar(item.valor)}</dd>
          {item.clave === "con-error" && !enCurso && item.valor > 0 ? <dd className="resumen-ejecucion__nota">Revisa las filas con error</dd> : null}
        </div>
      ))}
      <div className="tarjeta-resumen resumen-ejecucion__item resumen-ejecucion__aparte" data-testid="res-advertencias">
        <dt className="tarjeta-resumen__titulo">Con advertencias</dt>
        <dd className="tarjeta-resumen__valor">{mostrar(ejecucion.conAdvertencias)}</dd>
        <dd className="resumen-ejecucion__nota">(informativo, no suma)</dd>
      </div>
    </dl>
  );
}
