import type { Consulta, Ejecucion } from "@/types/dominio";

type Cifras = Pick<Consulta, "leidas" | "nuevas" | "cambiaron" | "sinCambios" | "conError" | "conAdvertencias"> | Pick<Ejecucion, "leidas" | "nuevas" | "cambiaron" | "sinCambios" | "conError" | "conAdvertencias">;

/**
 * Resumen de una consulta de Jira (diseño §3.2): cuatro grupos que suman a «Leídas» y las advertencias aparte
 * («informativo, no suma»). Las cifras son las **acumuladas** de la consulta (D149); un 0 es un dato válido.
 */
export function ResumenConsulta({ cifras }: { cifras: Cifras }) {
  const items = [
    { clave: "leidas", titulo: "Leídas", valor: cifras.leidas },
    { clave: "nuevas", titulo: "Nuevas", valor: cifras.nuevas },
    { clave: "cambiaron", titulo: "Cambiaron", valor: cifras.cambiaron },
    { clave: "sin-cambios", titulo: "Sin cambios", valor: cifras.sinCambios },
    { clave: "con-error", titulo: "Con error", valor: cifras.conError },
  ];
  return (
    <dl className="resumen-ejecucion" data-testid="resumen-ejecucion">
      {items.map((item) => (
        <div key={item.clave} className="tarjeta-resumen resumen-ejecucion__item" data-testid={`res-${item.clave}`}>
          <dt className="tarjeta-resumen__titulo">{item.titulo}</dt>
          <dd className="tarjeta-resumen__valor">{item.valor}</dd>
          {item.clave === "con-error" && item.valor > 0 ? <dd className="resumen-ejecucion__nota">Revisa las filas con error</dd> : null}
        </div>
      ))}
      <div className="tarjeta-resumen resumen-ejecucion__item resumen-ejecucion__aparte" data-testid="res-advertencias">
        <dt className="tarjeta-resumen__titulo">Con advertencias</dt>
        <dd className="tarjeta-resumen__valor">{cifras.conAdvertencias}</dd>
        <dd className="resumen-ejecucion__nota">(informativo, no suma)</dd>
      </div>
    </dl>
  );
}
